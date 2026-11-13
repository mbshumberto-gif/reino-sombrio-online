'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const { createHash } = require('node:crypto');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const { makeHero, newCampaign, makeMember } = require('../adventure');

const id = { id:'e2e-hero', key:'9'.repeat(64) };
const hash = key => createHash('sha256').update(key).digest('hex');

async function launch(t, storage = createStorage()) {
  const game = createGame({ storage });
  const { port } = await game.listen(0, '127.0.0.1');
  t.after(() => game.close());
  const executablePath = process.env.ELDORIA_CHROMIUM;
  const browser = await chromium.launch({
    executablePath,
    args: executablePath ? ['--no-sandbox','--disable-dev-shm-usage','--single-process','--no-zygote'] : []
  });
  t.after(() => browser.close());
  return { browser, url:'http://127.0.0.1:' + port };
}

async function start(page, url, action = 'create') {
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await page.locator('#startAdventureBtn').click();
  await page.waitForFunction(() => document.querySelector('#heroClass').options.length === 9);
  await page.locator('#playerName').fill('Beto');
  await page.locator(action === 'create' ? '#createBtn' : '#continueSaveBtn').click();
  await page.locator('#heroName').getByText('Beto', { exact:true }).waitFor();
}

async function keyboard(page, key, milliseconds) {
  await page.keyboard.down(key);
  try { await page.waitForTimeout(milliseconds); }
  finally { await page.keyboard.up(key); }
}

async function touch(page, session, dx, dy, milliseconds, ending = 'touchEnd') {
  const joystick = page.locator('#virtualJoystick');
  await joystick.scrollIntoViewIfNeeded();
  const box = await joystick.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await session.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x,y,id:1}] });
  await session.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{x:x+dx,y:y+dy,id:1}] });
  await page.waitForTimeout(milliseconds);
  await session.send('Input.dispatchTouchEvent', { type:ending, touchPoints:[] });
}

test('toque em retrato e paisagem, maçã e portal da Vila', { timeout:35000 }, async t => {
  const { browser, url } = await launch(t);
  const context = await browser.newContext({ ...devices['Pixel 7'], viewport:{ width:360,height:800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(6500);
  page.setDefaultNavigationTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await start(page, url);
  const cdp = await context.newCDPSession(page);
  await touch(page, cdp, -42, -19, 510, 'touchCancel');
  await page.getByText(/AÇÃO · Macieira da praça/).waitFor();
  assert.equal(await page.locator('#joystickKnob').evaluate(el => el.style.transform), '');
  await page.locator('#mobileActionBtn').tap();
  await page.locator('#toast').getByText(/Uma maçã caiu/).waitFor();
  await page.waitForTimeout(850);
  await page.locator('#mobileActionBtn').tap();
  await page.locator('#toast').getByText(/Você guardou uma maçã/).waitFor();
  await page.setViewportSize({ width:800,height:360 });
  assert.ok(await page.locator('#virtualJoystick').isVisible());
  assert.ok(await page.locator('#mobileActionBtn').isVisible());
  await touch(page, cdp, 42, 29, 570);
  await page.getByText(/AÇÃO · Estrada da Floresta/).waitFor();
  await page.locator('#mobileActionBtn').tap();
  await page.locator('#areaTitle').getByText('Floresta Amaldiçoada', { exact:true }).waitFor();
  assert.deepEqual(errors, []);
  if (process.env.ELDORIA_SCREENSHOT) await page.screenshot({ path:process.env.ELDORIA_SCREENSHOT });
});

test('Ent tem três fases, Espaço ataca e o herói volta a andar após a vitória', { timeout:35000 }, async t => {
  const storage = createStorage();
  const room = newCampaign('D1133A', id.id);
  room.data.defeated.forest = [0,1,2,3,4];
  const hero = { id:id.id, keyHash:hash(id.key), revision:0,
    data:makeHero('Beto','warrior',{ attack:4000, defense:4000 }) };
  hero.data.homeCampaign = room.id;
  await storage.save({ campaign:room, players:[hero], members:[makeMember(room,id.id,{ x:480,y:145,campaign:{ activeRegion:'forest' } })] });
  const { browser, url } = await launch(t, storage);
  const page = await browser.newPage({ viewport:{ width:1220,height:890 } });
  page.setDefaultTimeout(6500);
  page.setDefaultNavigationTimeout(12000);
  await page.addInitScript(id => localStorage.setItem('eldoriaIdentityV2', JSON.stringify(id)), id);
  await start(page, url, 'continue');
  await page.waitForTimeout(1860);
  await page.keyboard.press('KeyE');
  await page.getByText('FASE 1/3').waitFor();
  await page.keyboard.press('Space');
  await page.getByText('FASE 2/3').waitFor();
  await page.locator('#totemBtn').click();
  await page.waitForFunction(() => document.querySelector('#totemBtn').textContent.includes('1 restante'));
  await page.waitForTimeout(150);
  await page.locator('#totemBtn').click();
  await page.locator('#totemBtn').waitFor({ state:'hidden' });
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await page.getByText('FASE 3/3').waitFor();
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await page.getByRole('dialog').getByText('Floresta Amaldiçoada conquistada').waitFor();
  await page.locator('#continueCampaignBtn').click();
  await page.locator('#worldCanvas').waitFor();
  await page.locator('#worldCanvas').click({ position:{ x:5,y:5 } });
  await keyboard(page, 'ArrowDown', 670);
  await page.waitForFunction(() => document.querySelector('#nearbyPrompt').textContent.includes('Voltar à Vila de Eldoria'));
  await page.keyboard.press('KeyE');
  await page.locator('#areaTitle').getByText('Vila de Eldoria', { exact:true }).waitFor();
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.locator('#roomLabel').getByText('D1133A', { exact:true }).waitFor();
  assert.equal(await page.locator('#heroName').innerText(),'Beto');
  if (process.env.ELDORIA_VILLAGE_SCREENSHOT) await page.screenshot({ path:process.env.ELDORIA_VILLAGE_SCREENSHOT });
});

test('quatro cenas de Malakar ficam acessíveis em celular baixo mesmo com fontes indisponíveis', { timeout:35000 }, async t => {
  const storage = createStorage();
  const room = newCampaign('C124F0', id.id, { world:{ forest:true,cave:true,fire:true,castle:true,shadow:true } });
  const hero = { id:id.id, keyHash:hash(id.key), revision:0, data:makeHero('Beto','ranger') };
  hero.data.homeCampaign = room.id;
  await storage.save({ campaign:room, players:[hero], members:[makeMember(room,id.id)] });
  const { browser, url } = await launch(t, storage);
  const context = await browser.newContext({ ...devices['Pixel 7'], viewport:{ width:360,height:540 } });
  await context.route('**/*.woff2', route => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(6500);
  page.setDefaultNavigationTimeout(12000);
  await page.addInitScript(id => localStorage.setItem('eldoriaIdentityV2', JSON.stringify(id)), id);
  await start(page, url, 'continue');
  for (const title of ['O último grito de Malakar','As correntes se partem','Eldoria desperta','O primeiro amanhecer']) {
    await page.getByRole('dialog').getByText(title, { exact:true }).waitFor();
    await page.locator('#continueCampaignBtn').tap();
  }
  await page.locator('#transitionScreen').waitFor({ state:'hidden' });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#transitionScreen').isVisible(), false);
  const member = await storage.readMember(room.id, hero.id);
  assert.equal(member.data.seenEnding, true);
});
