'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { io } = require('socket.io-client');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const { makeHero, makeMember, newCampaign } = require('../adventure');

const identity = name => ({ id:'mode-' + randomBytes(8).toString('hex'), key:randomBytes(32).toString('hex'), name });
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
    }, 3500);
    socket.on(event, listener);
  });
}
async function fixture(t, storage) {
  const game = createGame({ storage, graceMs:4000, bossIntroMs:0, logger:{ error() {} } });
  const { port } = await game.listen(0, '127.0.0.1');
  const clients = [];
  t.after(async () => {
    clients.forEach(client => client.disconnect());
    await game.close();
  });
  return async () => {
    const socket = io('http://127.0.0.1:' + port, { transports:['websocket'], reconnection:false, forceNew:true });
    clients.push(socket);
    socket.on('errorMessage', error => { socket.lastError = error; });
    await incoming(socket, 'connect');
    return socket;
  };
}
function adventure(socket, hero, action, extra = {}) {
  const state = incoming(socket, 'state', value => value.id === hero.id);
  socket.emit('adventure', { ...hero, action, ...extra });
  return state;
}

test('aventuras novas usam e persistem field mesmo quando o cliente omite ou tenta escolher turn', async t => {
  const storage = createStorage();
  const connect = await fixture(t, storage);
  for (const value of [undefined, 'turn', 'modo-inexistente']) {
    const hero = identity('Druida ' + String(value));
    const socket = await connect();
    const extra = { classKey:'druid' };
    if (value !== undefined) extra.combatMode = value;
    const state = await adventure(socket, hero, 'create', extra);
    assert.equal(state.combatMode, 'field', 'Valor enviado: ' + String(value));
    assert.equal(state.self.classKey, 'druid');
    const saved = await storage.readCampaign({ id:state.campaignId });
    assert.equal(saved.data.combatMode, 'field');
    assert.equal((await storage.readHero(hero.id)).data.classKey, 'druid');
  }
});

test('continuar, entrar e retomar mantêm o modo antigo e a classe gravada apesar de payloads novos', async t => {
  const storage = createStorage();
  const connect = await fixture(t, storage);
  for (const savedMode of [undefined, 'turn']) {
    const hero = identity('Maga ' + String(savedMode));
    const campaign = newCampaign(randomBytes(3).toString('hex').toUpperCase(), hero.id);
    if (savedMode !== undefined) campaign.data.combatMode = savedMode;
    const row = { id:hero.id, keyHash:createHash('sha256').update(hero.key).digest('hex'), revision:0,
      data:{ ...makeHero(hero.name, 'mage'), level:5, gold:123, homeCampaign:campaign.id } };
    await storage.save({ campaign, players:[row], members:[makeMember(campaign, hero.id)] });
    const original = await connect();
    const continued = await adventure(original, hero, 'continue', { combatMode:'field', classKey:'warrior' });
    assert.equal(continued.combatMode, 'turn');
    assert.equal(continued.self.classKey, 'mage');
    original.disconnect();
    const returned = await connect();
    const resumed = await adventure(returned, hero, 'resume', { campaignId:campaign.id, combatMode:'field', classKey:'druid' });
    assert.equal(resumed.combatMode, 'turn');
    assert.equal(resumed.self.classKey, 'mage');
    assert.equal(resumed.self.level, 5);
    assert.equal(resumed.self.gold, 123);
    const friend = identity('Nova aliada ' + String(savedMode));
    const guest = await connect();
    const joined = await adventure(guest, friend, 'join', { code:campaign.code, classKey:'druid', combatMode:'field' });
    assert.equal(joined.combatMode, 'turn');
    assert.equal(joined.self.classKey, 'druid');
    const saved = await storage.readCampaign({ id:campaign.id });
    assert.equal(saved.data.combatMode, savedMode);
    assert.equal(Object.hasOwn(saved.data, 'combatMode'), savedMode !== undefined);
    assert.equal((await storage.readHero(hero.id)).data.classKey, 'mage');
  }
});
