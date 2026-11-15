'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HERO_CLASSES, TECHNIQUES } = require('../game-data');
const { makeHero } = require('../adventure');
const { startBattle, act, enemyTurn, skillCost } = require('../combat');

const enemy = { name:'Espinheiro corrompido', hp:1200, atk:40, gold:10, xp:20 };
const hero = (id, classKey, level = 1) => ({ id, data:makeHero(id, classKey, { skillLevel:level }) });
const encounter = entries => startBattle('forest', { region:'forest', boss:false }, enemy, entries);

test('Druida possui identidade, habilidade e técnica válidas, sem substituir classes existentes', () => {
  assert.equal(HERO_CLASSES.druid.name, 'Druida');
  assert.equal(HERO_CLASSES.druid.skill.id, 'raizes_vivas');
  assert.equal(TECHNIQUES.druid.name, 'Florescer');
  const entry = hero('Jade', 'druid');
  assert.equal(entry.data.classKey, 'druid');
  assert.equal(skillCost('druid', 'skill'), 18);
  assert.equal(skillCost('druid', 'technique'), 23);
});

test('identificadores com nomes herdados mantêm efeitos individuais sem modificar protótipos', () => {
  const originalObject = Object.getOwnPropertyDescriptors(Object.prototype);
  const originalConstructor = Object.getOwnPropertyDescriptors(Object);
  const entries = [hero('__proto__', 'druid'), hero('constructor', 'warrior')];
  const battle = encounter(entries);
  act(battle, '__proto__', 'technique', entries);
  act(battle, 'constructor', 'defend', entries);
  assert.ok(Object.hasOwn(battle.status, '__proto__'));
  assert.ok(Object.hasOwn(battle.status, 'constructor'));
  assert.notEqual(battle.status.__proto__, Object.prototype);
  assert.notEqual(battle.status.constructor, Object);
  assert.notEqual(battle.status.__proto__, battle.status.constructor);
  assert.equal(battle.status.__proto__.ward, true);
  assert.equal(battle.status.constructor.defending, true);
  assert.equal(Object.getPrototypeOf(battle.status), Object.prototype);
  enemyTurn(battle, entries);
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), originalObject);
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object), originalConstructor);
});

test('raízes consomem mana, causam mais dano quando aprimoradas e enfraquecem o contra-ataque', () => {
  const basic = hero('Jade', 'druid');
  const trained = hero('Jade', 'druid', 3);
  const battle = encounter([basic]);
  const upgraded = encounter([trained]);
  const mana = basic.data.mana;
  const outcome = act(battle, basic.id, 'skill', [basic]);
  act(upgraded, trained.id, 'skill', [trained]);
  assert.equal(outcome.error, undefined);
  assert.equal(basic.data.mana, mana - 18);
  assert.ok(battle.hp < battle.maxHp);
  assert.ok(upgraded.lastAction.damage > battle.lastAction.damage);
  assert.equal(battle.weakened, true);

  const unweakened = hero('Jade', 'druid');
  const normal = encounter([unweakened]);
  enemyTurn(battle, [basic]);
  enemyTurn(normal, [unweakened]);
  assert.ok(basic.data.hp > unweakened.data.hp);
  assert.equal(battle.weakened, false);
});

test('Florescer cura aliados em pé, cresce com habilidade e não reanima nem cura inimigos', () => {
  function cast(level) {
    const druid = hero('Jade', 'druid', level);
    const ally = hero('Beto', 'warrior');
    const fallen = hero('Lia', 'ranger');
    druid.data.hp -= 60;
    ally.data.hp -= 60;
    fallen.data.hp = 0;
    const entries = [druid, ally, fallen];
    const battle = encounter(entries);
    const hp = ally.data.hp;
    const mana = druid.data.mana;
    const result = act(battle, druid.id, 'technique', entries);
    assert.equal(result.error, undefined);
    assert.equal(druid.data.mana, mana - 23);
    assert.equal(fallen.data.hp, 0);
    assert.equal(battle.hp, battle.maxHp);
    assert.equal(battle.status[druid.id].ward, true);
    return ally.data.hp - hp;
  }
  assert.equal(cast(1), 20);
  assert.equal(cast(4), 32);
});

test('Druida regenera ao defender, respeita vida máxima e não conjura sem mana', () => {
  const druid = hero('Jade', 'druid');
  druid.data.hp -= 2;
  const battle = encounter([druid]);
  act(battle, druid.id, 'defend', [druid]);
  assert.equal(druid.data.hp, druid.data.maxHp);
  const dryBattle = encounter([druid]);
  druid.data.mana = 0;
  const hp = dryBattle.hp;
  assert.equal(act(dryBattle, druid.id, 'skill', [druid]).error, 'Mana insuficiente.');
  assert.equal(dryBattle.hp, hp);
  assert.equal(dryBattle.active, druid.id);
});

test('aprimorar Canção guerreira aumenta dano e proteção, sem acumular bônus para sempre', () => {
  function sing(level) {
    const bard = hero('Nara', 'bard', level);
    const ally = hero('Beto', 'warrior');
    const entries = [bard, ally];
    const battle = encounter(entries);
    act(battle, bard.id, 'skill', entries);
    act(battle, ally.id, 'attack', entries);
    const damage = battle.lastAction.damage;
    assert.equal(battle.status[ally.id].inspire, false);
    assert.equal(battle.status[ally.id].inspirePower, undefined);
    enemyTurn(battle, entries);
    assert.equal(battle.status[bard.id].ward, false);
    assert.equal(battle.status[bard.id].wardPower, undefined);
    return { damage, received:battle.lastAction.hits[0].damage };
  }
  const basic = sing(1);
  const trained = sing(4);
  assert.ok(trained.damage > basic.damage);
  assert.ok(trained.received < basic.received);
});

test('aprimorar Escudo de luz protege mais, com limite e compatibilidade de estado booleano', () => {
  function shield(level) {
    const paladin = hero('Sol', 'paladin', level);
    const battle = encounter([paladin]);
    act(battle, paladin.id, 'skill', [paladin]);
    assert.equal(battle.status[paladin.id].ward, true);
    assert.ok(battle.status[paladin.id].wardPower >= 0.25);
    enemyTurn(battle, [paladin]);
    assert.equal(battle.status[paladin.id].ward, false);
    return battle.lastAction.hits[0].damage;
  }
  assert.ok(shield(4) < shield(1));
  assert.ok(shield(100) > 0);
});
