'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('a página usa somente o modo de plataforma 2D', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.match(html, /platformer\.js\?v=4/);
  assert.doesNotMatch(html, /rpg\.js/);
  assert.match(html, /data-move="left"/);
  assert.match(html, /data-move="right"/);
  assert.match(html, /data-jump="true"/);
  assert.match(html, /data-interact="true"/);
});

test('o controle mobile aciona pulo e interação do portal', () => {
  const script = fs.readFileSync(path.join(__dirname, '../public/platformer.js'), 'utf8');
  assert.match(script, /button\.dataset\.interact/);
  assert.match(script, /keys\.add\("interact"\)/);
  assert.match(script, /socket\.emit\("platformerAdvance"\)/);
});

test('cada região possui três fases e cenário próprios', () => {
  const script = fs.readFileSync(path.join(__dirname, '../public/platformer.js'), 'utf8');
  for (const region of ['village', 'forest', 'cave', 'fire', 'castle', 'shadow']) {
    assert.match(script, new RegExp(region + ':\\s*\\['));
  }
  assert.ok(script.includes('const levelData = () => (stages[region] || stages.village)'));
  assert.match(script, /function drawBackground/);
});
