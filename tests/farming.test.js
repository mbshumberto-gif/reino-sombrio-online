'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Farming = require('../farming');
const hero = (extra = {}) => ({ gold: 100, hp: 50, maxHp: 100, mana: 15, maxMana: 50, ...extra });
const rule = fn => assert.throws(fn, error => error.code === 'GAME_RULE');

test('old heroes expose empty personal plots without modifying their saved attributes', () => {
  const old = hero();
  const snapshot = structuredClone(old);
  const state = Farming.publicState(old, 1000);
  assert.deepEqual(state.harvest, { melon: 0, pumpkin: 0, carrot: 0, corn: 0 });
  assert.deepEqual(state.plots.map(plot => plot.id), Farming.PLOTS);
  assert.ok(state.plots.every(plot => plot.stage === 'empty'));
  assert.deepEqual(old, snapshot);
});

test('planting spends the seed price once and rejects planting over a growing crop', () => {
  const player = hero();
  const crop = Farming.CROPS.melon;
  Farming.plant(player, 'garden-1', 'melon', 1000);
  assert.equal(player.gold, 100 - crop.seedPrice);
  assert.equal(player.farm['garden-1'].readyAt, 1000 + crop.growMs);
  const before = structuredClone(player);
  rule(() => Farming.plant(player, 'garden-1', 'pumpkin', 2000));
  assert.deepEqual(player, before);
});

test('crops grow offline across JSON persistence and harvest cannot be replayed', () => {
  const player = hero();
  Farming.plant(player, 'garden-2', 'pumpkin', 1000);
  const restored = JSON.parse(JSON.stringify(player));
  const deadline = restored.farm['garden-2'].readyAt;
  rule(() => Farming.harvest(restored, 'garden-2', deadline - 1));
  assert.equal(Farming.publicState(restored, deadline - 1).plots[1].ready, false);
  assert.equal(Farming.publicState(restored, deadline).plots[1].stage, 'ripe');
  const receipt = Farming.harvest(restored, 'garden-2', deadline);
  assert.deepEqual(receipt, { crop: 'pumpkin', count: Farming.CROPS.pumpkin.yield });
  assert.equal(restored.harvest.pumpkin, Farming.CROPS.pumpkin.yield);
  rule(() => Farming.harvest(restored, 'garden-2', deadline));
  assert.equal(restored.harvest.pumpkin, Farming.CROPS.pumpkin.yield);
  assert.equal(Farming.publicState(restored, deadline).plots[1].stage, 'empty');
  // The save loaded at the beginning was a distinct copy, not shared memory.
  assert.equal(player.harvest, undefined);
});

test('watering advances growth once and is persisted without allowing repeated acceleration', () => {
  const player = hero();
  Farming.plant(player, 'garden-3', 'carrot', 1000);
  const initial = player.farm['garden-3'].readyAt;
  Farming.water(player, 'garden-3', 2000);
  const expected = initial - Math.floor(Farming.CROPS.carrot.growMs * 0.25);
  assert.equal(player.farm['garden-3'].readyAt, expected);
  const restored = JSON.parse(JSON.stringify(player));
  rule(() => Farming.water(restored, 'garden-3', 2001));
  assert.equal(restored.farm['garden-3'].readyAt, expected);
  Farming.harvest(restored, 'garden-3', expected);
  assert.equal(restored.harvest.carrot, 3);
});

test('druids grow crops faster and watering late never makes readiness precede server time', () => {
  const player = hero({ classKey: 'druid' });
  Farming.plant(player, 'garden-1', 'corn', 1000);
  const duration = Math.ceil(Farming.CROPS.corn.growMs * 0.85);
  assert.equal(player.farm['garden-1'].readyAt, 1000 + duration);
  const now = 1000 + duration - 1;
  Farming.water(player, 'garden-1', now);
  assert.equal(player.farm['garden-1'].readyAt, now);
  assert.equal(Farming.publicState(player, now).plots[0].ready, true);
});

test('invalid crops, plots, times and insufficient gold cannot spend or create plants', () => {
  const player = hero({ gold: 0 });
  const before = structuredClone(player);
  for (const [plot, crop, now] of [
    ['garden-1', 'melon', 1000], ['garden-5', 'carrot', 1000], ['__proto__', 'corn', 1000],
    ['garden-1', '__proto__', 1000], ['garden-1', 'toString', 1000], ['garden-1', {}, 1000],
    ['garden-1', 'carrot', NaN], ['garden-1', 'carrot', -1]
  ]) rule(() => Farming.plant(player, plot, crop, now));
  assert.deepEqual(player, before);
});

test('two heroes use independent plots and crop inventory', () => {
  const first = hero();
  const second = hero();
  Farming.plant(first, 'garden-1', 'melon', 0);
  Farming.plant(second, 'garden-1', 'carrot', 0);
  Farming.harvest(first, 'garden-1', Farming.CROPS.melon.growMs);
  assert.equal(first.harvest.melon, 2);
  assert.equal(second.harvest, undefined);
  assert.equal(second.farm['garden-1'].crop, 'carrot');
});

test('food restores bounded vitals, consumes one item and rejects waste or an empty inventory', () => {
  const player = hero({ hp: 95, mana: 48, harvest: { pumpkin: 2, carrot: 1 } });
  assert.deepEqual(Farming.eat(player, 'pumpkin'), { crop: 'pumpkin', hp: 5, mana: 2 });
  assert.equal(player.hp, 100);
  assert.equal(player.mana, 50);
  assert.equal(player.harvest.pumpkin, 1);
  rule(() => Farming.eat(player, 'pumpkin'));
  assert.equal(player.harvest.pumpkin, 1);
  player.mana = 20;
  rule(() => Farming.eat(player, 'carrot'));
  assert.equal(player.harvest.carrot, 1);
  rule(() => Farming.eat(player, 'melon'));
  player.hp = 0;
  rule(() => Farming.eat(player, 'pumpkin'));
});

test('a full food stack keeps a mature crop available for later collection', () => {
  const player = hero({ harvest: { melon: 98 } });
  Farming.plant(player, 'garden-4', 'melon', 1000);
  const deadline = player.farm['garden-4'].readyAt;
  rule(() => Farming.harvest(player, 'garden-4', deadline));
  assert.equal(player.harvest.melon, 98);
  assert.ok(player.farm['garden-4']);
  Farming.eat(player, 'melon');
  Farming.harvest(player, 'garden-4', deadline);
  assert.equal(player.harvest.melon, 99);
});
