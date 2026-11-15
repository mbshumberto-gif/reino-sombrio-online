'use strict';

const fail = message => Object.assign(new Error(message), { code:'GAME_RULE' });
const count = (value, fallback = 0) => Number.isSafeInteger(value) && value >= 0 ? value : fallback;

function ensure(hero) {
  hero.companions ||= { lume:0, lia:false };
  const previous = hero.companions.liaEcho || {};
  const echo = hero.companions.liaEcho = {
    generation:Math.max(1, count(previous.generation, 1)),
    fallen:count(previous.fallen), needsRescue:previous.needsRescue === true
  };
  if (echo.needsRescue) hero.companions.lia = false;
  return echo;
}

function recruit(hero) {
  const echo = ensure(hero);
  if (!hero.companions.lume) throw fail('Liberte Lume antes de pedir um clone a Lia.');
  if (echo.needsRescue) throw fail('O clone caiu. Resgate um novo clone no Broto de Lia, ao sul do Pomar.');
  if (hero.companions.lia) throw fail('Um clone de Lia já acompanha você.');
  hero.companions.lia = true;
  return echo;
}

function rescue(hero) {
  const echo = ensure(hero);
  if (!hero.companions.lume) throw fail('Liberte Lume para despertar o Broto de Lia.');
  if (!echo.needsRescue || hero.companions.lia) throw fail('Você não tem um clone de Lia para resgatar agora.');
  echo.generation++;
  echo.needsRescue = false;
  hero.companions.lia = true;
  return echo;
}

// Falls stay with the encounter until the hero leaves its combat baseline.
// This prevents a committed gravestone from outliving an uncommitted companion loss.
function recordKnockout(battle, entry, beforeHp, now = Date.now()) {
  if (!(beforeHp > 0) || entry.data.hp > 0 || !entry.data.companions?.lia) return null;
  const echo = ensure(entry.data);
  if (!entry.data.companions.lia) return null;
  const id = battle.id + ':' + entry.id + ':' + echo.generation;
  const falls = battle.liaFalls ||= [];
  if (falls.some(fall => fall.id === id)) return null;
  echo.fallen++;
  echo.needsRescue = true;
  entry.data.companions.lia = false;
  const fall = { id, heroId:entry.id, heroName:entry.data.name, generation:echo.generation,
    fallen:echo.fallen, zone:battle.zone, at:now };
  falls.push(fall);
  return fall;
}

function settleFalls(world, battle, entry) {
  const pending = (battle.liaFalls || []).filter(fall => fall.heroId === entry.id);
  if (!pending.length) return [];
  const echo = ensure(entry.data);
  const memorials = Array.isArray(world.liaMemorials) ? world.liaMemorials : [];
  let total = Math.max(count(world.liaMemorialCount, memorials.length), memorials.length);
  for (const fall of pending) {
    echo.generation = Math.max(echo.generation, fall.generation);
    echo.fallen = Math.max(echo.fallen, fall.fallen);
    echo.needsRescue = true;
    entry.data.companions.lia = false;
    if (!memorials.some(memorial => memorial.id === fall.id)) {
      memorials.push({ id:fall.id, heroName:fall.heroName, generation:fall.generation, zone:fall.zone, at:fall.at });
      total++;
    }
  }
  world.liaMemorials = memorials.slice(-48);
  world.liaMemorialCount = total;
  battle.liaFalls = (battle.liaFalls || []).filter(fall => fall.heroId !== entry.id);
  return pending;
}

module.exports = { ensure, recruit, rescue, recordKnockout, settleFalls };
