'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { io } = require('socket.io-client');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const { makeHero, newCampaign, makeMember } = require('../adventure');
const World = require('../public/world-data');

function next(socket, name, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, listener); reject(new Error('Tempo esgotado: ' + name)); }, 4000);
    const listener = value => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(name, listener);
      resolve(value);
    };
    socket.on(name, listener);
  });
}

function send(socket, name, payload, output = 'state', predicate) {
  const answer = next(socket, output, predicate);
  socket.emit(name, payload);
  return answer;
}

async function nightVillage(t, npcId) {
  const home = World.HOUSES.find(house => house.npcId === npcId);
  assert.ok(home, 'O morador precisa de uma casa.');
  const storage = createStorage();
  const identity = { id:'village-' + randomBytes(8).toString('hex'), key:randomBytes(32).toString('hex') };
  const room = newCampaign(randomBytes(3).toString('hex').toUpperCase(), identity.id);
  room.data.epoch = Date.now() - 68000;
  room.data.cleared.forest = true;
  const hero = { id:identity.id, keyHash:createHash('sha256').update(identity.key).digest('hex'), revision:0,
    data:makeHero('Jade', 'druid', { hp:40, gold:100 }) };
  hero.data.homeCampaign = room.id;
  const member = makeMember(room, identity.id, { x:home.door.x, y:home.door.y + 18, campaign:{ activeRegion:home.zone } });
  await storage.save({ campaign:room, players:[hero], members:[member] });
  const game = createGame({ storage, bossIntroMs:0 });
  const { port } = await game.listen(0, '127.0.0.1');
  const url = 'http://127.0.0.1:' + port;
  const clients = [];
  t.after(async () => { clients.forEach(socket => socket.disconnect()); await game.close(); });
  async function connect() {
    const socket = io(url, { transports:['websocket'], reconnection:false, forceNew:true });
    clients.push(socket);
    await next(socket, 'connect');
    return socket;
  }
  const socket = await connect();
  const state = await send(socket, 'adventure', { ...identity, action:'continue' });
  return { home, storage, identity, room, hero, socket, state, connect, url };
}

test('Mira atende em casa à noite, restaura vida e preserva o personagem e o pagamento', async t => {
  const f = await nightVillage(t, 'healer');
  const npc = World.npcPositions('village', f.state.now, f.state.world).find(npc => npc.id === 'healer');
  assert.equal(npc.indoors, true);
  assert.ok(World.distance(npc, f.home.door) <= 1);
  const dialogue = await send(f.socket, 'interact', { id:f.home.id, npcId:'blacksmith' }, 'dialogue');
  assert.equal(dialogue.id, 'healer', 'A casa determina quem atende, independentemente do pedido do cliente.');
  assert.ok(dialogue.options.some(option => option.id === 'rest'));
  const rested = await send(f.socket, 'npcAction', { npc:'healer', action:'rest' }, 'state', state => state.self.hp === state.self.maxHp);
  assert.equal(rested.self.classKey, 'druid');
  assert.equal(rested.self.gold, 90);
  const saved = await f.storage.readHero(f.hero.id);
  assert.equal(saved.data.hp, saved.data.maxHp);
  assert.equal(saved.data.gold, 90);
  assert.equal(saved.data.classKey, 'druid');
  const metadata = await (await fetch(f.url + '/game-data')).json();
  assert.equal(metadata.npcs.healer.appearance.skinTone, 'deep');
});

test('Aderic oferece missões na porta de casa à noite e o aceite é persistido', async t => {
  const f = await nightVillage(t, 'chronicler');
  const dialogue = await send(f.socket, 'interact', { id:f.home.id }, 'dialogue');
  assert.equal(dialogue.id, 'chronicler');
  assert.ok(dialogue.options.some(option => option.id === 'quest:lost_relic'));
  const accepted = await send(f.socket, 'npcAction', { npc:'chronicler', action:'quest:lost_relic' }, 'state',
    state => state.journal.some(quest => quest.id === 'lost_relic' && quest.accepted));
  assert.equal(accepted.self.classKey, 'druid');
  assert.equal((await f.storage.readMember(f.room.id, f.hero.id)).data.quests.lost_relic.step, 0);
});

test('a forja continua acessível pela casa de Eldrin durante a noite', async t => {
  const f = await nightVillage(t, 'blacksmith');
  const dialogue = await send(f.socket, 'interact', { id:f.home.id }, 'dialogue');
  assert.equal(dialogue.id, 'blacksmith');
  assert.ok(dialogue.options.some(option => option.id === 'shop'));
  await send(f.socket, 'npcAction', { npc:'blacksmith', action:'shop' }, 'shop');
  const bought = await send(f.socket, 'inventoryAction', { action:'buy', item:'ironSword' }, 'state',
    state => state.self.owned.includes('ironSword'));
  assert.equal(bought.self.gold, 65);
  const saved = await f.storage.readHero(f.hero.id);
  assert.ok(saved.data.owned.includes('ironSword'));
  assert.equal(saved.data.gold, 65);
});

test('estar em outra área não permite usar o atendimento noturno de uma casa remotamente', async t => {
  const f = await nightVillage(t, 'healer');
  const visitor = { id:'visitor-' + randomBytes(8).toString('hex'), key:randomBytes(32).toString('hex'), name:'Visitante', classKey:'warrior' };
  const remoteHero = { id:visitor.id, keyHash:createHash('sha256').update(visitor.key).digest('hex'), revision:0,
    data:makeHero(visitor.name, visitor.classKey, { hp:30, gold:100 }) };
  await f.storage.save({ players:[remoteHero], members:[makeMember(f.room, visitor.id, { campaign:{ activeRegion:'forest' } })] });
  const remote = await f.connect();
  await send(remote, 'adventure', { ...visitor, action:'join', code:f.room.code });
  const error = await send(remote, 'npcAction', { npc:'healer', action:'rest' }, 'errorMessage');
  assert.match(error, /perto|morador|casa|aproxime/i);
  const saved = await f.storage.readHero(visitor.id);
  assert.equal(saved.data.hp, 30);
  assert.equal(saved.data.gold, 100);
});
