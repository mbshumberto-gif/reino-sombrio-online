'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { chromium, devices } = require('playwright');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const { newCampaign, makeHero, makeMember } = require('../adventure');

async function seed(storage, name = 'Maga das memórias', classKey = 'mage') {
  const identity = { id:'selection-e2e-' + randomBytes(6).toString('hex'), key:randomBytes(32).toString('hex') };
  const room = newCampaign(randomBytes(3).toString('hex').toUpperCase(), identity.id);
  const hero = { id:identity.id, keyHash:createHash('sha256').update(identity.key).digest('hex'), revision:0,
    data:{ ...makeHero(name, classKey), level:7, gold:432, homeCampaign:room.id,
      owned:['oakStaff', 'chainArmor'], equipment:{ weapon:'oakStaff', armor:'chainArmor', charm:null } } };
  await storage.save({ campaign:room, players:[hero], members:[makeMember(room, hero.id)] });
  return { identity, room, hero };
}

async function fixture(t, viewport, { delayProfile = 0, delayFirstInspect = 0 } = {}) {
  const storage = createStorage();
  const mage = await seed(storage);
  const game = createGame({ storage });
  const { port } = await game.listen(0, '127.0.0.1');
  const executablePath = process.env.ELDORIA_CHROMIUM;
  const browser = await chromium.launch({ executablePath,
    args:executablePath ? ['--no-sandbox', '--disable-dev-shm-usage', '--single-process', '--no-zygote'] : []
  }).catch(async error => { await game.close(); throw error; });
  t.after(async () => { try { await browser.close(); } finally { await game.close(); } });
  const context = await browser.newContext({ ...devices['Pixel 7'], viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(identity => {
    if (!sessionStorage.getItem('heroSelectionSeeded')) {
      localStorage.setItem('eldoriaIdentityV2', JSON.stringify(identity));
      sessionStorage.setItem('heroSelectionSeeded', 'yes');
    }
  }, mage.identity);
  await page.route('**/game.js?*', async route => {
    const response = await route.fetch();
    const profileDelay = delayProfile ? 'const selectionOnevent = socket.onevent.bind(socket); socket.onevent = packet => { if (packet.data?.[0] === \"heroProfile\") { window.__heroSelectionProfileHeld = true; setTimeout(() => selectionOnevent(packet), ' + delayProfile + '); } else selectionOnevent(packet); };' : '';
    const inspectDelay = delayFirstInspect ? 'const selectionEmit = socket.emit.bind(socket); window.__heroInspectRequests = 0; socket.emit = (event, ...args) => { if (event === "inspectHero" && ++window.__heroInspectRequests === 1) { setTimeout(() => selectionEmit(event, ...args), ' + delayFirstInspect + '); return socket; } return selectionEmit(event, ...args); }; socket.on("heroProfile", () => { window.__heroInitialProfileReady = true; });' : '';
    const body = (await response.text()).replace('const socket = io();',
      'const socket = io(); ' + profileDelay + inspectDelay + ' socket.on("state", value => { window.__heroSelectionState = value; });');
    await route.fulfill({ response, body });
  });
  const url = 'http://127.0.0.1:' + port;
  await page.goto(url, { waitUntil:'domcontentloaded' });
  if (delayFirstInspect) await page.waitForFunction(() => window.__heroInitialProfileReady && document.querySelector('#heroClass').options.length === 10);
  await page.locator('#startAdventureBtn').tap();
  if (delayProfile) {
    await page.waitForFunction(() => window.__heroSelectionProfileHeld && document.querySelector('#heroClass').options.length === 10);
  } else {
    await page.waitForFunction(() => document.querySelector('#heroClass').value === 'mage' && !document.querySelector('#createBtn').disabled);
    assert.equal(await page.locator('#playerName').inputValue(), mage.hero.data.name);
  }
  return { page, storage, mage, errors, url };
}

function assertOriginalMage(saved, original) {
  for (const key of ['name', 'classKey', 'level', 'gold', 'owned', 'equipment', 'homeCampaign']) {
    assert.deepEqual(saved.data[key], original.data[key], key);
  }
  assert.equal(saved.keyHash, original.keyHash);
}

const activeIdentity = page => page.evaluate(() => JSON.parse(localStorage.getItem('eldoriaIdentityV2')));

// Both form actions exercise a real browser, a real socket, and separate persisted hero rows.
test('no celular em retrato escolher Guerreiro cria outra identidade e permite voltar à Maga salva', { timeout:35000 }, async t => {
  const { page, storage, mage, errors } = await fixture(t, { width:390, height:844 }, { delayFirstInspect:150 });
  assert.equal(await page.locator('#continueSaveBtn').isEnabled(), true, 'Abrir a entrada reutiliza o perfil já conferido.');
  assert.equal(await page.evaluate(() => window.__heroInspectRequests), 1, 'Não repete a consulta dentro do limite do servidor.');
  await page.locator('#heroClass').selectOption('warrior');
  await page.locator('#playerName').fill('Guardiã da estrada');
  await page.locator('#createBtn').tap();
  await page.waitForFunction(() => !document.querySelector('#game').classList.contains('hidden') && window.__heroSelectionState?.self.classKey === 'warrior');
  const warriorIdentity = await activeIdentity(page);
  assert.notEqual(warriorIdentity.id, mage.identity.id);
  assert.notEqual(warriorIdentity.key, mage.identity.key);
  const warrior = await storage.readHero(warriorIdentity.id);
  assert.equal(warrior.data.classKey, 'warrior');
  assert.equal(warrior.data.level, 1);
  assertOriginalMage(await storage.readHero(mage.identity.id), mage.hero);
  assert.ok(await page.locator('#virtualJoystick').isVisible());
  await page.locator('#leaveAdventureBtn').tap();
  await page.locator('#entry').waitFor({ state:'visible' });
  await page.locator('#heroRoster').selectOption(mage.identity.id);
  await page.waitForFunction(() => document.querySelector('#heroClass').value === 'mage' && !document.querySelector('#continueSaveBtn').disabled);
  await page.locator('#continueSaveBtn').tap();
  await page.waitForFunction(() => !document.querySelector('#game').classList.contains('hidden') && window.__heroSelectionState?.self.classKey === 'mage');
  assert.equal((await activeIdentity(page)).id, mage.identity.id);
  const restored = await page.evaluate(() => window.__heroSelectionState);
  assert.equal(restored.self.level, 7);
  assert.equal(restored.self.gold, 432);
  assert.equal(restored.self.equipment.weapon, 'oakStaff');
  assertOriginalMage(await storage.readHero(mage.identity.id), mage.hero);
  assert.deepEqual(errors, []);
  await page.screenshot({ path:'/tmp/eldoria-hero-selection-portrait.png' });
});

test('em paisagem um perfil atrasado não troca a classe escolhida ao entrar, e recarregar retoma o Guerreiro', { timeout:35000 }, async t => {
  const { page, storage, mage, errors } = await fixture(t, { width:844, height:390 }, { delayProfile:1200 });
  const host = await seed(storage, 'Anfitrião', 'warrior');
  await page.locator('#heroClass').selectOption('warrior');
  await page.locator('#playerName').fill('Guarda do grupo');
  await page.locator('#roomCode').fill(host.room.code);
  await page.locator('#joinBtn').tap();
  await page.waitForFunction(() => !document.querySelector('#game').classList.contains('hidden') && window.__heroSelectionState?.self.classKey === 'warrior');
  const warrior = await activeIdentity(page);
  assert.notEqual(warrior.id, mage.identity.id);
  assert.equal((await storage.readHero(warrior.id)).data.classKey, 'warrior');
  assert.equal(await page.locator('#roomLabel').textContent(), host.room.code);
  assertOriginalMage(await storage.readHero(mage.identity.id), mage.hero);
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('#game').classList.contains('hidden') && window.__heroSelectionState?.self.classKey === 'warrior');
  assert.equal((await activeIdentity(page)).id, warrior.id);
  assert.equal(await page.locator('#roomLabel').textContent(), host.room.code);
  assertOriginalMage(await storage.readHero(mage.identity.id), mage.hero);
  assert.deepEqual(errors, []);
  await page.screenshot({ path:'/tmp/eldoria-hero-selection-landscape.png' });
});
