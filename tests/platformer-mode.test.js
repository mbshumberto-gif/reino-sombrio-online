'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('a página carrega o mundo aberto 2D sem o renderizador antigo', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /platformer\.js\?v=5/);
  assert.doesNotMatch(html, /rpg\.js/);
  assert.match(html, /data-move="left"/);
  assert.match(html, /data-move="right"/);
  assert.match(html, /data-jump="true"/);
});

test('o mapa é contínuo e contém os seis biomas em sequência', () => {
  const script = fs.readFileSync(path.join(__dirname, '../public/platformer.js'), 'utf8');
  assert.match(script, /REGION_ORDER = \["village","forest","cave","fire","castle","shadow"\]/);
  assert.match(script, /W = REGION_WIDTH \* REGION_ORDER\.length/);
  assert.match(script, /const worldTerrain = \{floors:\[\],platforms:\[\],hazards:\[\]\}/);
  assert.match(script, /const levelData = \(\) => worldTerrain/);
  assert.doesNotMatch(script, /platformerAdvance/);
  assert.match(script, /function drawBackground/);
});

test('o servidor permite atravessar o mundo e protege passagens bloqueadas', () => {
  const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(server, /OPEN_WORLD_REGION_WIDTH = 1800/);
  assert.match(server, /OPEN_WORLD_REGION_WIDTH \* OPEN_WORLD_REGION_ORDER\.length/);
  assert.match(server, /targetRegion\?\.unlock && !room\.world\[targetRegion\.unlock\]/);
  assert.match(server, /blockedByGate/);
});

test('o modo plataforma desativa os encontros do mapa antigo', () => {
  const game = fs.readFileSync(path.join(__dirname, '../public/game.js'), 'utf8');
  assert.match(game, /if\(window\.platformerMode\)return/);
});
