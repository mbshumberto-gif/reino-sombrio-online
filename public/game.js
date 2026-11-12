const socket = io();
const $ = id => document.getElementById(id);
let currentCode = null, latestState = null, toastTimer;
let localPosition = null;
const heldKeys = new Set();
let moveFrame = null, lastMoveSent = 0;

const HEROES = {
 warrior:{label:'Guerreiro',skin:'#d9a77b',hair:'#6b422b',outfit:'#416f91',accent:'#e2bd61',trim:'#263b55',gear:'sword'},
 mage:{label:'Mago',skin:'#e6bb98',hair:'#3a294b',outfit:'#65518f',accent:'#c58bf0',trim:'#392c5e',gear:'staff'},
 sorceress:{label:'Feiticeira',skin:'#e7c1a5',hair:'#432c58',outfit:'#704b91',accent:'#dc91ed',trim:'#432b62',gear:'staff'},
 cleric:{label:'Clérigo',skin:'#e5bd91',hair:'#a17b42',outfit:'#e8e0c9',accent:'#e3bf5c',trim:'#8d7545',gear:'staff'},
 rogue:{label:'Ladino',skin:'#c98e65',hair:'#30252b',outfit:'#4a4d5e',accent:'#ad4554',trim:'#282b39',gear:'sword'},
 bard:{label:'Bardo',skin:'#e3b88d',hair:'#70452e',outfit:'#8b4e67',accent:'#e1b65c',trim:'#56364e',gear:'staff'},
 paladin:{label:'Paladino',skin:'#d9a77b',hair:'#6b422b',outfit:'#b9c4ce',accent:'#e5c46a',trim:'#617488',gear:'sword'},
 ranger:{label:'Ranger',skin:'#c98e65',hair:'#493c27',outfit:'#557b55',accent:'#a8c66c',trim:'#314b3b',gear:'bow'},
 monk:{label:'Monge',skin:'#d9a77b',hair:'#493c27',outfit:'#a45c38',accent:'#e4c46b',trim:'#633b2d',gear:'sword'}
};

function toast(msg){ $("toast").textContent=msg; $("toast").classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3000); }
function log(msg){ const el=document.createElement("div"); el.className="logline"; el.textContent=msg; $("log").prepend(el); }
function enterGame(){ $("entry").classList.add("hidden"); $("game").classList.remove("hidden"); $("roomLabel").textContent=currentCode; }
function chosenHero(){ return $("heroClass").value || 'warrior'; }

$("createBtn").onclick=()=>socket.emit("createRoom",{name:$("playerName").value,heroClass:chosenHero()});
$("joinBtn").onclick=()=>socket.emit("joinRoom",{name:$("playerName").value,roomCode:$("roomCode").value,heroClass:chosenHero()});
$("copyBtn").onclick=async()=>{try{await navigator.clipboard.writeText(currentCode);toast("Código copiado! Envie para seus amigos.")}catch{toast("Código da sala: "+currentCode)}};
$("readyBtn").onclick=()=>socket.emit("ready");
$("restBtn").onclick=()=>socket.emit("rest");
document.querySelectorAll("[data-area]").forEach(b=>b.onclick=()=>socket.emit("explore",{area:b.dataset.area,action:b.dataset.action||"enter"}));
$("treasureForestBtn").onclick=()=>socket.emit("explore",{area:"forest",action:"treasure"});
$("treasureCaveBtn").onclick=()=>socket.emit("explore",{area:"cave",action:"treasure"});
$("merchantBtn").onclick=()=>$("merchant").classList.toggle("hidden");
$("closeMerchant").onclick=()=>$("merchant").classList.add("hidden");
document.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>socket.emit("shop",{item:b.dataset.buy}));
$("attackBtn").onclick=()=>socket.emit("battleAction",{action:"attack"});
$("potionBtn").onclick=()=>socket.emit("battleAction",{action:"potion"});
$("fleeBtn").onclick=()=>socket.emit("battleAction",{action:"flee"});
document.querySelectorAll("[data-npc]").forEach(button=>button.onclick=()=>socket.emit("talkNpc",{npc:button.dataset.npc}));
$("defendBtn").onclick=()=>socket.emit("battleAction",{action:"defend"});
$("skillBtn").onclick=()=>socket.emit("battleAction",{action:"skill"});
$("skillUpgradeBtn").onclick=()=>socket.emit("upgradeSkill");
document.querySelectorAll("[data-boss-area]").forEach(button=>button.onclick=()=>socket.emit("explore",{area:button.dataset.bossArea,action:"enter",boss:true}));

// Sprites SVG originais desenhados em blocos para manter o visual pixel art.
function heroSprite(heroKey, walking=false, facing='down', equipment={}) {
  const c = HEROES[heroKey] || HEROES.warrior;
  const armorTone = equipment?.armor === 'shadowCloak' ? '#382b4f' : equipment?.armor === 'chainArmor' ? '#9da9b2' : equipment?.armor === 'leatherArmor' ? '#9a6844' : '';
  const armorOverlay = armorTone ? `<path d="M9 14 L26 14 L28 28 L18 31 L7 28 Z" fill="${armorTone}" stroke="#25232b" stroke-width="1"/><rect x="15" y="17" width="5" height="9" fill="${c.accent}"/>` : '';
  const face = facing === 'left' ? 'scale(-1 1) translate(-32 0)' : '';
  let headgear = '', accessory = '';
  if (heroKey === 'warrior') headgear = `<rect x="7" y="3" width="18" height="5" fill="${c.accent}"/><rect x="5" y="7" width="22" height="5" fill="#8f9ba0"/><rect x="10" y="10" width="3" height="3" fill="#f2d47d"/>`;
  if (heroKey === 'archer') headgear = `<rect x="5" y="3" width="22" height="5" fill="${c.accent}"/><rect x="7" y="7" width="18" height="5" fill="${c.accent}"/><rect x="4" y="10" width="5" height="12" fill="${c.accent}"/>`;
  if (heroKey === 'mage') headgear = `<rect x="12" y="0" width="8" height="5" fill="${c.accent}"/><rect x="8" y="5" width="16" height="5" fill="${c.accent}"/><rect x="5" y="10" width="22" height="4" fill="#513b78"/>`;
  if (heroKey === 'druid') headgear = `<rect x="7" y="4" width="5" height="5" fill="${c.accent}"/><rect x="13" y="1" width="6" height="7" fill="#6d9c55"/><rect x="20" y="4" width="5" height="5" fill="${c.accent}"/>`;
  if (c.gear === 'sword') accessory = `<g class="weapon"><rect x="27" y="15" width="3" height="18" fill="#d8e1e3"/><rect x="25" y="19" width="7" height="3" fill="#e4c46b"/><rect x="27" y="32" width="3" height="6" fill="#75472e"/></g>`;
  if (c.gear === 'bow') accessory = `<g class="weapon"><path d="M28 13 Q38 22 28 34" fill="none" stroke="#b7844c" stroke-width="3"/><path d="M28 13 L28 34" stroke="#e3dfc9" stroke-width="1"/></g>`;
  if (c.gear === 'staff') accessory = `<g class="weapon"><rect x="28" y="9" width="3" height="29" fill="#8a603c"/><rect x="26" y="5" width="7" height="6" fill="${c.accent}"/><rect x="27" y="3" width="5" height="3" fill="#fff0a8"/></g>`;
  return `<svg class="hero-sprite ${walking?'is-walking':''}" viewBox="0 0 36 44" role="img" aria-label="${c.label}" shape-rendering="crispEdges"><g ${face?`transform="${face}"`:''}>
    ${accessory}
    <g class="leg leg-left"><rect x="9" y="29" width="7" height="9" fill="#4b3c39"/><rect x="7" y="37" width="9" height="4" fill="#242b31"/></g>
    <g class="leg leg-right"><rect x="19" y="29" width="7" height="9" fill="#4b3c39"/><rect x="19" y="37" width="9" height="4" fill="#242b31"/></g>
    <rect x="8" y="13" width="19" height="17" fill="${c.outfit}"/>${armorOverlay}<rect x="11" y="14" width="13" height="4" fill="${c.trim}"/><rect x="14" y="18" width="5" height="10" fill="${c.accent}"/>
    <g class="arm arm-left"><rect x="4" y="16" width="6" height="12" fill="${c.outfit}"/><rect x="4" y="26" width="6" height="5" fill="${c.skin}"/></g>
    <g class="arm arm-right"><rect x="25" y="16" width="6" height="12" fill="${c.outfit}"/><rect x="25" y="26" width="6" height="5" fill="${c.skin}"/></g>
    <rect x="10" y="5" width="15" height="12" fill="${c.skin}"/><rect x="10" y="12" width="15" height="4" fill="${c.hair}" opacity=".9"/><rect x="13" y="9" width="2" height="2" fill="#20232a"/><rect x="21" y="9" width="2" height="2" fill="#20232a"/>
    ${headgear}
    <rect x="10" y="28" width="15" height="2" fill="${c.accent}"/>
  </g></svg>`;
}

function renderMap() {
  if (!latestState) return;
  const layer = $("avatarLayer");
  const existing = new Map([...layer.children].map(node => [node.dataset.playerId, node]));
  latestState.players.forEach(p => {
    let marker = existing.get(p.id);
    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'map-player' + (p.id === socket.id ? ' me' : '');
      marker.dataset.playerId = p.id;
      const name = document.createElement('span');
      name.className = 'map-player-name';
      const sprite = document.createElement('div');
      sprite.className = 'sprite-holder';
      marker.append(name, sprite);
      layer.append(marker);
    }
    marker.style.left = `${p.x}%`;
    marker.style.top = `${p.y}%`;
    marker.style.zIndex = String(20 + Math.round(p.y));
    marker.querySelector('.map-player-name').textContent = p.name;
    const signature = `${p.classKey}|${p.facing}|${!!p.moving}|${p.equipment?.armor}|${p.equipment?.weapon}`;
    if (marker.dataset.spriteSignature !== signature) {
      marker.querySelector('.sprite-holder').innerHTML = heroSprite(p.classKey, !!p.moving, p.facing, p.equipment);
      marker.dataset.spriteSignature = signature;
    }
    existing.delete(p.id);
  });
  existing.forEach(node => node.remove());
}

// Movimento no mapa sincronizado com os demais jogadores.
const KEY_DIRECTIONS = {
  ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down',
  ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right'
};
function beginMovement(key) {
  if (!KEY_DIRECTIONS[key]) return;
  heldKeys.add(KEY_DIRECTIONS[key]);
  if (!moveFrame) moveFrame = requestAnimationFrame(movementLoop);
}
function endMovement(key) {
  const direction = KEY_DIRECTIONS[key];
  if (direction) heldKeys.delete(direction);
}
function movementLoop(timestamp) {
  moveFrame = null;
  const me = latestState?.players.find(p => p.id === socket.id);
  if (!me || latestState.battle) { localPosition = null; return; }
  if (heldKeys.size === 0) {
    if (me.moving) { me.moving = false; renderMap(); }
    return;
  }
  let dx = 0, dy = 0;
  if (heldKeys.has('left')) dx -= 1;
  if (heldKeys.has('right')) dx += 1;
  if (heldKeys.has('up')) dy -= 1;
  if (heldKeys.has('down')) dy += 1;
  if (!dx && !dy) return;
  const length = Math.hypot(dx,dy) || 1;
  const speed = 0.24; // percentual do mapa por frame (aprox. 14%/s em 60fps)
  const base = localPosition || {x:me.x,y:me.y};
  const next = {
    x: Math.max(5, Math.min(95, base.x + dx/length*speed)),
    y: Math.max(58, Math.min(91, base.y + dy/length*speed))
  };
  let facing = me.facing || 'down';
  if (Math.abs(dx) > Math.abs(dy)) facing = dx < 0 ? 'left' : 'right';
  else if (dy !== 0) facing = dy < 0 ? 'up' : 'down';
  localPosition = next;
  me.x = next.x; me.y = next.y; me.facing = facing; me.moving = true;
  if (timestamp - lastMoveSent > 65) {
    socket.emit('movePlayer', {x:next.x,y:next.y,facing});
    lastMoveSent = timestamp;
    renderMap();
  }
  moveFrame = requestAnimationFrame(movementLoop);
}
window.addEventListener('keydown', event => {
  if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const key = event.code;
  if (KEY_DIRECTIONS[key]) { event.preventDefault(); beginMovement(key); }
});
window.addEventListener('keyup', event => endMovement(event.code));
window.addEventListener('blur', () => {
  heldKeys.clear();
  const me = latestState?.players.find(p => p.id === socket.id);
  if (me) { me.moving = false; renderMap(); }
});
document.querySelectorAll('[data-move]').forEach(button => {
  const keyForDirection = {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
  const key = keyForDirection[button.dataset.move];
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture?.(event.pointerId); beginMovement(key); });
  ['pointerup','pointercancel','lostpointercapture','pointerleave'].forEach(name => button.addEventListener(name, () => endMovement(key)));
});

// Trilha 8-bit original sintetizada no navegador (sem arquivos ou músicas protegidas).
let audioContext = null, masterGain = null, musicTimer = null, musicEnabled = false, musicStep = 0;
const melody = [659,784,988,784,587,659,784,523,587,698,880,698,523,587,698,494,523,659,784,659,440,523,659,587,392,494,587,494,440,523,659,523];
const bassline = [131,147,165,147,110,131,147,131];
function playTone(freq, duration, type, level, when) {
  if (!audioContext || !masterGain) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(when); osc.stop(when + duration + 0.02);
}
function musicTick() {
  if (!musicEnabled || !audioContext) return;
  const now = audioContext.currentTime + 0.025;
  playTone(melody[musicStep % melody.length], 0.17, 'square', 0.42, now);
  if (musicStep % 4 === 0) playTone(bassline[Math.floor(musicStep/4) % bassline.length], 0.42, 'triangle', 0.3, now);
  if (musicStep % 8 === 4) playTone(melody[(musicStep+5) % melody.length] * 2, 0.08, 'square', 0.13, now+0.09);
  musicStep++;
  musicTimer = setTimeout(musicTick, 220);
}
async function toggleMusic() {
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return toast('Seu navegador não oferece áudio Web Audio.');
      audioContext = new AudioContextClass();
      masterGain = audioContext.createGain();
      masterGain.gain.value = Number($("musicVolume").value)/100 * 0.16;
      masterGain.connect(audioContext.destination);
    }
    await audioContext.resume();
    musicEnabled = !musicEnabled;
    $("musicToggle").textContent = musicEnabled ? '♫ Música: ligada' : '♫ Música: desligada';
    $("musicToggle").classList.toggle('music-on', musicEnabled);
    if (musicEnabled) musicTick(); else { clearTimeout(musicTimer); musicTimer = null; }
  } catch (error) { toast('Não foi possível iniciar a música neste navegador.'); }
}
$("musicToggle").addEventListener('click', toggleMusic);
$("musicVolume").addEventListener('input', () => {
  if (masterGain) masterGain.gain.setTargetAtTime(Number($("musicVolume").value)/100*0.16, audioContext.currentTime, 0.04);
});

fetch("/game-data").then(response=>response.json()).then(data=>{window.gameClasses=data.classes;window.gameQuests=data.quests;const select=$("heroClass");select.innerHTML="";Object.entries(data.classes).forEach(([key,hero])=>{const option=document.createElement("option");option.value=key;option.textContent=`${hero.name} — ${hero.role} | ${hero.skill.name}`;select.append(option);});}).catch(()=>{});
socket.on("joined",data=>{currentCode=data.code;localPosition=null;enterGame();toast("Você entrou na aventura! Compartilhe o código.")});
socket.on("errorMessage",toast);
socket.on("notice",msg=>{toast(msg);log(msg)});
const remoteMoveTimers = new Map();
socket.on('playerMoved', data => {
  if (!latestState) return;
  const p = latestState.players.find(player => player.id === data.id);
  if (p) {
    p.x=data.x; p.y=data.y; p.facing=data.facing; p.moving=true;
    clearTimeout(remoteMoveTimers.get(data.id));
    remoteMoveTimers.set(data.id, setTimeout(() => {
      const current = latestState?.players.find(player => player.id === data.id);
      if (current) { current.moving=false; renderMap(); }
      remoteMoveTimers.delete(data.id);
    }, 220));
    renderMap();
  }
});
socket.on("state",state=>{
 latestState=state;
 const meNow = state.players.find(p => p.id === socket.id);
 if (meNow) localPosition = {x:meNow.x,y:meNow.y};
 if (state.battle) { heldKeys.clear(); localPosition = null; }
 $("players").innerHTML="";
 state.players.forEach(p=>{
   const el=document.createElement("div");el.className="player";
   const icon=document.createElement('span'); icon.className='player-class-icon'; icon.textContent=({warrior:'⚔',mage:'✦',sorceress:'☄',cleric:'✚',rogue:'🗡',bard:'♫',paladin:'🛡',ranger:'🏹',monk:'☯'})[p.classKey]||'⚔';
   const info=document.createElement('div');
   const name=document.createElement("strong");name.textContent=p.name+(p.id===state.hostId?" 👑":"");
   const classLine=document.createElement('span'); classLine.className='class-label'; classLine.textContent=p.className;
   const stats=document.createElement("span");stats.className="hp";stats.textContent=`Nível ${p.level} • Vida ${p.hp}/${p.maxHp} • ATQ ${p.attack} • DEF ${p.defense} • MP ${p.mana}/${p.maxMana} • ${p.gold} ouros • ${p.potions} poções${p.ready?" • Pronto":""}`;
   info.append(name,classLine,stats);el.append(icon,info);$("players").append(el);
 });
 if (meNow) { $("character").textContent=`HERÓI: ${meNow.name} • ${meNow.className} | NÍVEL ${meNow.level} • XP: ${meNow.xp}/100 | HP ${meNow.hp}/${meNow.maxHp} • MP ${meNow.mana}/${meNow.maxMana} | ARMA: ${meNow.weapon} | ARMADURA: ${meNow.armor}`; const skill=window.gameClasses?.[meNow.classKey]?.skill; if(skill) $("skillBtn").textContent=`${skill.name} (${skill.cost} MP)`; }
 $("readyBtn").textContent=state.players.find(p=>p.id===socket.id)?.ready?"Cancelar prontidão":"Estou pronto";
 $("world").innerHTML="";
 [["Floresta Amaldiçoada",state.world.forest],["Caverna dos Ecos",state.world.cave],["Terras do Fogo",state.world.fire],["Castelo dos Condenados",state.world.castle],["Reino Sombrio",state.world.shadow]].forEach(([name,done])=>{
   const tag=document.createElement("span");tag.textContent=(done?"✓ ":"◇ ")+name;if(done)tag.className="done";$("world").append(tag);
 });
 $("treasureCaveBtn").disabled=!state.world.forest||!!state.battle;
 $("treasureForestBtn").disabled=!!state.battle;
 $("merchantBtn").disabled=!!state.battle;
 if(meNow) { $("inventoryPanel").textContent=`Poções: ${meNow.inventory?.potions ?? meNow.potions} • Arma: ${meNow.weapon} • Armadura: ${meNow.armor} • Pontos de habilidade: ${meNow.skillPoints} • Habilidade nível ${meNow.skillLevel}`; $("skillUpgradeBtn").disabled=!meNow.skillPoints; }
 if(state.quests&&window.gameQuests){$("questList").innerHTML="";window.gameQuests.forEach(quest=>{const progress=state.quests[quest.id];const item=document.createElement("div");item.className="quest-item"+(progress?.completed?" completed":"");const title=document.createElement("strong");title.textContent=(progress?.completed?"✓ ":"◇ ")+quest.title;const desc=document.createElement("p");desc.textContent=quest.description;const reward=document.createElement("small");reward.textContent=progress?.completed?"Concluída":`Recompensa: ${quest.reward.xp} XP • ${quest.reward.gold} ouros`;item.append(title,desc,reward);$("questList").append(item);});}

 document.querySelectorAll("[data-area]").forEach(button=>{const area=button.dataset.area;const unlock={forest:null,cave:"forest",fire:"cave",castle:"fire",shadow:"castle"}[area];button.disabled=!!state.battle||!!state.world[area]||(!!unlock&&!state.world[unlock]);});
 const bossUnlock={forest:true,cave:state.world.forest,fire:state.world.cave,castle:state.world.fire,shadow:state.world.castle};document.querySelectorAll("[data-boss-area]").forEach(button=>{const area=button.dataset.bossArea;button.disabled=!!state.battle||!bossUnlock[area]||!!state.world[area];});
 $("townActions").classList.toggle("hidden",!!state.battle);
 if(state.battle) $("merchant").classList.add("hidden");
 const b=state.battle;
 $("battle").classList.toggle("hidden",!b);$("actions").classList.toggle("hidden",!!b);
 if(b){
   $("areaTitle").textContent="Combate cooperativo";
   $("storyText").textContent="A equipe precisa agir em conjunto. Cada jogador tem uma ação por rodada.";
   $("enemyName").textContent=b.enemy;$("enemyHp").textContent=`${b.hp} / ${b.maxHp} de vida`;
   $("enemyBar").style.width=(100*b.hp/b.maxHp)+"%";
   const me=state.players.find(p=>p.id===socket.id);
   const isMyTurn=!!me&&b.activePlayerId===socket.id&&me.hp>0;
   const activePlayer=state.players.find(p=>p.id===b.activePlayerId);
   $("attackBtn").disabled=!isMyTurn;$("potionBtn").disabled=!isMyTurn;$("fleeBtn").disabled=!isMyTurn||b.boss;$("defendBtn").disabled=!isMyTurn;$("skillBtn").disabled=!isMyTurn||!me||me.mana<((window.gameClasses?.[me.classKey]?.skill?.cost)||999);
   $("battleHint").textContent=isMyTurn
     ? `Sua vez! Rodada ${b.turn}. Escolha sua ação.`
     : activePlayer
       ? `Rodada ${b.turn}: vez de ${activePlayer.name}. Aguarde sua vez.`
       : "Aguardando o próximo turno.";
 } else {
   $("areaTitle").textContent="Vila de Eldoria";
   $("storyText").textContent=state.world.shadow?"O reino está livre da escuridão! Malakar foi derrotado. A vitória pertence à equipe.":"Reúnam seus aliados e preparem-se para enfrentar as sombras. Caminhe pela vila usando WASD, as setas ou os controles na tela.";
 }
 renderMap();
});
