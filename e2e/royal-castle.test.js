'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium, devices } = require('playwright');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const { makeHero, newCampaign, makeMember } = require('../adventure');

const identity = { id:'royal-castle-browser-hero', key:'5'.repeat(64) };
const hash = key => createHash('sha256').update(key).digest('hex');

async function fixture(t, rescued) {
  const storage = createStorage();
  const campaign = newCampaign('C451E0', identity.id);
  campaign.data.combatMode = 'field';
  campaign.data.cleared.shadow = rescued;
  const hero = { id:identity.id, keyHash:hash(identity.key), revision:0,
    data:makeHero('Aurora', 'druid', { gold:123, potions:7 }) };
  hero.data.homeCampaign = campaign.id;
  hero.data.apples = 3;
  hero.data.owned = ['oakStaff', 'amberCharm'];
  hero.data.equipment = { weapon:'oakStaff', armor:null, charm:'amberCharm' };
  const member = makeMember(campaign, hero.id, { x:480, y:208, campaign:{ activeRegion:'village' } });
  member.data.seenEnding = true;
  await storage.save({ campaign, players:[hero], members:[member] });
  const game = createGame({ storage, bossIntroMs:200 });
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
  await page.addInitScript(value => localStorage.setItem('eldoriaIdentityV2', JSON.stringify(value)), identity);
  // Observe server-confirmed state without replacing game actions or persistence.
  await page.route('**/game.js?*', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('const socket = io();',
      'const socket = io(); socket.on("state", value => window.__royalState = value); socket.on("moved", value => { if(value.id === window.__royalState?.id) window.__royalPosition = value; });');
    await route.fulfill({ response, body });
  });
  await page.goto('http://127.0.0.1:' + port, { waitUntil:'domcontentloaded' });
  await page.locator('#startAdventureBtn').click();
  await page.waitForFunction(() => document.querySelector('#heroClass').options.length === 10 && document.querySelector('#entryStatus').textContent === 'Pronto para entrar.');
  await page.locator('#continueSaveBtn').click();
  await page.waitForFunction(() => !document.querySelector('#game').classList.contains('hidden') && window.__royalState?.self.name === 'Aurora');
  return { page, storage, campaign, errors };
}

async function position(page) {
  return page.evaluate(() => {
    const state = window.__royalState;
    return window.__royalPosition?.zone === state.zone ? window.__royalPosition : state.players.find(player => player.id === state.id);
  });
}

async function walkTo(page, x, y) {
  for (let step = 0; step < 45; step++) {
    const at = await position(page);
    const dx = x - at.x, dy = y - at.y;
    if (Math.hypot(dx, dy) <= 12) return;
    const horizontal = Math.abs(dx) > Math.abs(dy), delta = horizontal ? dx : dy;
    const key = horizontal ? delta > 0 ? 'ArrowRight' : 'ArrowLeft' : delta > 0 ? 'ArrowDown' : 'ArrowUp';
    await page.keyboard.down(key);
    try { await page.waitForTimeout(Math.max(70, Math.min(220, Math.abs(delta) / 190 * 1000))); }
    finally { await page.keyboard.up(key); }
    await page.waitForTimeout(90);
  }
  throw new Error('Não chegou ao destino real: ' + JSON.stringify({ target:{x,y}, actual:await position(page) }));
}

async function closeConversation(page) {
  for (let line = 0; line < 10 && await page.locator('#dialoguePanel').isVisible(); line++) await page.locator('#dialogueNext').tap();
  if (await page.locator('#worldDialog').evaluate(dialog => dialog.open)) await page.locator('#worldDialog .close-dialog').tap();
}

async function assertMobileExplore(page) {
  assert.equal(await page.locator('#worldCanvas').isVisible(), true);
  assert.equal(await page.locator('#virtualJoystick').isVisible(), true);
  assert.equal(await page.locator('#mobileActionBtn').isVisible(), true);
  assert.equal(await page.locator('#bossIntro').isVisible(), false);
}

async function inventory(page) {
  return page.evaluate(() => {
    const { classKey, owned, equipment, potions, apples, gold } = window.__royalState.self;
    return { classKey, owned, equipment, potions, apples, gold, id:window.__royalState.id, campaignId:window.__royalState.campaignId };
  });
}

test('castelinho permanece fechado no celular até Maria Rita ser resgatada', { timeout:25000 }, async t => {
  const { page, storage, campaign, errors } = await fixture(t, false);
  await assertMobileExplore(page);
  await page.waitForFunction(() => window.EldoriaWorld.zone('village').points.some(point => point.id === 'royal-castle-gate'));
  await page.waitForFunction(() => /castel|Maria Rita/i.test(document.querySelector('#nearbyPrompt').textContent));
  assert.equal(await page.locator('#dialoguePanel').isVisible(), false, 'Aderic não intercepta o portão');
  await page.locator('#overworld').screenshot({ path:'/tmp/eldoria-royal-castle-closed.png' });
  await page.locator('#mobileActionBtn').tap();
  await page.waitForFunction(() => /Maria Rita/.test(document.querySelector('#toast').textContent));
  assert.equal(await page.evaluate(() => window.__royalState.zone), 'village');
  assert.equal((await storage.readMember(campaign.id, identity.id)).data.zone, 'village');
  assert.equal(await page.evaluate(() => window.__royalState.world.cleared.shadow), false);
  assert.deepEqual(errors, []);
});

test('resgate abre o salão real e a visita preserva personagem, mochila e campanha', { timeout:35000 }, async t => {
  const { page, storage, campaign, errors } = await fixture(t, true);
  await page.waitForFunction(() => /castel|Maria Rita/i.test(document.querySelector('#nearbyPrompt').textContent));
  assert.equal(await page.locator('#dialoguePanel').isVisible(), false, 'Entrada livre sem conversa automática');
  const before = await inventory(page);
  await page.locator('#overworld').screenshot({ path:'/tmp/eldoria-royal-castle-open.png' });
  await page.locator('#mobileActionBtn').tap();
  await page.waitForFunction(() => window.__royalState.zone === 'royal-castle');
  await assertMobileExplore(page);
  assert.deepEqual(await inventory(page), before);
  await walkTo(page, 480, 235);
  await page.locator('#overworld').screenshot({ path:'/tmp/eldoria-royal-interior-portrait.png' });
  await page.setViewportSize({ width:844, height:390 });
  await assertMobileExplore(page);
  await page.locator('#overworld').screenshot({ path:'/tmp/eldoria-royal-interior-landscape.png' });
  await page.setViewportSize({ width:390, height:844 });
  await walkTo(page, 480, 220);
  await page.waitForFunction(() => /Maria Rita|memória|retrato/i.test(document.querySelector('#nearbyPrompt').textContent));
  await page.locator('#mobileActionBtn').tap();
  await page.locator('#dialoguePanel').waitFor({ state:'visible' });
  const memories = await page.locator('#dialoguePanel').textContent();
  assert.match(memories, /Maria Rita/);
  assert.match(memories, /memória|lembran|princesa|Eldoria/i);
  await closeConversation(page);
  await walkTo(page, 480, 458);
  await page.waitForFunction(() => /Vila|sair|saída/i.test(document.querySelector('#nearbyPrompt').textContent));
  await page.locator('#mobileActionBtn').tap();
  await page.waitForFunction(() => window.__royalState.zone === 'village');
  await assertMobileExplore(page);
  assert.deepEqual(await inventory(page), before);
  assert.equal((await storage.readMember(campaign.id, identity.id)).data.zone, 'village');
  assert.equal(await page.locator('#dialoguePanel').isVisible(), false, 'Saída não prende o jogador em conversa');
  assert.deepEqual(errors, []);
});
