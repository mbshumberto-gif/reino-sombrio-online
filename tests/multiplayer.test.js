'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { setTimeout: wait } = require('node:timers/promises');
const { io } = require('socket.io-client');
const { Pool } = require('pg');
const { createGame } = require('../server');
const { createStorage } = require('../persistence');
const World = require('../public/world-data');
const { makeHero, newCampaign, makeMember } = require('../adventure');

const digest = key => require('node:crypto').createHash('sha256').update(key).digest('hex');
const identity = (name = 'Herói') => ({
  id:'test-' + randomBytes(8).toString('hex'), key:randomBytes(32).toString('hex'), name, classKey:'warrior'
});

function event(socket, name, condition = () => true, duration = 3500) {
  return new Promise((resolve, reject) => {
    const listener = value => {
      if (!condition(value)) return;
      clearTimeout(timer);
      socket.off(name, listener);
      resolve(value);
    };
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error('Tempo esgotado: ' + name + ' · ' + socket.lastError));
    }, duration);
    socket.on(name, listener);
  });
}

async function fixture(t, options = {}) {
  const game = createGame({ storage:createStorage(), graceMs:230, ...options, logger:{ error() {} } });
  const { port } = await game.listen(0, '127.0.0.1');
  const url = 'http://127.0.0.1:' + port;
  const clients = [];
  t.after(async () => {
    for (const socket of clients) socket.disconnect();
    await game.close();
  });
  return {
    game, url, async connect() {
      const socket = io(url, { transports:['websocket'], reconnection:false, forceNew:true });
      clients.push(socket);
      socket.on('state', data => { socket.state = data; });
      socket.on('moved', data => { if (data.id === socket.state?.id) socket.position = data; });
      socket.on('errorMessage', data => { socket.lastError = data; });
      await event(socket, 'connect');
      return socket;
    }
  };
}

function send(socket, eventName, payload, output = 'state', predicate) {
  const next = event(socket, output, predicate);
  socket.emit(eventName, payload);
  return next;
}

const enter = (socket, action, hero, extra = {}) => send(socket, 'adventure', { action, ...hero, ...extra },
  'state', state => state.id === hero.id);
const interact = (socket, id, predicate) => send(socket, 'interact', { id }, 'state', predicate);

async function walk(socket, x, y) {
  let seq = socket.position?.seq || 0;
  let from = socket.position?.zone === socket.state.zone
    ? socket.position : socket.state.players.find(p => p.id === socket.state.id);
  const zone = socket.state.zone;
  for (let i = 0; World.distance(from, { x, y }) > 10 && i < 160; i++) {
    const dx = x - from.x;
    const dy = y - from.y;
    const length = Math.max(12, Math.hypot(dx, dy));
    from = await send(socket, 'moveInput', { dx:dx / length, dy:dy / length, seq:++seq, zone },
      'moved', data => data.id === socket.state.id && data.seq === seq);
    await wait(43);
  }
  assert.ok(World.distance(from, { x,y }) <= 12, 'Percurso incompleto: ' + zone + ' ' + x + ',' + y);
}

test('até oito jogadores, identificação privada, isolamento de zona e reconexão', async t => {
  const f = await fixture(t, { graceMs:4000 });
  const host = await f.connect();
  const owner = identity('Líder');
  const created = await enter(host, 'create', owner);
  const group = [];
  for (let i = 2; i <= 8; i++) {
    const hero = identity('Aliado ' + i);
    const guest = await f.connect();
    const update = event(host, 'state', state => state.heroes.length === i);
    await enter(guest, 'join', hero, { code:created.code });
    await update;
    group.push({ hero, guest });
  }
  assert.equal(host.state.heroes.length, 8);
  const extra = await f.connect();
  assert.match(await send(extra, 'adventure', { ...identity('Nono'), action:'join', code:created.code }, 'errorMessage'), /8 aventureiros/);
  await wait(430);
  assert.match(await send(extra, 'adventure', { ...owner, key:identity().key, action:'join', code:created.code }, 'errorMessage'), /navegador original/);
  assert.match(await send(host, 'interact', { id:'village-shortcut' }, 'errorMessage'), /Chegue mais perto/);
  await wait(190);
  const visited = await interact(host, 'forest-road', state => state.zone === 'forest');
  assert.equal(visited.players.length, 1);
  assert.equal(visited.heroes.length, 8);
  if (group[0].guest.state.players.length !== 7) {
    await event(group[0].guest, 'state', state => state.players.length === 7);
  }
  const seen = event(host, 'state', state => !state.heroes.find(p => p.id === group[0].hero.id).online);
  group[0].guest.disconnect();
  await seen;
  const reconnect = await f.connect();
  const recovered = await enter(reconnect, 'resume', group[0].hero, { campaignId:created.campaignId });
  assert.equal(recovered.code, created.code);
  assert.equal(recovered.zone, 'village');
  assert.equal(recovered.heroes.length, 8);
});

test('modo temporário evita confirmação falsa e mantém campanha ao sair e voltar', async t => {
  const f = await fixture(t);
  const socket = await f.connect();
  const hero = identity();
  const created = await enter(socket, 'create', hero);
  assert.equal(created.durable, false);
  assert.match(await send(socket, 'saveGame', {}, 'errorMessage'), /Modo temporário/);
  await interact(socket, 'forest-road', state => state.zone === 'forest');
  await send(socket, 'leaveAdventure', {}, 'left');
  await wait(420);
  const restored = await enter(socket, 'continue', hero);
  assert.equal(restored.code, created.code);
  assert.equal(restored.zone, 'forest');
});

test('maçã cai, pode ser colhida uma vez e permanece na mochila em outra campanha', async t => {
  const f = await fixture(t);
  const client = await f.connect();
  const hero = identity();
  await enter(client, 'create', hero);
  await walk(client, 410, 428);
  const fallen = await interact(client, 'apple-village', state => state.fruit.length === 1);
  assert.equal(fallen.self.apples, 0);
  await wait(760);
  const picked = await interact(client, 'apple-village', state => state.self.apples === 1);
  assert.equal(picked.fruit[0].claimed, true);
  await wait(200);
  assert.match(await send(client, 'interact', { id:'apple-village' }, 'errorMessage'), /amadurecendo/);
  await send(client, 'leaveAdventure', {}, 'left');
  await wait(420);
  const next = await enter(client, 'create', hero);
  assert.notEqual(next.code, picked.code);
  assert.equal(next.self.apples, 1);
});

test('servidor valida o trajeto, o turno e descarta a repetição de um golpe', async t => {
  const f = await fixture(t, { turnMs:3000 });
  const socket = await f.connect();
  await enter(socket, 'create', identity());
  const start = socket.state.players[0];
  const ignored = event(socket, 'moved', () => true, 130).then(() => false, () => true);
  socket.emit('moveInput', { dx:40, dy:0, seq:1, zone:'village', x:900 });
  assert.equal(await ignored, true);
  const allowed = await send(socket, 'moveInput', { dx:1, dy:0, seq:2, zone:'village' }, 'moved');
  assert.ok(allowed.x - start.x <= 19);
  const forest = await interact(socket, 'forest-road', state => state.zone === 'forest');
  assert.equal(forest.zone, 'forest');
  await wait(200);
  assert.match(await send(socket, 'interact', { id:'boss-forest' }, 'errorMessage'), /Chegue mais perto/);
  await walk(socket, 284, 413);
  await wait(750);
  const target = socket.state.battle || (await event(socket, 'state', state => !!state.battle)).battle;
  assert.equal(target.target.kind, 'enemy');
  const hit = await send(socket, 'battleAction', { id:target.id, turn:target.turn, action:'attack' },
    'state', state => state.battle?.turn > target.turn);
  assert.ok(hit.battle.hp < target.hp);
  await wait(130);
  const replay = await send(socket, 'battleAction', { id:target.id, turn:target.turn, action:'attack' }, 'errorMessage');
  assert.match(replay, /turno mudou/);
  assert.equal(socket.state.battle.hp, hit.battle.hp);
});

test('a pedra dá uma lâmina por herói só depois de tocar o sino da Vila', async t => {
  const storage = createStorage();
  const hero = identity('Alvorada');
  const campaign = newCampaign('BE1170', hero.id);
  campaign.data.defeated.forest = [0,1,2,3,4];
  const row = { id:hero.id, keyHash:digest(hero.key), revision:0,
    data:makeHero(hero.name,'warrior') };
  row.data.homeCampaign = campaign.id;
  const member = makeMember(campaign,hero.id,{ x:660,y:456,campaign:{ activeRegion:'forest' } });
  await storage.save({ campaign, players:[row], members:[member] });
  const f = await fixture(t, { storage });
  const socket = await f.connect();
  await enter(socket,'continue',hero);
  const hint = await send(socket,'interact',{ id:'dawn-sword' },'dialogue');
  assert.match(hint.lines[0], /sino/);
  assert.ok(!(await storage.readHero(hero.id)).data.owned.includes('dawnBlade'));
  await walk(socket,482,478);
  await interact(socket,'south-road',state=>state.zone==='village');
  await walk(socket,487,265);
  await walk(socket,690,265);
  await walk(socket,701,205);
  await interact(socket,'echo-bell',state=>state.world.opened.includes('echo-bell'));
  await walk(socket,697,265);
  await walk(socket,482,265);
  await walk(socket,480,467);
  await interact(socket,'forest-road',state=>state.zone==='forest');
  await walk(socket,636,454);
  await interact(socket,'dawn-sword',state=>state.self.owned.includes('dawnBlade'));
  await wait(190);
  await send(socket,'interact',{ id:'dawn-sword' },'dialogue');
  assert.equal((await storage.readHero(hero.id)).data.owned.filter(id=>id==='dawnBlade').length,1);
});

test('dungeons publicam pistas e reservam a resposta para o servidor', async t => {
  const f = await fixture(t);
  const payload = await (await fetch(f.url + '/campaign-data')).json();
  for (const rooms of Object.values(payload.dungeons)) {
    const puzzle = rooms.find(room => room.kind === 'puzzle');
    assert.ok(puzzle.hint);
    assert.ok(!Object.hasOwn(puzzle, 'answer'));
    assert.ok(!Object.hasOwn(puzzle, 'accept'));
  }
});

const testDb = process.env.ELDORIA_TEST_DATABASE_URL;
test('PostgreSQL migra, persiste o checkpoint e confirma apenas gravação válida', { skip:!testDb }, async t => {
  const admin = new Pool({ connectionString:testDb, ssl:false });
  const namespace = 'eldoria_test_' + randomBytes(6).toString('hex');
  await admin.query('CREATE SCHEMA ' + namespace);
  const db = new URL(testDb);
  db.searchParams.set('options', '-c search_path=' + namespace);
  const storage = createStorage({ connectionString:db.href, ssl:false });
  await storage.init();
  const sql = new Pool({ connectionString:db.href, ssl:false });
  t.after(async () => {
    await sql.end();
    await admin.query('DROP SCHEMA ' + namespace + ' CASCADE');
    await admin.end();
  });
  const hero = identity('Beto');
  const legacy = { name:'Beto', classKey:'mage', level:7, gold:225, hp:77, maxHp:115, x:480, y:400,
    campaign:{ activeRegion:'cave', world:{ forest:true }, defeatedEnemies:{ cave:[2] }, openedChests:['forest-2'] } };
  await sql.query('INSERT INTO game_characters (character_id,character_name,class_key,character_data) VALUES ($1,$2,$3,$4)',
    [hero.id, 'Beto', 'mage', legacy]);
  const f = await fixture(t, { storage });
  const first = await f.connect();
  const before = await enter(first, 'continue', hero);
  assert.equal(before.zone, 'cave');
  assert.equal(before.self.level, 7);
  assert.equal(before.self.classKey, 'mage');
  assert.ok(before.world.cleared.forest);
  assert.match(await send(first, 'saveGame', {}, 'notice'), /Progresso salvo/);
  const legacyRow = await storage.readLegacy(hero.id);
  assert.equal(legacyRow.gold, 225);

  const otherHero = identity('Anfitrião');
  const other = await f.connect();
  const second = await enter(other, 'create', otherHero);
  await send(first, 'leaveAdventure', {}, 'left');
  await wait(420);
  const visitor = await enter(first, 'join', hero, { code:second.code });
  assert.equal(visitor.self.classKey, 'mage');
  assert.equal(visitor.world.cleared.forest, false);
  assert.equal((await storage.readCampaign({ id:before.campaignId })).data.cleared.forest, true);

  await f.game.close();
  const newStorage = createStorage({ connectionString:db.href, ssl:false });
  const restart = await fixture(t, { storage:newStorage });
  const again = await restart.connect();
  const restored = await enter(again, 'continue', hero);
  assert.equal(restored.code, before.code);
  assert.equal(restored.zone, 'cave');
  assert.ok(restored.world.cleared.forest);

  await sql.query('ALTER TABLE eldoria_participations RENAME TO held_participations');
  try {
    const failure = await send(again, 'saveGame', {}, 'errorMessage');
    assert.match(failure, /não foi confirmado/);
  } finally {
    await sql.query('ALTER TABLE held_participations RENAME TO eldoria_participations');
  }
});

test('vitória, recompensa e guarda derrotado sobrevivem ao restart da campanha', { skip:!testDb }, async t => {
  const sql = new Pool({ connectionString:testDb, ssl:false });
  const namespace = 'eldoria_boss_' + randomBytes(6).toString('hex');
  await sql.query('CREATE SCHEMA ' + namespace);
  const db = new URL(testDb);
  db.searchParams.set('options', '-c search_path=' + namespace);
  t.after(async () => {
    await sql.query('DROP SCHEMA ' + namespace + ' CASCADE');
    await sql.end();
  });
  const store = createStorage({ connectionString:db.href, ssl:false });
  const hero = identity('Guerreira');
  const room = newCampaign('EC17AA', hero.id);
  room.data.defeated.forest = [0,1,2,3,4];
  const row = { id:hero.id, keyHash:digest(hero.key), revision:0,
    data:makeHero(hero.name, 'warrior', { attack:4000, defense:2000 }) };
  row.data.homeCampaign = room.id;
  const member = makeMember(room, hero.id, { x:480,y:131,campaign:{ activeRegion:'forest' } });
  await store.save({ campaign:room, players:[row], members:[member] });
  const f = await fixture(t, { storage:store });
  const socket = await f.connect();
  await enter(socket, 'continue', hero);
  await wait(1880);
  await interact(socket, 'boss-forest', state => state.battle?.boss);
  for (const action of ['attack','totem','totem','attack','attack']) {
    const battle = socket.state.battle;
    await send(socket,'battleAction',{ id:battle.id, turn:battle.turn, action },'state',
      state => !state.battle || state.battle.round > battle.round);
  }
  assert.ok(socket.state.world.cleared.forest);
  assert.equal(socket.state.battle, null);
  const gold = socket.state.self.gold;
  assert.ok(gold > 50);
  await f.game.close();
  const restart = await fixture(t, { storage:createStorage({ connectionString:db.href, ssl:false }) });
  const next = await restart.connect();
  const state = await enter(next, 'continue', hero);
  assert.equal(state.self.gold, gold);
  assert.ok(state.world.cleared.forest);
  assert.ok(World.canStand('forest', state.players[0].x, state.players[0].y));
});

test('Lume abre o atalho, Lia aceita o convite e o amuleto altera os atributos', async t => {
  const storage = createStorage();
  const hero = identity('Lia e Lume');
  const campaign = newCampaign('AF110F',hero.id);
  const row = { id:hero.id, keyHash:digest(hero.key), revision:0, data:makeHero(hero.name,'sorceress') };
  row.data.homeCampaign = campaign.id;
  row.data.apples = 2;
  const member = makeMember(campaign,hero.id,{ x:752,y:448 });
  await storage.save({ campaign, players:[row], members:[member] });
  const f = await fixture(t,{ storage });
  const socket = await f.connect();
  await enter(socket,'continue',hero);
  const orchard = await interact(socket,'lume-trail',state=>state.zone === 'orchard');
  assert.equal(orchard.world.orchardOpen, false);
  await walk(socket,480,283);
  await walk(socket,607,250);
  const before = socket.state.self.attack;
  const adopted = await interact(socket,'spirit',state=>state.self.companions.lume === 1);
  assert.equal(adopted.self.apples,1);
  assert.ok(adopted.world.orchardOpen);
  assert.ok(adopted.self.owned.includes('amberCharm'));
  const equipped = await send(socket,'inventoryAction',{ action:'equip', item:'amberCharm' },'state',state=>state.self.equipment.charm === 'amberCharm');
  assert.equal(equipped.self.attack,before+2);
  await wait(180);
  const fed = await send(socket,'inventoryAction',{ action:'feed' },'state',state=>state.self.companions.lume === 2);
  assert.equal(fed.self.apples,0);
  await walk(socket,526,225);
  const talk = await send(socket,'interact',{ id:'lia' },'dialogue');
  assert.ok(talk.options.some(option=>option.id==='recruit'));
  await send(socket,'npcAction',{ npc:'lia',action:'recruit' },'state',state=>state.self.companions.lia);
  assert.equal((await storage.readHero(hero.id)).data.companions.lia,true);
  await walk(socket,480,90);
  await interact(socket,'orchard-shortcut',state=>state.zone==='village');
});

test('Eldrin aprimora o item equipado uma vez e mantém o bônus no save', async t => {
  const storage = createStorage();
  const hero = identity('Aprendiz da forja');
  const campaign = newCampaign('F0A9E1', hero.id);
  const row = { id:hero.id, keyHash:digest(hero.key), revision:0,
    data:makeHero(hero.name,'warrior',{ level:2, gold:120 }) };
  row.data.homeCampaign = campaign.id;
  await storage.save({ campaign, players:[row], members:[makeMember(campaign,hero.id,{ x:628,y:357 })] });
  const f = await fixture(t,{ storage });
  const socket = await f.connect();
  const initial = await enter(socket,'continue',hero);
  const forge = { action:'forge', slot:'weapon', item:null, rank:1 };
  const improved = await send(socket,'inventoryAction',forge,'state',state=>state.self.weapon.endsWith('+1'));
  assert.equal(improved.self.attack, initial.self.attack + 3);
  assert.equal(improved.self.gold, initial.self.gold - 55);
  await wait(200);
  await send(socket,'inventoryAction',forge,'errorMessage');
  const saved = await storage.readHero(hero.id);
  assert.equal(saved.data.forged['starter-weapon'],1);
  assert.equal(saved.data.gold,improved.self.gold);
});

test('enigma, prêmio e pista da relíquia funcionam em salas físicas', async t => {
  const storage = createStorage();
  const hero = identity('Cronista');
  const campaign = newCampaign('D9A103',hero.id);
  campaign.data.rooms.forest = [0];
  const row = { id:hero.id,keyHash:digest(hero.key),revision:0,data:makeHero(hero.name,'warrior',{ attack:9000,defense:9000 }) };
  row.data.homeCampaign = campaign.id;
  const member = makeMember(campaign,hero.id,{ x:480,y:267 });
  member.data.zone = World.dungeonId('forest',1);
  member.data.quests.lost_relic = { step:0, completed:false };
  await storage.save({ campaign,players:[row],members:[member] });
  const f = await fixture(t,{ storage });
  const socket = await f.connect();
  await enter(socket,'continue',hero);
  assert.match(await send(socket,'puzzleAnswer',{ id:'trial',answer:'madeira' },'errorMessage'),/ainda não reagiu/);
  await wait(420);
  const opened = await send(socket,'puzzleAnswer',{ id:'trial',answer:'raízes' },'state',state=>state.world.rooms.forest.includes(1));
  assert.equal(opened.self.gold,70);
  await wait(420);
  assert.match(await send(socket,'puzzleAnswer',{ id:'trial',answer:'raízes' },'errorMessage'),/já está aberta/);
  await walk(socket,363,270);
  const clue = await interact(socket,'relic-clue',state=>state.journal.find(q=>q.id==='lost_relic').objective.includes('relicário'));
  assert.equal(clue.self.gold,70);
  await walk(socket,480,97);
  await interact(socket,'dungeon-next',state=>state.zone===World.dungeonId('forest',2));
});

test('Malakar não reaparece e a missão das lanternas abre depois da vitória', async t => {
  const storage = createStorage();
  const hero = identity('Última lanterna');
  const campaign = newCampaign('B9E2AC', hero.id, { world:{ forest:true,cave:true,fire:true,castle:true } });
  campaign.data.defeated.shadow = [0,1,2,3,4];
  const player = { id:hero.id, keyHash:digest(hero.key), revision:0,
    data:makeHero(hero.name,'mage',{ attack:7000,defense:7000 }) };
  player.data.homeCampaign = campaign.id;
  const member = makeMember(campaign,hero.id,{ x:480,y:133,campaign:{ activeRegion:'shadow' } });
  await storage.save({ campaign, players:[player], members:[member] });
  const f = await fixture(t,{ storage });
  const socket = await f.connect();
  await enter(socket,'continue',hero);
  assert.ok(!socket.state.journal.some(q=>q.id==='lanterns'));
  await wait(1880);
  await interact(socket,'boss-shadow',state=>state.battle?.boss);
  for (const action of ['attack','totem','totem','attack','attack']) {
    const battle = socket.state.battle;
    await send(socket,'battleAction',{ id:battle.id,turn:battle.turn,action },'state',
      state=>!state.battle || state.battle.round > battle.round);
  }
  assert.ok(socket.state.world.cleared.shadow);
  assert.ok(socket.state.journal.some(q=>q.id==='lanterns'));
  assert.ok(socket.state.journal.some(q=>q.id==='home_letters'));
  await walk(socket,480,135);
  const after = await interact(socket,'boss-shadow',state=>state.world.cleared.shadow);
  assert.equal(after.battle,null);
  assert.ok(World.canStand('shadow',socket.position.x,socket.position.y));
});

test('um turno inativo avança e a reconexão preserva a batalha em andamento', async t => {
  const storage = createStorage();
  const hero = identity('Guarda');
  const other = identity('Escudeiro');
  const campaign = newCampaign('B0A593',hero.id);
  const make = identity => ({ id:identity.id, keyHash:digest(identity.key), revision:0,
    data:makeHero(identity.name,'warrior',{ attack:10,defense:120 }) });
  const first = make(hero);
  const second = make(other);
  first.data.homeCampaign = campaign.id;
  await storage.save({ campaign,players:[first,second],members:[
    makeMember(campaign,hero.id,{ x:235,y:230,campaign:{ activeRegion:'forest' } }),
    makeMember(campaign,other.id,{ x:236,y:231,campaign:{ activeRegion:'forest' } })
  ] });
  const f = await fixture(t,{ storage,turnMs:600,graceMs:2000 });
  const a = await f.connect();
  const b = await f.connect();
  await enter(a,'continue',hero);
  await enter(b,'join',other,{ code:campaign.code });
  const began = await event(a,'state',state=>!!state.battle);
  assert.equal(began.battle.active,hero.id);
  const timeout = await event(a,'state',state=>state.battle?.active===other.id,2400);
  assert.equal(timeout.battle.lastAction.action,'defend');
  b.disconnect();
  const next = await f.connect();
  const returned = await enter(next,'resume',other,{ campaignId:campaign.id });
  assert.equal(returned.battle.id,began.battle.id);
  assert.equal(returned.battle.active,other.id);
  const hit = await send(next,'battleAction',{ id:returned.battle.id,turn:returned.battle.turn,action:'attack' },
    'state',state=>state.battle?.round > returned.battle.round);
  assert.equal(hit.battle.active,hero.id);
});
