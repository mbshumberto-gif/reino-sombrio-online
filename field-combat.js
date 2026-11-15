'use strict';

const { randomUUID } = require('node:crypto');
const { HERO_CLASSES, TECHNIQUES } = require('./game-data');
const { heroStats } = require('./adventure');
const World = require('./public/world-data');

const RANGED = new Set(['mage', 'sorceress', 'ranger', 'druid', 'bard']);
const COOLDOWNS = { attack:650, skill:1800, technique:2400, defend:1400, potion:1200, apple:1200, companion:1800, totem:700, flee:1000 };
const PATTERNS = {
  forest:['Raízes à espreita', 'Círculo de seiva', 'Tempestade das copas'],
  cave:['Pedras instáveis', 'Cristais da prisão', 'Ruptura sísmica'],
  fire:['Solo em brasa', 'Pilares da forja', 'Chuva de brasas'],
  castle:['Marca do general', 'Estandartes da guarda', 'Última ordem'],
  shadow:['Correntes da memória', 'Selos do eclipse', 'Raios do esquecimento']
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const at = entry => entry.member.data;
function keyed(record, id) {
  if (!Object.hasOwn(record, id)) Object.defineProperty(record, id, { value:{}, writable:true, configurable:true, enumerable:true });
  return record[id];
}
const effects = (battle, id) => keyed(battle.status, id);
const restore = (hero, hp, mana = 0) => {
  hero.hp = Math.min(hero.maxHp, hero.hp + hp);
  hero.mana = Math.min(hero.maxMana, hero.mana + mana);
};
const groupFor = (battle, entries) => entries.filter(entry => battle.heroes.includes(entry.id) && at(entry).zone === battle.zone);
const connected = entries => entries.filter(entry => entry.socketId && entry.data.hp > 0);

function start(zone, target, enemy, entries, position, now = Date.now()) {
  const point = World.safePosition(zone, position.x, position.y);
  const heroes = connected(entries).filter(entry => at(entry).zone === zone && distance(at(entry), point) <= 360);
  if (!heroes.length) throw new Error('Nenhum aventureiro próximo para o encontro.');
  const hp = Math.max(10, Math.ceil(enemy.hp * (1 + (heroes.length - 1) * 0.52)));
  return {
    mode:'field', id:randomUUID(), zone, target:{ ...target }, heroes:heroes.map(entry => entry.id),
    name:enemy.name, position:point, hp, maxHp:hp, attack:Math.max(1, enemy.atk),
    armor:Math.floor(enemy.atk * (target.boss ? 0.20 : 0.08)), boss:!!target.boss,
    phase:1, round:1, rewards:{ gold:enemy.gold || 0, xp:enemy.xp || 0 },
    totems:[], telegraphs:[], cooldowns:{}, status:{}, supportUsed:false,
    nextAttack:now + 850, nextSeedPulse:now + 3000, lastTick:now, lastRegen:now, pausedAt:null, lastAction:null, ended:null
  };
}

function totemPosition(battle, side) {
  const { x, y } = battle.position;
  for (const [dx, dy] of [[side * 76, 56], [side * 90, 0], [side * 60, -56], [side * 32, 85]]) {
    if (World.canStand(battle.zone, x + dx, y + dy)) return { x:x + dx, y:y + dy };
  }
  return World.safePosition(battle.zone, x, y);
}

function phaseAfterDamage(battle, now) {
  if (!battle.boss || !battle.hp) return;
  if (battle.phase === 1 && battle.hp <= Math.floor(battle.maxHp * 0.68)) {
    battle.phase = 2;
    battle.totems = [-1, 1].map((side, index) => ({ id:'totem-' + index, ...totemPosition(battle, side), hp:2 }));
    battle.nextSeedPulse = now + 3000;
  } else if (battle.phase === 2 && !battle.totems.length && battle.hp <= Math.floor(battle.maxHp * 0.32)) {
    battle.phase = 3;
  } else return;
  battle.telegraphs = [];
  battle.nextAttack = now + 500;
  return 'Fase ' + battle.phase + ' · ' + (PATTERNS[battle.target.region] || PATTERNS.forest)[battle.phase - 1];
}

function harm(battle, amount, now, pierce = 0) {
  const prior = battle.hp;
  const shield = battle.totems.length ? 0.25 : 1;
  const floor = battle.boss && battle.phase < 3
    ? Math.floor(battle.maxHp * (battle.phase === 1 ? 0.68 : 0.32)) + (battle.totems.length ? 1 : 0) : 0;
  const damage = Math.max(1, Math.floor((amount - battle.armor * (1 - pierce)) * shield * (battle.markedUntil > now ? 1.25 : 1)));
  battle.hp = Math.max(Math.min(prior, floor), prior - damage);
  battle.markedUntil = 0;
  return prior - battle.hp;
}

function strike(battle, entry, power, now, pierce = 0) {
  const status = effects(battle, entry.id);
  const inspire = status.inspireUntil > now ? status.inspirePower || 1.25 : 1;
  const crit = entry.data.classKey === 'rogue' && Math.random() < 0.27 ? 1.6 : 1;
  status.inspireUntil = 0;
  return harm(battle, (heroStats(entry.data).attack * power + 2) * inspire * crit, now, pierce);
}

function ward(battle, entries, now, power = 0.55) {
  for (const entry of entries) {
    const status = effects(battle, entry.id);
    status.wardPower = status.wardUntil > now ? Math.min(status.wardPower || 1, power) : power;
    status.wardUntil = now + 5000;
  }
}

function spendCost(hero, action) {
  const amount = action === 'skill' ? HERO_CLASSES[hero.classKey].skill.cost : TECHNIQUES[hero.classKey].cost;
  return hero.classKey === 'sorceress' ? Math.ceil(amount * 0.8) : amount;
}

function nearestTotem(battle, entry, target) {
  return battle.totems.filter(totem => !target || target === totem.id)
    .sort((a, b) => distance(at(entry), a) - distance(at(entry), b))[0];
}

function breakTotem(battle, entry, target, damage = 1) {
  const totem = nearestTotem(battle, entry, target);
  if (!totem || distance(at(entry), totem) > 90) return false;
  totem.hp -= damage;
  battle.totems = battle.totems.filter(candidate => candidate.hp > 0);
  return true;
}

function act(battle, entry, payload, entries, now = Date.now()) {
  const action = typeof payload === 'string' ? payload : payload?.action;
  if (battle.ended) return { error:'O encontro já terminou.' };
  if (!entry.socketId || !entry.data.hp || !battle.heroes.includes(entry.id) || at(entry).zone !== battle.zone) {
    return { error:'Você precisa estar no encontro e em pé para agir.' };
  }
  if (!Object.hasOwn(COOLDOWNS, action)) return { error:'Ação inválida.' };
  const cooldowns = keyed(battle.cooldowns, entry.id);
  if ((cooldowns.global || 0) > now || (cooldowns[action] || 0) > now) return { error:'Aguarde a recuperação da ação.' };
  const hero = entry.data;
  const allies = connected(groupFor(battle, entries));
  const status = effects(battle, entry.id);
  const range = RANGED.has(hero.classKey) ? 210 : 90;
  const supportSkill = action === 'skill' && ['cleric', 'bard', 'paladin'].includes(hero.classKey);
  const supportTechnique = action === 'technique' && ['warrior', 'cleric', 'druid'].includes(hero.classKey);
  if ((action === 'attack' || action === 'skill' && !supportSkill || action === 'technique' && !supportTechnique) && distance(at(entry), battle.position) > range) {
    return { error:'Aproxime-se da criatura para atacar.' };
  }
  if (action === 'skill' || action === 'technique') {
    const cost = spendCost(hero, action);
    if (hero.mana < cost) return { error:'Mana insuficiente.' };
  }
  const before = battle.hp;
  let text;
  if (action === 'attack') {
    strike(battle, entry, hero.classKey === 'ranger' ? 1.15 : 1, now);
    if (hero.classKey === 'monk') restore(hero, 4);
    text = hero.name + ' atacou.';
  } else if (action === 'defend') {
    status.defendUntil = now + 2200;
    restore(hero, hero.classKey === 'druid' ? 3 : 0, 6);
    text = 'Guarda preparada por 2 segundos.';
  } else if (action === 'potion' || action === 'apple') {
    const key = action === 'potion' ? 'potions' : 'apples';
    if (!hero[key] || hero.hp >= hero.maxHp) return { error:'Você precisa do item e de vida para recuperar.' };
    hero[key]--;
    restore(hero, action === 'apple' ? 19 + (hero.companions?.lume || 0) * 3 : hero.classKey === 'cleric' ? 49 : 37);
    text = 'Vida restaurada.';
  } else if (action === 'skill') {
    hero.mana -= spendCost(hero, action);
    const level = Math.max(1, hero.skillLevel || 1);
    const power = HERO_CLASSES[hero.classKey].skill.power * (1 + (level - 1) * 0.18);
    if (hero.classKey === 'cleric') allies.forEach(ally => restore(ally.data, Math.floor(power)));
    else if (hero.classKey === 'bard') {
      ward(battle, allies, now, Math.max(0.3, 0.55 - (level - 1) * 0.02));
      allies.forEach(ally => Object.assign(effects(battle, ally.id), { inspireUntil:now + 6000, inspirePower:Math.min(2, 1.25 + (level - 1) * 0.08) }));
    } else if (hero.classKey === 'paladin') ward(battle, allies, now, Math.max(0.25, 0.55 - (level - 1) * 0.04));
    else {
      strike(battle, entry, power * (hero.classKey === 'mage' ? 1.2 : 1), now, hero.classKey === 'monk' ? 0.65 : 0);
      if (['druid', 'sorceress'].includes(hero.classKey)) battle.weakenedUntil = now + 5000;
      if (hero.classKey === 'monk') restore(hero, 8);
    }
    text = HERO_CLASSES[hero.classKey].skill.name + '!';
  } else if (action === 'technique') {
    hero.mana -= spendCost(hero, action);
    switch (hero.classKey) {
      case 'warrior':
        status.defendUntil = status.counterUntil = now + 3500;
        ward(battle, allies.filter(ally => distance(at(ally), at(entry)) <= 125), now);
        break;
      case 'cleric': {
        const fallen = groupFor(battle, entries).find(ally => ally.socketId && !ally.data.hp && distance(at(ally), at(entry)) <= 180);
        if (fallen) restore(fallen.data, Math.ceil(fallen.data.maxHp * 0.3));
        else ward(battle, allies, now);
        break;
      }
      case 'druid':
        allies.forEach(ally => restore(ally.data, 20 + 4 * (Math.max(1, hero.skillLevel || 1) - 1)));
        ward(battle, [entry], now);
        break;
      case 'rogue':
        status.evadeUntil = now + 2000;
        breakTotem(battle, entry, payload?.target, 2);
        strike(battle, entry, 1.15, now);
        break;
      case 'ranger':
        breakTotem(battle, entry, payload?.target, 2);
        strike(battle, entry, 1.25, now);
        battle.markedUntil = now + 5000;
        break;
      case 'bard':
        allies.forEach(ally => restore(ally.data, 0, 10));
        ward(battle, allies, now);
        strike(battle, entry, 1.24, now);
        break;
      case 'paladin':
        ward(battle, allies, now);
        strike(battle, entry, 1.12, now);
        break;
      default:
        battle.telegraphs = [];
        battle.nextAttack = now + 1200;
        strike(battle, entry, 1.3, now, hero.classKey === 'monk' ? 0.65 : 0);
        if (hero.classKey === 'sorceress') battle.weakenedUntil = now + 5000;
        if (hero.classKey === 'monk') restore(hero, 13);
    }
    text = TECHNIQUES[hero.classKey].name + '!';
  } else if (action === 'totem') {
    if (!breakTotem(battle, entry, payload?.target)) return { error:'Aproxime-se de um totem para quebrá-lo.' };
    text = battle.totems.length ? 'O totem rachou.' : 'As raízes da prisão se partiram!';
  } else if (action === 'companion') {
    if (!hero.companions?.lia || battle.supportUsed) return { error:'Lia já ajudou ou ainda não acompanha o grupo.' };
    battle.supportUsed = true;
    allies.forEach(ally => restore(ally.data, 25, 9));
    text = 'Lia socorreu o grupo.';
  } else if (action === 'flee') {
    if (battle.boss) return { error:'O guardião bloqueia a passagem.' };
    battle.ended = 'fled';
    text = 'O grupo recuou.';
  }
  cooldowns.global = now + 280;
  cooldowns[action] = now + COOLDOWNS[action];
  const phase = phaseAfterDamage(battle, now);
  if (battle.hp <= 0) battle.ended = 'won';
  battle.lastAction = { side:'party', heroId:entry.id, action, at:now, damage:before - battle.hp, text:phase ? text + ' · ' + phase : text };
  return { outcome:battle.ended, changed:true, text:battle.lastAction.text };
}

function announce(battle, online, now) {
  const region = battle.target.region;
  const marked = online[(battle.round - 1) % online.length];
  const volley = battle.round;
  const mark = (point, index, type, radius, extra = {}) => ({ id:volley + '-' + index, x:point.x, y:point.y,
    radius, type, resolvesAt:now + (type === 'lightning' ? 1450 : 1650), ...extra });
  // Fixed circles along the announced direction let players step sideways before impact.
  if (battle.boss && (region === 'castle' || region === 'cave' && battle.phase === 3)) {
    const origin = battle.position;
    const aim = at(marked);
    const length = Math.max(1, distance(origin, aim));
    const reach = Math.min(450, Math.max(180, length + 65));
    const points = [];
    for (let step = 0; step <= reach; step += 42) {
      const point = { x:origin.x + (aim.x - origin.x) / length * step, y:origin.y + (aim.y - origin.y) / length * step };
      if (World.canStand(battle.zone, point.x, point.y)) points.push(point);
    }
    return points.map((point, index) => mark(point, index, region === 'castle' ? 'command' : 'fissure', region === 'castle' ? 32 : 39));
  }
  if (battle.boss && region === 'fire') {
    const targets = battle.phase === 3 ? online : [marked];
    return targets.map((entry, index) => mark(at(entry), index, 'ember', 58, { pulses:2 }));
  }
  const storm = !battle.boss && battle.zone === 'boat';
  const targets = battle.boss && battle.phase === 3 ? online : [marked];
  const type = storm || battle.boss && battle.phase === 3 ? 'lightning' : battle.boss ? battle.phase === 2 ? 'spore' : 'root' : 'strike';
  return targets.map((entry, index) => mark(at(entry), index, type, type === 'lightning' ? 49 : type === 'root' ? 61 : 52));
}

function tick(battle, entries, now = Date.now()) {
  if (battle.ended) return { outcome:battle.ended, changed:false };
  const group = groupFor(battle, entries);
  const living = group.filter(entry => entry.data.hp > 0);
  if (!living.length) {
    battle.ended = 'lost';
    return { outcome:'lost', changed:true, text:'O grupo recuou até um lugar seguro.' };
  }
  const online = connected(living);
  if (!online.length) {
    battle.pausedAt ??= now;
    return { outcome:null, changed:false };
  }
  if (battle.pausedAt !== null) {
    const delay = Math.max(0, now - battle.pausedAt);
    battle.telegraphs.forEach(mark => { mark.resolvesAt += delay; });
    battle.nextAttack += delay;
    battle.nextSeedPulse += delay;
    battle.lastRegen += delay;
    battle.pausedAt = null;
  }
  battle.lastTick = now;
  let changed = false;
  const hits = [];
  const hitIds = new Set();
  for (const mark of battle.telegraphs.filter(mark => mark.resolvesAt <= now)) {
    for (const entry of online) {
      // Overlapping circles in the same volley cannot multiply damage on a crowded party.
      if (hitIds.has(entry.id) || distance(at(entry), mark) > mark.radius) continue;
      hitIds.add(entry.id);
      const status = effects(battle, entry.id);
      const guard = Math.min(status.defendUntil >= now ? 0.35 : 1, status.wardUntil >= now ? status.wardPower || 0.55 : 1);
      const passive = entry.data.classKey === 'warrior' ? 0.85 : entry.data.classKey === 'paladin' && battle.boss ? 0.8 : 1;
      const strength = mark.type === 'lightning' ? 1.45 : mark.type === 'root' ? 1.1 : 1;
      const damage = status.evadeUntil >= now ? 0 : Math.max(1, Math.floor((battle.attack * strength - heroStats(entry.data).defense * 0.55) * guard * passive * (battle.weakenedUntil >= now ? 0.7 : 1)));
      const before = entry.data.hp;
      entry.data.hp = Math.max(0, before - damage);
      if (damage && battle.boss && battle.target.region === 'shadow' && mark.type === 'lightning') {
        entry.data.mana = Math.max(0, entry.data.mana - 6);
      }
      if (status.counterUntil >= now && entry.data.hp > 0) harm(battle, heroStats(entry.data).attack * 0.5, now);
      hits.push({ id:entry.id, damage:before - entry.data.hp, guarded:guard < 1 });
    }
    if (mark.pulses > 1) {
      mark.pulses--;
      mark.resolvesAt = now + 1500;
    }
    changed = true;
  }
  battle.telegraphs = battle.telegraphs.filter(mark => mark.resolvesAt > now);
  if (changed) {
    battle.lastAction = { side:'enemy', action:'hazard', at:now, hits, text:hits.length ? 'Saia dos círculos antes do impacto!' : 'O golpe atingiu o chão vazio.' };
    phaseAfterDamage(battle, now);
    if (battle.hp <= 0) battle.ended = 'won';
    else if (!group.some(entry => entry.data.hp > 0)) battle.ended = 'lost';
  }
  if (!battle.ended && now >= battle.nextAttack && !battle.telegraphs.length) {
    battle.telegraphs = announce(battle, online, now);
    battle.nextAttack = now + (battle.phase === 3 ? 2600 : 3300);
    battle.round++;
    battle.pattern = battle.boss ? (PATTERNS[battle.target.region] || PATTERNS.forest)[battle.phase - 1] : battle.telegraphs[0]?.type === 'lightning' ? 'Raio no convés · saia da marca' : 'Golpe anunciado';
    changed = true;
  }
  if (!battle.ended && battle.boss && battle.target.region === 'forest' && battle.phase === 2 && battle.totems.length && now >= battle.nextSeedPulse) {
    const before = battle.hp;
    battle.hp = Math.min(Math.floor(battle.maxHp * 0.68), battle.hp + Math.ceil(battle.maxHp * 0.025 * battle.totems.length));
    battle.nextSeedPulse = now + 3000;
    if (battle.hp > before) {
      battle.lastAction = { side:'enemy', action:'seed', at:now, text:'Os totens alimentaram o Ent. Quebre-os para cortar a seiva!' };
      changed = true;
    }
  }
  if (now - battle.lastRegen >= 3000) {
    online.forEach(entry => restore(entry.data, 0, 2));
    battle.lastRegen = now;
    changed = true;
  }
  return { outcome:battle.ended, changed, text:battle.lastAction?.text };
}

function remove(battle, id) {
  battle.heroes = battle.heroes.filter(heroId => heroId !== id);
  delete battle.status[id];
  delete battle.cooldowns[id];
}

function publicState(battle) {
  const { lastTick, lastRegen, pausedAt, nextAttack, nextSeedPulse, ...state } = battle;
  return structuredClone(state);
}

module.exports = { start, act, tick, remove, publicState };
