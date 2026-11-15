'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Field = require('../field-combat');
const { makeHero } = require('../adventure');
const World = require('../public/world-data');

const enemy = { name:'Guardião da memória', hp:300, atk:25, gold:30, xp:40 };
const center = { x:480, y:237 };
function player(id = 'hero', classKey = 'warrior', x = 480, y = 270) {
  return { id, socketId:'socket-' + id, data:makeHero(id, classKey), member:{ data:{ zone:'forest', x, y } } };
}
function battle(entries, boss = false) {
  return Field.start('forest', { region:'forest', kind:boss ? 'boss' : 'enemy', index:0, boss }, enemy, entries, center, 1000);
}

test('o encontro reúne apenas heróis próximos, vivos e conectados na mesma área', () => {
  const local = player();
  const otherZone = player('outro'); otherZone.member.data.zone = 'village';
  const offline = player('offline'); offline.socketId = null;
  const far = player('longe', 'mage', 50, 500);
  const fallen = player('caído'); fallen.data.hp = 0;
  const encounter = battle([local, otherZone, offline, far, fallen]);
  assert.deepEqual(encounter.heroes, [local.id]);
  assert.equal(encounter.mode, 'field');
});

test('ataques respeitam alcance, mana e recuperação medidos no servidor', () => {
  const hero = player();
  const encounter = battle([hero]);
  hero.member.data.y = 400;
  assert.match(Field.act(encounter, hero, { action:'attack' }, [hero], 1100).error, /Aproxime/);
  assert.equal(encounter.hp, encounter.maxHp);
  hero.member.data.y = 270;
  Field.act(encounter, hero, { action:'attack' }, [hero], 1100);
  const hp = encounter.hp;
  assert.ok(hp < encounter.maxHp);
  assert.match(Field.act(encounter, hero, { action:'attack' }, [hero], 1101).error, /recuperação/);
  assert.equal(encounter.hp, hp);
  hero.data.mana = 0;
  assert.match(Field.act(encounter, hero, { action:'skill' }, [hero], 2000).error, /Mana/);
  assert.equal(encounter.hp, hp);
});

test('um círculo anuncia o golpe e sair dele evita o dano', () => {
  const hero = player();
  const encounter = battle([hero]);
  Field.tick(encounter, [hero], 1900);
  const mark = encounter.telegraphs[0];
  assert.ok(mark.resolvesAt - 1900 >= 1300);
  const hp = hero.data.hp;
  hero.member.data.x += mark.radius + 20;
  Field.tick(encounter, [hero], mark.resolvesAt);
  assert.equal(hero.data.hp, hp);
  const stationary = player('parado');
  const second = battle([stationary]);
  Field.tick(second, [stationary], 1900);
  Field.tick(second, [stationary], second.telegraphs[0].resolvesAt);
  assert.ok(stationary.data.hp < stationary.data.maxHp);
});

test('defender reduz o impacto anunciado sem bloquear movimento', () => {
  const guarded = player('guarded');
  const unguarded = player('unguarded');
  const guardFight = battle([guarded]);
  const openFight = battle([unguarded]);
  Field.tick(guardFight, [guarded], 1900);
  Field.tick(openFight, [unguarded], 1900);
  Field.act(guardFight, guarded, { action:'defend' }, [guarded], 3000);
  Field.tick(guardFight, [guarded], 3550);
  Field.tick(openFight, [unguarded], 3550);
  assert.ok(guarded.data.hp > unguarded.data.hp);
});

test('chefes exigem três fases e quebrar os dois totens por proximidade', () => {
  const hero = player();
  hero.data.baseAttack = 5000;
  const encounter = battle([hero], true);
  Field.act(encounter, hero, { action:'attack' }, [hero], 1100);
  assert.equal(encounter.phase, 2);
  assert.equal(encounter.totems.length, 2);
  for (const totem of encounter.totems) assert.ok(World.canStand('forest', totem.x, totem.y));
  Field.act(encounter, hero, { action:'attack' }, [hero], 2000);
  assert.equal(encounter.phase, 2);
  assert.ok(encounter.hp > Math.floor(encounter.maxHp * 0.32));
  Object.assign(hero.member.data, { x:480, y:450 });
  assert.match(Field.act(encounter, hero, { action:'totem' }, [hero], 3000).error, /Aproxime/);
  let now = 4000;
  for (const totem of [...encounter.totems]) {
    Object.assign(hero.member.data, { x:totem.x, y:totem.y });
    for (let i = 0; i < 2; i++) {
      assert.equal(Field.act(encounter, hero, { action:'totem', target:totem.id }, [hero], now).error, undefined);
      now += 800;
    }
  }
  assert.equal(encounter.totems.length, 0);
  Object.assign(hero.member.data, { x:480, y:270 });
  Field.act(encounter, hero, { action:'attack' }, [hero], now + 1000);
  assert.equal(encounter.phase, 3);
  Field.tick(encounter, [hero], now + 1600);
  assert.ok(encounter.telegraphs.every(mark => mark.type === 'lightning'));
  assert.equal(Field.act(encounter, hero, { action:'attack' }, [hero], now + 2000).outcome, 'won');
  const hp = encounter.hp;
  assert.match(Field.act(encounter, hero, { action:'attack' }, [hero], now + 4000).error, /terminou/);
  assert.equal(encounter.hp, hp);
});

test('a Druida enfraquece o inimigo e cura aliados em pé sem reanimar caídos', () => {
  const druid = player('druida', 'druid');
  const ally = player('aliado'); ally.data.hp -= 50;
  const fallen = player('caído'); fallen.data.hp = 0;
  const encounter = battle([druid, ally, fallen]);
  // A party member can fall after admission; keep the fallen id in this encounter.
  encounter.heroes.push(fallen.id);
  Field.act(encounter, druid, { action:'skill' }, [druid, ally, fallen], 1100);
  assert.ok(encounter.weakenedUntil > 1100);
  const hp = ally.data.hp;
  Field.act(encounter, druid, { action:'technique' }, [druid, ally, fallen], 2000);
  assert.ok(ally.data.hp > hp);
  assert.equal(fallen.data.hp, 0);
  assert.ok(encounter.status[druid.id].wardUntil > 2000);
});

test('sem jogadores online o encontro pausa, e um desconectado não recebe dano', () => {
  const hero = player();
  const encounter = battle([hero]);
  Field.tick(encounter, [hero], 1900);
  const hp = hero.data.hp;
  const due = encounter.telegraphs[0].resolvesAt;
  hero.socketId = null;
  Field.tick(encounter, [hero], 2500);
  Field.tick(encounter, [hero], 20000);
  assert.equal(hero.data.hp, hp);
  hero.socketId = 'returned';
  Field.tick(encounter, [hero], 21000);
  assert.ok(encounter.telegraphs[0].resolvesAt > 21000);
  assert.equal(hero.data.hp, hp);
  assert.ok(encounter.telegraphs[0].resolvesAt > due);
});

test('um aliado desconectado é excluído de impactos e curas enquanto outros lutam', () => {
  const first = player('first', 'cleric');
  const second = player('second');
  const encounter = battle([first, second]);
  Field.tick(encounter, [first, second], 1900);
  second.socketId = null;
  second.data.hp -= 20;
  const hp = second.data.hp;
  Field.act(encounter, first, { action:'skill' }, [first, second], 2000);
  Field.tick(encounter, [first, second], 3550);
  assert.equal(second.data.hp, hp);
});

test('fugir termina encontros comuns e chefes bloqueiam a fuga', () => {
  const hero = player();
  const encounter = battle([hero]);
  assert.equal(Field.act(encounter, hero, { action:'flee' }, [hero], 1100).outcome, 'fled');
  const boss = battle([hero], true);
  assert.match(Field.act(boss, hero, { action:'flee' }, [hero], 1100).error, /bloqueia/);
  hero.data.hp = 0;
  assert.equal(Field.tick(boss, [hero], 1500).outcome, 'lost');
});

test('círculos sobrepostos causam no máximo um impacto por aventureiro na mesma descarga', () => {
  const first = player('primeiro');
  const second = player('segundo');
  const encounter = battle([first, second], true);
  encounter.phase = 3;
  Field.tick(encounter, [first, second], 1900);
  assert.equal(encounter.telegraphs.length, 2);
  const before = first.data.hp;
  Field.tick(encounter, [first, second], encounter.telegraphs[0].resolvesAt);
  const hits = encounter.lastAction.hits.filter(hit => hit.id === first.id);
  assert.equal(hits.length, 1);
  assert.equal(before - first.data.hp, hits[0].damage);
});

test('identificadores que coincidem com propriedades de Object têm efeitos isolados', () => {
  const hero = player('__proto__');
  const encounter = battle([hero]);
  Field.act(encounter, hero, { action:'defend' }, [hero], 1100);
  assert.ok(Object.hasOwn(encounter.status, hero.id));
  assert.ok(Object.hasOwn(encounter.cooldowns, hero.id));
  assert.equal(Object.prototype.defendUntil, undefined);
  assert.equal(Object.prototype.global, undefined);
});

function regional(region, phase = 3) {
  const hero = player('regional');
  const encounter = battle([hero], true);
  encounter.target.region = region;
  encounter.phase = phase;
  return { hero, encounter };
}

test('o motor de campo mantém pulsos de regeneração de totens limitados à segunda fase', () => {
  const { hero, encounter } = regional('forest', 2);
  encounter.hp = 120;
  encounter.totems = [{ id:'seed', x:500, y:250, hp:2 }];
  Field.tick(encounter, [hero], 4000);
  assert.ok(encounter.hp > 120);
  const once = encounter.hp;
  Field.tick(encounter, [hero], 4001);
  assert.equal(encounter.hp, once);
  encounter.hp = Math.floor(encounter.maxHp * 0.68) - 1;
  Field.tick(encounter, [hero], 7000);
  assert.equal(encounter.hp, Math.floor(encounter.maxHp * 0.68));
  encounter.totems = [];
  encounter.hp = 100;
  Field.tick(encounter, [hero], 10000);
  assert.equal(encounter.hp, 100);
});

test('a ruptura da caverna e a ordem de Vharok anunciam linhas fixas e esquiváveis', () => {
  for (const [region, type] of [['cave', 'fissure'], ['castle', 'command']]) {
    const { hero, encounter } = regional(region);
    Field.tick(encounter, [hero], 1900);
    assert.ok(encounter.telegraphs.length >= 4);
    assert.ok(encounter.telegraphs.every(mark => mark.type === type && mark.resolvesAt >= 3200));
    const original = structuredClone(encounter.telegraphs);
    hero.member.data.x += 150;
    const hp = hero.data.hp;
    Field.tick(encounter, [hero], 3550);
    assert.equal(hero.data.hp, hp);
    assert.ok(original.every(mark => mark.x === center.x));
  }
});

test('as brasas permanecem por dois impactos anunciados e sair evita o segundo', () => {
  const { hero, encounter } = regional('fire');
  Field.tick(encounter, [hero], 1900);
  assert.equal(encounter.telegraphs[0].type, 'ember');
  assert.equal(encounter.telegraphs[0].pulses, 2);
  Field.tick(encounter, [hero], 3550);
  assert.ok(hero.data.hp < hero.data.maxHp);
  assert.equal(encounter.telegraphs[0].pulses, 1);
  assert.equal(encounter.telegraphs[0].resolvesAt, 5050);
  const hp = hero.data.hp;
  hero.member.data.x += 150;
  Field.tick(encounter, [hero], 5050);
  assert.equal(hero.data.hp, hp);
  assert.ok(encounter.telegraphs.every(mark => mark.resolvesAt > 5050 && mark.pulses === 2));
});

test('os raios de Malakar drenam mana apenas de quem permanece na marca', () => {
  const { hero, encounter } = regional('shadow');
  Field.tick(encounter, [hero], 1900);
  hero.data.mana = 20;
  Field.tick(encounter, [hero], 3350);
  assert.equal(hero.data.mana, 14);
  const dodged = regional('shadow');
  Field.tick(dodged.encounter, [dodged.hero], 1900);
  dodged.hero.data.mana = 20;
  dodged.hero.member.data.x += 120;
  Field.tick(dodged.encounter, [dodged.hero], 3350);
  assert.equal(dodged.hero.data.mana, 20);
});

test('o barco anuncia raios no convés sem trocar de mapa', () => {
  const hero = player('marujo');
  hero.member.data.zone = 'boat';
  const encounter = Field.start('boat', { kind:'voyageEnemy', index:1, region:'forest' }, enemy, [hero], { x:480,y:270 }, 1000);
  Field.tick(encounter, [hero], 1900);
  assert.equal(encounter.telegraphs[0].type, 'lightning');
  assert.match(encounter.pattern, /convés/);
  hero.socketId = null;
  const hp = hero.data.hp;
  Field.tick(encounter, [hero], 3350);
  assert.equal(hero.data.hp, hp);
});
