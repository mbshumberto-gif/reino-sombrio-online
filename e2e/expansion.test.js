'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium, devices } = require('playwright');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const { makeHero, newCampaign, makeMember } = require('../adventure');
const Farming = require('../farming');

const identity = { id:'expansion-hero', key:'7'.repeat(64) };
const hash = key => createHash('sha256').update(key).digest('hex');

async function fixture(t, { zone, x, y, setup = () => {} }) {
  const storage = createStorage();
  const room = newCampaign('FA4D01', identity.id);
  room.data.combatMode = 'field';
  const hero = { id:identity.id, keyHash:hash(identity.key), revision:0, data:makeHero('Jade', 'druid', { attack:4000, defense:4000, gold:100 }) };
  hero.data.homeCampaign = room.id;
  const member = makeMember(room, identity.id, { x, y, campaign:{ activeRegion:zone } });
  setup(room.data, hero.data, member.data);
  await storage.save({ campaign:room, players:[hero], members:[member] });
  const game = createGame({ storage });
  const { port } = await game.listen(0, '127.0.0.1');
  const executablePath = process.env.ELDORIA_CHROMIUM;
  const browser = await chromium.launch({ executablePath,
    args:executablePath ? ['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote'] : []
  }).catch(async error => { await game.close(); throw error; });
  t.after(async () => { try { await browser.close(); } finally { await game.close(); } });
  const context = await browser.newContext({ ...devices['Pixel 7'], viewport:{ width:390, height:844 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(id => localStorage.setItem('eldoriaIdentityV2', JSON.stringify(id)), identity);
  // Observe authoritative packets without replacing the server or sending test-only actions.
  await page.route('**/game.js?*', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('const socket = io();',
      'const socket = io(); socket.on("state", value => { window.__e2eState = value; }); socket.on("moved", value => { if (value.id === window.__e2eState?.id) window.__e2ePosition = value; });');
    await route.fulfill({ response, body });
  });
  await page.goto('http://127.0.0.1:' + port, { waitUntil:'domcontentloaded' });
  await page.locator('#startAdventureBtn').click();
  await page.waitForFunction(() => document.querySelector('#heroClass').options.length === 10 && document.querySelector('#entryStatus').textContent === 'Pronto para entrar.');
  await page.locator('#continueSaveBtn').click();
  await page.waitForFunction(() => !document.querySelector('#game').classList.contains('hidden') && window.__e2eState?.self.name === 'Jade');
  return { page, context, storage, room, errors };
}

async function keyboard(page, key, duration) {
  await page.keyboard.down(key);
  try { await page.waitForTimeout(duration); }
  finally { await page.keyboard.up(key); }
  await page.waitForTimeout(90);
}

async function position(page) {
  return page.evaluate(() => {
    const state = window.__e2eState;
    return window.__e2ePosition?.zone === state.zone ? window.__e2ePosition : state.players.find(p => p.id === state.id);
  });
}

async function walkTo(page, x, y) {
  for (let attempt = 0; attempt < 45; attempt++) {
    const at = await position(page);
    const dx = x - at.x, dy = y - at.y;
    if (Math.hypot(dx, dy) <= 13) return;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const delta = horizontal ? dx : dy;
    const key = horizontal ? delta > 0 ? 'ArrowRight' : 'ArrowLeft' : delta > 0 ? 'ArrowDown' : 'ArrowUp';
    await keyboard(page, key, Math.max(70, Math.min(220, Math.abs(delta) / 190 * 1000)));
  }
  throw new Error('Não chegou ao destino ' + x + ',' + y + ': ' + JSON.stringify(await position(page)));
}

async function fieldButton(page, action) {
  const selector = '[data-field-action="' + action + '"]';
  await page.waitForFunction(selector => {
    const button = document.querySelector(selector);
    return button && !button.disabled && !button.hidden;
  }, selector);
  await page.locator(selector).tap();
}

async function assertFieldControlsFit(page) {
  const viewport = page.viewportSize();
  for (const selector of ['#worldCanvas','#virtualJoystick','#mobileActionBtn','#fieldSkillBtn','#fieldTechniqueBtn','#fieldDefendBtn','#fieldTotemBtn','#fieldSelfVitals','#fieldLeaveBtn']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box && box.width > 0 && box.height > 0, selector + ' visível');
    assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
      selector + ' cabe sem rolar: ' + JSON.stringify({ box, viewport }));
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sem rolagem horizontal');
  assert.match(await page.locator('#fieldSkillBtn').getAttribute('aria-label'), /Raízes vivas/);
}

test('Druida colhe, replanta, rega e usa o alimento no Pomar pelo celular', { timeout:35000 }, async t => {
  const { page, storage, errors } = await fixture(t, { zone:'orchard', x:350, y:405, setup(_world, hero) {
    hero.hp = 40;
    hero.farm = { 'garden-1':{ crop:'melon', plantedAt:Date.now() - 180000, readyAt:Date.now() - 1000, watered:false } };
  } });
  await page.waitForFunction(() => document.querySelector('#nearbyPrompt').textContent.includes('canteiro 1'));
  await page.locator('#mobileActionBtn').tap();
  await page.locator('#worldDialogTitle').getByText('Horta do Pomar · canteiro 1', { exact:true }).waitFor();
  await page.getByRole('button', { name:'Colher', exact:true }).tap();
  await page.waitForFunction(() => window.__e2eState.self.farm.harvest.melon === 2);
  // Farm actions have a server input cooldown of 200 ms.
  await page.waitForTimeout(220);
  await page.getByRole('button', { name:/Plantar Abóbora/ }).tap();
  await page.waitForFunction(() => window.__e2eState.self.farm.plots[0].crop === 'pumpkin');
  await page.waitForTimeout(220);
  await page.getByRole('button', { name:'Regar · adianta a colheita', exact:true }).tap();
  await page.waitForFunction(() => window.__e2eState.self.farm.plots[0].watered === true);
  const planted = await storage.readHero(identity.id);
  assert.equal(planted.data.gold, 100 - Farming.CROPS.pumpkin.seedPrice);
  const duration = planted.data.farm['garden-1'].readyAt - planted.data.farm['garden-1'].plantedAt;
  assert.equal(duration, Math.ceil(Farming.CROPS.pumpkin.growMs * 0.85) * 0.75);
  await page.screenshot({ path:'/tmp/eldoria-garden-mobile.png' });
  await page.locator('#worldDialog .close-dialog').tap();
  await page.getByText('Mochila, alimentos e companheiros', { exact:true }).click();
  await page.waitForTimeout(220);
  await page.getByRole('button', { name:'Comer Melancia (2)', exact:true }).tap();
  await page.waitForFunction(() => window.__e2eState.self.farm.harvest.melon === 1);
  assert.equal((await storage.readHero(identity.id)).data.hp, 40 + Farming.CROPS.melon.hp);
  assert.deepEqual(errors, []);
});

test('Ent luta no mapa, aceita movimento por toque e exige quebrar totens nas três fases', { timeout:50000 }, async t => {
  const { page, context, errors } = await fixture(t, { zone:'forest', x:480, y:160,
    setup(world) { world.defeated.forest = [0,1,2,3,4]; } });
  await page.waitForTimeout(1850);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__e2eState?.battle?.mode === 'field');
  assert.equal(await page.locator('#worldCanvas').isVisible(), true);
  assert.equal(await page.locator('#virtualJoystick').isVisible(), true);
  assert.equal(await page.locator('#fieldBattle').isVisible(), true);
  assert.equal(await page.locator('#battle').isVisible(), false);
  await page.waitForFunction(() => window.__e2eState.battle.telegraphs.length > 0);
  const before = await position(page);
  const session = await context.newCDPSession(page);
  await page.locator('#virtualJoystick').scrollIntoViewIfNeeded();
  const box = await page.locator('#virtualJoystick').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await session.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x,y,id:1}] });
  await session.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:x+35,y,id:1}] });
  await page.waitForTimeout(220);
  await session.send('Input.dispatchTouchEvent', { type:'touchCancel', touchPoints:[] });
  await page.waitForTimeout(100);
  assert.ok((await position(page)).x > before.x + 10);
  assert.equal(await page.locator('#joystickKnob').evaluate(el => el.style.transform), '');
  await page.locator('#worldCanvas').click({ position:{ x:5, y:5 } });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__e2eState.battle.phase === 2);
  assert.equal(await page.evaluate(() => window.__e2eState.battle.totems.length), 2);
  await assertFieldControlsFit(page);
  await page.screenshot({ path:'/tmp/eldoria-field-mobile.png' });
  await page.setViewportSize({ width:844, height:390 });
  await page.waitForTimeout(150);
  await assertFieldControlsFit(page);
  await page.screenshot({ path:'/tmp/eldoria-field-landscape.png' });
  await page.setViewportSize({ width:390, height:844 });
  for (let index = 0; index < 2; index++) {
    const totem = await page.evaluate(() => window.__e2eState.battle.totems[0]);
    await walkTo(page, totem.x, totem.y + 20);
    await fieldButton(page, 'totem');
    await page.waitForFunction(id => window.__e2eState.battle.totems.find(totem => totem.id === id)?.hp === 1, totem.id);
    await fieldButton(page, 'totem');
    await page.waitForFunction(id => !window.__e2eState.battle.totems.some(totem => totem.id === id), totem.id);
  }
  await fieldButton(page, 'attack');
  await page.waitForFunction(() => window.__e2eState.battle.phase === 3);
  await page.waitForFunction(() => !document.querySelector('#fieldAttackBtn').disabled);
  await page.locator('#mobileActionBtn').tap();
  await page.waitForFunction(() => !window.__e2eState.battle && window.__e2eState.world.cleared.forest);
  assert.equal(await page.locator('#transitionScreen').isVisible(), true);
  assert.ok(await page.evaluate(() => window.__e2eState.world.rescued.includes('Tomás')));
  assert.deepEqual(errors, []);
});

test('convés tem dois encontros na própria tela e a ilha oferece descanso', { timeout:45000 }, async t => {
  const { page, errors } = await fixture(t, { zone:'boat', x:380, y:380, setup(world) {
    world.combatMode = 'turn'; // Voyage remains on the map even in an older campaign.
    world.cleared.forest = true;
  } });
  assert.equal(await page.locator('#areaTitle').textContent(), 'Travessia das Lanternas');
  await page.waitForTimeout(1850);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__e2eState?.battle?.target.pointId === 'deck-raider-0');
  assert.equal(await page.locator('#worldCanvas').isVisible(), true);
  await fieldButton(page, 'attack');
  await page.waitForFunction(() => window.__e2eState.world.voyage.defeated.includes('deck-raider-0'));
  await walkTo(page, 620, 320);
  await page.waitForTimeout(4100);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__e2eState?.battle?.target.pointId === 'deck-raider-1');
  await fieldButton(page, 'attack');
  await page.waitForFunction(() => window.__e2eState.world.voyage.defeated.length === 2);
  await walkTo(page, 780, 190);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__e2eState.zone === 'island');
  await walkTo(page, 340, 440);
  await page.waitForFunction(() => document.querySelector('#nearbyPrompt').textContent.includes('Fogueira dos navegantes'));
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__e2eState.activeCheckpoint.zone === 'island' && window.__e2eState.activeCheckpoint.x === 340);
  assert.deepEqual(errors, []);
});
