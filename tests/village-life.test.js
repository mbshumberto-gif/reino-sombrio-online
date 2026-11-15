'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const World = require('../public/world-data');

const epoch = 100000;
const restored = {
  epoch,
  cleared:{ forest:true, cave:true, fire:true, castle:true, shadow:true },
  voyage:{ cleared:true }
};
const people = time => [...World.npcPositions('village', time, restored), ...World.npcPositions('orchard', time, restored),
  ...World.residentPositions('village', time, restored)];

test('o relógio compartilhado respeita as quatro fases, épocas zero e limites de dia', () => {
  const phases = ['morning', 'afternoon', 'dusk', 'night'];
  for (let index = 0; index < 4; index++) {
    const start = World.dayCycle(index * 22000, { epoch:0 });
    assert.equal(start.phase, phases[index]);
    assert.equal(start.index, index);
    assert.equal(start.progress, 0);
    assert.equal(start.isNight, index === 3);
    assert.equal(start.dayMs, 88000);
    const end = World.dayCycle((index + 1) * 22000 - 1, { epoch:0 });
    assert.equal(end.phase, phases[index]);
    assert.ok(end.progress > 0.999);
  }
  assert.equal(World.dayCycle(88000, { epoch:0 }).phase, 'morning');
  assert.equal(World.dayCycle(88000, { epoch:0 }).day, 1);
  assert.equal(World.dayCycle(epoch - 1, { epoch }).elapsed, 0);
  assert.deepEqual(World.dayCycle(epoch + 5000, { epoch }), World.dayCycle(epoch + 5000, { epoch }));
});

test('as cinco casas têm corpos sólidos e portas alcançáveis a partir da entrada do mapa', () => {
  assert.equal(World.HOUSES.length, 5);
  assert.equal(Object.keys(World.zones).length, 33);
  const reachable = zoneId => {
    const map = World.zone(zoneId);
    const todo = [{ x:Math.round(map.spawn[0] / 16) * 16, y:Math.round(map.spawn[1] / 16) * 16 }];
    const seen = new Set();
    for (let i = 0; i < todo.length; i++) {
      const current = todo[i];
      const key = current.x + ',' + current.y;
      if (seen.has(key) || !World.canStand(zoneId, current.x, current.y)) continue;
      seen.add(key);
      for (const [dx, dy] of [[16,0],[-16,0],[0,16],[0,-16]]) todo.push({ x:current.x + dx, y:current.y + dy });
    }
    return seen;
  };
  for (const house of World.HOUSES) {
    assert.ok(World.NPCS[house.npcId]);
    assert.equal(World.canStand(house.zone, house.x + house.width / 2, house.y + house.height / 2), false);
    assert.ok(World.canStand(house.zone, house.door.x, house.door.y));
    assert.ok(World.canStand(house.zone, house.door.x, house.door.y + 24));
    assert.ok(reachable(house.zone).has(house.door.x + ',' + house.door.y), house.id);
    const point = World.zone(house.zone).points.find(point => point.id === house.id);
    assert.equal(point.kind, 'home');
    assert.equal(point.npcId, house.npcId);
    assert.equal(point.homeId, house.id);
    assert.deepEqual({ x:point.x, y:point.y }, house.door);
  }
});

test('NPCs trabalham de dia, voltam para casa ao entardecer e permanecem disponíveis à porta à noite', () => {
  const morning = World.npcPositions('village', epoch + 1000, restored);
  for (const npc of morning) {
    assert.equal(npc.activity, 'working');
    assert.equal(npc.indoors, false);
    const original = World.NPCS[npc.id].route[0];
    assert.deepEqual([npc.x, npc.y], original, 'A primeira manhã preserva os serviços e pontos conhecidos.');
  }
  for (const zone of ['village', 'orchard']) {
    const returning = World.npcPositions(zone, epoch + 55000, restored);
    assert.ok(returning.every(npc => npc.activity === 'returning' && !npc.indoors));
    const night = World.npcPositions(zone, epoch + 70000, restored);
    for (const npc of night) {
      const home = World.HOUSES.find(home => home.id === npc.homeId);
      assert.equal(npc.activity, 'home');
      assert.equal(npc.indoors, true);
      assert.equal(npc.moving, false);
      assert.deepEqual({ x:npc.x, y:npc.y }, home.door);
    }
    const emerging = World.npcPositions(zone, epoch + 90000, restored);
    assert.ok(emerging.every(npc => npc.activity === 'working' && !npc.indoors && npc.moving));
  }
});

test('NPCs e moradores percorrem caminhos transitáveis sem saltos entre duas noites e manhãs', () => {
  let previous = new Map();
  const step = 50;
  for (let elapsed = 0; elapsed <= 176000; elapsed += step) {
    const actors = people(epoch + elapsed);
    for (const actor of actors) {
      const home = World.HOUSES.find(home => home.id === actor.homeId);
      assert.ok(World.canStand(home.zone, actor.x, actor.y), actor.name + ' em ' + elapsed);
      const old = previous.get(actor.id);
      if (old) {
        assert.ok(World.distance(actor, old) <= World.SPEED * step / 1000 + 0.01,
          actor.name + ' não pode saltar por paredes ou entre fases em ' + elapsed);
      }
    }
    previous = new Map(actors.map(actor => [actor.id, actor]));
  }
  for (const elapsed of [22000, 44000, 66000, 88000, 94500, 110000, 132000, 154000, 176000]) {
    const before = new Map(people(epoch + elapsed - 1).map(actor => [actor.id, actor]));
    for (const actor of people(epoch + elapsed)) {
      assert.ok(World.distance(actor, before.get(actor.id)) < 0.2, actor.name + ' no limite ' + elapsed);
    }
  }
});

test('moradores retornam conforme os resgates e todos se recolhem de noite, incluindo Maria Rita', () => {
  assert.deepEqual(World.residentPositions('village', epoch, { epoch }), []);
  const forest = World.residentPositions('village', epoch, { epoch, cleared:{ forest:true } });
  assert.deepEqual(forest.map(actor => actor.name), ['Tomás', 'Elara']);
  const explicit = World.residentPositions('village', epoch, { epoch, rescued:['Marina'] });
  assert.deepEqual(explicit.map(actor => actor.name), ['Marina']);
  const all = World.residentPositions('village', epoch, restored);
  assert.equal(all.length, 9);
  const princess = all.find(actor => actor.name === 'Maria Rita');
  assert.equal(princess.classKey, 'princess');
  assert.equal(princess.appearance.hair, 'curly');
  assert.ok(World.residentPositions('village', epoch + 70000, restored).every(actor => actor.indoors && actor.activity === 'home'));
  assert.deepEqual(World.residentPositions('orchard', epoch, restored), []);
});

test('Mira, Eldrin e Nara têm aparência negra própria sem alterar identidade, classe ou função', () => {
  const actors = World.npcPositions('village', epoch + 1000, restored);
  const expected = { healer:['cleric', 'curly'], blacksmith:['warrior', 'short'], villager:['ranger', 'braids'] };
  for (const [id, [classKey, hair]] of Object.entries(expected)) {
    const actor = actors.find(actor => actor.id === id);
    assert.equal(actor.classKey, classKey);
    assert.equal(actor.appearance.skinTone, 'deep');
    assert.equal(actor.appearance.hair, hair);
    assert.match(actor.appearance.skin, /^#[0-9a-f]{6}$/i);
  }
});
