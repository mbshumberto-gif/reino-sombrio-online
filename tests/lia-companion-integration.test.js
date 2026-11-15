'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { setTimeout: wait } = require('node:timers/promises');
const { io } = require('socket.io-client');
const { Pool } = require('pg');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const Story = require('../adventure');
const World = require('../public/world-data');

function incoming(socket, name, predicate = () => true, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const listener = value => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(name, listener);
      resolve(value);
    };
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error('Tempo esgotado: ' + name + ' · ' + (socket.lastError || 'sem resposta')));
    }, timeout);
    socket.on(name, listener);
  });
}
const send = (socket, name, payload, output = 'state', predicate) => {
  const response = incoming(socket, output, predicate);
  socket.emit(name, payload);
  return response;
};

async function launch(t, storage, options = {}) {
  const game = createGame({ storage, bossIntroMs:0, actionMs:10, graceMs:4000, logger:{ error() {} }, ...options });
  const { port } = await game.listen(0, '127.0.0.1');
  const clients = [];
  t.after(async () => {
    clients.forEach(client => client.disconnect());
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

async function seed(storage, { room, name = 'Guardiã de Lia', defense, zone = 'forest', x = 228, y = 270, hp = 1, companions = { lume:1, lia:true },
  world = {}, combatMode = 'field' } = {}) {
  const id = 'lia-' + randomBytes(8).toString('hex');
  const key = randomBytes(32).toString('hex');
  const campaign = room || Story.newCampaign(randomBytes(3).toString('hex').toUpperCase(), id);
  if (!room) Object.assign(campaign.data, { combatMode }, world);
  const hero = { id, keyHash:createHash('sha256').update(key).digest('hex'), revision:0,
    data:{ ...Story.makeHero(name, 'warrior'), hp, companions, homeCampaign:campaign.id } };
  if (defense !== undefined) hero.data.baseDefense = defense;
  assert.ok(World.canStand(zone, x, y), zone + ' ' + x + ',' + y + ' deve ser transitável');
  const member = Story.makeMember(campaign, id);
  Object.assign(member.data, { zone, x, y, checkpoint:{ zone:'village', x:480, y:458 } });
  await storage.save({ campaign:room ? null : campaign, players:[hero], members:[member] });
  return { id, key, campaign, hero, member };
}
const enter = (socket, hero, action = 'continue') => send(socket, 'adventure', {
  action, id:hero.id, key:hero.key, campaignId:hero.campaign.id
}, 'state', state => state.id === hero.id);

async function waitUntil(predicate, timeout = 7000) {
  const until = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= until) throw new Error('Condição de teste não foi atingida.');
    await wait(25);
  }
}

async function loseClone(socket, hero, mode = 'field') {
  const engaged = socket.state.battle ? socket.state : await incoming(socket, 'state', state => !!state.battle);
  assert.equal(engaged.battle.mode, mode);
  if (mode === 'turn') {
    const battle = engaged.battle;
    await send(socket, 'battleAction', { id:battle.id, turn:battle.turn, action:'defend' });
  }
  if (socket.state.battle || socket.state.self.companions.lia) {
    await incoming(socket, 'state', state => !state.battle && !state.self.companions.lia);
  }
  assert.equal(socket.state.self.companions.liaEcho.needsRescue, true);
}

test('o KO no campo grava o clone perdido e sua lápide juntos; reiniciar não duplica o memorial', async t => {
  const storage = createStorage();
  const hero = await seed(storage);
  const first = await launch(t, storage);
  const socket = await first.connect();
  await enter(socket, hero);
  await loseClone(socket, hero);
  const saved = await storage.readHero(hero.id);
  const world = (await storage.readCampaign({ id:hero.campaign.id })).data;
  assert.deepEqual(saved.data.companions.liaEcho, { generation:1, fallen:1, needsRescue:true });
  assert.equal(saved.data.companions.lia, false);
  assert.equal(world.liaMemorialCount, 1);
  assert.equal(world.liaMemorials.length, 1);
  assert.equal(world.liaMemorials[0].heroName, hero.hero.data.name);
  assert.equal(world.liaMemorials[0].generation, 1);
  assert.equal(world.liaMemorials[0].zone, 'forest');
  socket.disconnect();
  await first.game.close();
  const second = await launch(t, storage);
  const resumed = await second.connect();
  const restored = await enter(resumed, hero);
  assert.equal(restored.self.companions.lia, false);
  assert.equal(restored.self.companions.liaEcho.fallen, 1);
  assert.equal(restored.world.liaMemorialCount, 1);
  assert.equal(restored.world.liaMemorials.length, 1);
});

test('resgate exige proximidade e Lume; repetir o pedido não cria clones extras', async t => {
  const storage = createStorage();
  const echo = { generation:1, fallen:1, needsRescue:true };
  const nearby = await seed(storage, { zone:'orchard', x:570, y:370, hp:100,
    companions:{ lume:1, lia:false, liaEcho:structuredClone(echo) } });
  const distant = await seed(storage, { zone:'village', x:480, y:458, hp:100,
    companions:{ lume:1, lia:false, liaEcho:structuredClone(echo) } });
  const noSpirit = await seed(storage, { zone:'orchard', x:570, y:370, hp:100,
    companions:{ lume:0, lia:false, liaEcho:structuredClone(echo) } });
  const f = await launch(t, storage);
  const far = await f.connect();
  await enter(far, distant);
  await send(far, 'interact', { id:'lia-echo' }, 'errorMessage');
  assert.equal((await storage.readHero(distant.id)).data.companions.liaEcho.generation, 1);
  const dry = await f.connect();
  await enter(dry, noSpirit);
  await send(dry, 'interact', { id:'lia-echo' }, 'errorMessage');
  assert.equal((await storage.readHero(noSpirit.id)).data.companions.lia, false);
  const local = await f.connect();
  await enter(local, nearby);
  const rescued = await send(local, 'interact', { id:'lia-echo' }, 'state', state => state.self.companions.lia);
  assert.deepEqual(rescued.self.companions.liaEcho, { generation:2, fallen:1, needsRescue:false });
  await wait(200);
  await send(local, 'interact', { id:'lia-echo' }, 'errorMessage');
  assert.equal((await storage.readHero(nearby.id)).data.companions.liaEcho.generation, 2);
});

test('a Lia original continua no Pomar e seu recrutamento não substitui um resgate pendente', async t => {
  const storage = createStorage();
  const hero = await seed(storage, { zone:'orchard', x:476, y:275, hp:100,
    companions:{ lume:1, lia:false, liaEcho:{ generation:2, fallen:2, needsRescue:true } } });
  const f = await launch(t, storage);
  const socket = await f.connect();
  const state = await enter(socket, hero);
  const npc = World.npcPositions('orchard', state.now, state.world).find(candidate => candidate.id === 'lia');
  assert.ok(npc);
  assert.ok(World.distance(npc, { x:476, y:275 }) < 91);
  const dialogue = await send(socket, 'interact', { id:'lia' }, 'dialogue');
  assert.equal(dialogue.id, 'lia');
  assert.equal(dialogue.options.some(option => option.id === 'recruit'), false);
  await send(socket, 'npcAction', { npc:'lia', action:'recruit' }, 'errorMessage');
  const saved = await storage.readHero(hero.id);
  assert.equal(saved.data.companions.lia, false);
  assert.equal(saved.data.companions.liaEcho.generation, 2);
});

test('falha de gravação desfaz a perda e a lápide juntas; nova tentativa confirma apenas uma vez', async t => {
  const memory = createStorage();
  let refuse = true;
  let attempts = 0;
  const atomicWrites = [];
  const storage = { ...memory, save:async payload => {
    if (payload.campaign?.data.liaMemorialCount > 0) {
      attempts++;
      atomicWrites.push({ ids:payload.players?.map(player => player.id) || [], world:structuredClone(payload.campaign.data) });
      if (refuse) throw new Error('Falha deliberada antes do COMMIT');
    }
    return memory.save(payload);
  } };
  const hero = await seed(storage);
  const f = await launch(t, storage);
  const socket = await f.connect();
  await enter(socket, hero);
  await waitUntil(() => attempts > 0);
  assert.equal((await storage.readHero(hero.id)).data.companions.lia, true);
  assert.equal((await storage.readCampaign({ id:hero.campaign.id })).data.liaMemorialCount || 0, 0);
  assert.ok(atomicWrites.every(write => write.ids.includes(hero.id)), 'A lápide e o herói devem integrar a mesma gravação.');
  const confirmed = incoming(socket, 'state', state => !state.battle && !state.self.companions.lia);
  refuse = false;
  await confirmed;
  assert.equal((await storage.readHero(hero.id)).data.companions.liaEcho.fallen, 1);
  const world = (await storage.readCampaign({ id:hero.campaign.id })).data;
  assert.equal(world.liaMemorialCount, 1);
  assert.equal(world.liaMemorials.length, 1);
});

const testDb = process.env.ELDORIA_TEST_DATABASE_URL;
test('PostgreSQL mantém a queda e o memorial depois de recriar servidor e conexão', { skip:!testDb }, async t => {
  const admin = new Pool({ connectionString:testDb, ssl:false });
  const namespace = 'lia_memorial_' + randomBytes(6).toString('hex');
  await admin.query('CREATE SCHEMA ' + namespace);
  t.after(async () => {
    await admin.query('DROP SCHEMA ' + namespace + ' CASCADE');
    await admin.end();
  });
  const url = new URL(testDb);
  url.searchParams.set('options', '-c search_path=' + namespace);
  const storage = createStorage({ connectionString:url.href, ssl:false });
  await storage.init();
  const hero = await seed(storage, { combatMode:'turn' });
  const first = await launch(t, storage);
  const socket = await first.connect();
  await enter(socket, hero);
  await loseClone(socket, hero, 'turn');
  await first.game.close();
  const fresh = createStorage({ connectionString:url.href, ssl:false });
  const second = await launch(t, fresh);
  const resumed = await second.connect();
  const restored = await enter(resumed, hero);
  assert.equal(restored.self.companions.lia, false);
  assert.equal(restored.self.companions.liaEcho.fallen, 1);
  assert.equal(restored.world.liaMemorialCount, 1);
  assert.equal(restored.world.liaMemorials.length, 1);
  await second.game.close();
});

test('sair após KO durante um combate por turnos preserva a perda sem penalizar o aliado vivo', async t => {
  const storage = createStorage();
  const victim = await seed(storage, { combatMode:'turn' });
  const survivor = await seed(storage, { room:victim.campaign, name:'Protetor', x:250, y:280, hp:145, defense:1000 });
  const f = await launch(t, storage);
  const first = await f.connect();
  await enter(first, victim);
  const second = await f.connect();
  await send(second, 'adventure', { action:'join', id:survivor.id, key:survivor.key, code:victim.campaign.code }, 'state');
  const engaged = first.state.battle ? first.state : await incoming(first, 'state', state => !!state.battle);
  assert.equal(engaged.battle.mode, 'turn');
  assert.equal(engaged.battle.active, victim.id);
  await send(first, 'battleAction', { id:engaged.battle.id, turn:engaged.battle.turn, action:'defend' }, 'state',
    state => state.battle?.active === survivor.id);
  if (second.state.battle?.active !== survivor.id) await incoming(second, 'state', state => state.battle?.active === survivor.id);
  const fallen = incoming(first, 'state', state => state.battle && state.self.hp === 0);
  await send(second, 'battleAction', { id:second.state.battle.id, turn:second.state.battle.turn, action:'defend' });
  await fallen;
  assert.equal(first.state.self.companions.lia, false);
  assert.equal((await storage.readCampaign({ id:victim.campaign.id })).data.liaMemorialCount || 0, 0,
    'A lápide permanece pendente até o personagem sair da baseline de combate.');
  await send(first, 'leaveAdventure', {}, 'left');
  const saved = await storage.readHero(victim.id);
  const world = (await storage.readCampaign({ id:victim.campaign.id })).data;
  assert.equal(saved.data.companions.lia, false);
  assert.equal(saved.data.companions.liaEcho.fallen, 1);
  assert.equal(world.liaMemorialCount, 1);
  assert.equal(world.liaMemorials.length, 1);
  assert.equal(second.state.self.companions.lia, true);
  assert.equal(second.state.self.companions.liaEcho.needsRescue, false);
});

test('a lápide do Pomar mostra a memória persistida sem alterar a geração do companheiro', async t => {
  const storage = createStorage();
  const grave = { id:'memoria-antiga', heroName:'Glória', generation:4, zone:'cave', at:Date.now() - 10000 };
  const hero = await seed(storage, { zone:'orchard', x:650, y:420, hp:100,
    companions:{ lume:1, lia:true, liaEcho:{ generation:5, fallen:4, needsRescue:false } },
    world:{ liaMemorials:[grave], liaMemorialCount:4 } });
  const f = await launch(t, storage);
  const socket = await f.connect();
  await enter(socket, hero);
  const dialogue = await send(socket, 'interact', { id:'lia-memorial' }, 'dialogue');
  assert.match(dialogue.title, /Memorial/);
  assert.ok(dialogue.lines.some(line => line.includes('Glória') && line.includes('4')));
  assert.deepEqual((await storage.readHero(hero.id)).data.companions.liaEcho,
    { generation:5, fallen:4, needsRescue:false });
  assert.equal((await storage.readCampaign({ id:hero.campaign.id })).data.liaMemorialCount, 4);
});
