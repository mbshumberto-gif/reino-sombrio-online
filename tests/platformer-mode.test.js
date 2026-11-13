'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('a página carrega somente o cliente principal do RPG top-down', () => {
  const html = read('public/index.html');
  assert.match(html, /game\\.js\\?v=\\d+/);
  assert.doesNotMatch(html, /rpg\\.js/);
  assert.doesNotMatch(html, /platformer\\.js/);
  for (const direction of ['up', 'down', 'left', 'right']) {
    assert.match(html, new RegExp('data-move="' + direction + '"'));
  }
});

test('o cliente principal contém desenho, movimentação e interação do herói', () => {
  const game = read('public/game.js');
  assert.match(game, /function drawWorld\\(/);
  assert.match(game, /function movementLoop\\(/);
  assert.match(game, /function pixelHero\\(/);
  assert.match(game, /function interactWorld\\(/);
  assert.match(game, /requestAnimationFrame\\(worldAnimation\\)/);
});

test('o servidor mantém posições compatíveis com mapas locais de 960x576', () => {
  const server = read('server.js');
  assert.match(server, /player\\.x = clamp\\(requestedX, 20, 940\\)/);
  assert.match(server, /player\\.y = clamp\\(requestedY, 30, 520\\)/);
  assert.doesNotMatch(server, /OPEN_WORLD_REGION_WIDTH/);
});

test('chefes derrotados desaparecem e inimigos comuns derrotados não reaparecem', () => {
  const game = read('public/game.js');
  assert.match(game, /if\\(region\\?\\.boss&&!latestState\\.world\\?\\.\\[area\\]\\)/);
  assert.match(game, /if\\(!defeated\\.includes\\(i\\)\\)/);
  const server = read('server.js');
  assert.match(server, /room\\.world\\[defeated\\.area\\] = true/);
  assert.match(server, /if \\(region\\.boss && room\\.world\\[area\\]\\) return socket\\.emit/);
});

test('a troca de região acontece pelos portais e respeita o desbloqueio', () => {
  const server = read('server.js');
  assert.match(server, /socket\\.on\\('travelRegion'/);
  assert.match(server, /Derrote o guardião da região anterior para abrir esta passagem/);
});
