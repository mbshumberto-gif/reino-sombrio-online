'use strict';

const express = require('express');
const http = require('node:http');
const path = require('node:path');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { Server } = require('socket.io');
const { createStorage } = require('./persistence');
const { HERO_CLASSES, EQUIPMENT, REGIONS, TECHNIQUES } = require('./game-data');
const { DUNGEONS } = require('./campaign-expansion');
const World = require('./public/world-data');
const Story = require('./adventure');
const Combat = require('./combat');

const GRACE_MS = 45000;
const ROOM_LIMIT = 8;
const ADMISSION_LIMIT = 64;
const KEY_PATTERN = /^[a-f0-9]{64}$/i;
const HERO_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;
const ROOM_CODE_PATTERN = /^[A-F0-9]{6}$/;
const PUBLIC_DIR = path.join(__dirname, 'public');
const index = path.join(PUBLIC_DIR, 'index.html');
const regionById = Object.fromEntries(REGIONS.map(region => [region.id, region]));
const hash = value => createHash('sha256').update(value).digest('hex');
const sameKey = (digest, key) => typeof digest === 'string' && KEY_PATTERN.test(digest)
  && typeof key === 'string' && KEY_PATTERN.test(key)
  && timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(hash(key), 'hex'));
const cleanName = value => typeof value === 'string' ? value.replace(/[<>\u0000-\u001F]/g, '').trim().slice(0, 18) : '';
const fail = message => Object.assign(new Error(message), { code: 'GAME_RULE' });
const normalize = value => typeof value === 'string'
  ? value.slice(0, 100).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() : '';
const credentials = (id, key) => typeof id === 'string' && HERO_ID_PATTERN.test(id)
  && typeof key === 'string' && KEY_PATTERN.test(key);
const different = (left, right) => JSON.stringify(left) !== JSON.stringify(right);
const here = (room, zone) => 'map:' + room.id + ':' + zone;

function createGame({ storage = createStorage({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: true }
}), graceMs = GRACE_MS, turnMs = 30000, logger = console } = {}) {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { maxHttpBufferSize: 16 * 1024 });
  const rooms = new Map();
  const codes = new Map();
  const activeHeroes = new Map();
  let admission = Promise.resolve();
  let admissionsQueued = 0;
  let stopping = false;
  let shutdown;

  app.disable('x-powered-by');
  app.get('/live', (_req, res) => res.json({ ok: true }));
  app.get('/health', async (_req, res) => {
    if (stopping) return res.status(503).json({ ok:false, mode:'restarting' });
    try {
      await storage.check();
      res.json({ ok: true, game: 'Reino Sombrio Online', indexExists: true, database: storage.durable,
        mode: storage.durable ? 'persistent' : 'temporary' });
    } catch {
      res.status(503).json({ ok: false, database: false, mode: 'unavailable' });
    }
  });
  app.get('/game-data', (_req, res) => res.json({ classes: HERO_CLASSES, regions: REGIONS, equipment: EQUIPMENT, techniques: TECHNIQUES }));
  app.get('/campaign-data', (_req, res) => res.json({
    lore: Story.lore,
    dungeons: Object.fromEntries(Object.entries(DUNGEONS).map(([key, list]) => [key, list.map(
      ({ name, kind, enemy, description, hint }) => ({ name, kind, enemy, description, hint }))]))
  }));
  app.get('/', (_req, res) => res.sendFile(index));
  app.use(express.static(PUBLIC_DIR, { index: false }));

  function roomFrom(row) {
    const existing = rooms.get(row.id);
    if (existing) return existing;
    const room = { ...row, players: new Map(), battles: new Map(), fruit: new Map(),
      tail: Promise.resolve(), locked: false, queued: 0, hostId: null };
    rooms.set(row.id, room);
    codes.set(row.code, room);
    return room;
  }

  function rememberSocket(room, entry, socket) {
    entry.socketId = socket.id;
    entry.awayUntil = null;
    entry.lastInput = 0;
    entry.lastMove = 0;
    room.hostId ||= entry.id;
    activeHeroes.set(entry.id, room);
    socket.data.roomId = room.id;
    socket.data.heroId = entry.id;
    socket.join(here(room, entry.member.data.zone));
    socket.emit('joined', { code: room.code, campaignId: room.id, durable: storage.durable, heroId: entry.id });
  }

  function stateFor(room, entry, now) {
    const member = entry.member.data;
    const battle = room.battles.get(member.zone);
    const people = [...room.players.values()];
    const heroes = people.map(player => ({
      id: player.id, name: player.data.name, classKey: player.data.classKey,
      level: player.data.level, zone: player.member.data.zone, online: Boolean(player.socketId),
      hp: player.data.hp, maxHp: player.data.maxHp
    }));
    const players = people.filter(player => player.member.data.zone === member.zone).map(player => ({
      id: player.id, name: player.data.name, classKey: player.data.classKey, equipment: player.data.equipment,
      companions: player.data.companions, hp: player.data.hp, maxHp: player.data.maxHp, online: Boolean(player.socketId),
      x: player.member.data.x, y: player.member.data.y, facing: player.member.data.facing
    }));
    const { name, classKey, hp, maxHp, mana, maxMana, level, xp, gold, potions, apples, equipment, owned, companions,
      skillPoints, skillLevel } = entry.data;
    return {
      code: room.code, campaignId: room.id, hostId: room.hostId, id: entry.id, now,
      zone: member.zone, players, heroes, world: Story.publicCampaign(room.data),
      journal: Story.questJournal(member, room.data), seenEnding: member.seenEnding,
      self: { name, classKey, hp, maxHp, mana, maxMana, level, xp, gold, potions, apples,
        equipment, owned, companions, skillPoints, skillLevel, xpToNext:Story.xpForNext(level), ...Story.heroStats(entry.data) },
      battle: battle || null, activeCheckpoint: member.checkpoint, durable: storage.durable,
      fruit: [...room.fruit.values()].filter(fruit => fruit.zone === member.zone && fruit.expires > now)
    };
  }

  function publish(room, only) {
    const now = Date.now();
    for (const entry of room.players.values()) {
      if (!entry.socketId || (only && entry.id !== only)) continue;
      io.to(entry.socketId).emit('state', stateFor(room, entry, now));
    }
  }

  function privateMessage(entry, event, value) {
    if (entry.socketId) io.to(entry.socketId).emit(event, value);
  }

  function queue(room, task) {
    if (room.queued >= 48) return Promise.reject(fail('Aguarde um instante e tente de novo.'));
    room.queued++;
    const work = room.tail.then(async () => {
      room.locked = true;
      try { return await task(); }
      finally { room.locked = false; room.queued--; }
    });
    room.tail = work.catch(() => {});
    return work;
  }

  async function change(room, task, { force = [], announce = true } = {}) {
    const oldWorld = structuredClone(room.data);
    const oldBattles = structuredClone(room.battles);
    const oldFruit = structuredClone(room.fruit);
    const oldPlayers = [...room.players.values()].map(entry => ({
      entry, hero: structuredClone(entry.data), member: structuredClone(entry.member.data), encounterAt: entry.encounterAt, baseline: entry.battleBaseline
    }));
    const messages = [];
    try {
      const result = task((entry, event, value) => messages.push([entry, event, value]));
      const players = oldPlayers.filter(({ entry, hero, baseline }) => !entry.battleBaseline && different(baseline || hero, entry.data))
        .map(({ entry }) => entry);
      const members = oldPlayers.filter(({ entry, member }) => force.includes(entry.id) || different(member, entry.member.data))
        .map(({ entry }) => entry.member);
      const changedWorld = different(oldWorld, room.data);
      if (changedWorld || players.length || members.length) {
        await storage.save({ campaign: changedWorld ? room : null, players, members });
      }
      for (const { entry, member } of oldPlayers) {
        if (members.includes(entry.member)) entry.positionDirty = false;
        const zone = entry.member.data.zone;
        if (zone !== member.zone && entry.socketId) {
          const socket = io.sockets.sockets.get(entry.socketId);
          socket?.leave(here(room, member.zone));
          socket?.join(here(room, zone));
          entry.lastMove = 0;
        }
      }
      for (const [entry, event, value] of messages) privateMessage(entry, event, value);
      if (announce) publish(room);
      return result;
    } catch (error) {
      room.data = oldWorld;
      room.battles = oldBattles;
      room.fruit = oldFruit;
      for (const { entry, hero, member, encounterAt, baseline } of oldPlayers) {
        entry.data = hero;
        entry.member.data = member;
        entry.encounterAt = encounterAt;
        entry.battleBaseline = baseline;
      }
      throw error;
    }
  }

  async function reserveCode(except) {
    for (let i = 0; i < 10; i++) {
      const code = randomBytes(3).toString('hex').toUpperCase();
      if (code !== except && !codes.has(code) && !await storage.readCampaign({ code })) return code;
    }
    throw fail('Não foi possível gerar um convite. Tente novamente.');
  }

  async function enter(socket, event, payload) {
    if (stopping) throw fail('O servidor está reiniciando.');
    if (socket.data.heroId) throw fail('Você já está em uma aventura.');
    const { id, key } = payload;
    if (!credentials(id, key)) throw fail('A identificação do navegador é inválida.');
    const active = activeHeroes.get(id);
    if (active) {
      const entry = active.players.get(id);
      if (!sameKey(entry.keyHash, key)) throw fail('Use o navegador original ou recupere seu personagem.');
      const canResume = event === 'resume' && payload.campaignId === active.id;
      const canContinue = event === 'continue' && entry.data.homeCampaign === active.id;
      const canJoin = event === 'join' && payload.code === active.code;
      if (entry.socketId || !(canResume || canContinue || canJoin)) {
        throw fail('Esse herói tem uma sessão aberta. Retome a mesma aventura para continuar.');
      }
      return queue(active, () => {
        if (!socket.connected) return;
        if (active.players.get(id) !== entry) throw fail('A sessão expirou. Entre na aventura novamente.');
        rememberSocket(active, entry, socket);
        publish(active);
      });
    }

    let hero = await storage.readHero(id);
    if (hero && !sameKey(hero.keyHash, key)) throw fail('Use o navegador original ou recupere seu personagem.');
    const legacy = hero ? null : await storage.readLegacy(id);
    if (!hero) hero = { id, keyHash: hash(key), revision: 0, data: Story.makeHero(cleanName(payload.name) || 'Aventureiro', payload.classKey, legacy || {}) };
    let newRoom;
    let selected;
    let importedRoom;
    let importedMember;

    if (legacy?.campaign) {
      importedRoom = Story.newCampaign(await reserveCode(), id, legacy.campaign);
      importedMember = Story.makeMember(importedRoom, id, legacy);
      hero.data.homeCampaign = importedRoom.id;
    }
    if (event === 'create' || (event === 'continue' && importedRoom)) {
      newRoom = event === 'continue' ? importedRoom : Story.newCampaign(await reserveCode(importedRoom?.code), id);
      selected = newRoom;
    } else if (event === 'join') {
      if (!ROOM_CODE_PATTERN.test(payload.code || '')) throw fail('Digite o código de seis caracteres da sala.');
      selected = codes.get(payload.code) || await storage.readCampaign({ code: payload.code });
      if (!selected) throw fail('Sala não encontrada. Confira o código.');
    } else {
      const campaignId = event === 'resume' ? payload.campaignId : hero.data.homeCampaign || await storage.lastCampaign(id);
      if (typeof campaignId !== 'string') throw fail('Nenhuma aventura foi encontrada para este personagem.');
      selected = rooms.get(campaignId) || await storage.readCampaign({ id: campaignId });
      if (!selected) throw fail('Nenhuma aventura foi encontrada para este personagem.');
    }
    const room = newRoom ? { ...selected, players: new Map(), battles: new Map(), fruit: new Map(),
      tail: Promise.resolve(), locked: false, queued: 0, hostId: null } : roomFrom(selected);
    await queue(room, async () => {
      if (!socket.connected) return;
      if (room.players.size >= ROOM_LIMIT) throw fail('A sala está cheia. Limite de 8 aventureiros.');
      if ([...room.players.values()].some(entry => entry.data.name.toLowerCase() === hero.data.name.toLowerCase())) {
        throw fail('Já existe um aventureiro com esse nome na sala.');
      }
      const savedMember = newRoom === importedRoom && importedRoom
        ? importedMember : await storage.readMember(room.id, id);
      if (event === 'resume' && !savedMember) throw fail('A sala precisa de um convite para este personagem.');
      const member = savedMember || Story.makeMember(room, id);
      if (member.revision) Object.assign(member.data, World.safePosition(member.data.zone, member.data.x, member.data.y));
      const needsRevive = !hero.data.hp;
      if (needsRevive) {
        hero.data.hp = Math.ceil(hero.data.maxHp * 0.5);
        Object.assign(member.data, World.safePosition(member.data.zone, member.data.checkpoint?.x, member.data.checkpoint?.y));
      }
      const setHome = event === 'create' && !hero.data.homeCampaign;
      if (setHome) hero.data.homeCampaign = room.id;
      const saveHero = hero.revision === 0 || setHome || needsRevive;
      if (importedRoom && importedRoom !== newRoom) {
        await storage.save({ campaign: importedRoom, players: [hero], members: [importedMember] });
      }
      if (newRoom || !member.revision || saveHero) {
        await storage.save({ campaign: newRoom ? room : null, players: saveHero && (!importedRoom || importedRoom === newRoom) ? [hero] : [],
          members: !member.revision ? [member] : [] });
      }
      if (!socket.connected) return;
      if (newRoom) {
        rooms.set(room.id, room);
        codes.set(room.code, room);
      }
      const entry = { ...hero, member, socketId: null, encounterAt: Date.now() + 1800, positionDirty: false };
      room.players.set(id, entry);
      rememberSocket(room, entry, socket);
      publish(room);
    });
  }

  function showNpc(room, entry, npc, send) {
    const world = room.data;
    const member = entry.member.data;
    const lines = Story.dialogues[npc.id].slice();
    if (world.cleared.shadow && npc.id === 'villager') lines.push('Malakar caiu. Meu irmão voltou na primeira manhã. Vamos acender as lanternas para celebrar?');
    if (npc.id === 'lia' && entry.data.companions.lume) lines.push('Lume gosta de você. Se quiser, eu conheço caminhos que a luz dele consegue revelar.');
    const options = Object.entries(Story.quests).flatMap(([id, quest]) => {
      if (quest.npc !== npc.id || !Story.canOffer(id, world) || member.quests[id]?.completed) return [];
      const step = member.quests[id]?.step;
      if (step === undefined) return [{ id: 'quest:' + id, label: 'Aceitar · ' + quest.title }];
      if (step === quest.steps.length - 1) return [{ id: 'quest:' + id, label: 'Entregar · ' + quest.title }];
      lines.push(quest.steps[step]);
      return [];
    });
    if (npc.id === 'blacksmith') options.push({ id: 'shop', label: 'Ver equipamentos' });
    if (npc.id === 'healer') options.push({ id:'rest', label:world.cleared.forest ? 'Descansar · 10 ouros' : 'Descansar com Mira' });
    if (npc.id === 'lia' && entry.data.companions.lume && !entry.data.companions.lia) {
      options.push({ id: 'recruit', label: 'Convidar Lia para viajar' });
    }
    send(entry, 'dialogue', { id: npc.id, title: npc.label, portrait: npc.classKey, lines, options });
  }

  function nearbyNpc(room, entry, id) {
    const member = entry.member.data;
    return World.npcPositions(member.zone, Date.now(), room.data).find(p => p.id === id && World.distance(member, p) <= 91);
  }

  function beginEncounter(room, entry, target) {
    const zone = entry.member.data.zone;
    if (room.battles.has(zone)) throw fail('Já há um combate nesta área.');
    if (entry.encounterAt > Date.now()) return;
    if (!entry.data.hp) throw fail('Volte ao ponto de descanso antes de lutar.');
    const map = World.zone(zone);
    const region = regionById[map.region];
    let enemy;
    if (target.kind === 'dungeonEnemy') {
      const detail = DUNGEONS[map.region][map.dungeonIndex];
      if (room.data.rooms[map.region]?.includes(map.dungeonIndex)) return;
      enemy = { name: detail.enemy, hp: detail.hp, atk: detail.atk, gold: detail.gold, xp: detail.xp };
    } else {
      if (room.data.cleared[map.region]) return;
      const defeated = room.data.defeated[map.region];
      if (target.kind === 'boss' && defeated.length < region.enemies.length) {
        throw fail('Ainda há ' + (region.enemies.length - defeated.length) + ' criaturas na região.');
      }
      if (target.kind === 'enemy' && defeated.includes(target.enemyIndex)) return;
      enemy = target.kind === 'boss' ? region.boss : region.enemies[target.enemyIndex];
    }
    const group = [...room.players.values()].filter(player => player.socketId && player.data.hp > 0 && player.member.data.zone === zone);
    if (!group.length) return;
    for (const player of group) player.battleBaseline = structuredClone(player.data);
    const battle = Combat.startBattle(zone, {
      kind: target.kind, region: map.region, index: target.enemyIndex ?? map.dungeonIndex,
      boss: target.kind === 'boss' || target.kind === 'dungeonEnemy' && map.dungeonIndex === 3
    }, enemy, group);
    battle.expires = Date.now() + turnMs;
    room.battles.set(zone, battle);
  }

  function teleport(entry, zone, spawn) {
    const member = entry.member.data;
    const position = World.safePosition(zone, ...spawn);
    Object.assign(member, { ...position, zone, checkpoint: { ...position, zone } });
    entry.encounterAt = Date.now() + 1500;
  }

  function portalTravel(room, entry, portal, send) {
    const member = entry.member.data;
    const map = World.zone(member.zone);
    const world = room.data;
    if (portal.requires && !world.cleared[portal.requires]) throw fail('O guardião ainda protege essa passagem.');
    if (portal.shortcut && !world.orchardOpen) throw fail('A passagem está selada. Procure a origem da luz no pomar.');
    if (portal.requiresRoom !== undefined && !world.rooms[map.region]?.includes(portal.requiresRoom)) {
      throw fail('Resolva o encontro da sala para abrir a porta.');
    }
    if (room.battles.has(portal.to)) throw fail('Aguarde o grupo terminar o combate do outro lado.');
    if (portal.finish && member.dungeonEligible?.includes(map.region) && !member.dungeonRewards?.includes(map.region)) {
      (member.dungeonRewards ||= []).push(map.region);
      Story.reward(entry.data, 75, 65);
      entry.data.potions += 2;
      const item = map.region === 'forest' ? 'rootGuard' : map.region === 'shadow' ? 'eclipseEdge' : null;
      if (item && !entry.data.owned.includes(item)) entry.data.owned.push(item);
      send(entry, 'notice', 'Masmorra concluída. Você recebeu 75 ouros, 2 poções e ' + (item ? EQUIPMENT[item].name : '65 XP') + '.');
    }
    teleport(entry, portal.to, portal.spawn);
  }

  function interactClue(room, entry, p, send) {
    const hero = entry.data;
    const member = entry.member.data;
    if (p.id === 'spirit') {
      if (hero.companions.lume) {
        if (!room.data.orchardOpen) {
          room.data.orchardOpen = true;
          send(entry, 'notice', 'Lume reconheceu o aqueduto e abriu o atalho para a Vila.');
        } else send(entry, 'notice', 'Lume flutua de volta até você.');
        return;
      }
      if (!hero.apples) throw fail('A pequena luz recua. Traga uma maçã fresca para acalmá-la.');
      hero.apples--;
      hero.companions.lume = 1;
      room.data.orchardOpen = true;
      if (!hero.owned.includes('amberCharm')) hero.owned.push('amberCharm');
      send(entry, 'dialogue', { title: 'Lume', portrait: 'lume', lines: [
        'O aqueduto vibra quando a luz toca a maçã. Duas faíscas abrem os olhos e ficam ao seu lado.',
        'Lume seguirá você em Eldoria. A velha passagem para a Vila voltou a brilhar.'
      ], options: [] });
      return;
    }
    const clue = Story.clues[p.id];
    if (!clue) return;
    const [id, step, text] = clue;
    const quest = member.quests[id];
    if (p.id === 'relic' && !room.data.rooms.forest?.includes(3)) throw fail('O Guardião das Raízes protege o relicário.');
    if (Story.quests[id].requires && !room.data.cleared.shadow) throw fail('O lugar ainda guarda a magia de Malakar.');
    if (!quest) throw fail('Procure ' + World.NPCS[Story.quests[id].npc].name + ' na Vila para investigar.');
    if (quest.step < step) throw fail(Story.quests[id].steps[quest.step]);
    if (quest.step === step) {
      quest.step++;
      if (p.kind === 'lamp' && !(room.data.lamps ||= []).includes(p.id)) room.data.lamps.push(p.id);
    }
    send(entry, 'notice', text);
  }

  function treeAction(room, entry, point, send) {
    const now = Date.now();
    const zone = entry.member.data.zone;
    const key = zone + ':' + point.id;
    const fruit = room.fruit.get(key);
    if (fruit && fruit.expires > now) {
      if (fruit.claimed) throw fail('A próxima maçã ainda está amadurecendo.');
      if (now < fruit.at + 730) return;
      if (entry.data.apples >= 12) throw fail('Sua mochila já está cheia de maçãs.');
      fruit.claimed = true;
      entry.data.apples++;
      const quest = entry.member.data.quests.herbalist;
      if (quest && quest.step < 2) quest.step++;
      send(entry, 'notice', 'Você guardou uma maçã de Eldoria.');
      return;
    }
    room.fruit.set(key, { id: point.id, zone, at: now, expires: now + 16000, claimed: false });
    send(entry, 'notice', 'Uma maçã caiu. Toque em AÇÃO de novo para colher.');
  }

  function interact(room, entry, payload, send) {
    const member = entry.member.data;
    if (room.battles.has(member.zone)) throw fail('Termine o combate para interagir.');
    const map = World.zone(member.zone);
    const npc = nearbyNpc(room, entry, payload.id);
    if (npc) return showNpc(room, entry, npc, send);
    const point = map.points.find(candidate => candidate.id === payload.id);
    if (!point) throw fail('Aproxime-se de algo com que possa interagir.');
    const position = point.kind === 'enemy' ? World.patrol(point, Date.now()) : point;
    const range = point.kind === 'portal' ? 69 : 64;
    if (World.distance(member, position) > range) throw fail('Chegue mais perto.');
    if (point.kind === 'portal') return portalTravel(room, entry, point, send);
    if (point.kind === 'tree') return treeAction(room, entry, point, send);
    if (point.kind === 'camp') {
      const hero = entry.data;
      if (hero.hp === hero.maxHp && hero.mana === hero.maxMana) {
        send(entry, 'notice', 'Você já recuperou toda a sua energia.');
        return;
      }
      hero.hp = hero.maxHp;
      hero.mana = hero.maxMana;
      member.checkpoint = { zone:member.zone, x:point.x, y:point.y };
      send(entry, 'notice', 'A fogueira restaurou sua vida e mana. Ponto de retorno guardado.');
      return;
    }
    if (point.kind === 'clue' || point.kind === 'lamp') return interactClue(room, entry, point, send);
    if (point.kind === 'chest') {
      if (room.data.opened.includes(point.id)) throw fail('Esse tesouro já foi encontrado pelo grupo.');
      room.data.opened.push(point.id);
      entry.data.gold += map.kind === 'branch' ? 46 : 24;
      entry.data.potions++;
      send(entry, 'notice', 'Você encontrou ouro e uma poção!');
    }
    if (point.kind === 'puzzle') {
      if (room.data.rooms[map.region]?.includes(map.dungeonIndex)) throw fail('A inscrição já foi decifrada.');
      const puzzle = DUNGEONS[map.region][map.dungeonIndex];
      send(entry, 'puzzle', { title: map.name, description: puzzle.description, hint: puzzle.hint, id: point.id });
    }
    if (['enemy', 'boss', 'dungeonEnemy'].includes(point.kind)) beginEncounter(room, entry, point);
  }

  function resolvePuzzle(room, entry, payload, send) {
    const member = entry.member.data;
    const map = World.zone(member.zone);
    const point = map.points.find(candidate => candidate.kind === 'puzzle' && candidate.id === payload.id);
    if (!point || World.distance(member, point) > 64 || room.battles.has(member.zone)) throw fail('Chegue perto da inscrição.');
    if (room.data.rooms[map.region]?.includes(map.dungeonIndex)) throw fail('A passagem já está aberta.');
    const puzzle = DUNGEONS[map.region][map.dungeonIndex];
    if (![puzzle.answer, ...(puzzle.accept || [])].some(answer => normalize(answer) === normalize(payload.answer))) {
      throw fail('A inscrição ainda não reagiu. ' + puzzle.hint);
    }
    (room.data.rooms[map.region] ||= []).push(map.dungeonIndex);
    Story.reward(entry.data, 20, 35);
    send(entry, 'puzzleSolved', {});
    send(entry, 'notice', 'A inscrição se acendeu. A porta está aberta!');
  }

  function npcAction(room, entry, payload, send) {
    const npc = nearbyNpc(room, entry, payload.npc);
    if (!npc || room.battles.has(entry.member.data.zone)) throw fail('Converse com o morador de perto.');
    const hero = entry.data;
    const member = entry.member.data;
    if (typeof payload.action !== 'string') throw fail('Escolha uma opção da conversa.');
    if (payload.action.startsWith('quest:')) {
      const id = payload.action.slice(6);
      if (!Story.own(Story.quests, id)) throw fail('Missão desconhecida.');
      const quest = Story.quests[id];
      if (quest.npc !== npc.id || !Story.canOffer(id, room.data)) throw fail('Essa missão ainda não está disponível.');
      const progress = member.quests[id];
      if (!progress) {
        const apples = id === 'herbalist' ? Math.min(2, hero.apples) : 0;
        member.quests[id] = { step: apples, completed: false };
        send(entry, 'notice', 'Missão aceita · ' + quest.title);
      } else {
        if (progress.completed || progress.step !== quest.steps.length - 1) throw fail('O objetivo ainda precisa ser concluído.');
        if (id === 'herbalist') {
          if (hero.apples < 2) throw fail('Traga duas maçãs para Mira.');
          hero.apples -= 2;
        }
        progress.completed = true;
        progress.step++;
        Story.reward(hero, ...quest.reward);
        send(entry, 'notice', 'Missão concluída · ' + quest.title);
      }
      return;
    }
    if (npc.id === 'blacksmith' && payload.action === 'shop') {
      send(entry, 'shop', {});
      return;
    }
    if (npc.id === 'healer' && payload.action === 'rest') {
      if (hero.hp === hero.maxHp && hero.mana === hero.maxMana) {
        send(entry, 'notice', 'Mira vê que você já está recuperado.');
        return;
      }
      const cost = room.data.cleared.forest ? 10 : 0;
      if (hero.gold < cost) throw fail('São necessários 10 ouros para descansar com Mira.');
      hero.gold -= cost;
      hero.hp = hero.maxHp;
      hero.mana = hero.maxMana;
      send(entry, 'notice', 'Mira cuidou de suas feridas.');
      return;
    }
    if (npc.id === 'lia' && payload.action === 'recruit') {
      if (!hero.companions.lume || hero.companions.lia) throw fail('Lia precisa saber que o espírito está livre.');
      hero.companions.lia = true;
      send(entry, 'notice', 'Lia juntou-se à sua jornada.');
    }
  }

  function equip(room, entry, payload, send) {
    const hero = entry.data;
    if (room.battles.has(entry.member.data.zone)) throw fail('Guarde a mochila durante o combate.');
    if (payload.action === 'feed') {
      if (!hero.apples || !hero.companions.lume || hero.companions.lume >= 5) throw fail('Lume já está satisfeito ou faltam maçãs.');
      hero.apples--;
      hero.companions.lume++;
      send(entry, 'notice', 'Lume adorou a maçã. Vínculo ' + hero.companions.lume + '/5.');
      return;
    }
    if (payload.action === 'upgrade') {
      if (!hero.skillPoints) throw fail('Você ganha pontos ao subir de nível.');
      hero.skillPoints--;
      hero.skillLevel++;
      send(entry, 'notice', 'Habilidade principal aprimorada.');
      return;
    }
    if (payload.action === 'unequip') {
      if (!['weapon', 'armor', 'charm'].includes(payload.slot)) throw fail('Espaço de equipamento inválido.');
      hero.equipment[payload.slot] = null;
      return;
    }
    if (payload.action === 'buy' && !nearbyNpc(room, entry, 'blacksmith')) throw fail('Compre com Eldrin na Vila.');
    if (payload.item === 'potion' && payload.action === 'buy') {
      if (hero.gold < 10) throw fail('São necessários 10 ouros.');
      hero.gold -= 10;
      hero.potions++;
      return;
    }
    if (!Story.own(EQUIPMENT, payload.item)) throw fail('Equipamento inválido.');
    const item = EQUIPMENT[payload.item];
    if (payload.action === 'buy') {
      if (!item.price || hero.owned.includes(payload.item) || hero.gold < item.price) throw fail('O item já pertence a você, não está à venda ou faltam ouros.');
      hero.gold -= item.price;
      hero.owned.push(payload.item);
      send(entry, 'notice', item.name + ' foi guardado na mochila.');
    } else if (payload.action === 'equip') {
      if (!hero.owned.includes(payload.item)) throw fail('Este equipamento não está na mochila.');
      hero.equipment[item.slot] = payload.item;
      send(entry, 'notice', item.name + ' equipado.');
    }
  }

  function battleAction(room, entry, payload, send, timeout = false) {
    const zone = entry.member.data.zone;
    const battle = room.battles.get(zone);
    if (!battle || (!timeout && (payload.id !== battle.id || payload.turn !== battle.turn))) {
      throw fail('O turno mudou. Aguarde a próxima ação.');
    }
    const group = battle.heroes.map(id => room.players.get(id)).filter(Boolean);
    const action = timeout ? 'defend' : payload.action;
    const result = Combat.act(battle, entry.id, action, group);
    if (result.error) throw fail(result.error);
    battle.expires = Date.now() + turnMs;
    if (!result.outcome) return;
    room.battles.delete(zone);
    const { kind, region, index: targetIndex } = battle.target;
    const world = room.data;
    const won = result.outcome === 'won';
    if (won && kind === 'boss') world.cleared[region] = true;
    if (won && kind === 'enemy') world.defeated[region].push(targetIndex);
    if (won && kind === 'dungeonEnemy') (world.rooms[region] ||= []).push(targetIndex);
    const bards = group.some(player => player.data.classKey === 'bard' && player.data.hp > 0);
    for (const [i, player] of group.entries()) {
      player.battleBaseline = null;
      if (won) {
        const mission = kind === 'boss' ? Story.mainQuest(region)?.reward : null;
        Story.reward(player.data, Math.ceil((battle.rewards.gold + (mission?.gold || 0)) * (bards ? 1.1 : 1)), battle.rewards.xp + (mission?.xp || 0));
        if (kind === 'dungeonEnemy' && targetIndex === 3) {
          const eligible = player.member.data.dungeonEligible ||= [];
          if (!eligible.includes(region)) eligible.push(region);
        }
      }
      if (!player.data.hp || result.outcome === 'lost') {
        player.data.hp = Math.ceil(player.data.maxHp * 0.55);
        player.data.mana = Math.ceil(player.data.maxMana * 0.55);
        const checkpoint = player.member.data.checkpoint;
        if (World.zone(checkpoint?.zone).kind === 'surface' && World.canStand(checkpoint.zone, checkpoint.x, checkpoint.y)) {
          teleport(player, checkpoint.zone, [checkpoint.x, checkpoint.y]);
        } else teleport(player, 'village', [480 + (i % 4) * 23, 451 + Math.floor(i / 4) * 22]);
      } else if (kind === 'boss' && won) {
        teleport(player, zone, [480 + ((i % 3) - 1) * 32, 400 + Math.floor(i / 3) * 25]);
      } else {
        player.encounterAt = Date.now() + 4000;
        if (!won) {
          const checkpoint = player.member.data.checkpoint;
          teleport(player, zone, [checkpoint?.x, checkpoint?.y]);
          player.encounterAt = Date.now() + 4000;
        }
      }
      const message = won ? battle.name + ' foi derrotado. Recompensas guardadas.' :
        result.outcome === 'lost' ? 'O grupo recuou a um ponto seguro. Descanse antes de tentar de novo.' : result.text;
      send(player, 'notice', message);
      if (won && kind === 'boss' && region !== 'shadow') send(player, 'chapter', { name: World.zone(zone).name });
    }
  }

  function move(room, entry, socket, payload) {
    if (!payload || room.locked || room.battles.get(entry.member.data.zone)?.heroes.includes(entry.id)) return;
    const { dx, dy, seq, zone } = payload;
    const member = entry.member.data;
    if (zone !== member.zone || !Number.isSafeInteger(seq) || seq <= entry.lastInput
      || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 1 || Math.abs(dy) > 1) return;
    const now = Date.now();
    const elapsed = entry.lastMove ? now - entry.lastMove : 65;
    if (elapsed < 32) return;
    entry.lastMove = now;
    entry.lastInput = seq;
    const dt = Math.min(elapsed, 95) / 1000;
    const position = World.walk(zone, member, dx, dy, dt);
    const moving = position.x !== member.x || position.y !== member.y;
    Object.assign(member, position, { facing: World.facing(dx, dy, member.facing) });
    entry.positionDirty ||= moving;
    const packet = { ...position, id: entry.id, zone, facing: member.facing, moving, seq };
    socket.volatile.emit('moved', packet);
    socket.to(here(room, zone)).volatile.emit('moved', packet);

    if (!moving || entry.encounterAt > now || room.battles.has(zone)) return;
    const map = World.zone(zone);
    const target = map.points.find(p => p.kind === 'enemy' && !room.data.defeated[map.region]?.includes(p.enemyIndex)
      && World.distance(member, World.patrol(p, now)) <= 29);
    if (!target) return;
    try {
      beginEncounter(room, entry, target);
      publish(room);
    } catch (error) {
      if (error.code !== 'GAME_RULE') logger.error(error);
    }
  }

  function dropEntry(room, entry) {
    if (room.players.get(entry.id) !== entry) return;
    room.players.delete(entry.id);
    activeHeroes.delete(entry.id);
    if (room.hostId === entry.id) room.hostId = [...room.players.values()].find(player => player.socketId)?.id
      || room.players.keys().next().value || null;
    if (!room.players.size && rooms.get(room.id) === room) {
      rooms.delete(room.id);
      codes.delete(room.code);
    }
  }

  function report(socket, error) {
    if (error.code === 'GAME_RULE' || error.code === 'SAVE_CONFLICT') {
      socket.emit('errorMessage', error.message, { retryable:false });
    } else {
      logger.error(error);
      socket.emit('errorMessage', 'O progresso não foi confirmado. Tente novamente quando o servidor estiver disponível.', { retryable:true });
    }
  }

  function limit(socket, event, milliseconds) {
    const limits = socket.data.limits ||= {};
    const now = Date.now();
    if ((limits[event] || 0) + milliseconds > now) return false;
    limits[event] = now;
    return true;
  }

  io.on('connection', socket => {
    const current = () => {
      const room = rooms.get(socket.data.roomId);
      const entry = room?.players.get(socket.data.heroId);
      return entry?.socketId === socket.id ? { room, entry } : {};
    };
    const admit = (name, handler) => socket.on(name, (payload = {}) => {
      if (!payload || typeof payload !== 'object' || !limit(socket, name, 400)) return;
      if (admissionsQueued >= ADMISSION_LIMIT) {
        socket.emit('errorMessage', 'Há muita gente entrando. Tente em alguns segundos.', { retryable:true });
        return;
      }
      admissionsQueued++;
      admission = admission.then(async () => {
        if (socket.connected) await handler(payload);
      }).catch(error => report(socket, error)).finally(() => admissionsQueued--);
    });
    const event = (name, handler, cooldown = 175, options) => socket.on(name, (payload = {}) => {
      if (!payload || typeof payload !== 'object' || stopping || !limit(socket, name, cooldown)) return;
      const { room, entry } = current();
      if (!entry) return;
      queue(room, () => {
        if (entry.socketId !== socket.id) return;
        return change(room, send => handler(room, entry, payload, send), options?.(entry));
      }).catch(error => report(socket, error));
    });

    admit('adventure', payload => enter(socket, ['create', 'join', 'continue', 'resume'].includes(payload.action) ? payload.action : 'continue', payload));
    admit('redeemRecovery', async payload => {
      if (socket.data.heroId) throw fail('Feche a aventura antes de recuperar outro herói.');
      const [prefix, id, token] = String(payload.code || '').slice(0, 160).trim().split('.');
      if (prefix !== 'ER2' || !credentials(id, token) || !credentials(id, payload.key)) throw fail('Código de recuperação inválido.');
      if (activeHeroes.has(id)) throw fail('Feche a outra sessão e aguarde a saída do personagem.');
      const hero = await storage.readHero(id);
      if (!hero || !sameKey(hero.data.recoveryHash, token)) throw fail('Código de recuperação inválido ou já utilizado.');
      hero.keyHash = hash(payload.key);
      delete hero.data.recoveryHash;
      await storage.save({ players: [hero] });
      socket.emit('recovered', { id });
    });
    event('issueRecovery', (_room, entry, _payload, send) => {
      if (entry.battleBaseline) throw fail('Termine o combate para gerar o código.');
      if (!storage.durable) throw fail('Ative PostgreSQL para recuperar o personagem em outro aparelho.');
      const token = randomBytes(32).toString('hex');
      entry.data.recoveryHash = hash(token);
      send(entry, 'recovery', 'ER2.' + entry.id + '.' + token);
    }, 1600, () => ({ announce: false }));
    event('interact', interact);
    event('puzzleAnswer', resolvePuzzle, 400);
    event('npcAction', npcAction);
    event('inventoryAction', equip);
    event('battleAction', battleAction, 0);
    event('saveGame', (_room, entry, _payload, send) => {
      if (!storage.durable) throw fail('Modo temporário. Configure PostgreSQL para salvar entre reinícios.');
      send(entry, 'notice', entry.battleBaseline ? 'Checkpoint salvo. Este combate pode ser retomado enquanto a sala estiver aberta.' : 'Progresso salvo.');
    }, 900, entry => ({ force: [entry.id] }));
    event('endingSeen', (room, entry) => {
      if (room.data.cleared.shadow) entry.member.data.seenEnding = true;
    }, 350);
    socket.on('leaveAdventure', () => {
      const { room, entry } = current();
      if (!entry || !limit(socket, 'leaveAdventure', 600)) return;
      queue(room, async () => {
        await change(room, send => removeFromBattle(room, entry, send),
          { force: entry.positionDirty ? [entry.id] : [], announce: false });
        socket.leave(here(room, entry.member.data.zone));
        delete socket.data.heroId;
        delete socket.data.roomId;
        dropEntry(room, entry);
        publish(room);
        socket.emit('left');
      }).catch(error => report(socket, error));
    });
    socket.on('moveInput', payload => {
      const { room, entry } = current();
      if (entry && !stopping) move(room, entry, socket, payload);
    });
    socket.on('disconnect', () => {
      const { room, entry } = current();
      if (!entry) return;
      entry.socketId = null;
      entry.awayUntil = Date.now() + graceMs;
      if (room.hostId === entry.id) room.hostId = [...room.players.values()].find(player => player.socketId)?.id || entry.id;
      if (!stopping) publish(room);
    });
  });

  function settleTimeouts(room, now) {
    for (const battle of room.battles.values()) {
      const entry = room.players.get(battle.active);
      if (entry && battle.expires <= now && entry.socketId) {
        queue(room, () => change(room, send => {
          if (room.battles.get(battle.zone) !== battle || battle.expires > Date.now()) return;
          battleAction(room, entry, {}, send, true);
        })).catch(error => logger.error(error));
      }
    }
  }

  function removeFromBattle(room, entry, send) {
    const battle = room.battles.get(entry.member.data.zone);
    if (!battle || !battle.heroes.includes(entry.id)) return;
    if (entry.battleBaseline) entry.data = entry.battleBaseline;
    entry.battleBaseline = null;
    const survivors = battle.heroes.filter(id => id !== entry.id && room.players.get(id)?.data.hp > 0);
    if (!survivors.length) {
      for (const id of battle.heroes) {
        const other = room.players.get(id);
        if (other?.battleBaseline) {
          other.data = other.battleBaseline;
          other.battleBaseline = null;
        }
      }
      room.battles.delete(battle.zone);
      return;
    }
    const active = battle.active === entry.id;
    battle.heroes = battle.heroes.filter(id => id !== entry.id);
    if (active) {
      const group = battle.heroes.map(id => room.players.get(id)).filter(Boolean);
      Combat.skip(battle, entry.id, group);
      if (!battle.active) {
        for (const survivor of group) {
          survivor.data = survivor.battleBaseline || survivor.data;
          survivor.battleBaseline = null;
        }
        room.battles.delete(battle.zone);
      } else battle.expires = Date.now() + turnMs;
      for (const survivor of group) send(survivor, 'notice', entry.data.name + ' saiu do combate.');
    }
    battle.order = battle.order.filter(id => id !== entry.id);
  }

  function expirePlayer(room, entry, now) {
    if (!entry.awayUntil || entry.awayUntil > now) return;
    queue(room, async () => {
      if (entry.socketId || !entry.awayUntil || entry.awayUntil > Date.now()) return;
      await change(room, send => removeFromBattle(room, entry, send),
        { force: entry.positionDirty ? [entry.id] : [], announce: false });
      dropEntry(room, entry);
      publish(room);
    }).catch(error => logger.error(error));
  }

  const timer = setInterval(() => {
    if (stopping) return;
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.locked || room.queued) continue;
      settleTimeouts(room, now);
      for (const [id, fruit] of room.fruit) if (fruit.expires <= now) room.fruit.delete(id);
      for (const entry of room.players.values()) expirePlayer(room, entry, now);
      if (room.nextPositionSave && room.nextPositionSave > now) continue;
      room.nextPositionSave = now + 4500;
      const force = [...room.players.values()].filter(entry => entry.positionDirty).map(entry => entry.id);
      if (force.length) queue(room, () => change(room, () => {}, { force, announce: false })).catch(error => logger.error(error));
    }
  }, 500);
  timer.unref();

  async function listen(port = Number(process.env.PORT) || 3000, host = '0.0.0.0') {
    await storage.init().catch(error => logger.error('PostgreSQL indisponível:', error.message));
    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, host, () => {
        httpServer.off('error', reject);
        resolve();
      });
    });
    return httpServer.address();
  }

  function close() {
    shutdown ||= stop();
    return shutdown;
  }

  async function stop() {
    stopping = true;
    clearInterval(timer);
    await admission;
    for (const room of rooms.values()) {
      await room.tail;
      const force = [...room.players.values()].filter(entry => entry.positionDirty).map(entry => entry.id);
      if (force.length) await change(room, () => {}, { force, announce: false }).catch(error => logger.error(error));
    }
    await new Promise(resolve => io.close(resolve));
    await storage.close();
  }

  return { app, httpServer, listen, close };
}

if (require.main === module) {
  const game = createGame();
  game.listen().then(address => console.log('Reino Sombrio Online na porta ' + address.port))
    .catch(error => { console.error(error); process.exitCode = 1; });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    const limit = setTimeout(() => process.exit(1), 8000);
    limit.unref();
    game.close().then(() => clearTimeout(limit)).catch(error => { console.error(error); process.exitCode = 1; });
  });
}

module.exports = { createGame };
