'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('a página carrega o RPG de visão superior e não o modo plataforma', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /game\.js"><\/script><script src="rpg\.js\?v=1"/);
  assert.doesNotMatch(html, /platformer\.js/);
  for (const direction of ['up', 'down', 'left', 'right']) {
    assert.match(html, new RegExp('data-move="' + direction + '"'));
  }
});

test('o RPG mantém câmera, movimento em quatro direções e colisões', () => {
  const script = fs.readFileSync(path.join(__dirname, '../public/rpg.js'), 'utf8');
  assert.match(script, /window\.drawWorld = function/);
  assert.match(script, /window\.movementLoop = function/);
  assert.match(script, /moveBlocked\(nx, base\.y\)/);
  assert.match(script, /moveBlocked\(x, ny\)/);
  assert.match(script, /function interactWorld/);
});

test('chefes derrotados não reaparecem, mas inimigos comuns continuam exploráveis', () => {
  const script = fs.readFileSync(path.join(__dirname, '../public/rpg.js'), 'utf8');
  assert.match(script, /if \(!cleared && region\?\.boss\)/);
  assert.match(script, /if \(defeated\.includes\(i\) \|\| !ENEMY_POINTS/);
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(server, /room\.world\[defeated\.area\] = true/);
  assert.match(server, /if \(region\.boss && room\.world\[area\]\) return socket\.emit/);
});

test('o servidor continua liberando a próxima região após a vitória', () => {
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(server, /if \(REGIONS\[targetIndex\]\.unlock && !room\.world\[REGIONS\[targetIndex\]\.unlock\]\)/);
  assert.match(server, /A passagem para a próxima região foi aberta/);
});
