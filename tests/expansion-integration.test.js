'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { setTimeout: wait } = require('node:timers/promises');
const { io } = require('socket.io-client');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const { newCampaign, makeHero, makeMember, CAPTIVES } = require('../adventure');
const Farming = require('../farming');
const World = require('../public/world-data');

function incoming(socket, name, predicate = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const receive = value => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(name, receive);
      resolve(value);
    };
    const timer = setTimeout(() => {
      socket.off(name, receive);
      reject(new Error('Tempo esgotado em ' + name + ': ' + (socket.lastError || 'sem resposta')));
    }, timeout);
    socket.on(name, receive);
  });
}

async function launch(t, storage, options = {}) {
  const game = createGame({ storage, graceMs:4000, logger:{ error() {} }, ...options });
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

function send(socket, name, payload, output = 'state', predicate) {
  const result = incoming(socket, output, predicate);
  socket.emit(name, payload);
  return result;
}

async function seed(storage, { room, name = 'Cultivador', zone = 'orchard', x = 350, y = 390,
  classKey = 'warrior', heroData = {}, campaignData = {} } = {}) {
  const identity = { id:'expansion-' + randomBytes(8).toString('hex'), key:randomBytes(32).toString('hex') };
  const campaign = room || newCampaign(randomBytes(3).toString('hex').toUpperCase(), identity.id);
  Object.assign(campaign.data, campaignData);
  const player = { id:identity.id, keyHash:createHash('sha256').update(identity.key).digest('hex'), revision:0,
    data:{ ...makeHero(name, classKey), ...heroData, homeCampaign:campaign.id } };
  const member = makeMember(campaign, identity.id, { x, y, campaign:{ activeRegion:zone } });
  // Invalid test coordinates should fail here rather than quietly use a spawn.
  assert.ok(World.canStand(zone, x, y), 'Posição de teste transitável: ' + zone + ' ' + x + ',' + y);
  Object.assign(member.data, { zone, x, y, checkpoint:{ zone, x, y } });
  await storage.save({ campaign:room ? null : campaign, players:[player], members:[member] });
  return { ...identity, campaign, player, member };
}

const enter = (socket, hero, action = 'continue') => send(socket, 'adventure', {
  id:hero.id, key:hero.key, action, campaignId:hero.campaign.id, code:hero.campaign.code
}, 'state', state => state.id === hero.id);

test('o servidor exige proximidade para plantar e calcula o crescimento sem confiar no relógio do cliente', async t => {
  const storage = createStorage();
  const local = await seed(storage);
  const remote = await seed(storage, { name:'Distante', zone:'village', x:480, y:458 });
  const f = await launch(t, storage);
  const distant = await f.connect();
  await enter(distant, remote);
  await send(distant, 'farmAction', { action:'plant', plotId:'garden-1', crop:'melon' }, 'errorMessage');
  assert.equal((await storage.readHero(remote.id)).data.farm, undefined);

  const farmer = await f.connect();
  const initial = await enter(farmer, local);
  assert.equal(initial.self.farm.plots.length, 4);
  const before = Date.now();
  const planted = await send(farmer, 'farmAction', {
    action:'plant', plotId:'garden-1', crop:'melon', now:0, plantedAt:0, readyAt:0
  }, 'state', state => state.self.farm.plots[0].crop === 'melon');
  const plot = planted.self.farm.plots[0];
  assert.ok(plot.plantedAt >= before && plot.plantedAt <= Date.now());
  assert.equal(plot.readyAt - plot.plantedAt, Farming.CROPS.melon.growMs);
  assert.equal(planted.self.gold, initial.self.gold - Farming.CROPS.melon.seedPrice);
  await wait(200);
  await send(farmer, 'farmAction', { action:'harvest', plotId:'garden-1', now:plot.readyAt + 1 }, 'errorMessage');
  assert.equal((await storage.readHero(local.id)).data.harvest?.melon || 0, 0);
});

test('colheita persiste após reabrir o servidor e repetir a ação não duplica alimentos', async t => {
  const storage = createStorage();
  const old = Date.now() - Farming.CROPS.pumpkin.growMs - 1000;
  const farmer = await seed(storage, { heroData:{ farm:{ 'garden-1':{
    crop:'pumpkin', plantedAt:old, readyAt:old + Farming.CROPS.pumpkin.growMs, watered:false
  } } } });
  const first = await launch(t, storage);
  const socket = await first.connect();
  const initial = await enter(socket, farmer);
  assert.equal(initial.self.farm.plots[0].ready, true);
  await send(socket, 'farmAction', { action:'harvest', plotId:'garden-1' }, 'state',
    state => state.self.farm.harvest.pumpkin === Farming.CROPS.pumpkin.yield);
  await wait(200);
  await send(socket, 'farmAction', { action:'harvest', plotId:'garden-1' }, 'errorMessage');
  assert.equal((await storage.readHero(farmer.id)).data.harvest.pumpkin, Farming.CROPS.pumpkin.yield);
  socket.disconnect();
  await first.game.close();

  const second = await launch(t, storage);
  const resumed = await second.connect();
  const state = await enter(resumed, farmer);
  assert.equal(state.self.farm.plots[0].crop, null);
  assert.equal(state.self.farm.harvest.pumpkin, Farming.CROPS.pumpkin.yield);
});

test('falha de gravação desfaz compra e plantio antes de permitir nova tentativa', async t => {
  const memory = createStorage();
  let rejectSaves = false;
  const storage = { ...memory, save: async payload => {
    if (rejectSaves && payload.players?.length) throw new Error('Banco indisponível no teste');
    return memory.save(payload);
  } };
  const farmer = await seed(storage);
  const f = await launch(t, storage);
  const socket = await f.connect();
  const initial = await enter(socket, farmer);
  rejectSaves = true;
  await send(socket, 'farmAction', { action:'plant', plotId:'garden-1', crop:'corn' }, 'errorMessage');
  const persisted = await storage.readHero(farmer.id);
  assert.equal(persisted.data.gold, initial.self.gold);
  assert.equal(persisted.data.farm, undefined);
  rejectSaves = false;
  await wait(200);
  const accepted = await send(socket, 'farmAction', { action:'plant', plotId:'garden-1', crop:'corn' }, 'state',
    state => state.self.farm.plots[0].crop === 'corn');
  assert.equal(accepted.self.gold, initial.self.gold - Farming.CROPS.corn.seedPrice);
});

test('combate no mapa aceita movimento e reconexão, mas recusa turnos antigos e participantes distantes', async t => {
  const storage = createStorage();
  const host = await seed(storage, { name:'Defensora', zone:'forest', x:228, y:270,
    heroData:{ baseDefense:1000 }, campaignData:{ combatMode:'field' } });
  const friend = await seed(storage, { room:host.campaign, name:'Aliada', zone:'forest', x:250, y:280 });
  const remote = await seed(storage, { room:host.campaign, name:'Explorador', zone:'forest', x:760, y:458 });
  const f = await launch(t, storage);
  const socket = await f.connect();
  await enter(socket, host);
  const ally = await f.connect();
  await enter(ally, friend);
  const far = await f.connect();
  await enter(far, remote);
  const state = socket.state.battle ? socket.state : await incoming(socket, 'state', value => value.battle?.mode === 'field');
  const battle = state.battle;
  assert.equal(battle.mode, 'field');
  assert.ok(battle.heroes.includes(host.id));
  assert.ok(battle.heroes.includes(friend.id));
  assert.equal(battle.heroes.includes(remote.id), false);
  assert.equal(far.state.battle, null);
  await send(socket, 'battleAction', { id:battle.id, turn:1, action:'attack' }, 'errorMessage');
  const start = state.players.find(player => player.id === host.id);
  const moved = await send(socket, 'moveInput', { zone:'forest', dx:1, dy:0, seq:1 }, 'moved',
    packet => packet.id === host.id && packet.seq === 1);
  assert.ok(moved.x > start.x, 'A batalha não deve bloquear o movimento.');
  socket.disconnect();
  const resumed = await f.connect();
  const restored = await enter(resumed, host, 'resume');
  assert.equal(restored.battle.id, battle.id);
  assert.equal(restored.battle.mode, 'field');
  await send(resumed, 'fieldAction', { id:'encontro-antigo', action:'attack' }, 'errorMessage');
  assert.equal((await storage.readHero(host.id)).data.gold, host.player.data.gold);
});

test('a vitória no mapa confirma ouro e inimigo derrotado uma vez', async t => {
  const storage = createStorage();
  const hero = await seed(storage, { name:'Druida', zone:'forest', x:228, y:270, classKey:'druid',
    heroData:{ baseAttack:5000, baseDefense:1000 }, campaignData:{ combatMode:'field' } });
  const f = await launch(t, storage);
  const socket = await f.connect();
  await enter(socket, hero);
  const engaged = socket.state.battle ? socket.state : await incoming(socket, 'state', state => state.battle?.mode === 'field');
  const battle = engaged.battle;
  const won = await send(socket, 'fieldAction', { id:battle.id, action:'attack' }, 'state', state => !state.battle);
  assert.ok(won.self.gold > hero.player.data.gold);
  assert.ok(won.world.defeated.forest.includes(battle.target.index));
  const saved = await storage.readHero(hero.id);
  assert.equal(saved.data.gold, won.self.gold);
  await wait(200);
  await send(socket, 'fieldAction', { id:battle.id, action:'attack' }, 'errorMessage');
  assert.equal((await storage.readHero(hero.id)).data.gold, saved.data.gold);
  assert.deepEqual((await storage.readCampaign({ id:hero.campaign.id })).data.defeated.forest, won.world.defeated.forest);
});

test('a ilha só abre depois de derrotar os dois invasores do convés', async t => {
  const storage = createStorage();
  const blocked = await seed(storage, { name:'Marinheiro', zone:'boat', x:800, y:180,
    campaignData:{ combatMode:'field', voyage:{ defeated:['deck-raider-0'], cleared:false } } });
  const ready = await seed(storage, { name:'Navegadora', zone:'boat', x:800, y:180,
    campaignData:{ combatMode:'field', voyage:{ defeated:['deck-raider-0', 'deck-raider-1'], cleared:false } } });
  const f = await launch(t, storage);
  const first = await f.connect();
  await enter(first, blocked);
  await send(first, 'interact', { id:'island-shore' }, 'errorMessage');
  assert.equal(first.state.zone, 'boat');
  const second = await f.connect();
  await enter(second, ready);
  const landed = await send(second, 'interact', { id:'island-shore' }, 'state', state => state.zone === 'island');
  assert.equal(landed.zone, 'island');
  assert.ok(World.canStand('island', landed.players.find(player => player.id === ready.id).x,
    landed.players.find(player => player.id === ready.id).y));
});

test('uma luta no mapa não impede expirar a reserva de um jogador desconectado', async t => {
  const storage = createStorage();
  const hero = await seed(storage, { name:'Reserva', zone:'forest', x:228, y:270,
    heroData:{ baseDefense:1000 }, campaignData:{ combatMode:'field' } });
  const f = await launch(t, storage, { graceMs:200 });
  const socket = await f.connect();
  await enter(socket, hero);
  const engaged = socket.state.battle ? socket.state : await incoming(socket, 'state', state => state.battle?.mode === 'field');
  assert.ok(engaged.battle.id);
  socket.disconnect();
  await wait(700);
  const rejoined = await f.connect();
  const state = await enter(rejoined, hero, 'resume');
  assert.equal(state.battle, null, 'Após o prazo, deve carregar o checkpoint, não manter a luta suspensa para sempre.');
  assert.equal(state.self.hp, hero.player.data.hp);
});

test('posições continuam sendo gravadas periodicamente durante uma luta no mapa', { timeout:12000 }, async t => {
  const storage = createStorage();
  const hero = await seed(storage, { name:'Passos', zone:'forest', x:228, y:270,
    heroData:{ baseDefense:1000 }, campaignData:{ combatMode:'field' } });
  const f = await launch(t, storage);
  const socket = await f.connect();
  await enter(socket, hero);
  const engaged = socket.state.battle ? socket.state : await incoming(socket, 'state', state => state.battle?.mode === 'field');
  const moved = await send(socket, 'moveInput', { zone:'forest', dx:1, dy:0, seq:1 }, 'moved',
    packet => packet.id === hero.id && packet.seq === 1);
  assert.ok(moved.x > hero.member.data.x);
  const deadline = Date.now() + 5500;
  let saved;
  do {
    await wait(125);
    saved = await storage.readMember(hero.campaign.id, hero.id);
  } while (Date.now() < deadline && Math.abs(saved.data.x - moved.x) > 0.001);
  assert.ok(Math.abs(saved.data.x - moved.x) < 0.001, 'O checkpoint de posição deve ser salvo sem aguardar o fim da luta.');
  assert.equal(socket.state.battle.id, engaged.battle.id);
});

test('uma derrota na ilha respeita o checkpoint salvo na fogueira dos navegantes', { timeout:10000 }, async t => {
  const storage = createStorage();
  const hero = await seed(storage, { name:'Náufrago', zone:'island', x:480, y:210,
    heroData:{ hp:1, baseDefense:0 },
    campaignData:{ combatMode:'field', voyage:{ defeated:['deck-raider-0', 'deck-raider-1'], cleared:false } } });
  const camp = World.zone('island').points.find(point => point.id === 'island-camp');
  hero.member.data.checkpoint = { zone:'island', x:camp.x, y:camp.y };
  await storage.save({ members:[hero.member] });
  const f = await launch(t, storage);
  const socket = await f.connect();
  await enter(socket, hero);
  await wait(1850);
  await send(socket, 'interact', { id:'island-warden' }, 'state', state => state.battle?.mode === 'field');
  const restored = await incoming(socket, 'state', state => !state.battle, 5000);
  assert.equal(restored.zone, 'island');
  const player = restored.players.find(player => player.id === hero.id);
  assert.equal(player.x, camp.x);
  assert.equal(player.y, camp.y);
  assert.equal(restored.self.hp, Math.ceil(restored.self.maxHp * 0.55));
  const persisted = await storage.readMember(hero.campaign.id, hero.id);
  assert.deepEqual(persisted.data.checkpoint, { zone:'island', x:camp.x, y:camp.y });
});

test('derrotar o Ent nas três fases persiste o fragmento, os resgates e a recompensa juntos', { timeout:12000 }, async t => {
  const storage = createStorage();
  const hero = await seed(storage, { name:'Libertadora', zone:'forest', x:480, y:130,
    heroData:{ baseAttack:5000, baseDefense:1000 }, campaignData:{ combatMode:'field' } });
  hero.campaign.data.defeated.forest = [0, 1, 2, 3, 4];
  await storage.save({ campaign:hero.campaign });
  const f = await launch(t, storage);
  const socket = await f.connect();
  await enter(socket, hero);
  await wait(1850);
  const engaged = await send(socket, 'interact', { id:'boss-forest' }, 'state', state => state.battle?.boss);
  const battleId = engaged.battle.id;
  await send(socket, 'fieldAction', { id:battleId, action:'attack' }, 'state', state => state.battle?.phase === 2);
  assert.equal(socket.state.battle.totems.length, 2);
  while (socket.state.battle.totems.length) {
    const totem = socket.state.battle.totems[0];
    const total = socket.state.battle.totems.reduce((sum, point) => sum + point.hp, 0);
    await wait(730);
    await send(socket, 'fieldAction', { id:battleId, action:'totem', target:totem.id }, 'state',
      state => state.battle?.totems.reduce((sum, point) => sum + point.hp, 0) < total);
  }
  await wait(730);
  await send(socket, 'fieldAction', { id:battleId, action:'attack' }, 'state', state => state.battle?.phase === 3);
  await wait(730);
  const won = await send(socket, 'fieldAction', { id:battleId, action:'attack' }, 'state', state => !state.battle);
  assert.ok(won.world.cleared.forest);
  assert.ok(won.world.fragments.some(fragment => fragment.region === 'forest' && fragment.name === 'Raiz'));
  assert.ok(CAPTIVES.forest.every(name => won.world.rescued.includes(name)));
  const savedHero = await storage.readHero(hero.id);
  const savedWorld = await storage.readCampaign({ id:hero.campaign.id });
  assert.equal(savedHero.data.gold, won.self.gold);
  assert.ok(savedWorld.data.cleared.forest);
  assert.ok(CAPTIVES.forest.every(name => savedWorld.data.rescued.includes(name)));
  socket.disconnect();
  await f.game.close();
  const restarted = await launch(t, storage);
  const resumed = await restarted.connect();
  const state = await enter(resumed, hero);
  assert.equal(state.self.gold, won.self.gold);
  assert.deepEqual(state.world.fragments, won.world.fragments);
  assert.deepEqual(state.world.rescued, won.world.rescued);
  await send(resumed, 'fieldAction', { id:battleId, action:'attack' }, 'errorMessage');
  assert.equal((await storage.readHero(hero.id)).data.gold, savedHero.data.gold);
});
