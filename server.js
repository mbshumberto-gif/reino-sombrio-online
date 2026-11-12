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
const cleanName = (value) => String(value || '').replace(/[<>]/g, '').trim().slice(0, 18);
const createRoomCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();

function makePlayer(id, name) {
  return {
    id, name, hp: 100, maxHp: 100, attack: 12, defense: 3,
    level: 1, xp: 0, gold: 20, potions: 3,
    weapon: 'Espada enferrujada', ready: false
  };
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: [...room.players.values()].map((player) => ({ ...player })),
    world: room.world,
    battle: room.battle
  };
}

function emitRoom(room) { io.to(room.code).emit('state', publicRoom(room)); }
function sendRoomMessage(room, text) { io.to(room.code).emit('notice', text); }
function sendPlayerMessage(player, text) { io.to(player.id).emit('notice', text); }

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
    let roomCode;
    do { roomCode = createRoomCode(); } while (rooms.has(roomCode));

    const room = {
      code: roomCode,
      hostId: socket.id,
      players: new Map(),
      world: { forest: false, cave: false, castle: false },
      battle: null
    };

    room.players.set(socket.id, makePlayer(socket.id, name));
    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.emit('joined', { code: roomCode });
    emitRoom(room);
  });

  socket.on('joinRoom', (payload = {}) => {
    const name = cleanName(payload.name) || 'Aventureiro';
    const roomCode = String(payload.roomCode || '').trim().toUpperCase();
    const room = rooms.get(roomCode);
    if (!room) return socket.emit('errorMessage', 'Sala não encontrada. Confira o código.');
    if (room.players.size >= 8) return socket.emit('errorMessage', 'A sala já está cheia (máximo de 8 jogadores).');
    if ([...room.players.values()].some((player) => player.name.toLowerCase() === name.toLowerCase())) {
      return socket.emit('errorMessage', 'Esse nome já está sendo usado nesta sala.');
    }

    room.players.set(socket.id, makePlayer(socket.id, name));
    socket.join(roomCode);
    socket.emit('joined', { code: roomCode });
    sendRoomMessage(room, `${name} entrou na aventura!`);
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
          room.battle = { area, enemy: 'Goblin ladrão', hp: 45, maxHp: 45, atk: 11, xp: 30, gold: 16, boss: false, turn: 0, acted: [] };
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
      room.battle = { area, enemy: 'Senhor das Sombras', hp: 180, maxHp: 180, atk: 20, xp: 120, gold: 150, boss: true, turn: 0, acted: [] };
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
      room.battle = { area, enemy: enemy.name, hp: enemy.hp, maxHp: enemy.hp, atk: enemy.atk, xp: enemy.xp, gold: enemy.gold, boss: false, turn: 0, acted: [] };
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

  socket.on('flee', () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room || !room.battle) return;
    if (room.battle.boss) return socket.emit('errorMessage', 'Não há como fugir da batalha final!');
    const player = room.players.get(socket.id);
    if (Math.floor(Math.random() * 2) === 0) {
      sendRoomMessage(room, `🏃 ${player.name} conseguiu fugir do combate. A equipe voltou à vila.`);
      room.battle = null;
    } else {
      const damage = Math.max(1, room.battle.atk - Math.floor(player.defense / 2));
      player.hp = Math.max(0, player.hp - damage);
      sendRoomMessage(room, `❌ ${player.name} não conseguiu fugir e recebeu ${damage} de dano.`);
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
    if (battle.acted.includes(socket.id)) return socket.emit('errorMessage', 'Você já agiu nesta rodada. Aguarde os outros jogadores.');

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

    if (livingPlayers.length > 0 && battle.acted.length >= livingPlayers.length) {
      battle.acted = [];
      battle.turn += 1;
      for (const target of livingPlayers) {
        const damage = Math.max(1, battle.atk - Math.floor(target.defense / 2) + Math.floor(Math.random() * 5));
        target.hp = Math.max(0, target.hp - damage);
        sendPlayerMessage(target, `💥 ${battle.enemy} atacou você e causou ${damage} de dano.`);
      }
      if (livingPlayers.every((candidate) => candidate.hp <= 0)) {
        room.battle = null;
        sendRoomMessage(room, '💀 Todos caíram em combate. Voltem à vila e tentem novamente.');
      }
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
    if (room.battle) room.battle.acted = room.battle.acted.filter((id) => id !== socket.id);
    emitRoom(room);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Reino Sombrio Online rodando na porta ${PORT}`);
  console.log(`Pasta pública: ${PUBLIC_DIR}`);
});
