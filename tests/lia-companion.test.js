'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Story = require('../adventure');
const Combat = require('../combat');
const Field = require('../field-combat');
const World = require('../public/world-data');

function player(id, classKey = 'warrior', companions = { lume:1, lia:true }) {
  const data = Story.makeHero(id, classKey);
  data.companions = structuredClone(companions);
  return { id, socketId:'socket-' + id, data, member:{ data:{ zone:'forest', x:480, y:270 } } };
}
const enemy = { name:'Sombra da prisão', hp:600, atk:1000, gold:10, xp:10 };
const target = { kind:'enemy', region:'forest', index:0, boss:false };
const turn = entries => Combat.startBattle('forest', target, enemy, entries);
const field = entries => Field.start('forest', target, enemy, entries, { x:480, y:237 }, 1000);

function assertFallen(hero, generation = 1, fallen = 1) {
  assert.equal(hero.data.companions.lia, false);
  assert.deepEqual(hero.data.companions.liaEcho, { generation, fallen, needsRescue:true });
}

test('KO por turno perde apenas o clone do aventureiro atingido, inclusive em saves booleanos antigos', () => {
  const victim = player('Marcado');
  const survivor = player('Sobrevivente');
  victim.data.hp = 1;
  const battle = turn([victim, survivor]);
  Combat.enemyTurn(battle, [victim, survivor]);
  assertFallen(victim);
  assert.equal(survivor.data.companions.lia, true);
  assert.equal(survivor.data.hp, survivor.data.maxHp);
  assert.equal(survivor.data.companions.liaEcho?.needsRescue || false, false);
});

test('um golpe de campo com vários círculos registra a queda de Lia uma única vez', () => {
  const victim = player('Marcado');
  victim.data.hp = 1;
  const battle = field([victim]);
  Field.tick(battle, [victim], 1900);
  const mark = battle.telegraphs[0];
  battle.telegraphs.push({ ...mark, id:'sobreposto' });
  Field.tick(battle, [victim], mark.resolvesAt);
  assertFallen(victim);
  Field.tick(battle, [victim], mark.resolvesAt + 5000);
  assertFallen(victim);
});

test('reanimação do herói mantém a perda do clone e um novo KO não duplica a queda', () => {
  const victim = player('Marcado');
  const cleric = player('Curandeira', 'cleric', { lume:1, lia:false });
  victim.data.hp = 1;
  const entries = [victim, cleric];
  const battle = turn(entries);
  Combat.enemyTurn(battle, entries);
  assertFallen(victim);
  assert.equal(battle.active, cleric.id);
  const result = Combat.act(battle, cleric.id, 'technique', entries);
  assert.equal(result.error, undefined);
  assert.ok(victim.data.hp > 0);
  assertFallen(victim);
  // After revival, this hero can fall again without acquiring an unearned replacement clone.
  battle.move = { type:'hit', name:'Golpe', target:victim.id };
  Combat.enemyTurn(battle, entries);
  assert.equal(victim.data.hp, 0);
  assertFallen(victim);
});

test('fuga, vitória e desconexão sem KO não matam o clone', () => {
  const escapee = player('Fugitivo');
  const escaped = turn([escapee]);
  assert.equal(Combat.act(escaped, escapee.id, 'flee', [escapee]).outcome, 'fled');
  assert.equal(escapee.data.companions.lia, true);
  const winner = player('Vencedor');
  winner.data.baseAttack = 5000;
  const won = turn([winner]);
  assert.equal(Combat.act(won, winner.id, 'attack', [winner]).outcome, 'won');
  assert.equal(winner.data.companions.lia, true);
  const away = player('Desconectado');
  const paused = field([away]);
  Field.tick(paused, [away], 1900);
  away.socketId = null;
  Field.tick(paused, [away], 9000);
  assert.equal(away.data.companions.lia, true);
  assert.equal(away.data.companions.liaEcho?.fallen || 0, 0);
});

test('uma geração posterior incrementa o histórico, e a Lia original permanece no Pomar', () => {
  const victim = player('Terceiro clone', 'ranger', {
    lume:1, lia:true, liaEcho:{ generation:3, fallen:2, needsRescue:false }
  });
  victim.data.hp = 1;
  Combat.enemyTurn(turn([victim]), [victim]);
  assertFallen(victim, 3, 3);
  const original = World.npcPositions('orchard', 100000, { epoch:100000 }).find(npc => npc.id === 'lia');
  assert.ok(original, 'A morte do companheiro não remove a NPC original.');
  assert.equal(original.name, 'Lia');
});

test('o memorial retém as últimas 48 gerações, preserva o total e ignora liquidação repetida', () => {
  const Lia = require('../lia-companion');
  const hero = player('Viajante');
  const world = {};
  for (let generation = 1; generation <= 55; generation++) {
    const battle = { id:'encontro-' + generation, zone:'forest' };
    hero.data.hp = 0;
    Lia.recordKnockout(battle, hero, 1, 1000 + generation);
    Lia.settleFalls(world, battle, hero);
    Lia.settleFalls(world, battle, hero);
    if (generation < 55) {
      Lia.rescue(hero.data);
      hero.data.hp = 1;
    }
  }
  assert.equal(world.liaMemorialCount, 55);
  assert.equal(world.liaMemorials.length, 48);
  assert.equal(world.liaMemorials[0].generation, 8);
  assert.equal(world.liaMemorials[47].generation, 55);
  assert.equal(new Set(world.liaMemorials.map(grave => grave.id)).size, 48);
  assertFallen(hero, 55, 55);
});
