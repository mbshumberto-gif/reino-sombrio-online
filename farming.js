'use strict';

// Farming belongs to the hero, rather than the campaign. Dates are server time,
// so a crop keeps growing while its owner is offline or the process restarts.
const CROPS = Object.freeze({
  melon: Object.freeze({ name: 'Melancia', seedPrice: 12, growMs: 120000, yield: 2, hp: 42, mana: 8 }),
  pumpkin: Object.freeze({ name: 'Abóbora', seedPrice: 14, growMs: 180000, yield: 2, hp: 55, mana: 12 }),
  carrot: Object.freeze({ name: 'Cenoura', seedPrice: 5, growMs: 45000, yield: 3, hp: 18, mana: 0 }),
  corn: Object.freeze({ name: 'Milho', seedPrice: 8, growMs: 75000, yield: 2, hp: 28, mana: 5 })
});
const PLOTS = Object.freeze(['garden-1', 'garden-2', 'garden-3', 'garden-4']);
const MAX_FOOD = 99;
const fail = message => Object.assign(new Error(message), { code: 'GAME_RULE' });
const own = (record, key) => typeof key === 'string' && Object.hasOwn(record, key);
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const count = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, MAX_FOOD) : 0;

function cropFor(id) {
  if (!own(CROPS, id)) throw fail('Escolha uma semente do pomar.');
  return CROPS[id];
}

function validatePlot(id) {
  if (!PLOTS.includes(id)) throw fail('Este canteiro não existe.');
}

function validateTime(now) {
  if (!Number.isSafeInteger(now) || now < 0) throw fail('Não foi possível conferir o tempo da plantação.');
}

function readPlot(hero, id) {
  const plot = record(hero.farm)[id];
  return plot && own(CROPS, plot.crop) && Number.isSafeInteger(plot.plantedAt)
    && Number.isSafeInteger(plot.readyAt) && plot.plantedAt >= 0 && plot.readyAt >= plot.plantedAt ? plot : null;
}

function publicState(hero, now = Date.now()) {
  validateTime(now);
  const food = record(hero.harvest);
  return {
    plots: PLOTS.map(id => {
      const plot = readPlot(hero, id);
      if (!plot) return { id, crop: null, plantedAt: null, readyAt: null, watered: false, ready: false, stage: 'empty' };
      const ready = now >= plot.readyAt;
      const progress = (now - plot.plantedAt) / Math.max(1, plot.readyAt - plot.plantedAt);
      return { id, crop: plot.crop, plantedAt: plot.plantedAt, readyAt: plot.readyAt,
        watered: plot.watered === true, ready, stage: ready ? 'ripe' : progress >= 0.5 ? 'growing' : 'seedling' };
    }),
    harvest: Object.fromEntries(Object.keys(CROPS).map(id => [id, count(food[id])]))
  };
}

function plant(hero, plotId, cropId, now = Date.now()) {
  validatePlot(plotId);
  validateTime(now);
  const crop = cropFor(cropId);
  if (readPlot(hero, plotId)) throw fail('Este canteiro já está plantado. Colha antes de plantar de novo.');
  if (!Number.isFinite(hero.gold) || hero.gold < crop.seedPrice) throw fail('Falta ouro para comprar estas sementes.');
  const duration = Math.ceil(crop.growMs * (hero.classKey === 'druid' ? 0.85 : 1));
  if (!Number.isSafeInteger(now + duration)) throw fail('Não foi possível conferir o tempo da plantação.');
  hero.farm = record(hero.farm);
  hero.gold -= crop.seedPrice;
  hero.farm[plotId] = { crop: cropId, plantedAt: now, readyAt: now + duration, watered: false };
  return { crop: cropId, readyAt: now + duration };
}

function water(hero, plotId, now = Date.now()) {
  validatePlot(plotId);
  validateTime(now);
  const plot = readPlot(hero, plotId);
  if (!plot) throw fail('Plante uma semente antes de regar.');
  if (now < plot.plantedAt) throw fail('A plantação ainda não pode ser regada.');
  if (now >= plot.readyAt) throw fail('Sua colheita já está pronta.');
  if (plot.watered) throw fail('Este canteiro já recebeu água.');
  const reduction = Math.floor((plot.readyAt - plot.plantedAt) * 0.25);
  plot.readyAt = Math.max(now, plot.readyAt - reduction);
  plot.watered = true;
  return { crop: plot.crop, readyAt: plot.readyAt };
}

function harvest(hero, plotId, now = Date.now()) {
  validatePlot(plotId);
  validateTime(now);
  const plot = readPlot(hero, plotId);
  if (!plot) throw fail('Este canteiro está vazio.');
  if (now < plot.readyAt) throw fail('A plantação ainda está crescendo.');
  const crop = cropFor(plot.crop);
  const food = record(hero.harvest);
  const previous = count(food[plot.crop]);
  if (previous + crop.yield > MAX_FOOD) throw fail('Sua mochila já está cheia deste alimento.');
  hero.harvest = food;
  hero.harvest[plot.crop] = previous + crop.yield;
  delete hero.farm[plotId];
  return { crop: plot.crop, count: crop.yield };
}

function eat(hero, cropId) {
  const crop = cropFor(cropId);
  const food = record(hero.harvest);
  const previous = count(food[cropId]);
  if (!previous) throw fail('Você ainda não tem este alimento na mochila.');
  if (!(hero.hp > 0)) throw fail('Descanse em um ponto seguro antes de comer.');
  const hp = Math.min(hero.maxHp, hero.hp + crop.hp);
  const mana = Math.min(hero.maxMana, hero.mana + crop.mana);
  if (hp <= hero.hp && mana <= hero.mana) throw fail('Sua vida e mana já estão recuperadas.');
  const result = { crop: cropId, hp: hp - hero.hp, mana: mana - hero.mana };
  hero.harvest = food;
  hero.harvest[cropId] = previous - 1;
  hero.hp = hp;
  hero.mana = mana;
  return result;
}

module.exports = { CROPS, PLOTS, publicState, plant, water, harvest, eat };
