'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium, devices } = require('playwright');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const { makeHero, newCampaign, makeMember } = require('../adventure');

const identity = { id:'lia-echo-browser-hero', key:'6'.repeat(64) };
const hash = key => createHash('sha256').update(key).digest('hex');

async function fixture(t, { zone, x, y, setup, bossIntroMs = 300 }) {
  const storage = createStorage();
  const campaign = newCampaign('EC401A', identity.id);
  campaign.data.combatMode = 'field';
  const hero = { id:identity.id, keyHash:hash(identity.key), revision:0,
    data:makeHero('Aurora', 'druid', { attack:4000, defense:4000 }) };
  hero.data.homeCampaign = campaign.id;
  hero.data.companions.lume = 1;
  const member = makeMember(campaign, hero.id, { x, y, campaign:{ activeRegion:zone } });
  setup(campaign.data, hero.data);
  await storage.save({ campaign, players:[hero], members:[member] });
  const game = createGame({ storage, bossIntroMs });
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
  // Observe the real authoritative packets; all actions still use the ordinary controls.
  await page.route('**/game.js?*', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('const socket = io();',
      'const socket = io(); socket.on("state", value => window.__echoState = value); socket.on("moved", value => { if(value.id === window.__echoState?.id) window.__echoPosition = value; });');
    await route.fulfill({ response, body });
  });
  await page.goto('http://127.0.0.1:' + port, { waitUntil:'domcontentloaded' });
  await page.locator('#startAdventureBtn').click();
  await page.waitForFunction(() => document.querySelector('#heroClass').options.length === 10 && document.querySelector('#entryStatus').textContent === 'Pronto para entrar.');
  await page.locator('#continueSaveBtn').click();
  await page.waitForFunction(() => !document.querySelector('#game').classList.contains('hidden') && window.__echoState?.self.name === 'Aurora');
  return { page, storage, campaign, errors };
}

async function closeConversation(page) {
  for (let line = 0; line < 8 && await page.locator('#dialoguePanel').isVisible(); line++) {
    await page.locator('#dialogueNext').tap();
  }
  if (await page.locator('#worldDialog').evaluate(dialog => dialog.open)) await page.locator('#worldDialog .close-dialog').tap();
}

async function position(page) {
  return page.evaluate(() => {
    const state = window.__echoState;
    return window.__echoPosition?.zone === state.zone ? window.__echoPosition : state.players.find(player => player.id === state.id);
  });
}

async function walkTo(page, x, y) {
  for (let step = 0; step < 30; step++) {
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
  throw new Error('Não chegou ao memorial: ' + JSON.stringify(await position(page)));
}

test('no celular, resgatar outro Eco de Lia preserva a memória do clone que caiu', { timeout:30000 }, async t => {
  const { page, storage, campaign, errors } = await fixture(t, { zone:'orchard', x:570, y:415,
    setup(world, hero) {
      hero.companions.lia = false;
      hero.companions.liaEcho = { generation:1, fallen:1, needsRescue:true };
      world.liaMemorials = [{ id:'echo-memory-1', heroName:'Aurora', generation:1, zone:'forest', at:Date.now() - 60000 }];
      world.liaMemorialCount = 1;
    }
  });
  await page.waitForFunction(() => document.querySelector('#nearbyPrompt').textContent.includes('Eco de Lia'));
  assert.equal(await page.evaluate(() => window.EldoriaPixel.visiblePoint(window.EldoriaWorld.zone('orchard').points.find(p => p.id === 'lia-echo'), window.EldoriaWorld.zone('orchard'), window.__echoState)), true);
  await page.locator('#mobileActionBtn').tap();
  await page.waitForFunction(() => window.__echoState.self.companions.lia && window.__echoState.self.companions.liaEcho.generation === 2);
  assert.equal(await page.evaluate(() => window.__echoState.self.companions.liaEcho.needsRescue), false);
  assert.equal(await page.evaluate(() => window.EldoriaPixel.visiblePoint(window.EldoriaWorld.zone('orchard').points.find(p => p.id === 'lia-echo'), window.EldoriaWorld.zone('orchard'), window.__echoState)), false);
  await closeConversation(page);
  assert.match(await page.locator('#inventoryPanel').textContent(), /Eco de Lia.*clone 2/);
  await page.locator('#overworld').screenshot({ path:'/tmp/eldoria-lia-echo-mobile.png' });
  const savedHero = await storage.readHero(identity.id);
  assert.equal(savedHero.data.companions.liaEcho.generation, 2);
  assert.equal(savedHero.data.companions.liaEcho.fallen, 1);
  const savedWorld = await storage.readCampaign({ id:campaign.id });
  assert.equal(savedWorld.data.liaMemorialCount, 1);
  assert.equal(savedWorld.data.liaMemorials[0].heroName, 'Aurora');
  await walkTo(page, 650, 420);
  await page.waitForFunction(() => document.querySelector('#nearbyPrompt').textContent.includes('Memorial'));
  await page.locator('#mobileActionBtn').tap();
  await page.locator('#dialoguePanel').waitFor({ state:'visible' });
  const lines = [await page.locator('#dialogueTitle').textContent()];
  for (let line = 0; line < 8 && await page.locator('#dialoguePanel').isVisible(); line++) {
    const message = await page.locator('#dialogueText').textContent();
    lines.push(message);
    if (message.includes('Aurora')) break;
    await page.locator('#dialogueNext').tap();
  }
  const memorial = lines.join('\n');
  assert.match(memorial, /Lia/);
  assert.match(memorial, /Aurora/);
  assert.match(memorial, /1/);
  await page.screenshot({ path:'/tmp/eldoria-lia-memorial-mobile.png' });
  assert.deepEqual(errors, []);
});

test('Troll Rei aparece na introdução e mantém sua arte original nas três fases da arena', { timeout:35000 }, async t => {
  const { page, errors } = await fixture(t, { zone:'cave', x:480, y:145, bossIntroMs:1400,
    setup(world, hero) {
      world.cleared.forest = true;
      world.defeated.cave = [0,1,2,3,4];
      hero.companions.lia = true;
      hero.companions.liaEcho = { generation:2, fallen:1, needsRescue:false };
    }
  });
  await page.waitForTimeout(1850);
  await page.keyboard.press('KeyE');
  await page.locator('#bossIntro').waitFor({ state:'visible' });
  assert.match(await page.locator('#bossIntroTitle').textContent(), /Troll Rei das Profundezas/);
  assert.equal(await page.evaluate(() => typeof window.EldoriaPixel.drawBossIntro), 'function');
  await page.locator('#bossIntroCanvas').screenshot({ path:'/tmp/eldoria-troll-intro.png' });
  await page.locator('#bossIntro').waitFor({ state:'hidden' });
  await page.waitForFunction(() => window.__echoState.battle?.phase === 1 && !document.querySelector('#attackBtn').disabled);
  assert.equal(await page.evaluate(() => window.__echoState.battle.mode), 'turn');
  assert.equal(await page.locator('#battle').isVisible(), true);
  assert.equal(await page.locator('#overworld').isVisible(), false);
  await page.locator('#battleSceneCanvas').screenshot({ path:'/tmp/eldoria-troll-phase-1.png' });
  await page.locator('#attackBtn').tap();
  await page.waitForFunction(() => window.__echoState.battle.phase === 2);
  await page.locator('#battleSceneCanvas').screenshot({ path:'/tmp/eldoria-troll-phase-2.png' });
  for (const remaining of [1, 0]) {
    await page.waitForFunction(() => !document.querySelector('#totemBtn').disabled);
    await page.locator('#totemBtn').tap();
    await page.waitForFunction(remaining => window.__echoState.battle.totems === remaining, remaining);
  }
  await page.waitForFunction(() => !document.querySelector('#attackBtn').disabled);
  await page.locator('#attackBtn').tap();
  await page.waitForFunction(() => window.__echoState.battle.phase === 3);
  await page.locator('#battleSceneCanvas').screenshot({ path:'/tmp/eldoria-troll-phase-3.png' });
  assert.deepEqual(errors, []);
});
