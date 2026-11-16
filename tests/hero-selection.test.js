'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { setTimeout: wait } = require('node:timers/promises');
const { io } = require('socket.io-client');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const { newCampaign, makeHero, makeMember } = require('../adventure');

function incoming(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const listener = (...args) => {
      if (!predicate(...args)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(args);
    };
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error('Tempo esgotado: ' + event + ' · ' + (socket.lastError || 'sem resposta')));
    }, 4000);
    socket.on(event, listener);
  });
}
const send = (socket, name, payload, output, predicate) => {
  const result = incoming(socket, output, predicate);
  socket.emit(name, payload);
  return result;
};

async function fixture(t, storage) {
  const game = createGame({ storage, graceMs:4000, logger:{ error() {} } });
  const { port } = await game.listen(0, '127.0.0.1');
  const clients = [];
  t.after(async () => {
    clients.forEach(socket => socket.disconnect());
    await game.close();
  });
  return async () => {
    const socket = io('http://127.0.0.1:' + port, { transports:['websocket'], reconnection:false, forceNew:true });
    clients.push(socket);
    socket.on('state', state => { socket.state = state; });
    socket.on('errorMessage', message => { socket.lastError = message; });
    await incoming(socket, 'connect');
    return socket;
  };
}

async function seed(storage, classKey = 'mage', name = 'Maga das memórias') {
  const identity = { id:'selection-' + randomBytes(8).toString('hex'), key:randomBytes(32).toString('hex') };
  const campaign = newCampaign(randomBytes(3).toString('hex').toUpperCase(), identity.id);
  const hero = { id:identity.id, keyHash:createHash('sha256').update(identity.key).digest('hex'), revision:0,
    data:{ ...makeHero(name, classKey), level:7, gold:432, owned:['oakStaff', 'chainArmor'],
      equipment:{ weapon:'oakStaff', armor:'chainArmor', charm:null }, recoveryHash:'segredo-de-recuperacao',
      homeCampaign:campaign.id } };
  await storage.save({ campaign, players:[hero], members:[makeMember(campaign, hero.id)] });
  return { ...identity, campaign, hero };
}

function assertMage(state) {
  assert.equal(state.self.classKey, 'mage');
  assert.equal(state.self.level, 7);
  assert.equal(state.self.gold, 432);
  assert.equal(state.self.equipment.weapon, 'oakStaff');
  assert.equal(state.self.equipment.armor, 'chainArmor');
}

test('inspectHero autentica, publica somente o perfil necessário e não grava nem importa personagens', async t => {
  const memory = createStorage();
  let saves = 0;
  const storage = { ...memory, save:async payload => { saves++; return memory.save(payload); },
    readLegacy:async id => id === 'legacy-profile' ? { name:'Maga antiga', classKey:'mage', level:9, gold:999, campaign:{ activeRegion:'forest' } } : memory.readLegacy(id) };
  const mage = await seed(storage);
  const saved = await storage.readHero(mage.id);
  const initialSaves = saves;
  const connect = await fixture(t, storage);
  const authorized = await connect();
  const [profile] = await send(authorized, 'inspectHero', { id:mage.id, key:mage.key }, 'heroProfile');
  assert.deepEqual(profile, { heroId:mage.id, exists:true, character:{ name:mage.hero.data.name, classKey:'mage', level:7 } });
  assert.equal(saves, initialSaves);
  assert.deepEqual(await storage.readHero(mage.id), saved);
  const unauthorized = await connect();
  let leakedProfile = false;
  unauthorized.on('heroProfile', () => { leakedProfile = true; });
  const [message, info] = await send(unauthorized, 'inspectHero', { id:mage.id, key:'0'.repeat(64) }, 'errorMessage');
  assert.equal(typeof message, 'string');
  assert.equal(info.request, 'inspectHero');
  assert.equal(info.heroId, mage.id);
  const serialized = JSON.stringify([message, info]);
  for (const secret of [mage.key, mage.hero.keyHash, mage.hero.data.recoveryHash, mage.hero.data.name]) {
    assert.equal(serialized.includes(secret), false, 'Perfil negado não deve expor informações do personagem.');
  }
  assert.equal(info.character, undefined);
  assert.equal(leakedProfile, false);
  const unknown = await connect();
  const missingId = 'selection-new-' + randomBytes(4).toString('hex');
  const [missing] = await send(unknown, 'inspectHero', { id:missingId, key:randomBytes(32).toString('hex') }, 'heroProfile');
  assert.deepEqual(missing, { heroId:missingId, exists:false });
  assert.equal(saves, initialSaves);
  assert.equal(await storage.readHero(missingId), null);
  const legacyClient = await connect();
  const [legacy] = await send(legacyClient, 'inspectHero', { id:'legacy-profile', key:randomBytes(32).toString('hex') }, 'heroProfile');
  assert.deepEqual(legacy, { heroId:'legacy-profile', exists:true, character:{ name:'Maga antiga', classKey:'mage', level:9 } });
  assert.equal(saves, initialSaves);
  assert.equal(await storage.readHero('legacy-profile'), null, 'Consultar o perfil não deve importar a campanha antiga.');
});

test('criar ou entrar com classe diferente da identidade salva falha antes de admitir ou gravar', async t => {
  const memory = createStorage();
  let saves = 0;
  const storage = { ...memory, save:async payload => { saves++; return memory.save(payload); } };
  const mage = await seed(storage);
  const host = await seed(storage, 'warrior', 'Guarda da estrada');
  const initialSaves = saves;
  const originalHero = await storage.readHero(mage.id);
  const connect = await fixture(t, storage);
  for (const action of ['create', 'join']) {
    const socket = await connect();
    let admissions = 0;
    socket.on('joined', () => { admissions++; });
    const [, info] = await send(socket, 'adventure', {
      action, id:mage.id, key:mage.key, classKey:'warrior', name:'Guerreira escolhida', code:host.campaign.code
    }, 'errorMessage');
    assert.equal(info.code, 'CHARACTER_CLASS_MISMATCH');
    assert.equal(info.heroId, mage.id);
    assert.deepEqual(info.character, { name:mage.hero.data.name, classKey:'mage', level:7 });
    assert.equal(admissions, 0);
    assert.equal(socket.state, undefined);
    assert.equal(saves, initialSaves);
    assert.deepEqual(await storage.readHero(mage.id), originalHero);
    assert.equal(await storage.readMember(host.campaign.id, mage.id), null);
  }
  const valid = await connect();
  const [state] = await send(valid, 'adventure', {
    action:'join', id:mage.id, key:mage.key, classKey:'mage', code:host.campaign.code
  }, 'state');
  assertMage(state);
  assert.equal(state.campaignId, host.campaign.id);
});

test('continuar e retomar ignoram a classe do formulário e preservam a classe e os itens salvos', async t => {
  const storage = createStorage();
  const mage = await seed(storage);
  const connect = await fixture(t, storage);
  const first = await connect();
  const [continued] = await send(first, 'adventure', { action:'continue', id:mage.id, key:mage.key, classKey:'warrior' }, 'state');
  assertMage(continued);
  const observer = await connect();
  await send(observer, 'inspectHero', { id:mage.id, key:mage.key }, 'heroProfile');
  assert.equal(first.connected, true, 'Consultar o perfil não substitui uma sessão ativa.');
  assert.equal(observer.state, undefined);
  first.disconnect();
  const next = await connect();
  const [resumed] = await send(next, 'adventure', {
    action:'resume', id:mage.id, key:mage.key, classKey:'druid', campaignId:mage.campaign.id
  }, 'state');
  assertMage(resumed);
  assert.equal(resumed.id, mage.id);
  assert.equal(resumed.campaignId, mage.campaign.id);
  assert.equal((await storage.readHero(mage.id)).data.classKey, 'mage');
  // A failed key cannot replace even an already connected character session.
  await wait(410);
  const impostor = await connect();
  await send(impostor, 'adventure', {
    action:'resume', id:mage.id, key:'1'.repeat(64), classKey:'mage', campaignId:mage.campaign.id
  }, 'errorMessage');
  assert.equal(impostor.state, undefined);
  assert.equal(next.connected, true);
});
