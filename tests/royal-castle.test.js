'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const { setTimeout: wait } = require('node:timers/promises');
const { io } = require('socket.io-client');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const Story = require('../adventure');
const World = require('../public/world-data');

function incoming(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const listener = value => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(value);
    };
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error('Tempo esgotado: ' + event + ' · ' + (socket.lastError || 'sem resposta')));
    }, 4000);
    socket.on(event, listener);
  });
}
const send = (socket, name, payload, output = 'state', predicate) => {
  const result = incoming(socket, output, predicate);
  socket.emit(name, payload);
  return result;
};

async function launch(t, storage) {
  const game = createGame({ storage, graceMs:4000, bossIntroMs:0, logger:{ error() {} } });
  const { port } = await game.listen(0, '127.0.0.1');
  const clients = [];
  t.after(async () => {
    clients.forEach(socket => socket.disconnect());
    await game.close();
  });
  return {
    game,
    async connect() {
      const socket = io('http://127.0.0.1:' + port, { transports:['websocket'], reconnection:false, forceNew:true });
      clients.push(socket);
      socket.on('state', state => { socket.state = state; });
      socket.on('errorMessage', error => { socket.lastError = error; });
      await incoming(socket, 'connect');
      return socket;
    }
  };
}

async function seed(storage, { campaign, name = 'Guardiã do Pomar', unlocked = false, zone = 'village', x = 480, y = 212,
  checkpoint = { zone, x, y } } = {}) {
  const id = 'royal-' + randomBytes(8).toString('hex');
  const key = randomBytes(32).toString('hex');
  const room = campaign || Story.newCampaign(randomBytes(3).toString('hex').toUpperCase(), id);
  if (!campaign) room.data.cleared.shadow = unlocked;
  const plantedAt = Date.now() - 10000;
  const hero = { id, keyHash:createHash('sha256').update(key).digest('hex'), revision:0,
    data:{ ...Story.makeHero(name, 'druid'), homeCampaign:room.id, gold:345,
      owned:['oakStaff', 'rootGuard'], equipment:{ weapon:'oakStaff', armor:'rootGuard', charm:null },
      farm:{ 'garden-1':{ crop:'melon', plantedAt, readyAt:plantedAt + 240000, watered:true } },
      harvest:{ melon:2, pumpkin:1 }, companions:{ lume:2, lia:true } } };
  const member = Story.makeMember(room, id);
  assert.ok(World.canStand(zone, x, y), 'Posição transitável do teste: ' + zone + ' ' + x + ',' + y);
  Object.assign(member.data, { zone, x, y, checkpoint });
  await storage.save({ campaign:campaign ? null : room, players:[hero], members:[member] });
  return { id, key, room, hero, member };
}
const enter = (socket, hero, action = 'continue') => send(socket, 'adventure', {
  action, id:hero.id, key:hero.key, campaignId:hero.room.id, code:hero.room.code
}, 'state', state => state.id === hero.id);

function assertBelongings(data, original) {
  for (const key of ['classKey', 'gold', 'owned', 'equipment', 'farm', 'harvest']) assert.deepEqual(data[key], original[key], key);
  assert.equal(data.companions.lia, true);
  assert.equal(data.companions.lume, 2);
}

test('o castelinho permanece fechado antes do resgate; dados enviados pelo cliente não abrem a passagem', async t => {
  const storage = createStorage();
  const hero = await seed(storage);
  const gate = World.zone('village').points.find(point => point.id === 'royal-castle-gate');
  assert.equal(gate.requires, 'shadow');
  assert.equal(gate.royal, true);
  assert.equal(gate.to, 'royal-castle');
  assert.equal(Story.publicCampaign(hero.room.data).royalty.rescued, false);
  const f = await launch(t, storage);
  const socket = await f.connect();
  await enter(socket, hero);
  const error = await send(socket, 'interact', {
    id:gate.id, to:'royal-castle', requires:null, royal:false,
    world:{ cleared:{ shadow:true } }, royalty:{ name:'Maria Rita', rescued:true }
  }, 'errorMessage');
  assert.match(error, /Maria Rita|resgate|castel/i);
  assert.equal(socket.state.zone, 'village');
  await wait(190);
  await send(socket, 'interact', { id:'royal-memory', rescued:true, zone:'royal-castle' }, 'errorMessage');
  const saved = await storage.readCampaign({ id:hero.room.id });
  assert.equal(saved.data.cleared.shadow, false);
  assert.equal((await storage.readMember(hero.room.id, hero.id)).data.zone, 'village');
  assertBelongings((await storage.readHero(hero.id)).data, hero.hero.data);
});

test('após o resgate os dois jogadores entram na mesma sala, e sair preserva classe, equipamento e plantação', async t => {
  const storage = createStorage();
  const host = await seed(storage, { unlocked:true });
  const guest = await seed(storage, { campaign:host.room, name:'Aliada de Eldoria' });
  const f = await launch(t, storage);
  const first = await f.connect();
  const initial = await enter(first, host);
  assert.equal(initial.world.royalty.rescued, true);
  const second = await f.connect();
  await enter(second, guest, 'join');
  assert.equal(second.state.world.royalty.rescued, true);
  const hostInside = await send(first, 'interact', { id:'royal-castle-gate' }, 'state', state => state.zone === 'royal-castle');
  assert.equal(hostInside.players.length, 1);
  if (!second.state.heroes.some(player => player.id === host.id && player.zone === 'royal-castle')) {
    await incoming(second, 'state', state => state.heroes.some(player => player.id === host.id && player.zone === 'royal-castle'));
  }
  assert.equal(second.state.players.some(player => player.id === host.id), false);
  const reunited = await send(second, 'interact', { id:'royal-castle-gate' }, 'state', state => state.zone === 'royal-castle');
  assert.deepEqual(new Set(reunited.players.map(player => player.id)), new Set([host.id, guest.id]));
  assert.equal(reunited.campaignId, hostInside.campaignId);
  const exit = World.zone('royal-castle').points.find(point => point.kind === 'portal' && point.to === 'village');
  assert.ok(exit);
  await wait(190);
  const outside = await send(first, 'interact', { id:exit.id }, 'state', state => state.zone === 'village');
  const position = outside.players.find(player => player.id === host.id);
  assert.equal(position.x, 480);
  assert.equal(position.y, 212);
  assertBelongings((await storage.readHero(host.id)).data, host.hero.data);
  assert.equal((await storage.readMember(host.room.id, host.id)).data.zone, 'village');
});

test('o interior e a abertura persistem ao reabrir o servidor; a memória real não concede prêmios repetíveis', async t => {
  const storage = createStorage();
  const hero = await seed(storage, { unlocked:true, zone:'royal-castle', x:480, y:210 });
  const first = await launch(t, storage);
  const socket = await first.connect();
  const initial = await enter(socket, hero);
  assert.equal(initial.zone, 'royal-castle');
  const dialogue = await send(socket, 'interact', { id:'royal-memory' }, 'dialogue');
  assert.match(dialogue.title, /Maria Rita/);
  assert.ok(dialogue.lines.some(line => /Maria Rita|princesa|Eldoria/.test(line)));
  await wait(190);
  await send(socket, 'interact', { id:'royal-memory' }, 'dialogue');
  assertBelongings((await storage.readHero(hero.id)).data, hero.hero.data);
  socket.disconnect();
  await first.game.close();
  const second = await launch(t, storage);
  const resumed = await second.connect();
  const restored = await enter(resumed, hero);
  assert.equal(restored.zone, 'royal-castle');
  assert.equal(restored.world.royalty.rescued, true);
  assert.equal((await storage.readCampaign({ id:hero.room.id })).data.cleared.shadow, true);
  assertBelongings((await storage.readHero(hero.id)).data, hero.hero.data);
});

test('um checkpoint antigo no castelo fechado é corrigido sem resgatar Maria Rita por atalho', async t => {
  const storage = createStorage();
  const hero = await seed(storage, { zone:'royal-castle', x:480, y:210 });
  const f = await launch(t, storage);
  const socket = await f.connect();
  const state = await enter(socket, hero);
  assert.equal(state.zone, 'village');
  assert.equal(state.world.royalty.rescued, false);
  const member = await storage.readMember(hero.room.id, hero.id);
  assert.equal(member.data.zone, 'village');
  assert.equal(member.data.checkpoint.zone, 'village');
  assertBelongings((await storage.readHero(hero.id)).data, hero.hero.data);
});
