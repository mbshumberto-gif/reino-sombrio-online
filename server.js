'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');

// Rotas de diagnóstico e da página inicial.
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, game: 'Reino Sombrio Online', indexExists: fs.existsSync(INDEX_FILE), database: persistence.hasDatabase() });
});

app.get('/', (_req, res) => {
  if (!fs.existsSync(INDEX_FILE)) {
    console.error(`Página inicial não encontrada: ${INDEX_FILE}`);
    return res.status(500).type('text').send(
      'O servidor iniciou, mas não encontrou public/index.html. ' +
      'Confira se a pasta public está no mesmo nível de server.js.'
    );
  }
  return res.sendFile(INDEX_FILE);
});

// Arquivos do jogo: CSS, JavaScript e imagens.
app.use(express.static(PUBLIC_DIR, { index: false }));

const rooms = new Map();
const { HERO_CLASSES, EQUIPMENT, REGIONS, QUESTS } = require('./game-data');
const { REGION_SCENES, DUNGEONS, SIDE_QUESTS, DIALOGUES } = require('./campaign-expansion');
const persistence = require('./persistence');
app.get('/game-data', (_req, res) => res.json({ classes: HERO_CLASSES, regions: REGIONS, quests: QUESTS, equipment: EQUIPMENT }));
app.get('/campaign-data', (_req,res)=>res.json({scenes:REGION_SCENES,dungeons:DUNGEONS,sideQuests:SIDE_QUESTS}));
app.get('/health', (_req,res)=>res.status(200).json({ok:true,database:persistence.hasDatabase()}));
app.get('/campaign-data', (_req,res)=>res.json({scenes:REGION_SCENES,dungeons:DUNGEONS,sideQuests:SIDE_QUESTS}));

const SPAWN_POINTS = [
  { x: 448, y: 470 }, { x: 496, y: 470 }, { x: 400, y: 470 }, { x: 544, y: 470 },
  { x: 352, y: 470 }, { x: 592, y: 470 }, { x: 304, y: 470 }, { x: 640, y: 470 }
];

const cleanName = (value) => String(value || '').replace(/[<>]/g, '').trim().slice(0, 18);
const createRoomCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();

function makePlayer(id, name, classKey, spawn, characterId, saved = {}) {
  const hero = HERO_CLASSES[classKey] ? classKey : 'warrior';
  const config = HERO_CLASSES[hero];
  const fresh = {
    id, name, characterId, classKey: hero, className: config.name,
    x: spawn.x, y: spawn.y, facing: 'down',
    hp: config.hp, maxHp: config.hp, attack: config.attack, baseAttack: config.attack, defense: config.defense, baseDefense: config.defense,
    mana: config.mana, maxMana: config.mana, level: 1, xp: 0, gold: 50, potions: 3,
    weapon: config.weapon, armor: 'Vestuário de aventureiro', equipment: { weapon: null, armor: null },
    inventory: ['Poção de vida x3'], skillPoints: 0, skillLevel: 1, skillCooldown: 0, defending: false, buffs: {},
    ready: false, lastMoveAt: 0
  };
  return { ...fresh, ...saved, id, name, characterId, classKey: hero, className: config.name, x: spawn.x, y: spawn.y, facing: 'down', ready: false, lastMoveAt: 0 };
}

function nextSpawn(room) {
  return SPAWN_POINTS[room.players.size % SPAWN_POINTS.length];
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: [...room.players.values()].map((player) => ({
      id: player.id, name: player.name, classKey: player.classKey, className: player.className,
      x: player.x, y: player.y, facing: player.facing,
      hp: player.hp, maxHp: player.maxHp, attack: player.attack, defense: player.defense,
      mana: player.mana, maxMana: player.maxMana, level: player.level, xp: player.xp, gold: player.gold, potions: player.potions,
      weapon: player.weapon, armor: player.armor, equipment: player.equipment, inventory: { potions: player.potions, weapon: player.weapon, armor: player.armor },
      skillPoints: player.skillPoints, skillLevel: player.skillLevel, skillCooldown: player.skillCooldown, ready: player.ready
    })),
    world: room.world, activeRegion: room.activeRegion, defeatedEnemies: room.defeatedEnemies || {}, dungeon: room.dungeon, sideQuests: room.sideQuests, transition: room.transition,
    quests: room.quests,
    battle: room.battle
  };
}

function emitRoom(room) { for (const player of room.players.values()) persistence.saveCharacter(player); io.to(room.code).emit('state', publicRoom(room)); }
function sendRoomMessage(room, text) { io.to(room.code).emit('notice', text); }
function sendPlayerMessage(player, text) { io.to(player.id).emit('notice', text); }

function createBattle(room, details) {
  const turnOrder = [...room.players.values()]
    .filter((player) => player.hp > 0)
    .map((player) => player.id);
  return {
    ...details,
    turn: 1,
    acted: [],
    turnOrder,
    activePlayerId: turnOrder[0] || null
  };
}

function findRoomByPlayerId(playerId) {
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

function recalculateEquipment(player) {
  const weapon = player.equipment.weapon ? EQUIPMENT[player.equipment.weapon] : null;
  const armor = player.equipment.armor ? EQUIPMENT[player.equipment.armor] : null;
  player.attack = player.baseAttack + (weapon?.attack || 0);
  player.defense = player.baseDefense + (weapon?.defense || 0) + (armor?.defense || 0);
  if (weapon) player.weapon = weapon.name;
  if (armor) player.armor = armor.name;
}

function addExperience(player, amount) {
  player.xp += amount;
  while (player.xp >= 100) {
    player.xp -= 100;
    player.level += 1;
    player.maxHp += 12;
    player.hp = player.maxHp;
    player.maxMana += 8; player.mana = player.maxMana;
    player.baseAttack += 2; player.baseDefense += 1;
    player.skillPoints += 1;
    recalculateEquipment(player);
    sendPlayerMessage(player, `✨ ${player.name} chegou ao nível ${player.level}!`);
  }
}

io.on('connection', (socket) => {
  socket.on('createRoom', async (payload = {}) => {
    const name = cleanName(payload.name) || 'Aventureiro';
    const heroClass = HERO_CLASSES[payload.heroClass] ? payload.heroClass : 'warrior';
    const characterId = String(payload.characterId || crypto.randomUUID()).slice(0,80);
    const saved = await persistence.loadCharacter(characterId);
    let roomCode;
    do { roomCode = createRoomCode(); } while (rooms.has(roomCode));

    const room = {
      code: roomCode,
      hostId: socket.id,
      players: new Map(),
      world: { forest: false, cave: false, fire: false, castle: false, shadow: false },
      defeatedEnemies: { forest: [], cave: [], fire: [], castle: [], shadow: [] },
      quests: Object.fromEntries(QUESTS.map((quest) => [quest.id, { progress: 0, completed: false }])),
      battle: null, activeRegion: 'village', dungeon: null, transition: null,
      sideQuests: Object.fromEntries(SIDE_QUESTS.map(q => [q.id,{accepted:false,progress:0,completed:false}]))
    };

    room.players.set(socket.id, makePlayer(socket.id, name, saved?.classKey || heroClass, nextSpawn(room), characterId, saved || {}));
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.emit('joined', { code: roomCode });
    emitRoom(room);
  });

  socket.on('joinRoom', async (payload = {}) => {
    const name = cleanName(payload.name) || 'Aventureiro';
    const heroClass = HERO_CLASSES[payload.heroClass] ? payload.heroClass : 'warrior';
    const characterId = String(payload.characterId || crypto.randomUUID()).slice(0,80);
    const saved = await persistence.loadCharacter(characterId);
    const roomCode = String(payload.roomCode || '').trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return socket.emit('errorMessage', 'Sala não encontrada. Confira o código.');
    if (room.players.size >= 8) return socket.emit('errorMessage', 'A sala já está cheia (máximo de 8 jogadores).');
    if ([...room.players.values()].some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      return socket.emit('errorMessage', 'Esse nome já está sendo usado nesta sala.');
    }

    room.players.set(socket.id, makePlayer(socket.id, name, saved?.classKey || heroClass, nextSpawn(room), characterId, saved || {}));
    if (room.battle) room.battle.turnOrder.push(socket.id);
    socket.join(roomCode);
    socket.emit('joined', { code: roomCode });
    sendRoomMessage(room, `${name} entrou na aventura!`);
    emitRoom(room);
  });

  // Movimento compartilhado no mapa da vila. O servidor limita a velocidade
  // e mantém as posições oficiais de todos os personagens.
  socket.on('movePlayer', (payload = {}) => {
    const room = findRoomByPlayerId(socket.id);
    if (!room || room.battle) return;
    const player = room.players.get(socket.id);
    const now = Date.now();
    if (now - player.lastMoveAt < 45) return;

    const requestedX = Number(payload.x);
    const requestedY = Number(payload.y);
    const allowedFacing = ['up', 'down', 'left', 'right'];
    if (!Number.isFinite(requestedX) || !Number.isFinite(requestedY)) return;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const deltaX = clamp(requestedX - player.x, -18, 18);
    const deltaY = clamp(requestedY - player.y, -18, 18);
    player.x = clamp(player.x + deltaX, 16, 944);
    player.y = clamp(player.y + deltaY, 16, 560);
    player.facing = allowedFacing.includes(payload.facing) ? payload.facing : player.facing;
    player.lastMoveAt = now;

    socket.to(room.code).emit('playerMoved', {
      id: player.id, x: player.x, y: player.y, facing: player.facing
    });
  });

  socket.on('travelRegion', (payload = {}) => {
    const room = findRoomByPlayerId(socket.id);
    if (!room || room.battle) return;
    const target = String(payload.area || '');
    const targetIndex = REGIONS.findIndex(region => region.id === target);
    const currentIndex = room.activeRegion === 'village' ? -1 : REGIONS.findIndex(region => region.id === room.activeRegion);
    if (target === 'village') {
      if (currentIndex !== 0) return socket.emit('errorMessage','A vila só pode ser alcançada pela passagem da floresta.');
      room.activeRegion = 'village';
    } else {
      if (targetIndex < 0 || targetIndex < currentIndex - 1 || targetIndex > currentIndex + 1) return socket.emit('errorMessage','A passagem ainda está bloqueada.');
      if (REGIONS[targetIndex].unlock && !room.world[REGIONS[targetIndex].unlock]) return socket.emit('errorMessage','Derrote o guardião da região anterior para abrir esta passagem.');
      room.activeRegion = target;
    }
    room.dungeon = null; room.transition = null;
    const enteringFromNorth = target === 'village' || targetIndex < currentIndex;
    [...room.players.values()].forEach((member,index) => {
      member.x = 480 + (index - (room.players.size-1)/2)*42;
      member.y = enteringFromNorth ? 66 : 510;
      member.facing = enteringFromNorth ? 'down' : 'up';
    });
    const chapter = target === 'village' ? 'Vila de Eldoria' : REGION_SCENES[target]?.title || target;
    sendRoomMessage(room, target === 'village' ? 'Vocês retornaram à Vila de Eldoria.' : `A jornada continua: ${chapter}.`);
    emitRoom(room);
  });
  socket.on('ready', () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
    player.ready = !player.ready;
    emitRoom(room);
  });

  socket.on('explore', (payload = {}) => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.battle) return socket.emit('errorMessage', 'Terminem o combate antes de explorar.');

    const player = room.players.get(socket.id);
    const area = payload.area;
    const action = payload.action;
    if (!REGIONS.some((region) => region.id === area)) return;
    if (room.activeRegion !== area) return socket.emit('errorMessage', 'Aproxime-se da passagem para entrar nesta região.');
    const region = REGIONS.find((entry) => entry.id === area);
    if (region.unlock && !room.world[region.unlock]) return socket.emit('errorMessage', `Conclua ${REGIONS.find((entry) => entry.id === region.unlock).name} primeiro.`);
    if (region.boss && room.world[area]) return socket.emit('errorMessage', `${region.name} já foi conquistada!`);

    if (action === 'treasure') {
      if (area === 'forest') {
        const roll = Math.floor(Math.random() * 3);
        if (roll === 0) {
          player.gold += 15;
          sendRoomMessage(room, `💰 ${player.name} encontrou 15 ouros na floresta!`);
        } else if (roll === 1) {
          player.potions += 1;
          sendRoomMessage(room, `🧪 ${player.name} encontrou uma poção na floresta!`);
        } else {
          room.battle = createBattle(room, { area, enemy: 'Goblin ladrão', hp: 45, maxHp: 45, atk: 11, xp: 30, gold: 16, boss: false });
          sendRoomMessage(room, `👹 Uma criatura surpreendeu ${player.name}! Goblin ladrão apareceu.`);
        }
      } else if (area === 'cave') {
        if (Math.floor(Math.random() * 2) === 0) {
          player.gold += 30;
          sendRoomMessage(room, `💰 ${player.name} encontrou 30 ouros nos escombros!`);
        } else {
          player.potions += 2;
          sendRoomMessage(room, `🧪 ${player.name} encontrou duas poções nos escombros!`);
        }
      }
      emitRoom(room);
      return;
    }

    if (action !== 'enter') return;
    room.activeRegion = area; room.transition = null; room.dungeon = null;
    const regionData = REGIONS.find((entry) => entry.id === area);
    const isBoss = payload.boss === true;
    const defeatedList = room.defeatedEnemies?.[area] || [];
    const available = regionData.enemies.map((entry,index)=>({entry,index})).filter(item=>!defeatedList.includes(item.index));
    const selected = Number.isInteger(payload.enemyIndex) ? available.find(item=>item.index===payload.enemyIndex) : available[Math.floor(Math.random()*Math.max(1,available.length))];
    if (!isBoss && !selected) return socket.emit('errorMessage','Não há mais criaturas nesta região. Explore a passagem para seguir adiante.');
    const selectedIndex = selected?.index ?? 0;
    const enemy = isBoss ? regionData.boss : selected.entry;
    room.battle = createBattle(room, { area, enemy: enemy.name, hp: enemy.hp, maxHp: enemy.hp, atk: enemy.atk, xp: enemy.xp, gold: enemy.gold, boss: isBoss, enemyIndex: isBoss ? null : selectedIndex });
    sendRoomMessage(room, isBoss ? `☠️ ${enemy.name} apareceu! Preparem-se!` : `⚔️ ${player.name} encontrou ${enemy.name}! A equipe pode atacar.`);
    emitRoom(room);
  });

  socket.on('startDungeon', (payload = {}) => {
    const room=findRoomByPlayerId(socket.id); if(!room||room.battle)return;
    const area=payload.area; const region=REGIONS.find(r=>r.id===area);
    if(!region||!DUNGEONS[area])return;
    if(region.unlock&&!room.world[region.unlock])return socket.emit('errorMessage','Conquiste a região anterior para abrir esta dungeon.');
    if(room.dungeon&&!room.dungeon.finished)return socket.emit('errorMessage','Você já está em uma dungeon.');
    room.activeRegion=area; room.transition=null;
    room.dungeon={region:area,currentRoom:0,cleared:Array(DUNGEONS[area].length).fill(false),finished:false};
    sendRoomMessage(room,'🗝 Uma dungeon foi descoberta. Avancem sala por sala!');emitRoom(room);
  });
  socket.on('dungeonAction',(payload={})=>{
    const room=findRoomByPlayerId(socket.id);if(!room||room.battle||!room.dungeon)return;
    const dungeon=room.dungeon, roomsData=DUNGEONS[dungeon.region], index=dungeon.currentRoom, action=payload.action;
    const player=room.players.get(socket.id);
    if(action==='leave'){room.dungeon=null;sendPlayerMessage(player,'Você deixou a dungeon.');emitRoom(room);return;}
    if(action==='advance'){
      if(!dungeon.cleared[index])return socket.emit('errorMessage','Conclua a sala atual antes de avançar.');
      if(index>=roomsData.length-1){dungeon.finished=true;player.gold+=75;player.potions+=2;sendRoomMessage(room,'🏆 Dungeon concluída! Recompensa extra: 75 ouros e 2 poções.');}
      else dungeon.currentRoom++;emitRoom(room);return;
    }
    const roomData=roomsData[index];if(!roomData||dungeon.cleared[index])return socket.emit('errorMessage','Esta sala já foi concluída.');
    if(roomData.kind==='puzzle'){if(payload.answer!=='eldoria')return socket.emit('errorMessage','O mecanismo não reagiu. Leia as inscrições e tente novamente.');dungeon.cleared[index]=true;player.xp+=35;player.gold+=20;sendRoomMessage(room,'🔓 Enigma resolvido! A passagem secreta se abriu.');emitRoom(room);return;}
    const isBoss=roomData.kind==='boss';
    room.battle=createBattle(room,{area:dungeon.region,enemy:roomData.enemy,hp:roomData.hp,maxHp:roomData.hp,atk:roomData.atk,xp:roomData.xp,gold:roomData.gold,boss:isBoss,dungeonRoomIndex:index});
    sendRoomMessage(room,isBoss?'☠ Guardião da dungeon à vista!':'⚔ Uma criatura bloqueia a passagem!');emitRoom(room);
  });
  socket.on('sideQuest',(payload={})=>{
    const room=findRoomByPlayerId(socket.id);if(!room||room.battle)return;
    const quest=SIDE_QUESTS.find(q=>q.id===payload.id);if(!quest)return;
    const progress=room.sideQuests[quest.id],player=room.players.get(socket.id);
    if(payload.action==='accept'){progress.accepted=true;sendPlayerMessage(player,'📜 Missão secundária aceita: '+quest.title);}
    else if(payload.action==='claim'){
      if(!progress.accepted||progress.progress<quest.goal)return socket.emit('errorMessage','Objetivo ainda não concluído.');
      if(progress.completed)return socket.emit('errorMessage','Recompensa já recebida.');
      progress.completed=true;player.gold+=quest.reward.gold;addExperience(player,quest.reward.xp);sendPlayerMessage(player,'🎖 Recompensa recebida: '+quest.reward.gold+' ouros e '+quest.reward.xp+' XP.');
    }emitRoom(room);
  });
  socket.on('shop', (payload = {}) => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.battle) return socket.emit('errorMessage', 'Não dá para negociar durante um combate.');
    const player = room.players.get(socket.id);
    const item = payload.item;

    if (item === 'potion') {
      if (player.gold < 10) return socket.emit('errorMessage', 'Você precisa de 10 ouros para comprar uma poção.');
      player.gold -= 10; player.potions += 1;
      sendRoomMessage(room, `🧪 ${player.name} comprou uma poção de vida.`);
    } else if (item === 'sword') {
      if (player.gold < 40) return socket.emit('errorMessage', 'Você precisa de 40 ouros para comprar a espada de aço.');
      if (player.attack >= 20) return socket.emit('errorMessage', 'Você já possui uma arma deste nível ou superior.');
      player.gold -= 40; player.baseAttack += 8; recalculateEquipment(player); player.weapon = 'Espada de aço';
      sendRoomMessage(room, `🗡️ ${player.name} comprou a Espada de aço!`);
    } else if (item === 'armor') {
      if (player.gold < 35) return socket.emit('errorMessage', 'Você precisa de 35 ouros para comprar a armadura reforçada.');
      if (player.defense >= 10) return socket.emit('errorMessage', 'Sua armadura já está no nível máximo da loja.');
      player.gold -= 35; player.baseDefense += 4; recalculateEquipment(player);
      sendRoomMessage(room, `🛡️ ${player.name} comprou a Armadura reforçada!`);
    } else if (EQUIPMENT[item]) {
      const gear = EQUIPMENT[item];
      if (player.gold < gear.price) return socket.emit('errorMessage', `Você precisa de ${gear.price} ouros.`);
      player.gold -= gear.price;
      player.equipment[gear.slot] = item;
      recalculateEquipment(player);
      sendRoomMessage(room, `🧰 ${player.name} equipou ${gear.name}.`);
    } else {
      return socket.emit('errorMessage', 'Item não encontrado na loja.');
    }
    emitRoom(room);
  });

  socket.on('battleAction', (payload = {}) => {
    const room = findRoomByPlayerId(socket.id);
    if (!room || !room.battle) return;
    const player = room.players.get(socket.id);
    const battle = room.battle;
    const action = payload.action;

    if (player.hp <= 0) return socket.emit('errorMessage', 'Seu personagem está sem vida. Descanse na vila.');
    if (battle.activePlayerId !== socket.id) {
      const active = room.players.get(battle.activePlayerId);
      return socket.emit('errorMessage', active
        ? `Aguarde sua vez. Agora é a vez de ${active.name}.`
        : 'Aguarde o próximo turno.');
    }

    if (action === 'potion') {
      if (player.potions < 1) return socket.emit('errorMessage', 'Você não tem poções.');
      if (player.hp === player.maxHp) return socket.emit('errorMessage', 'Sua vida já está cheia.');
      player.potions -= 1;
      player.hp = Math.min(player.maxHp, player.hp + (player.classKey === 'cleric' ? 45 : 35));
      sendRoomMessage(room, `🧪 ${player.name} usou uma poção.`);
    } else if (action === 'attack') {
      let damage = Math.max(1, player.attack + Math.floor(Math.random() * 7) - 2);
      if (player.classKey === 'rogue' && Math.random() < 0.25) damage = Math.floor(damage * 1.75);
      if (player.classKey === 'ranger') damage = Math.floor(damage * 1.15);
      if (player.buffs.inspired) { damage = Math.floor(damage * 1.25); player.buffs.inspired = 0; }
      battle.hp = Math.max(0, battle.hp - damage);
      if (player.classKey === 'monk') player.hp = Math.min(player.maxHp, player.hp + 4);
      sendRoomMessage(room, `⚔️ ${player.name} causou ${damage} de dano em ${battle.enemy}!`);
    } else if (action === 'defend') {
      player.defending = true;
      sendRoomMessage(room, `🛡️ ${player.name} assumiu uma postura defensiva.`);
    } else if (action === 'skill') {
      const skill = HERO_CLASSES[player.classKey].skill;
      const skillPower = skill.power * (1 + ((player.skillLevel || 1) - 1) * 0.2);
      const skillCost = player.classKey === 'sorceress' ? Math.ceil(skill.cost * 0.8) : skill.cost;
      if (player.mana < skillCost) return socket.emit('errorMessage', `Mana insuficiente. ${skill.name} custa ${skillCost} MP.`);
      player.mana -= skillCost;
      if (player.classKey === 'cleric') {
        for (const ally of room.players.values()) if (ally.hp > 0) ally.hp = Math.min(ally.maxHp, ally.hp + skillPower);
        sendRoomMessage(room, `✨ ${player.name} lançou ${skill.name} e curou o grupo.`);
      } else if (player.classKey === 'bard') {
        for (const ally of room.players.values()) if (ally.hp > 0) ally.buffs.inspired = 1;
        sendRoomMessage(room, `🎵 ${player.name} tocou ${skill.name}; o grupo foi inspirado.`);
      } else if (player.classKey === 'paladin') {
        for (const ally of room.players.values()) if (ally.hp > 0) ally.buffs.lightShield = 1;
        sendRoomMessage(room, `🛡️ ${player.name} invocou ${skill.name}; o grupo recebeu proteção.`);
      } else {
        let damage = Math.max(1, Math.floor(player.attack * skillPower * (player.classKey === 'mage' ? 1.2 : 1)) + Math.floor(Math.random() * 8));
        if (player.classKey === 'rogue' && Math.random() < 0.25) damage = Math.floor(damage * 1.75);
        if (player.classKey === 'ranger') damage = Math.floor(damage * 1.15);
        if (player.buffs.inspired) { damage = Math.floor(damage * 1.25); player.buffs.inspired = 0; }
        battle.hp = Math.max(0, battle.hp - damage);
        sendRoomMessage(room, `✨ ${player.name} usou ${skill.name} e causou ${damage} de dano!`);
      }
    } else if (action === 'flee') {
      if (battle.boss) return socket.emit('errorMessage', 'Não há como fugir da batalha final!');
      if (Math.floor(Math.random() * 2) === 0) {
        sendRoomMessage(room, `🏃 ${player.name} conseguiu fugir do combate. A equipe voltou à vila.`);
        room.battle = null;
        emitRoom(room);
        return;
      }
      const damage = Math.max(1, battle.atk - Math.floor(player.defense / 2));
      player.hp = Math.max(0, player.hp - damage);
      sendRoomMessage(room, `❌ ${player.name} não conseguiu fugir e recebeu ${damage} de dano.`);
    } else {
      return socket.emit('errorMessage', 'Ação inválida.');
    }

    battle.acted.push(socket.id);
    const livingPlayers = [...room.players.values()].filter((candidate) => candidate.hp > 0);
    if (battle.hp <= 0) {
      const defeated = battle;
      room.battle = null;
      for (const candidate of livingPlayers) {
        candidate.gold += defeated.gold;
        addExperience(candidate, defeated.xp);
      }
      if (defeated.boss && defeated.dungeonRoomIndex === undefined) {
        room.world[defeated.area] = true;
        const regionIndex = REGIONS.findIndex(region => region.id === defeated.area);
        const nextRegion = REGIONS[regionIndex + 1]?.id || null;
        room.activeRegion = defeated.area;
        room.transition = { region: defeated.area, nextRegion, title: REGION_SCENES[defeated.area]?.title || defeated.area, message: nextRegion ? 'A passagem para a próxima região foi aberta.' : 'Malakar caiu. Eldoria está livre!', at: Date.now() };
        const quest = QUESTS.find((entry) => entry.region === defeated.area);
        if (quest && !room.quests[quest.id].completed) {
          room.quests[quest.id].progress = 1; room.quests[quest.id].completed = true;
          for (const candidate of livingPlayers) { candidate.gold += quest.reward.gold; addExperience(candidate, quest.reward.xp); }
          sendRoomMessage(room, `📜 Missão concluída: ${quest.title}! Recompensas adicionais concedidas.`);
        }
      }
      if (defeated.dungeonRoomIndex !== undefined && room.dungeon) room.dungeon.cleared[defeated.dungeonRoomIndex] = true;
      if (!defeated.boss && defeated.enemyIndex !== null && defeated.enemyIndex !== undefined) {
        room.defeatedEnemies ||= {};
        room.defeatedEnemies[defeated.area] ||= [];
        if (!room.defeatedEnemies[defeated.area].includes(defeated.enemyIndex)) room.defeatedEnemies[defeated.area].push(defeated.enemyIndex);
      }
      if (!defeated.boss) { for (const q of SIDE_QUESTS) { const progress = room.sideQuests?.[q.id]; if (q.region === defeated.area && progress?.accepted && !progress.completed) progress.progress = Math.min(q.goal, progress.progress + 1); } }
      sendRoomMessage(room, defeated.boss
        ? `🏆 ${defeated.enemy} foi derrotado! ${defeated.dungeonRoomIndex !== undefined ? 'A sala foi conquistada!' : defeated.area === 'shadow' ? 'O reino está livre da escuridão!' : 'Uma nova região foi conquistada!'}`
        : `🎉 ${defeated.enemy} derrotado! Os aventureiros vivos receberam ${defeated.xp} XP e ${defeated.gold} ouros.`);
      emitRoom(room);
      return;
    }

    const previousOrder = battle.turnOrder || [...room.players.keys()];
    const currentIndex = previousOrder.indexOf(socket.id);
    const nextId = previousOrder
      .slice(currentIndex + 1)
      .find((id) => room.players.has(id) && room.players.get(id).hp > 0);

    if (livingPlayers.length === 0) {
      room.battle = null;
      sendRoomMessage(room, '💀 Todos caíram em combate. Voltem à vila e tentem novamente.');
      emitRoom(room);
      return;
    }

    if (nextId) {
      battle.activePlayerId = nextId;
    } else {
      // Todos os aventureiros vivos agiram: agora o inimigo realiza seu turno.
      for (const target of livingPlayers) {
        let damage = Math.max(1, battle.atk - Math.floor(target.defense / 2) + Math.floor(Math.random() * 5));
        if (target.classKey === 'warrior') damage = Math.ceil(damage * 0.85);
        if (target.classKey === 'paladin' && battle.boss) damage = Math.ceil(damage * 0.8);
        if (target.defending) damage = Math.ceil(damage * 0.4);
        if (target.buffs.lightShield) { damage = Math.ceil(damage * 0.5); target.buffs.lightShield = 0; }
        target.defending = false;
        target.hp = Math.max(0, target.hp - damage);
        target.mana = Math.min(target.maxMana, target.mana + 6);
        sendPlayerMessage(target, `💥 ${battle.enemy} atacou você e causou ${damage} de dano.`);
      }

      const survivors = [...room.players.values()].filter((candidate) => candidate.hp > 0);
      if (survivors.length === 0) {
        room.battle = null;
        sendRoomMessage(room, '💀 Todos caíram em combate. Voltem à vila e tentem novamente.');
        emitRoom(room);
        return;
      }

      battle.turn += 1;
      battle.acted = [];
      battle.turnOrder = survivors.map((candidate) => candidate.id);
      battle.activePlayerId = battle.turnOrder[0];
      const nextPlayer = room.players.get(battle.activePlayerId);
      sendRoomMessage(room, `🔄 Rodada ${battle.turn}: ${nextPlayer.name} começa.`);
    }

    emitRoom(room);
  });

  socket.on('upgradeSkill', () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.battle) return socket.emit('errorMessage', 'Aprimore sua habilidade fora de combate.');
    const player = room.players.get(socket.id);
    if (player.skillPoints < 1) return socket.emit('errorMessage', 'Você precisa de um ponto de habilidade. Suba de nível para ganhar mais.');
    player.skillPoints -= 1;
    player.skillLevel = (player.skillLevel || 1) + 1;
    sendPlayerMessage(player, `✨ Sua habilidade ${HERO_CLASSES[player.classKey].skill.name} chegou ao nível ${player.skillLevel}!`);
    emitRoom(room);
  });

  socket.on('talkNpc', (payload = {}) => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.battle) return socket.emit('errorMessage', 'Não é possível conversar durante o combate.');
    const player = room.players.get(socket.id);
    if (payload.npc === 'healer') {
      if (player.gold < 15) return socket.emit('errorMessage', 'A curandeira cobra 15 ouros pelo tratamento.');
      player.gold -= 15; player.hp = player.maxHp; player.mana = player.maxMana;
      socket.emit('dialogue',{title:'Mira, a Curandeira',lines:DIALOGUES.healer.map(line=>line.text).concat('Pronto. Suas forças foram restauradas.')});
    } else if (payload.npc === 'blacksmith') {
      socket.emit('dialogue', { title:'Eldrin, o Ferreiro', lines:DIALOGUES.blacksmith.map(line=>line.text).concat('Abra o mercador para conferir armas e armaduras disponíveis.') });
    } else if (payload.npc === 'chronicler') {
      const next = QUESTS.find(quest => !room.quests[quest.id].completed);
      socket.emit('dialogue', { title:'Cronista Aderic', lines:DIALOGUES.chronicler.map(line=>line.text).concat(next ? `A próxima crônica é: ${next.title}. ${next.description}` : 'Você concluiu todas as crônicas de Eldoria.') });
    } else if (payload.npc === 'villager') { socket.emit('dialogue',{title:'Moradora de Eldoria',lines:DIALOGUES.villager.map(line=>line.text).concat('Se encontrar a relíquia, leve-a ao cronista. Ele saberá o que fazer.')}); }
    else return;
    emitRoom(room);
  });

  socket.on('rest', () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.battle) return socket.emit('errorMessage', 'Não é possível descansar durante um combate.');
    const player = room.players.get(socket.id);
    if (player.gold < 10) return socket.emit('errorMessage', 'Você precisa de 10 ouros para descansar.');
    player.gold -= 10;
    player.hp = player.maxHp; player.mana = player.maxMana; player.defending = false;
    socket.emit('notice', 'Você descansou e recuperou toda a vida e mana.');
    emitRoom(room);
  });

  socket.on('disconnect', async () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (player) await persistence.saveCharacter(player);
    room.players.delete(socket.id);
    if (player) sendRoomMessage(room, `${player.name} saiu da sala.`);
    if (room.players.size === 0) {
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    if (room.battle) {
      const battle = room.battle;
      const order = battle.turnOrder || [];
      const leavingIndex = order.indexOf(socket.id);
      battle.turnOrder = order.filter((id) => id !== socket.id);
      battle.acted = battle.acted.filter((id) => id !== socket.id);
      if (battle.activePlayerId === socket.id) {
        const nextId = order.slice(leavingIndex + 1).find((id) =>
          room.players.has(id) && room.players.get(id).hp > 0
        );
        const survivors = [...room.players.values()].filter((candidate) => candidate.hp > 0);
        if (nextId) {
          battle.activePlayerId = nextId;
        } else if (survivors.length > 0) {
          // Se quem saiu era o último da ordem, o inimigo conclui a rodada.
          for (const target of survivors) {
            const damage = Math.max(1, battle.atk - Math.floor(target.defense / 2));
            target.hp = Math.max(0, target.hp - damage);
            sendPlayerMessage(target, `💥 ${battle.enemy} atacou você e causou ${damage} de dano.`);
          }
          const remaining = [...room.players.values()].filter((candidate) => candidate.hp > 0);
          if (remaining.length === 0) {
            room.battle = null;
            sendRoomMessage(room, '💀 Todos caíram em combate. Voltem à vila e tentem novamente.');
          } else {
            battle.turn += 1;
            battle.acted = [];
            battle.turnOrder = remaining.map((candidate) => candidate.id);
            battle.activePlayerId = battle.turnOrder[0];
          }
        } else {
          room.battle = null;
        }
      }
    }
    emitRoom(room);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Reino Sombrio Online rodando na porta ${PORT}`);
  console.log(`Pasta pública: ${PUBLIC_DIR}`);
});
