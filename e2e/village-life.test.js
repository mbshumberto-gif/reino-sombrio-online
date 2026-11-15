'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const { chromium, devices } = require('playwright');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const { makeHero, newCampaign, makeMember } = require('../adventure');
const World = require('../public/world-data');

async function fixture(t) {
  const storage = createStorage();
  const game = createGame({ storage });
  const { port } = await game.listen(0, '127.0.0.1');
  const executablePath = process.env.ELDORIA_CHROMIUM;
  const browser = await chromium.launch({ executablePath,
    args:executablePath ? ['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote'] : []
  }).catch(async error => { await game.close(); throw error; });
  t.after(async () => { try { await browser.close(); } finally { await game.close(); } });
  let sharedContext;
  async function open({ elapsed, mobile = false, atHome = false }) {
    const identity = { id:'village-e2e-' + randomBytes(6).toString('hex'), key:randomBytes(32).toString('hex') };
    const room = newCampaign(randomBytes(3).toString('hex').toUpperCase(), identity.id,
      { world:{ forest:true, cave:true, fire:true, castle:true, shadow:true } });
    room.data.epoch = Date.now() - elapsed;
    const hero = { id:identity.id, keyHash:createHash('sha256').update(identity.key).digest('hex'), revision:0,
      data:makeHero('Jade', 'druid', { hp:40, gold:100 }) };
    hero.data.homeCampaign = room.id;
    const home = World.HOUSES.find(house => house.npcId === 'healer');
    const member = makeMember(room, hero.id, atHome ? { x:home.door.x, y:home.door.y + 18 } : { x:480, y:450 });
    member.data.seenEnding = true;
    await storage.save({ campaign:room, players:[hero], members:[member] });
    const context = sharedContext ||= await browser.newContext(mobile ? { ...devices['Pixel 7'], viewport:{ width:390, height:844 } }
      : { viewport:{ width:1280, height:960 } });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(identity => localStorage.setItem('eldoriaIdentityV2', JSON.stringify(identity)), identity);
    await page.route('**/game.js?*', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace('const socket = io();',
        'const socket = io(); socket.on("state", value => { window.__villageState = value; });');
      await route.fulfill({ response, body });
    });
    await page.goto('http://127.0.0.1:' + port, { waitUntil:'domcontentloaded' });
    await page.locator('#startAdventureBtn').click();
    await page.waitForFunction(() => document.querySelector('#entryStatus').textContent === 'Pronto para entrar.' &&
      document.querySelector('#heroClass').options.length === 10);
    await page.locator('#continueSaveBtn').click();
    await page.waitForFunction(() => !document.querySelector('#game').classList.contains('hidden') && window.__villageState?.self.name === 'Jade');
    return { page, context, room, hero, home, storage, errors };
  }
  return { open };
}

test('a Vila mostra casas e o mesmo período do servidor de dia, no entardecer e à noite', { timeout:35000 }, async t => {
  const { open } = await fixture(t);
  for (const [label, elapsed] of [['Manhã', 2000], ['Entardecer', 46000], ['Noite', 68000]]) {
    const { page, errors } = await open({ elapsed });
    await page.waitForFunction(expected => document.querySelector('#miniClock').textContent === expected, label);
    const result = await page.evaluate(() => {
      const state = window.__villageState;
      const homes = window.EldoriaWorld.HOUSES.filter(home => home.zone === state.zone);
      const npcs = window.EldoriaWorld.npcPositions(state.zone, state.now, state.world);
      return { clock:document.querySelector('#miniClock').textContent, homes:homes.length,
        npcs:npcs.map(npc => ({ id:npc.id, indoors:!!npc.indoors })) };
    });
    assert.equal(result.clock, label);
    assert.ok(result.homes >= 4, 'Cada morador da Vila tem casa.');
    assert.equal(result.npcs.every(npc => npc.indoors), label === 'Noite');
    await page.locator('#worldCanvas').screenshot({ path:'/tmp/eldoria-village-' + (label === 'Manhã' ? 'day' : label === 'Entardecer' ? 'dusk' : 'night') + '.png' });
    assert.deepEqual(errors, []);
  }
});

test('Mira atende à noite no celular e seu retrato respeita a aparência da NPC negra', { timeout:25000 }, async t => {
  const { open } = await fixture(t);
  const { page, hero, storage, errors } = await open({ elapsed:68000, mobile:true, atHome:true });
  await page.evaluate(() => {
    const render = window.EldoriaPixel.portrait;
    window.__villagePortraits = [];
    window.EldoriaPixel.portrait = function(canvas, key, time, equipment, appearance) {
      if (canvas.id === 'dialoguePortrait') window.__villagePortraits.push({ key, appearance });
      return render(canvas, key, time, equipment, appearance);
    };
  });
  if (await page.locator('#dialoguePanel').isHidden()) await page.locator('#mobileActionBtn').tap();
  await page.waitForFunction(() => document.querySelector('#dialogueTitle').textContent.includes('Mira') &&
    !document.querySelector('#dialoguePanel').classList.contains('hidden'));
  for (let line = 0; line < 8 && !await page.getByRole('button', { name:'Descansar · 10 ouros', exact:true }).isVisible(); line++) {
    await page.locator('#dialogueNext').tap();
  }
  await page.getByRole('button', { name:'Descansar · 10 ouros', exact:true }).waitFor();
  await page.waitForFunction(() => window.__villagePortraits.some(render => render.appearance?.skinTone === 'deep'));
  await page.screenshot({ path:'/tmp/eldoria-mira-night-mobile.png' });
  await page.getByRole('button', { name:'Descansar · 10 ouros', exact:true }).tap();
  await page.waitForFunction(() => window.__villageState.self.hp === window.__villageState.self.maxHp && window.__villageState.self.gold === 90);
  const saved = await storage.readHero(hero.id);
  assert.equal(saved.data.classKey, 'druid');
  assert.equal(saved.data.hp, saved.data.maxHp);
  assert.equal(saved.data.gold, 90);
  assert.deepEqual(errors, []);
});

test('retratos de NPCs negros, cabelo cacheado da princesa e Goblin possuem apresentação própria', { timeout:20000 }, async t => {
  const { open } = await fixture(t);
  const { page, errors } = await open({ elapsed:2000 });
  const variants = await page.evaluate(async () => {
    const data = await (await fetch('/game-data')).json();
    const board = document.createElement('section');
    board.id = 'villageArtReview';
    board.style.cssText = 'position:relative;background:#202e43;padding:20px;display:grid;grid-template-columns:repeat(4,1fr);gap:18px;border:2px solid #b19877;max-width:1120px;margin:20px auto';
    const result = [];
    for (const id of ['healer','blacksmith','villager','princess']) {
      const npc = data.npcs[id];
      const card = document.createElement('div');
      const title = document.createElement('p');
      title.textContent = npc?.fullName || 'Princesa Maria Rita';
      const canvas = document.createElement('canvas');
      canvas.width = 112;
      canvas.height = 128;
      canvas.style.cssText = 'width:100%;height:250px;object-fit:contain;background:#172339';
      const key = id === 'princess' ? 'princess' : npc.look;
      window.EldoriaPixel.portrait(canvas, key, 1200, {}, npc?.appearance);
      const rendered = canvas.toDataURL();
      if (id !== 'princess') {
        const ordinary = document.createElement('canvas');
        ordinary.width = 112;
        ordinary.height = 128;
        window.EldoriaPixel.portrait(ordinary, key, 1200, {});
        result.push({ id, skinTone:npc.appearance.skinTone, distinct:rendered !== ordinary.toDataURL() });
      }
      card.append(title, canvas);
      board.append(card);
    }
    const goblin = document.createElement('canvas');
    goblin.width = 760;
    goblin.height = 296;
    goblin.style.cssText = 'grid-column:1/-1;width:100%;height:auto';
    const state = structuredClone(window.__villageState);
    state.zone = 'forest';
    state.battle = { heroes:[], name:'Goblin ladrão', boss:false, phase:1, status:{}, totems:0, move:null, lastAction:null };
    window.EldoriaPixel.drawBattle(goblin, state, 1200, { complete:false }, 0);
    board.append(goblin);
    document.body.append(board);
    return result;
  });
  assert.equal(variants.length, 3);
  for (const npc of variants) {
    assert.equal(npc.skinTone, 'deep');
    assert.equal(npc.distinct, true, npc.id + ' usa sua aparência própria no retrato.');
  }
  await page.locator('#villageArtReview').screenshot({ path:'/tmp/eldoria-village-character-art.png' });
  assert.deepEqual(errors, []);
});
