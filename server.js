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
  res.status(200).json({ ok: true, game: 'Reino Sombrio Online', indexExists: fs.existsSync(INDEX_FILE) });
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

// Classes jogáveis: cada uma tem aparência e atributos próprios.
const HERO_CLASSES = {
  warrior: { name: 'Guerreiro', hp: 120, attack: 13, defense: 6, weapon: 'Espada de ferro' },
  archer:  { name: 'Arqueira', hp: 100, attack: 16, defense: 3, weapon: 'Arco simples' },
  mage:    { name: 'Maga', hp: 90, attack: 19, defense: 2, weapon: 'Cajado arcano' },
  druid:   { name: 'Druida', hp: 110, attack: 12, defense: 5, weapon: 'Cajado de madeira' }
};

const SPAWN_POINTS = [
  { x: 46, y: 78 }, { x: 55, y: 82 }, { x: 64, y: 77 }, { x: 36, y: 83 },
  { x: 73, y: 82 }, { x: 27, y: 77 }, { x: 49, y: 88 }, { x: 59, y: 87 }
];

const cleanName = (value) => String(value || '').replace(/[<>]/g, '').trim().slice(0, 18);
const createRoomCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();

function makePlayer(id, name, classKey, spawn) {
  const hero = HERO_CLASSES[classKey] ? classKey : 'warrior';
  const config = HERO_CLASSES[hero];
  return {
    id, name, classKey: hero, className: config.name,
    x: spawn.x, y: spawn.y, facing: 'down',
    hp: config.hp, maxHp: config.hp, attack: config.attack, defense: config.defense,
    level: 1, xp: 0, gold: 20, potions: 3,
    weapon: config.weapon, ready: false, lastMoveAt: 0
  };
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
      level: player.level, xp: player.xp, gold: player.gold, potions: player.potions,
      weapon: player.weapon, ready: player.ready
    })),
    world: room.world,
    battle: room.battle
  };
}

function emitRoom(room) { io.to(room.code).emit('state', publicRoom(room)); }
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

function addExperience(player, amount) {
  player.xp += amount;
  while (player.xp >= 100) {
    player.xp -= 100;
    player.level += 1;
    player.maxHp += 15;
    player.hp = player.maxHp;
    player.attack += 3;
    player.defense += 1;
    sendPlayerMessage(player, `✨ ${player.name} chegou ao nível ${player.level}!`);
  }
}

io.on('connection', (socket) => {
  socket.on('createRoom', (payload = {}) => {
    const name = cleanName(payload.name) || 'Aventureiro';
    const heroClass = HERO_CLASSES[payload.heroClass] ? payload.heroClass : 'warrior';
    let roomCode;
    do { roomCode = createRoomCode(); } while (rooms.has(roomCode));

    const room = {
      code: roomCode,
      hostId: socket.id,
      players: new Map(),
      world: { forest: false, cave: false, castle: false },
      battle: null
    };

    room.players.set(socket.id, makePlayer(socket.id, name, heroClass, nextSpawn(room)));
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.emit('joined', { code: roomCode });
    emitRoom(room);
  });

  socket.on('joinRoom', (payload = {}) => {
    const name = cleanName(payload.name) || 'Aventureiro';
    const heroClass = HERO_CLASSES[payload.heroClass] ? payload.heroClass : 'warrior';
    const roomCode = String(payload.roomCode || '').trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return socket.emit('errorMessage', 'Sala não encontrada. Confira o código.');
    if (room.players.size >= 8) return socket.emit('errorMessage', 'A sala já está cheia (máximo de 8 jogadores).');
    if ([...room.players.values()].some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      return socket.emit('errorMessage', 'Esse nome já está sendo usado nesta sala.');
    }

    room.players.set(socket.id, makePlayer(socket.id, name, heroClass, nextSpawn(room)));
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
    const deltaX = clamp(requestedX - player.x, -2.2, 2.2);
    const deltaY = clamp(requestedY - player.y, -2.2, 2.2);
    player.x = clamp(player.x + deltaX, 5, 95);
    player.y = clamp(player.y + deltaY, 58, 91);
    player.facing = allowedFacing.includes(payload.facing) ? payload.facing : player.facing;
    player.lastMoveAt = now;

    socket.to(room.code).emit('playerMoved', {
      id: player.id, x: player.x, y: player.y, facing: player.facing
    });
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
    if (!['forest', 'cave', 'castle'].includes(area)) return;
    if (area === 'cave' && !room.world.forest) return socket.emit('errorMessage', 'Explore e conclua a Floresta Sombria primeiro.');
    if (area === 'castle' && !room.world.cave) return socket.emit('errorMessage', 'Conclua a Caverna dos Ecos antes de entrar no castelo.');
    if (area === 'castle' && room.world.castle) return socket.emit('errorMessage', 'O castelo já foi conquistado! O reino está livre.');

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
    if (area === 'castle') {
      room.battle = createBattle(room, { area, enemy: 'Senhor das Sombras', hp: 180, maxHp: 180, atk: 20, xp: 120, gold: 150, boss: true });
      sendRoomMessage(room, '☠️ O Senhor das Sombras apareceu! Todos juntos!');
    } else {
      const enemies = area === 'forest'
        ? [
            { name: 'Lobo sombrio', hp: 35, atk: 9, xp: 25, gold: 12 },
            { name: 'Goblin ladrão', hp: 45, atk: 11, xp: 30, gold: 16 },
            { name: 'Aranha gigante', hp: 40, atk: 12, xp: 35, gold: 18 }
          ]
        : [
            { name: 'Orc guerreiro', hp: 65, atk: 15, xp: 40, gold: 25 },
            { name: 'Esqueleto amaldiçoado', hp: 55, atk: 17, xp: 45, gold: 28 },
            { name: 'Troll da caverna', hp: 85, atk: 13, xp: 50, gold: 35 }
          ];
      const enemy = enemies[Math.floor(Math.random() * enemies.length)];
      room.battle = createBattle(room, { area, enemy: enemy.name, hp: enemy.hp, maxHp: enemy.hp, atk: enemy.atk, xp: enemy.xp, gold: enemy.gold, boss: false });
      sendRoomMessage(room, `⚔️ ${player.name} encontrou ${enemy.name}! A equipe pode atacar.`);
    }
    emitRoom(room);
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
      player.gold -= 40; player.attack += 8; player.weapon = 'Espada de aço';
      sendRoomMessage(room, `🗡️ ${player.name} comprou a Espada de aço!`);
    } else if (item === 'armor') {
      if (player.gold < 35) return socket.emit('errorMessage', 'Você precisa de 35 ouros para comprar a armadura reforçada.');
      if (player.defense >= 10) return socket.emit('errorMessage', 'Sua armadura já está no nível máximo da loja.');
      player.gold -= 35; player.defense += 4;
      sendRoomMessage(room, `🛡️ ${player.name} comprou a Armadura reforçada!`);
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
      player.hp = Math.min(player.maxHp, player.hp + 35);
      sendRoomMessage(room, `🧪 ${player.name} usou uma poção.`);
    } else if (action === 'attack') {
      const damage = Math.max(1, player.attack + Math.floor(Math.random() * 7) - 2);
      battle.hp = Math.max(0, battle.hp - damage);
      sendRoomMessage(room, `⚔️ ${player.name} causou ${damage} de dano em ${battle.enemy}!`);
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
      if (defeated.area === 'forest') room.world.forest = true;
      if (defeated.area === 'cave') room.world.cave = true;
      if (defeated.boss) room.world.castle = true;
      sendRoomMessage(room, defeated.boss
        ? '🏆 O Senhor das Sombras foi derrotado! O reino está livre! Um abraço do Beto San! Até a próxima aventura.'
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
        const damage = Math.max(1, battle.atk - Math.floor(target.defense / 2) + Math.floor(Math.random() * 5));
        target.hp = Math.max(0, target.hp - damage);
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

  socket.on('rest', () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.battle) return socket.emit('errorMessage', 'Não é possível descansar durante um combate.');
    const player = room.players.get(socket.id);
    if (player.gold < 10) return socket.emit('errorMessage', 'Você precisa de 10 ouros para descansar.');
    player.gold -= 10;
    player.hp = player.maxHp;
    socket.emit('notice', 'Você descansou e recuperou toda a vida.');
    emitRoom(room);
  });

  socket.on('disconnect', () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const player = room.players.get(socket.id);
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
