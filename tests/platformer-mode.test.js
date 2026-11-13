'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const World = require('../public/world-data');
const { newCampaign, makeHero, makeMember, heroStats } = require('../adventure');
const { startBattle, act, enemyTurn } = require('../combat');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

test('a página usa o cliente top-down e oferece toque e continuação do herói', () => {
  assert.match(html, /world-data\.js\?v=/);
  assert.match(html, /pixel\.js\?v=/);
  assert.match(html, /game\.js\?v=/);
  assert.doesNotMatch(html, /rpg\.js|platformer\.js|newCharacterBtn|continuePreviousBtn/);
  for (const control of ['virtualJoystick', 'mobileActionBtn', 'attackBtn', 'continueSaveBtn', 'continueCampaignBtn']) {
    assert.match(html, new RegExp('id="' + control + '"'));
  }
});

function reachable(map) {
  const step = 16;
  const first = map.spawn.map(value => Math.round(value / step) * step);
  const todo = [first];
  const seen = new Set();
  for (let i = 0; i < todo.length; i++) {
    const [x, y] = todo[i];
    const key = x + ',' + y;
    if (seen.has(key) || !World.canStand(map.id, x, y)) continue;
    seen.add(key);
    todo.push([x + step, y], [x - step, y], [x, y + step], [x, y - step]);
  }
  return point => {
    for (let dx = -16; dx <= 16; dx += 16) for (let dy = -16; dy <= 16; dy += 16) {
      const x = Math.round(point.x / step) * step + dx;
      const y = Math.round(point.y / step) * step + dy;
      if (seen.has(x + ',' + y)) return true;
    }
    return false;
  };
}

test('todas as 31 áreas têm interações alcançáveis e portais com destino válido', () => {
  assert.equal(Object.keys(World.zones).length, 31);
  for (const map of Object.values(World.zones)) {
    const canReach = reachable(map);
    for (const point of map.points) {
      assert.ok(canReach(point), map.id + ':' + point.id);
      if (point.kind === 'portal') {
        assert.ok(Object.hasOwn(World.zones, point.to));
        assert.ok(World.canStand(point.to, ...point.spawn));
      }
    }
  }
});

test('o movimento respeita parede e o mesmo limite na diagonal', () => {
  const start = { x:480, y:430 };
  const straight = World.walk('village', start, 1, 0, 0.05);
  const diagonal = World.walk('village', start, 1, 1, 0.05);
  assert.ok(Math.abs(World.distance(start, straight) - World.distance(start, diagonal)) < 0.001);
  let position = { x:75, y:300 };
  for (let i = 0; i < 40; i++) position = World.walk('village', position, -1, 0, 0.05);
  assert.ok(position.x >= 41);
  assert.ok(World.canStand('village', position.x, position.y));
});

test('as rotinas usam posições transitáveis durante todo o ciclo', () => {
  for (const zone of ['village','orchard']) {
    for (let time = 0; time < 88000; time += 200) {
      for (const npc of World.npcPositions(zone, 100000 + time, { epoch:100000 })) {
        assert.ok(World.canStand(zone, npc.x, npc.y), npc.name + ' em ' + time);
      }
    }
  }
});

test('uma campanha anterior mantém chefes, tesouros e dados do herói', () => {
  const saved = {
    name:'Beto', classKey:'ranger', level:9, gold:170, potions:7, hp:70, maxHp:180,
    weapon:'Arco élfico', equipment:{ armor:'shadowCloak' }, x:460, y:410,
    campaign:{ activeRegion:'cave', world:{ forest:true }, defeatedEnemies:{ cave:[0,2] },
      openedChests:['forest-2'], sideQuests:{ lost_relic:{ accepted:true, completed:true } } }
  };
  const room = newCampaign('A1234F', 'hero', saved.campaign);
  const hero = makeHero('Outro', 'mage', saved);
  const member = makeMember(room, 'hero', saved);
  assert.equal(hero.name, 'Beto');
  assert.equal(hero.classKey, 'ranger');
  assert.equal(hero.level, 9);
  assert.equal(hero.gold, 170);
  assert.equal(hero.potions, 7);
  assert.equal(heroStats(hero).attack, hero.baseAttack + 2);
  assert.deepEqual(room.data.defeated.forest, [0,1,2,3,4]);
  assert.deepEqual(room.data.defeated.cave, [0,2]);
  assert.ok(room.data.opened.includes('chest-forest-2'));
  assert.ok(member.data.quests.lost_relic.completed);
  assert.equal(member.data.zone, 'cave');
});

test('o Ent exige três fases mesmo com um ataque muito forte', () => {
  const hero = { id:'guerreiro', data:makeHero('Guerreiro','warrior',{ attack:2000, defense:2000 }) };
  const entries = [hero];
  const battle = startBattle('forest', { region:'forest', boss:true },
    { name:'Ent Corrompido', hp:260, atk:22, gold:50, xp:40 }, entries);
  assert.equal(battle.move.type, 'charge');
  assert.equal(act(battle, hero.id, 'attack', entries).outcome, null);
  assert.equal(battle.phase, 2);
  assert.equal(battle.totems, 2);
  enemyTurn(battle, entries);
  assert.equal(act(battle, hero.id, 'totem', entries).outcome, null);
  assert.equal(battle.totems, 1);
  enemyTurn(battle, entries);
  assert.equal(act(battle, hero.id, 'totem', entries).outcome, null);
  enemyTurn(battle, entries);
  assert.equal(act(battle, hero.id, 'attack', entries).outcome, null);
  assert.equal(battle.phase, 3);
  enemyTurn(battle, entries);
  assert.equal(act(battle, hero.id, 'attack', entries).outcome, 'won');
});

test('o monstro tem um turno próprio e defender mitiga o golpe e recupera mana', () => {
  const hero = { id:'hero', data:makeHero('Guerreiro','warrior') };
  const ally = { id:'ally', data:makeHero('Aliado','mage') };
  const entries = [hero, ally];
  const enemy = { name:'Lobo', hp:100, atk:24, gold:10, xp:20 };
  const battle = startBattle('forest', { region:'forest', boss:false }, enemy, entries);
  const hp = hero.data.hp;
  hero.data.mana = 0;
  act(battle, hero.id, 'defend', entries);
  assert.equal(battle.active, ally.id);
  assert.equal(hero.data.mana, 9);
  act(battle, ally.id, 'attack', entries);
  assert.equal(battle.active, null);
  assert.equal(hero.data.hp, hp);
  assert.equal(battle.lastAction.side, 'party');
  enemyTurn(battle, entries);
  const guarded = battle.lastAction.hits[0];
  assert.equal(battle.lastAction.side, 'enemy');
  assert.ok(guarded.guarded && guarded.damage > 0);
  assert.equal(battle.active, hero.id);
  const unguarded = startBattle('forest', { region:'forest', boss:false }, enemy, entries);
  enemyTurn(unguarded, entries);
  assert.ok(unguarded.lastAction.hits[0].damage > guarded.damage * 2);
});
