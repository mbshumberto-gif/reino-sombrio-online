'use strict';

const { randomUUID } = require('node:crypto');
const { HERO_CLASSES, TECHNIQUES } = require('./game-data');
const { heroStats } = require('./adventure');

const BOSSES = {
  forest: ['Investida das raízes', 'Totens de seiva', 'Coração da árvore'],
  cave: ['Martelo de pedra', 'Cristais ressonantes', 'Eco sísmico'],
  fire: ['Mordida de brasa', 'Brasas em órbita', 'Fôlego vulcânico'],
  castle: ['Desafio do general', 'Estandartes da guarda', 'Última ordem'],
  shadow: ['Correntes do vazio', 'Selos de memória', 'Eclipse de Eldoria']
};

function startBattle(zone, target, enemy, heroes) {
  const regionalRank = Object.keys(BOSSES).indexOf(target.region);
  const introductory = regionalRank === 0;
  const hp = Math.ceil(enemy.hp * (target.boss ? (introductory ? 0.90 : 1.1) : 1) * (1 + (heroes.length - 1) * 0.62));
  const ordered = heroes.map(({ id }) => id);
  return {
    id: randomUUID(), zone, target, name: enemy.name, hp, maxHp: hp,
    attack: Math.ceil(enemy.atk * (target.boss ? (introductory ? 1.02 : 1.12) : (introductory ? 0.95 : 1.05)) * (1 + (heroes.length - 1) * 0.08)),
    armor: target.boss ? Math.floor(enemy.atk * 0.3) : Math.floor(enemy.atk * 0.12),
    rewards: { gold: enemy.gold, xp: enemy.xp }, heroes: ordered, order: ordered.slice(), status: {},
    boss: target.boss, phase: 1, totems: 0, round: 1, turn: 1, active: ordered[0],
    move: announceMove({ target, boss:target.boss, round:1, phase:1 }, heroes),
    lastAction: null, supportUsed: false, expires: Date.now() + 30000
  };
}

function effects(battle, id) {
  return battle.status[id] ||= {};
}

function nextPhase(battle) {
  if (!battle.boss || !battle.hp) return;
  const ratio = battle.hp / battle.maxHp;
  const next = ratio <= 0.32 ? 3 : ratio <= 0.68 ? 2 : 1;
  if (next <= battle.phase) return;
  battle.phase = next;
  const name = BOSSES[battle.target.region][next - 1];
  battle.totems = next === 2 ? 2 : 0;
  return 'Fase ' + next + ' · ' + name + '!';
}

function harm(battle, value, pierce = 0) {
  const shield = battle.totems ? 0.35 : 1;
  const mark = battle.marked ? 1.28 : 1;
  const amount = Math.max(1, Math.floor((value - battle.armor * (1 - pierce)) * shield * mark));
  const floor = battle.boss && battle.phase < 3
    ? Math.floor(battle.maxHp * (battle.phase === 1 ? 0.68 : 0.32)) + (battle.totems ? 1 : 0) : 0;
  const prior = battle.hp;
  battle.hp = Math.max(Math.min(prior, floor), prior - amount);
  battle.marked = false;
  return prior - battle.hp;
}

function restore(hero, hp, mp = 0) {
  hero.hp = Math.min(hero.maxHp, hero.hp + hp);
  hero.mana = Math.min(hero.maxMana, hero.mana + mp);
}

function announceMove(battle, alive) {
  const target = alive[(battle.round - 1) % alive.length].id;
  const moves = BOSSES[battle.target.region];
  if (battle.boss && battle.phase === 3 && battle.round % 2 === 0) {
    return { type: 'area', name: moves[2], target };
  }
  if (battle.boss && battle.phase === 2 && battle.totems) return { type: 'shield', name: moves[1], target };
  if (battle.round % (battle.boss ? 2 : 3) === 1) return { type: 'charge', name: battle.boss ? moves[0] : 'Investida feroz', target };
  const names = { forest:'Garras da floresta', cave:'Estilhaço de cristal', fire:'Rajada de brasas',
    castle:'Golpe espectral', shadow:'Pulso do vazio' };
  return { type: 'hit', name: names[battle.target.region], target };
}

function enemyTurn(battle, entries) {
  const alive = entries.filter(entry => entry.data.hp > 0);
  if (!alive.length) return { outcome:'lost' };
  const move = battle.move || announceMove(battle, alive);
  const guard = alive.find(({ id }) => effects(battle, id).guard);
  const target = guard || alive.find(entry => entry.id === move.target) || alive[0];
  const targets = move.type === 'area' ? alive : [target];
  const hits = [];
  const enemyHp = battle.hp;
  for (const entry of targets) {
    const hero = entry.data;
    const status = effects(battle, entry.id);
    const defense = heroStats(hero).defense;
    const strength = move.type === 'charge' ? 1.85 : move.type === 'area' ? 1.46 : move.type === 'shield' ? 0.9 : 1;
    const interrupted = battle.interrupted && ['charge', 'area'].includes(move.type) ? 0.45 : 1;
    const guardPower = status.defending ? 0.4 : status.ward ? 0.55 : 1;
    const passive = hero.classKey === 'warrior' ? 0.85 : hero.classKey === 'paladin' && battle.boss ? 0.8 : 1;
    const damage = status.evade ? 0 : Math.max(1, Math.floor((battle.attack * strength - defense * 0.67) * guardPower *
      passive * interrupted * (battle.weakened ? 0.76 : 1)));
    const before = hero.hp;
    hero.hp = Math.max(0, before - damage);
    if (battle.boss && move.type === 'area' && !battle.interrupted && damage > 0) {
      if (battle.target.region === 'cave') hero.mana = Math.max(0, hero.mana - 9);
      if (battle.target.region === 'fire' && !status.defending) hero.hp = Math.max(0, hero.hp - 7);
      if (battle.target.region === 'shadow' && battle.hp) battle.hp = Math.min(Math.ceil(battle.maxHp * 0.32), battle.hp + Math.ceil(damage * 0.3));
    }
    if (status.guard && status.counter && hero.hp > 0) harm(battle, heroStats(hero).attack * 0.5);
    hits.push({ id:entry.id, damage:before - hero.hp, guarded:!!(status.defending || status.ward) });
  }
  for (const { id, data } of alive) {
    if (data.hp > 0) restore(data, 0, 3);
    const status = effects(battle, id);
    status.defending = status.ward = status.guard = status.counter = status.evade = false;
  }
  battle.interrupted = battle.weakened = false;
  const phase = nextPhase(battle);
  const survivors = entries.filter(entry => entry.data.hp > 0);
  battle.order = survivors.map(entry => entry.id);
  battle.active = battle.order[0] || null;
  battle.round++;
  battle.move = survivors.length ? announceMove(battle, survivors) : null;
  battle.turn++;
  const text = move.name + ' · ' + hits.map(hit => {
    const name = entries.find(entry => entry.id === hit.id).data.name;
    return name + (hit.damage ? ' −' + hit.damage + ' PV' : ' esquivou') + (hit.guarded ? ' (bloqueio)' : '');
  }).join(', ');
  battle.lastAction = { side:'enemy', action:move.type, hits, damage:Math.max(0, enemyHp - battle.hp),
    text: phase ? text + ' · ' + phase : text };
  return { outcome:battle.hp <= 0 ? 'won' : survivors.length ? null : 'lost', text };
}

function powerAttack(hero, battle, multiplier, pierce = 0) {
  const status = effects(battle, battle.active);
  const crit = hero.classKey === 'rogue' && Math.random() < 0.27 ? 1.6 : 1;
  const inspire = status.inspire ? 1.25 : 1;
  status.inspire = false;
  return harm(battle, (heroStats(hero).attack * multiplier + 2) * crit * inspire, pierce);
}

function castPrimary(battle, entry, alive) {
  const hero = entry.data;
  const power = HERO_CLASSES[hero.classKey].skill.power * (1 + (hero.skillLevel - 1) * 0.18);
  switch (hero.classKey) {
    case 'cleric':
      alive.forEach(ally => restore(ally.data, Math.floor(power)));
      break;
    case 'bard':
      alive.forEach(ally => { effects(battle, ally.id).inspire = effects(battle, ally.id).ward = true; });
      break;
    case 'paladin':
      alive.forEach(ally => { effects(battle, ally.id).ward = true; });
      break;
    default:
      powerAttack(hero, battle, power * (hero.classKey === 'mage' ? 1.2 : 1), hero.classKey === 'monk' ? 0.65 : 0);
      if (hero.classKey === 'sorceress') battle.weakened = true;
      if (hero.classKey === 'monk') restore(hero, 8);
  }
}

function castTechnique(battle, entry, entries) {
  const hero = entry.data;
  const active = effects(battle, entry.id);
  switch (hero.classKey) {
    case 'warrior':
      active.guard = active.defending = active.counter = true;
      break;
    case 'mage':
      battle.interrupted = true;
      powerAttack(hero, battle, 1.3);
      break;
    case 'sorceress':
      battle.interrupted = battle.weakened = true;
      powerAttack(hero, battle, 1.0);
      break;
    case 'cleric': {
      const fallen = entries.find(ally => !ally.data.hp);
      if (fallen) restore(fallen.data, Math.ceil(fallen.data.maxHp * 0.3));
      else {
        entries.forEach(ally => { effects(battle, ally.id).ward = true; });
        powerAttack(hero, battle, 0.95);
      }
      break;
    }
    case 'rogue':
      active.evade = true;
      battle.totems = Math.max(0, battle.totems - 1);
      powerAttack(hero, battle, 1.15);
      break;
    case 'bard':
      entries.filter(ally => ally.data.hp).forEach(ally => restore(ally.data, 0, 13));
      if (battle.move?.target) effects(battle, battle.move.target).ward = true;
      powerAttack(hero, battle, 1.24);
      break;
    case 'paladin':
      active.guard = true;
      entries.forEach(ally => { effects(battle, ally.id).ward = true; });
      powerAttack(hero, battle, 1.12);
      break;
    case 'ranger':
      battle.totems = Math.max(0, battle.totems - 1);
      powerAttack(hero, battle, 1.25);
      battle.marked = true;
      break;
    case 'monk':
      battle.interrupted = true;
      powerAttack(hero, battle, 1.3, 0.65);
      restore(hero, 13);
      break;
  }
}

function skillCost(classKey, action) {
  const cost = action === 'skill' ? HERO_CLASSES[classKey].skill.cost : TECHNIQUES[classKey].cost;
  return classKey === 'sorceress' ? Math.ceil(cost * 0.8) : cost;
}

function act(battle, id, action, entries) {
  const entry = entries.find(candidate => candidate.id === id);
  if (!entry?.data.hp || battle.active !== id) return { error: 'Aguarde a sua vez.' };
  const hero = entry.data;
  const alive = entries.filter(ally => ally.data.hp > 0);
  const status = effects(battle, id);
  const before = battle.hp;
  let text;
  if (action === 'attack') {
    text = 'Ataque · ' + powerAttack(hero, battle, hero.classKey === 'ranger' ? 1.15 : 1) + ' de dano.';
    if (hero.classKey === 'monk') restore(hero, 4);
  } else if (action === 'defend') {
    status.defending = true;
    const mana = hero.mana;
    restore(hero, 0, 9);
    text = 'Defesa preparada · −60% de dano recebido · +' + (hero.mana - mana) + ' MP.';
  } else if (action === 'potion' || action === 'apple') {
    const supply = action === 'potion' ? 'potions' : 'apples';
    if (!hero[supply] || hero.hp === hero.maxHp) return { error: 'Você precisa do item e de vida para recuperar.' };
    hero[supply]--;
    const hp = hero.hp;
    restore(hero, action === 'apple' ? 19 + hero.companions.lume * 3 : hero.classKey === 'cleric' ? 49 : 37);
    text = 'Recuperou ' + (hero.hp - hp) + ' PV.';
  } else if (action === 'skill' || action === 'technique') {
    const cost = skillCost(hero.classKey, action);
    if (hero.mana < cost) return { error: 'Mana insuficiente.' };
    hero.mana -= cost;
    if (action === 'skill') castPrimary(battle, entry, alive);
    else castTechnique(battle, entry, entries);
    text = (action === 'skill' ? HERO_CLASSES[hero.classKey].skill.name : TECHNIQUES[hero.classKey].name) + '!';
  } else if (action === 'totem') {
    if (!battle.totems) return { error: 'As proteções já foram destruídas.' };
    battle.totems--;
    text = battle.totems ? 'Uma proteção se partiu.' : 'O núcleo está exposto!';
  } else if (action === 'companion') {
    if (battle.supportUsed || !hero.companions.lia) return { error: 'Lia já ajudou nesta batalha ou ainda está no pomar.' };
    battle.supportUsed = true;
    alive.forEach(ally => restore(ally.data, 25, 9));
    if (battle.totems) battle.totems--;
    text = 'Lia abriu caminho e reanimou a equipe com um assobio.';
  } else if (action === 'flee') {
    if (battle.boss) return { error: 'O guardião bloqueou a passagem.' };
    return { outcome: 'fled', text: 'O grupo recuou até um lugar seguro.' };
  } else return { error: 'Ação inválida.' };
  const phase = nextPhase(battle);
  const index = battle.order.indexOf(id);
  const next = battle.order.slice(index + 1).find(heroId => entries.some(ally => ally.id === heroId && ally.data.hp > 0));
  battle.active = battle.hp > 0 ? next || null : null;
  battle.turn++;
  battle.expires = Date.now() + 30000;
  const damage = before - battle.hp;
  if (damage && (action === 'skill' || action === 'technique')) text += ' −' + damage + ' PV.';
  battle.lastAction = { side:'party', heroId:id, action, damage, text:phase ? text + ' · ' + phase : text };
  return { outcome:battle.hp <= 0 ? 'won' : null, text };
}

function skip(battle, id, group) {
  const next = battle.order.slice(battle.order.indexOf(id) + 1)
    .find(heroId => group.some(ally => ally.id === heroId && ally.data.hp > 0));
  battle.active = next || null;
  battle.turn++;
}

module.exports = { startBattle, act, enemyTurn, skillCost, skip };
