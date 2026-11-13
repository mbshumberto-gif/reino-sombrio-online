(() => {
  'use strict';

  const World = window.EldoriaWorld;
  const Pixel = window.EldoriaPixel;
  const $ = id => document.getElementById(id);
  const socket = io();
  const pressed = new Set();
  const positions = new Map();
  const pending = [];
  const movement = {
    ArrowUp:[0,-1], KeyW:[0,-1], ArrowDown:[0,1], KeyS:[0,1],
    ArrowLeft:[-1,0], KeyA:[-1,0], ArrowRight:[1,0], KeyD:[1,0]
  };
  const finalScenes = [
    ['O último grito de Malakar', 'Malakar tenta pronunciar uma última maldição. Sua voz se desfaz antes que os aventureiros possam ouvi-la.'],
    ['As correntes se partem', 'Muito longe dali, as correntes se abrem. Os moradores que a escuridão manteve adormecidos voltam a respirar livres.'],
    ['Eldoria desperta', 'Nas minas e fortalezas, as portas se abrem. Famílias se reencontram. Aderic acende a primeira lanterna.'],
    ['O primeiro amanhecer', 'A névoa abandona os campos. Na praça, os sinos anunciam a volta dos moradores e recebem os aventureiros.']
  ];
  const backdrop = new Image();
  backdrop.src = '/assets/eldoria-crepusculo.webp';
  let credentials;
  let data;
  let state;
  let connectionPending = null;
  let activeRoom = null;
  let conversation = null;
  let currentPuzzle = null;
  let cutscene = null;
  let inputId = 0;
  let lastInput = 0;
  let wasMoving = false;
  let lastAutoNpc = null;
  let lastNotice;
  let lastFrame = 0;
  let lastDraw = 0;
  let lastFocus = 0;
  let battleTime = 0;
  let battleRefresh;
  let interaction;
  let pointerId = null;
  let stick = { dx: 0, dy: 0 };
  let clockOffset = 0;
  let music = null;

  function randomKey() {
    return [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function loadCredentials() {
    try {
      const saved = JSON.parse(localStorage.getItem('eldoriaIdentityV2') || 'null');
      if (saved && /^[a-zA-Z0-9_-]{1,80}$/.test(saved.id) && /^[a-f0-9]{64}$/.test(saved.key)) return saved;
      const legacy = localStorage.getItem('eldoriaPreviousCharacterId') || localStorage.getItem('eldoriaCharacterId');
      const id = legacy && /^[a-zA-Z0-9_-]{1,80}$/.test(legacy) ? legacy : 'hero-' + randomKey().slice(0, 32);
      const identity = { id, key:randomKey() };
      localStorage.setItem('eldoriaIdentityV2', JSON.stringify(identity));
      return identity;
    } catch {
      return { id:'hero-' + randomKey().slice(0, 32), key:randomKey() };
    }
  }

  credentials = loadCredentials();
  try {
    const resume = JSON.parse(localStorage.getItem('eldoriaActiveRoom') || 'null');
    if (resume?.heroId === credentials.id && typeof resume.campaignId === 'string') activeRoom = resume;
  } catch {}

  const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
  const text = (id, content) => { $(id).textContent = content; };
  const control = () => positions.get(state?.id);
  const worldTime = () => Date.now() + clockOffset;

  function button(label, handler, className) {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    if (className) element.className = className;
    element.addEventListener('click', handler);
    return element;
  }

  function paragraph(content, tag = 'p') {
    const element = document.createElement(tag);
    element.textContent = content;
    return element;
  }

  function rememberRoom(room) {
    activeRoom = room;
    try {
      if (room) localStorage.setItem('eldoriaActiveRoom', JSON.stringify(room));
      else localStorage.removeItem('eldoriaActiveRoom');
    } catch {}
  }

  function say(message, history = true) {
    if (history && state) {
      const log = $('log');
      log.prepend(paragraph(message, 'div'));
      while (log.children.length > 50) log.lastChild.remove();
    }
    text('toast', message);
    show('toast');
    clearTimeout(lastNotice);
    lastNotice = setTimeout(() => show('toast', false), 2700);
  }

  function send(event, payload = {}) {
    if (!socket.connected) {
      say('Aguarde a reconexão com Eldoria.', false);
      return;
    }
    socket.emit(event, payload);
  }

  function displayEntry() {
    show('titleScreen', false);
    show('entry');
    text('entryStatus', socket.connected ? 'Pronto para entrar.' : 'Conectando a Eldoria…');
  }

  function enter(action) {
    if (!data) {
      text('entryStatus', 'Aguarde os dados do mundo ou recarregue a página.');
      return;
    }
    if (!socket.connected) {
      text('entryStatus', 'Conectando a Eldoria…');
      return;
    }
    connectionPending = action;
    text('entryStatus', 'Abrindo aventura…');
    send('adventure', { action, ...credentials, name:$('playerName').value,
      classKey:$('heroClass').value, code:$('roomCode').value.trim().toUpperCase() });
  }

  $('startAdventureBtn').addEventListener('click', displayEntry);
  $('backTitleBtn').addEventListener('click', () => { show('entry', false); show('titleScreen'); });
  $('heroForm').addEventListener('submit', event => { event.preventDefault(); enter('create'); });
  $('joinForm').addEventListener('submit', event => { event.preventDefault(); enter('join'); });
  $('continueSaveBtn').addEventListener('click', () => enter('continue'));
  $('recoverForm').addEventListener('submit', event => {
    event.preventDefault();
    connectionPending = 'recover';
    send('redeemRecovery', { key:credentials.key, code:$('recoveryCode').value });
  });
  $('leaveAdventureBtn').addEventListener('click', () => send('leaveAdventure'));
  $('saveGameBtn').addEventListener('click', () => send('saveGame'));
  $('recoveryBtn').addEventListener('click', () => send('issueRecovery'));
  $('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(state.code); say('Convite copiado.', false); }
    catch { say('Código da sala · ' + state.code, false); }
  });

  function classPreview() {
    const id = $('heroClass').value;
    Pixel.portrait($('heroPreview'), id);
    if (data) text('classRole', data.classes[id].role + ' · ' + data.classes[id].skill.name);
  }
  $('heroClass').addEventListener('change', classPreview);

  function closeDialogue() {
    conversation = null;
    show('dialoguePanel', false);
  }

  function renderDialogue() {
    if (!conversation) return;
    const { payload, step } = conversation;
    const end = step >= payload.lines.length - 1;
    text('dialogueTitle', payload.title);
    text('dialogueText', payload.lines[step] || '');
    text('dialogueNext', end ? 'Fechar' : 'Continuar ▸');
    const options = end ? (payload.options || []).map(({ id, label }) =>
      button(label, () => { send('npcAction', { npc:payload.id, action:id }); closeDialogue(); })) : [];
    $('dialogueOptions').replaceChildren(...options);
  }

  function nextLine() {
    if (!conversation) return;
    if (++conversation.step < conversation.payload.lines.length) renderDialogue();
    else closeDialogue();
  }

  $('dialogueNext').addEventListener('click', nextLine);

  function showDialog(title, children) {
    const dialog = $('worldDialog');
    text('worldDialogTitle', title);
    $('worldDialogBody').replaceChildren(...children);
    resetMovement();
    if (!dialog.open) dialog.showModal();
  }

  $('worldDialog').addEventListener('close', () => { currentPuzzle = null; });
  function showPuzzle(payload) {
    currentPuzzle = payload;
    const form = document.createElement('form');
    const input = document.createElement('input');
    input.id = 'riddleAnswer';
    input.maxLength = 100;
    input.autocomplete = 'off';
    input.placeholder = 'Sua resposta';
    input.setAttribute('aria-label', 'Resposta do enigma');
    const status = paragraph('');
    status.id = 'puzzleStatus';
    status.setAttribute('role', 'status');
    const submit = button('Decifrar', () => {}, 'primary');
    submit.type = 'submit';
    form.append(input, status, submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (currentPuzzle) send('puzzleAnswer', { id:currentPuzzle.id, answer:input.value });
    });
    showDialog(payload.title, [paragraph(payload.description), paragraph(payload.hint, 'small'), form]);
  }

  function renderShop() {
    const self = state.self;
    const children = [paragraph(self.gold + ' ouros'), button('Poção · 10 ouros', () => send('inventoryAction', { action:'buy', item:'potion' }))];
    for (const [slot, name] of [['weapon', self.weapon], ['armor', self.armor]]) {
      const offer = self.forge[slot];
      if (!offer) {
        children.push(paragraph(name + ' · aprimoramento máximo', 'small'));
        continue;
      }
      const improve = button('Aprimorar ' + name + ' para +' + offer.rank + ' · ' + offer.price + ' ouros',
        () => send('inventoryAction', { action:'forge', slot, item:self.equipment[slot], rank:offer.rank }));
      improve.disabled = self.level < offer.level || self.gold < offer.price;
      children.push(improve, paragraph('Nível ' + offer.level + ' · +3 ' + (slot === 'weapon' ? 'ataque' : 'defesa'), 'small'));
    }
    for (const [id, item] of Object.entries(data.equipment)) {
      if (!item.price) continue;
      const line = document.createElement('div');
      line.className = 'entry-line';
      const buy = button(item.name + ' · ' + item.price + ' ouros', () => send('inventoryAction', { action:'buy', item:id }));
      buy.disabled = self.owned.includes(id) || self.gold < item.price;
      line.append(buy, paragraph(gearStats(item), 'small'));
      children.push(line);
    }
    showDialog('Forja de Eldrin', children);
    $('worldDialog').dataset.shop = 'true';
  }

  $('worldDialog').addEventListener('close', () => delete $('worldDialog').dataset.shop);

  function gearStats(item) {
    return [item.attack ? '+' + item.attack + ' ataque' : '', item.defense ? '+' + item.defense + ' defesa' : ''].filter(Boolean).join(' · ');
  }

  function renderInventory() {
    const me = state.self;
    const list = [
      paragraph(me.potions + ' poções · ' + me.apples + ' maçãs'),
      paragraph('Arma · ' + me.weapon), paragraph('Armadura · ' + me.armor)
    ];
    if (me.equipment.charm) list.push(paragraph('Acessório · ' + data.equipment[me.equipment.charm].name));
    for (const id of me.owned) {
      const item = data.equipment[id];
      if (!item) continue;
      const equipped = me.equipment[item.slot] === id;
      const row = document.createElement('div');
      row.className = 'entry-line';
      const toggle = button(equipped ? 'Desequipar' : 'Equipar', () => send('inventoryAction', { action:equipped ? 'unequip' : 'equip', item:id, slot:item.slot }));
      toggle.disabled = !!state.battle;
      row.append(paragraph(item.name + ' · ' + gearStats(item), 'small'), toggle);
      list.push(row);
    }
    if (me.skillPoints > 0) {
      const upgrade = button('Aprimorar habilidade · ' + me.skillPoints + ' ponto(s)', () => send('inventoryAction', { action:'upgrade' }));
      upgrade.disabled = !!state.battle;
      list.push(upgrade);
    }
    if (me.companions.lume) {
      list.push(paragraph('Lume · vínculo ' + me.companions.lume + '/5'));
      const feed = button('Dar maçã a Lume', () => send('inventoryAction', { action:'feed' }));
      feed.disabled = !!state.battle || !me.apples || me.companions.lume >= 5;
      list.push(feed);
    } else list.push(paragraph(lumeHint(), 'small'));
    if (me.companions.lia) list.push(paragraph('Lia acompanha sua jornada. Chame-a durante o combate para apoiar o grupo.', 'small'));
    $('inventoryPanel').replaceChildren(...list);
  }

  function renderJournal() {
    const quests = state.journal.map(quest => {
      const line = document.createElement('div');
      line.className = 'entry-line';
      line.append(paragraph((quest.completed ? '✓ ' : '') + quest.title),
        paragraph(quest.completed || quest.accepted ? quest.objective : 'Converse com ' + quest.npc + ' para começar.', 'small'));
      return line;
    });
    const main = document.createElement('details');
    main.className = 'entry-line';
    const map = World.zone(state.zone);
    const description = map.kind === 'dungeon' ? data.dungeons[map.region]?.[map.dungeonIndex]?.description : data.lore[map.region];
    main.append(paragraph('Crônicas de Eldoria', 'summary'), paragraph(description || '', 'small'),
      ...state.world.quests.map(quest => paragraph((quest.completed ? '✓ ' : '◇ ') + quest.title, 'small')));
    const lume = state.self.companions.lume ? [] : [paragraph('Encontre Lume, o espírito do pomar'), paragraph(lumeHint(), 'small')];
    const enemies = World.remainingEnemies(map, state.world);
    const guard = map.points.some(point => point.kind === 'boss') ? [paragraph(
      state.world.cleared[map.region] ? 'Guardião derrotado' : enemies
        ? 'Criaturas restantes: ' + enemies + ' · O guardião ainda está oculto.'
        : 'Guardião revelado · Siga para o norte.', 'small')] : [];
    $('questList').replaceChildren(main, ...guard, ...lume, ...quests);
    const routes = map.points.filter(p => p.kind === 'portal').map(p => {
      const blocked = p.shortcut && !state.world.orchardOpen || p.requires && !state.world.cleared[p.requires]
        || p.requiresRoom !== undefined && !state.world.rooms[map.region]?.includes(p.requiresRoom);
      return paragraph((blocked ? '◇ ' : '→ ') + p.label + (blocked ? ' · Fechado' : ''), 'small');
    });
    $('routeList').replaceChildren(paragraph('Rotas nesta área'), ...routes);
  }

  function lumeHint() {
    if (state.zone === 'orchard') return state.self.apples
      ? 'Leve sua maçã até o velho aqueduto, a nordeste, e use AÇÃO.'
      : 'Sacuda a macieira do pomar e use AÇÃO outra vez quando a maçã cair.';
    return 'Colha uma maçã na Vila. Siga a trilha do Pomar a leste da praça e procure a luz no aqueduto.';
  }

  function renderParty() {
    $('players').replaceChildren(...state.heroes.map(player => {
      const member = document.createElement('li');
      member.append(paragraph(player.name + (player.id === state.hostId ? ' ✦' : '')),
        paragraph((data.classes[player.classKey]?.name || '') + ' · Nível ' + player.level +
          ' · ' + (player.online ? World.zone(player.zone).name : 'Reconectando'), 'small'));
      return member;
    }));
  }

  function setBar(id, value, max) {
    $(id).style.width = Math.max(0, Math.min(100, 100 * value / max)) + '%';
  }

  function renderBattle() {
    const battle = state.battle;
    show('battle', !!battle);
    show('overworld', !battle);
    show('mobileExplore', !battle);
    if (!battle) return;
    const me = state.self;
    const animating = battle.lastAction && worldTime() - battleTime < 690;
    const myTurn = battle.active === state.id && me.hp > 0 && !battle.resolveAt && !animating;
    const active = state.heroes.find(hero => hero.id === battle.active);
    text('enemyName', battle.name);
    text('enemyPhase', battle.boss ? 'FASE ' + battle.phase + '/3' : 'RODADA ' + battle.round);
    text('enemyHp', battle.hp + ' / ' + battle.maxHp + ' PV');
    setBar('enemyBar', battle.hp, battle.maxHp);
    const target = state.heroes.find(hero => hero.id === battle.move?.target);
    const warning = battle.move ? battle.move.name + (battle.move.type === 'area' ? ' → todo o grupo' : target ? ' → ' + target.name : '') : '';
    const turn = battle.result ? 'Combate encerrado' : !active || animating && battle.lastAction?.side === 'enemy'
      ? 'Vez do monstro' : active.id === state.id ? 'Sua vez' : 'Vez de ' + active.name;
    const riposte = battle.status?.[state.id]?.riposte;
    text('battleHint', turn + (warning ? ' · ' + warning : '') + (riposte ? ' · Revide pronto +35%' : ''));
    $('defendBtn').title = 'Reduz o dano, recupera mana e prepara um revide ao bloquear uma investida ou golpe em área.';
    text('battleLog', battle.lastAction?.text || 'Escolha sua ação.');
    const ability = data.classes[me.classKey].skill;
    const technique = data.techniques[me.classKey];
    const cost = value => me.classKey === 'sorceress' ? Math.ceil(value * 0.8) : value;
    text('skillBtn', ability.name + ' · ' + cost(ability.cost) + ' MP');
    text('techniqueBtn', technique.name + ' · ' + cost(technique.cost) + ' MP');
    $('skillBtn').title = ability.description;
    $('techniqueBtn').title = technique.description;
    const enabled = { attack:true, defend:true, skill:me.mana >= cost(ability.cost),
      technique:me.mana >= cost(technique.cost), potion:me.potions > 0 && me.hp < me.maxHp,
      apple:me.apples > 0 && me.hp < me.maxHp, companion:me.companions.lia && !battle.supportUsed,
      flee:!battle.boss, totem:battle.totems > 0 };
    for (const control of document.querySelectorAll('[data-action]')) control.disabled = !myTurn || !enabled[control.dataset.action] || !socket.connected;
    text('totemBtn', 'Quebrar totem · ' + battle.totems + ' restante(s)');
    show('totemBtn', !!battle.totems);
    show('companionBtn', !!me.companions.lia);
    show('appleBtn', !!me.apples);
  }

  function battleAction(action) {
    const battle = state?.battle;
    if (!battle || battle.active !== state.id || battle.resolveAt || (battle.lastAction && worldTime() - battleTime < 690)) return;
    send('battleAction', { id:battle.id, turn:battle.turn, action });
  }

  document.querySelectorAll('[data-action]').forEach(control => control.addEventListener('click', () => battleAction(control.dataset.action)));

  function openScene(scene) {
    if (cutscene) return;
    resetMovement();
    closeDialogue();
    if ($('worldDialog').open) $('worldDialog').close();
    cutscene = scene;
    show('endingStage', scene.final);
    text('transitionTitle', scene.title);
    text('transitionMessage', scene.description);
    text('continueCampaignBtn', scene.final ? 'Próxima cena ▸' : 'Voltar ao mapa');
    $('transitionScreen').showModal();
  }

  function closeScene() {
    const final = cutscene?.final;
    cutscene = null;
    $('transitionScreen').close();
    if (final) {
      state.endingPending = true;
      send('endingSeen');
    }
  }

  $('transitionScreen').addEventListener('cancel', event => {
    if (cutscene?.final) event.preventDefault();
    else closeScene();
  });

  $('continueCampaignBtn').addEventListener('click', () => {
    if (!cutscene?.final || ++cutscene.step >= finalScenes.length) {
      closeScene();
      return;
    }
    const [title, description] = finalScenes[cutscene.step];
    text('transitionTitle', title);
    text('transitionMessage', description);
    text('continueCampaignBtn', cutscene.step === finalScenes.length - 1 ? 'Voltar à Eldoria livre' : 'Próxima cena ▸');
  });

  function refresh() {
    const me = state.self;
    const map = World.zone(state.zone);
    text('roomLabel', state.code);
    text('heroName', me.name);
    text('heroClassName', data.classes[me.classKey].name + ' · Nível ' + me.level);
    text('heroHp', me.hp + '/' + me.maxHp + ' PV');
    text('heroMana', me.mana + '/' + me.maxMana + ' MP');
    text('heroStats', me.gold + ' ouros · ' + me.xp + '/' + me.xpToNext + ' XP');
    text('areaTitle', map.name);
    text('zoneTag', map.kind === 'dungeon' ? 'MASMORRA · SALA ' + (map.dungeonIndex + 1) + '/4' : World.NAMES[map.region].toUpperCase());
    setBar('heroHpBar', me.hp, me.maxHp);
    setBar('heroManaBar', me.mana, me.maxMana);
    Pixel.portrait($('hudPortrait'), me.classKey, 0, me.equipment);
    renderBattle();
    renderParty();
    renderJournal();
    renderInventory();
    if ($('worldDialog').open && $('worldDialog').dataset.shop && !state.battle) renderShop();
    $('saveGameBtn').disabled = !socket.connected;
    $('recoveryBtn').disabled = !state.durable;
    text('connectionStatus', state.durable ? 'Conectado · progresso persistente' : 'Sessão temporária · progresso guardado enquanto o servidor estiver ligado');
  }

  function acceptState(next) {
    const prior = state;
    state = next;
    clockOffset = state.now - Date.now();
    const movedZone = prior?.zone !== state.zone || prior?.campaignId !== state.campaignId;
    if (movedZone || prior?.battle?.id !== state.battle?.id) {
      interaction = undefined;
      text('nearbyPrompt', 'Explore Eldoria');
      lastFocus = 0;
      resetMovement();
      pending.length = 0;
      positions.clear();
      lastAutoNpc = null;
    }
    if (movedZone || state.battle) {
      closeDialogue();
      if ($('worldDialog').open) $('worldDialog').close();
    }
    const ids = new Set(state.players.map(entry => entry.id));
    for (const id of positions.keys()) if (!ids.has(id)) positions.delete(id);
    for (const entry of state.players) {
      const existing = positions.get(entry.id);
      if (!existing || movedZone || !pending.length || entry.id !== state.id) {
        positions.set(entry.id, { x:entry.x, y:entry.y, tx:entry.x, ty:entry.y, facing:entry.facing, moving:false });
      }
    }
    if (state.battle?.id !== prior?.battle?.id || state.battle?.turn !== prior?.battle?.turn) {
      battleTime = worldTime();
      clearTimeout(battleRefresh);
      if (state.battle?.lastAction) battleRefresh = setTimeout(() => { if (state) renderBattle(); }, 710);
    }
    refresh();
    if (state.world.cleared.shadow && !state.seenEnding && !cutscene && !state.battle && !state.endingPending) {
      openScene({ final:true, step:0, title:finalScenes[0][0], description:finalScenes[0][1] });
    }
  }

  function resumeRoom() {
    if (!activeRoom || !data || !socket.connected || connectionPending) return;
    connectionPending = 'resume';
    text('connectionStatus', 'Recuperando sua participação…');
    socket.emit('adventure', { ...credentials, action:'resume', campaignId:activeRoom.campaignId });
  }

  socket.on('connect', () => {
    text('entryStatus', 'Pronto para entrar.');
    resumeRoom();
  });

  socket.on('joined', room => {
    rememberRoom(room);
    connectionPending = null;
    inputId = 0;
    pending.length = 0;
    show('titleScreen', false);
    show('entry', false);
    show('game');
  });

  socket.on('left', () => {
    closeDialogue();
    if ($('worldDialog').open) $('worldDialog').close();
    if ($('transitionScreen').open) $('transitionScreen').close();
    cutscene = null;
    rememberRoom(null);
    state = null;
    positions.clear();
    pending.length = 0;
    resetMovement();
    show('game', false);
    displayEntry();
  });

  socket.on('disconnect', () => {
    connectionPending = null;
    resetMovement();
    if (state) {
      text('connectionStatus', 'Conexão interrompida · tentando retomar a mesma sala…');
      $('saveGameBtn').disabled = true;
      renderBattle();
    } else text('entryStatus', 'Tentando reconectar…');
  });

  socket.on('state', acceptState);
  socket.on('monsters', ({ zone, mobs }) => {
    if (state?.zone === zone && !state.battle) state.mobs = mobs;
  });
  socket.on('moved', packet => {
    if (!state || state.zone !== packet.zone || state.battle) return;
    const position = positions.get(packet.id);
    if (!position) return;
    if (packet.id !== state.id) {
      Object.assign(position, { tx:packet.x, ty:packet.y, facing:packet.facing, moving:packet.moving, movedAt:performance.now() });
      return;
    }
    while (pending.length && pending[0].seq <= packet.seq) pending.shift();
    let correct = { x:packet.x, y:packet.y };
    for (const frame of pending) correct = World.walk(state.zone, correct, frame.dx, frame.dy, 0.05);
    Object.assign(position, { tx:correct.x, ty:correct.y });
    if (World.distance(position, correct) > 40) Object.assign(position, correct);
    else if (World.distance(position, correct) > 8) {
      const x = position.x + (correct.x - position.x) * 0.23;
      const y = position.y + (correct.y - position.y) * 0.23;
      if (World.canStand(state.zone, x, y)) Object.assign(position, { x, y });
    }
  });

  socket.on('notice', message => say(message));
  socket.on('errorMessage', (message, info) => {
    if (currentPuzzle && $('puzzleStatus')) text('puzzleStatus', message);
    if (connectionPending === 'resume') {
      if (info?.retryable) {
        connectionPending = null;
        text('connectionStatus', 'Servidor indisponível · tentando retomar a participação…');
        setTimeout(resumeRoom, 2000);
        return;
      }
      rememberRoom(null);
      state = null;
      closeDialogue();
      if ($('worldDialog').open) $('worldDialog').close();
      if ($('transitionScreen').open) $('transitionScreen').close();
      cutscene = null;
      show('game', false);
      displayEntry();
    }
    if (connectionPending || !state) text('entryStatus', message);
    connectionPending = null;
    say(message, false);
  });

  socket.on('dialogue', payload => {
    if (!state || state.battle) return;
    conversation = { payload, step:0 };
    Pixel.portrait($('dialoguePortrait'), payload.portrait, worldTime());
    show('dialoguePanel');
    renderDialogue();
  });
  socket.on('shop', renderShop);
  socket.on('puzzle', showPuzzle);
  socket.on('puzzleSolved', () => $('worldDialog').close());
  socket.on('chapter', chapter => openScene({ title:chapter.name + ' conquistada', description:'A passagem para a próxima região foi aberta.' }));
  socket.on('recovery', code => {
    const value = document.createElement('input');
    value.value = code;
    value.readOnly = true;
    value.setAttribute('aria-label', 'Código de recuperação de uso único');
    showDialog('Recuperação do herói', [paragraph('Guarde este código em local privado. Ele permite recuperar o herói uma vez.'), value,
      button('Copiar código', async () => {
        try { await navigator.clipboard.writeText(code); say('Código copiado.', false); }
        catch { value.select(); }
      })]);
  });
  socket.on('recovered', ({ id }) => {
    rememberRoom(null);
    credentials.id = id;
    try { localStorage.setItem('eldoriaIdentityV2', JSON.stringify(credentials)); } catch {}
    connectionPending = null;
    text('entryStatus', 'Herói recuperado. Clique em Continuar aventura.');
    $('recoveryCode').value = '';
  });

  function focusable() {
    return state && !state.battle && control() && !cutscene && !$('worldDialog').open && socket.connected;
  }

  function findInteraction(now) {
    const map = World.zone(state.zone);
    const player = control();
    const points = map.points.filter(p => Pixel.visiblePoint(p, map, state));
    const npcs = World.npcPositions(map.id, now, state.world);
    const candidates = [...points, ...npcs].map(p => p.kind === 'enemy' ? { ...p, ...state.mobs?.[p.id] } : p)
      .filter(p => World.distance(player, p) <= (p.kind === 'npc' ? 77 : p.kind === 'portal' ? 62 : 56));
    candidates.sort((a,b) => World.distance(player,a) - World.distance(player,b));
    return { point:candidates[0], npc:npcs.find(p => World.distance(player, p) <= 55) };
  }

  function doInteract() {
    if (conversation) { nextLine(); return; }
    if (!focusable()) return;
    const { point } = findInteraction(worldTime());
    if (point) send('interact', { id:point.id });
  }

  $('mobileActionBtn').addEventListener('click', doInteract);
  $('overworld').addEventListener('click', () => { if (conversation) nextLine(); });

  function resetJoystick() {
    pointerId = null;
    stick = { dx:0, dy:0 };
    $('joystickKnob').style.transform = '';
  }

  function resetMovement() {
    pressed.clear();
    resetJoystick();
    if (control()) control().moving = false;
    wasMoving = false;
  }

  const joystick = $('virtualJoystick');
  function joystickMove(event) {
    const { left, top, width, height } = joystick.getBoundingClientRect();
    const limit = Math.min(width, height) * 0.31;
    const dx = (event.clientX - left - width / 2) / limit;
    const dy = (event.clientY - top - height / 2) / limit;
    const magnitude = Math.hypot(dx,dy);
    stick = magnitude > 0.16 ? { dx:dx / Math.max(1,magnitude), dy:dy / Math.max(1,magnitude) } : { dx:0, dy:0 };
    $('joystickKnob').style.transform = 'translate(' + stick.dx * limit + 'px,' + stick.dy * limit + 'px)';
  }

  joystick.addEventListener('pointerdown', event => {
    if (pointerId !== null) return;
    event.preventDefault();
    pointerId = event.pointerId;
    joystick.setPointerCapture(pointerId);
    joystickMove(event);
  });
  joystick.addEventListener('pointermove', event => { if (pointerId === event.pointerId) joystickMove(event); });
  ['pointerup','pointercancel','lostpointercapture'].forEach(type => joystick.addEventListener(type, event => {
    if (event.pointerId === pointerId) resetJoystick();
  }));

  window.addEventListener('keydown', event => {
    if (event.target.closest?.('input,select,textarea,dialog') || !state) return;
    if (event.code === 'Space' && state.battle && !event.repeat) {
      event.preventDefault();
      battleAction('attack');
    }
    if (event.code === 'KeyE' && !event.repeat) {
      event.preventDefault();
      doInteract();
    }
    if (Object.hasOwn(movement,event.code) && focusable()) {
      event.preventDefault();
      pressed.add(event.code);
    }
  });
  window.addEventListener('keyup', event => pressed.delete(event.code));
  window.addEventListener('blur', resetMovement);
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetMovement(); });

  function stepMovement(t, dt) {
    const position = control();
    let { dx, dy } = stick;
    if (!dx && !dy) for (const key of pressed) { dx += movement[key][0]; dy += movement[key][1]; }
    dx = Math.max(-1, Math.min(1, dx));
    dy = Math.max(-1, Math.min(1, dy));
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const next = World.walk(state.zone, position, dx, dy, dt);
      const changed = next.x !== position.x || next.y !== position.y;
      Object.assign(position, next, { facing:World.facing(dx,dy,position.facing), moving:changed });
    } else {
      position.moving = false;
      if (!wasMoving && !pending.length && World.distance(position,{ x:position.tx, y:position.ty }) < 20) {
        position.x += (position.tx - position.x) * 0.22;
        position.y += (position.ty - position.y) * 0.22;
      }
    }
    if ((moving || wasMoving) && t - lastInput >= 50) {
      lastInput = t;
      const packet = { dx, dy, seq:++inputId, zone:state.zone };
      pending.push(packet);
      if (pending.length > 8) pending.shift();
      socket.volatile.emit('moveInput', packet);
      wasMoving = moving;
    }
  }

  function renderFocus(now) {
    const phase = Math.floor(Math.max(0, now - state.world.epoch) / 22000) % 4;
    const dayPhase = ['Manhã','Tarde','Entardecer','Noite'][phase];
    if ($('miniClock').textContent !== dayPhase) text('miniClock', dayPhase);
    if (!focusable()) return;
    const { point, npc } = findInteraction(now);
    const id = point?.id;
    if (interaction !== id) {
      interaction = id;
      const touch = window.matchMedia('(any-pointer: coarse)').matches;
      text('nearbyPrompt', point ? (touch ? 'AÇÃO · ' : 'E · ') + point.label
        : touch ? 'Explore Eldoria' : 'WASD ou setas para andar · E para interagir');
    }
    if (!npc) lastAutoNpc = null;
    else if (!conversation && npc.id !== lastAutoNpc) {
      lastAutoNpc = npc.id;
      send('interact', { id:npc.id });
    }
  }

  function animation(t) {
    const dt = Math.min(0.05, (t - (lastFrame || t)) / 1000);
    lastFrame = t;
    if (state && data && !document.hidden) {
      if (focusable()) stepMovement(t, dt);
      if (!cutscene && t - lastDraw >= 16) {
        lastDraw = t;
        for (const [id, position] of positions) {
          if (id === state.id) continue;
          position.x += (position.tx - position.x) * 0.28;
          position.y += (position.ty - position.y) * 0.28;
          if (t - (position.movedAt || 0) > 170) position.moving = false;
        }
        const now = worldTime();
        if (state.battle) Pixel.drawBattle($('battleSceneCanvas'), state, now, backdrop, battleTime);
        else Pixel.drawWorld($('worldCanvas'), state, positions, data, now);
        if (t - lastFocus > 180) {
          lastFocus = t;
          renderFocus(now);
        }
      }
    }
    requestAnimationFrame(animation);
  }

  $('musicToggle').addEventListener('click', async () => {
    if (music) {
      clearInterval(music.timer);
      await music.context.close();
      music = null;
      $('musicToggle').setAttribute('aria-pressed', 'false');
      return;
    }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    const context = new Audio();
    const notes = [196,261.63,293.66,329.63,293.66,261.63,220,196,174.61,220,261.63,293.66,261.63,220,196,164.81];
    let beat = 0;
    const tick = () => {
      if (document.hidden || context.state !== 'running') return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = notes[beat++ % notes.length] * (state?.battle ? 1.25 : 1);
      const volume = Number($('musicVolume').value);
      if (!volume) return;
      gain.gain.setValueAtTime(volume * 0.00115, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.31);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.34);
    };
    music = { context, timer:setInterval(tick,365) };
    await context.resume();
    $('musicToggle').setAttribute('aria-pressed', 'true');
  });

  Promise.all(['/game-data','/campaign-data'].map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(url);
    return response.json();
  })).then(([game, story]) => {
    data = { ...game, ...story };
    const options = Object.entries(data.classes).map(([id, role]) => new Option(role.name, id));
    $('heroClass').replaceChildren(...options);
    classPreview();
    resumeRoom();
    requestAnimationFrame(animation);
  }).catch(() => text('entryStatus', 'Os dados do jogo não carregaram. Atualize a página para tentar novamente.'));
})();
