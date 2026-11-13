'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('a página carrega somente o cliente principal do RPG top-down', () => {
  const html = read('public/index.html');
  assert.match(html, /game\.js\?v=\d+/);
  assert.doesNotMatch(html, /rpg\.js/);
  assert.doesNotMatch(html, /platformer\.js/);
  assert.match(html, /id="virtualJoystick"/);
  assert.match(html, /id="mobileActionBtn"/);
});

test('a tela inicial oferece apenas criar aventura e continuar o mesmo personagem', () => {
  const html = read('public/index.html');
  const game = read('public/game.js');
  assert.match(html, /id="createBtn"/);
  assert.match(html, /id="continueSaveBtn"/);
  assert.doesNotMatch(html, /newCharacterBtn|continuePreviousBtn/);
  assert.doesNotMatch(game, /newCharacterBtn|continuePreviousBtn/);
  assert.match(game, /localStorage\.removeItem\('eldoriaPreviousCharacterId'\)/);
});
test('o cliente principal contém desenho, movimentação e interação do herói', () => {
  const game = read('public/game.js');
  assert.match(game, /function drawWorld\(/);
  assert.match(game, /function movementLoop\(/);
  assert.match(game, /function pixelHero\(/);
  assert.match(game, /function interactWorld\(/);
  assert.match(game, /requestAnimationFrame\(worldAnimation\)/);
});

test('o servidor mantém posições compatíveis com mapas locais de 960x576', () => {
  const server = read('server.js');
  assert.match(server, /player\.x = clamp\(requestedX, 20, 940\)/);
  assert.match(server, /player\.y = clamp\(requestedY, 30, 520\)/);
  assert.doesNotMatch(server, /OPEN_WORLD_REGION_WIDTH/);
});

test('chefes derrotados desaparecem e inimigos comuns derrotados não reaparecem', () => {
  const game = read('public/game.js');
  assert.match(game, /if\(region\?\.boss&&!latestState\.world\?\.\[area\]\)/);
  assert.match(game, /if\(!defeated\.includes\(i\)\)/);
  const server = read('server.js');
  assert.match(server, /room\.world\[defeated\.area\] = true/);
  assert.match(server, /if \(region\.boss && room\.world\[area\]\) return socket\.emit/);
});

test('a troca de região acontece pelos portais e respeita o desbloqueio', () => {
  const server = read('server.js');
  assert.match(server, /socket\.on\('travelRegion'/);
  assert.match(server, /Derrote o guardião da região anterior para abrir esta passagem/);
});

test('o mundo possui tesouros persistentes, patrulhas e dificuldade progressiva', () => {
  const game = read('public/game.js');
  const server = read('server.js');
  const data = read('game-data.js');
  assert.match(game, /function movingEnemyPoint\(/);
  assert.match(game, /CHEST_SPOTS/);
  assert.match(game, /openChest/);
  assert.match(server, /socket\.on\('openChest'/);
  assert.match(server, /openedChests/);
  assert.match(data, /enemy\.hp = Math\.ceil\(enemy\.hp \* 1\.42\)/);
  assert.match(data, /name:'Corvo carniceiro'/);
  assert.match(data, /name:'Cavaleiro do eclipse'/);
  assert.match(data, /enemies:\[.*?name:'Javali das raízes'/);
});

test('cada região exige cinco encontros antes do guardião e os inimigos têm arquétipos', () => {
  const data = read('game-data.js');
  const server = read('server.js');
  const game = read('public/game.js');
  assert.equal((data.match(/enemies:\[/g)||[]).length, 5);
  assert.match(data, /enemy\.atk = Math\.ceil\(enemy\.atk \* 1\.28\)/);
  assert.match(server, /function enemyArchetype\(/);
  assert.match(server, /const specialChance = battle\.boss \? 0\.46/);
  assert.match(server, /battle\.atk = Math\.ceil\(battle\.atk \* 1\.4\)/);
  assert.match(server, /battle\.enraged = true/);
  assert.match(game, /Fase 2|FASE 2/);
  assert.match(game, /\{x:760,y:420\}/);
});
test('o jogo apresenta a libertação do povo após derrotar Malakar', () => {
  const html = read('public/index.html'), game = read('public/game.js'), server = read('server.js');
  assert.match(html, /id="endingSequence"/);
  assert.match(game, /AS CORRENTES SE PARTEM/);
  assert.match(game, /ELDORIA LIVRE/);
  assert.match(server, /os prisioneiros despertaram e o povo de Eldoria está livre/);
});
test('retorno da Terra do Fogo leva ao portal inferior da região anterior e permite voltar à vila', () => {
  const server = read('server.js');
  const game = read('public/game.js');
  assert.match(server, /const enteredFromNorthExit = !returningToVillage && targetIndex > currentIndex/);
  assert.match(server, /const returningToVillage = target === 'village'/);
  assert.match(game, /socket\.emit\("travelRegion",\{area:"village"\}\)/);
});
test('o guardião só aparece depois que todos os monstros comuns forem derrotados', () => {
  const server = read('server.js');
  const game = read('public/game.js');
  assert.match(server, /defeatedList\.length < regionData\.enemies\.length/);
  assert.match(game, /length>=region\.enemies\.length/);
});
test('enigmas possuem respostas alternativas e dicas claras', () => {
  const server = read('server.js');
  const campaign = read('campaign-expansion.js');
  const game = read('public/game.js');
  assert.match(server, /normalizeAnswer/);
  assert.match(campaign, /hint:'Pense na parte da árvore/);
  assert.match(game, /r\.hint\|\|/);
});
