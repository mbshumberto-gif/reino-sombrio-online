'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { HERO_CLASSES, EQUIPMENT, REGIONS, QUESTS, TECHNIQUES } = require('../game-data');

test('the RPG exposes the nine requested playable classes', () => {
  assert.equal(Object.keys(HERO_CLASSES).length, 9);
  for (const key of ['warrior','mage','sorceress','cleric','rogue','bard','paladin','ranger','monk']) {
    assert.ok(HERO_CLASSES[key], `missing class ${key}`);
    assert.ok(HERO_CLASSES[key].skill?.id);
    assert.ok(HERO_CLASSES[key].skill?.cost > 0);
    assert.ok(TECHNIQUES[key]?.cost > 0);
  }
});

test('campaign regions form a five-step progression', () => {
  assert.deepEqual(REGIONS.map(region => region.id), ['forest','cave','fire','castle','shadow']);
  for (const region of REGIONS) {
    assert.ok(region.enemies.length >= 3);
    assert.ok(region.boss.hp > 0);
  }
});

test('every campaign region has a quest and rewards', () => {
  assert.equal(QUESTS.length, REGIONS.length);
  for (const quest of QUESTS) {
    assert.ok(REGIONS.some(region => region.id === quest.region));
    assert.ok(quest.reward.xp > 0 && quest.reward.gold > 0);
  }
});

test('equipment has valid slots and prices', () => {
  for (const item of Object.values(EQUIPMENT)) {
    assert.ok(['weapon','armor','charm'].includes(item.slot));
    assert.ok(item.price >= 0);
  }
});
