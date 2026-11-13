/* Shared map geometry. Positions are world pixels; tile art lives in pixel.js. */
((root, factory) => {
  const world = factory();
  if (typeof module === 'object' && module.exports) module.exports = world;
  else root.EldoriaWorld = world;
})(globalThis, () => {
  'use strict';

  const TILE = 32;
  const COLS = 30;
  const ROWS = 18;
  const WIDTH = COLS * TILE;
  const HEIGHT = ROWS * TILE;
  const SPEED = 190;
  const REGIONS = ['forest', 'cave', 'fire', 'castle', 'shadow'];
  const BRANCHES = {
    forest: { id: 'orchard', name: 'Pomar dos Sussurros', landmark: 'O velho aqueduto', object: 'spirit' },
    cave: { id: 'grotto', name: 'Gruta do Espelho', landmark: 'O poço de cristal', object: 'miners' },
    fire: { id: 'forge', name: 'Forja do Eclipse', landmark: 'A bigorna adormecida', object: 'embers' },
    castle: { id: 'archive', name: 'Biblioteca Proibida', landmark: 'O salão dos arquivos', object: 'records' },
    shadow: { id: 'garden', name: 'Jardim das Lanternas', landmark: 'O altar da memória', object: 'seals' }
  };
  const NAMES = {
    village: 'Vila de Eldoria', forest: 'Floresta Amaldiçoada', cave: 'Caverna dos Ecos',
    fire: 'Terras do Fogo', castle: 'Castelo dos Condenados', shadow: 'Reino Sombrio'
  };
  const DUNGEONS = {
    forest: ['Trilha das Raízes', 'Santuário Partido', 'Ninho Corrompido', 'Coração da Floresta'],
    cave: ['Galeria dos Mineiros', 'Ponte dos Ecos', 'Cripta Esquecida', 'Trono Subterrâneo'],
    fire: ['Campo de Cinzas', 'Templo das Brasas', 'Forja Abandonada', 'Ninho de Obsidiana'],
    castle: ['Pátio dos Condenados', 'Arquivo Proibido', 'Salão da Tortura', 'Sala do General'],
    shadow: ['Fenda do Vazio', 'Labirinto das Sombras', 'Catedral Negra', 'Câmara do Eclipse']
  };
  const ENEMIES = {
    forest: [[228, 245], [730, 285], [560, 340], [260, 394], [760, 420]],
    cave: [[220, 220], [751, 260], [560, 340], [262, 390], [760, 422]],
    fire: [[211, 260], [740, 218], [560, 340], [265, 391], [760, 420]],
    castle: [[220, 250], [739, 249], [560, 340], [261, 390], [760, 420]],
    shadow: [[212, 232], [750, 245], [560, 340], [262, 390], [760, 420]]
  };
  const NPCS = {
    chronicler: { name: 'Aderic', fullName: 'Cronista Aderic', look: 'mage', route: [[480, 273], [416, 272], [416, 211], [480, 222]] },
    healer: { name: 'Mira', fullName: 'Mira, a Curandeira', look: 'cleric', route: [[338, 356], [299, 356], [299, 288], [336, 302]] },
    blacksmith: { name: 'Eldrin', fullName: 'Eldrin, o Ferreiro', look: 'warrior', route: [[628, 357], [651, 357], [651, 284], [628, 300]] },
    villager: { name: 'Nara', fullName: 'Nara de Eldoria', look: 'ranger', route: [[550, 204], [581, 239], [548, 272], [519, 229]] },
    lia: { name: 'Lia', fullName: 'Lia, a Guardiã do Pomar', look: 'rogue', route: [[476, 251], [531, 246], [535, 293], [475, 297]] }
  };
  const point = (id, kind, x, y, label, extra = {}) => ({ id, kind, x, y, label, ...extra });
  const returnLabel = region => 'Voltar ' + (['cave','forest','village'].includes(region) ? 'à ' : region === 'fire' ? 'às ' : 'ao ') + NAMES[region];
  const portal = (id, x, y, label, to, spawn, extra) => point(id, 'portal', x, y, label, { to, spawn, ...extra });
  const dungeonId = (region, index) => 'dungeon-' + region + '-' + index;

  function mapGrid(kind, region, dungeonIndex) {
    const grid = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) =>
      x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 ? 1 : 0));
    const paint = (x, y, w, h, value) => {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j][i] = value;
    };
    if (kind === 'dungeon') {
      paint(1, 1, 28, 16, 5);
      paint(3, 2, 24, 14, 0);
      paint(12, 1, 6, 16, 2);
      paint(4, 8, 22, 2, 2);
      if (dungeonIndex === 0) {
        paint(6, 4, 3, 2, 5);
        paint(21, 11, 3, 2, 5);
      } else if (dungeonIndex === 1) {
        paint(5, 6, 7, 1, 3);
        paint(18, 6, 7, 1, 3);
        paint(5, 11, 6, 1, 3);
        paint(19, 11, 6, 1, 3);
      } else if (dungeonIndex === 2) {
        paint(12, 10, 6, 2, 5);
        paint(8, 6, 2, 5, 5);
        paint(20, 6, 2, 5, 5);
      } else {
        paint(7, 4, 4, 3, 5);
        paint(19, 4, 4, 3, 5);
        paint(6, 11, 4, 1, 3);
        paint(20, 11, 4, 1, 3);
      }
      return grid;
    }
    if (region === 'village') {
      paint(13, 3, 5, 14, 2);
      paint(4, 7, 22, 2, 2);
      paint(6, 11, 18, 2, 2);
      paint(4, 3, 6, 3, 4);
      paint(20, 3, 6, 3, 4);
      paint(6, 10, 3, 2, 3);
      paint(22, 10, 3, 2, 3);
      paint(3, 14, 3, 2, 1);
      paint(25, 14, 3, 2, 1);
      return grid;
    }
    for (let y = 2; y < 16; y++) {
      for (let x = 2; x < 28; x++) {
        if ((x < 4 || x > 25) && (x * 3 + y * 5) % 7 < 3) grid[y][x] = 1;
        if ((x > 4 && x < 24) && (x * 17 + y * 13 + region.length * 9) % 29 < 2) grid[y][x] = region === 'fire' ? 3 : 5;
      }
    }
    paint(13, 1, 5, 16, 2);
    paint(4, 8, 22, 2, 2);
    paint(5, 13, 21, 2, 2);
    if (kind === 'branch') {
      paint(4, 3, 4, 3, 3);
      paint(22, 11, 4, 4, region === 'fire' ? 3 : 5);
      paint(19, 4, 5, 2, 5);
    } else {
      paint(5, 4, 3, 2, 5);
      paint(23, 10, 3, 2, region === 'fire' ? 3 : 5);
      if (region === 'forest') {
        paint(3, 5, 2, 3, 1);
        paint(20, 4, 3, 2, 1);
        paint(18, 11, 2, 2, 1);
      }
      if (region === 'cave') {
        paint(23, 4, 3, 4, 3);
        paint(5, 10, 2, 3, 5);
        paint(7, 6, 4, 1, 5);
      }
      if (region === 'fire') {
        paint(10, 5, 2, 3, 3);
        paint(19, 6, 3, 2, 3);
        paint(24, 13, 3, 3, 3);
      }
      if (region === 'castle') {
        paint(6, 11, 3, 2, 4);
        paint(10, 5, 2, 3, 4);
        paint(19, 5, 2, 3, 4);
      }
      if (region === 'shadow') {
        paint(6, 11, 3, 2, 4);
        paint(18, 3, 5, 2, 5);
        paint(20, 11, 2, 4, 5);
      }
    }
    return grid;
  }

  const zones = {};
  function addZone(id, name, region, kind, points, dungeonIndex) {
    const grid = mapGrid(kind, region, dungeonIndex);
    for (const p of points) {
      const tx = Math.floor(p.x / TILE);
      const ty = Math.floor(p.y / TILE);
      for (let y = Math.max(1, ty - 1); y <= Math.min(ROWS - 2, ty + 1); y++) {
        for (let x = Math.max(1, tx - 1); x <= Math.min(COLS - 2, tx + 1); x++) {
          if (grid[y][x] !== 2) grid[y][x] = 0;
        }
      }
    }
    zones[id] = { id, name, region, kind, dungeonIndex, grid, points, spawn: [480, 458] };
  }

  addZone('village', NAMES.village, 'village', 'surface', [
    portal('forest-road', 480, 513, 'Estrada da Floresta', 'forest', [480, 458]),
    portal('lume-trail', 754, 448, 'Trilha do Pomar · Lume', 'orchard', [475, 366]),
    point('apple-village', 'tree', 365, 408, 'Macieira da praça'),
    point('lamp-village', 'lamp', 561, 409, 'Lanterna da praça')
  ]);
  REGIONS.forEach((region, index) => {
    const branch = BRANCHES[region];
    const previous = REGIONS[index - 1] || 'village';
    const next = REGIONS[index + 1];
    const points = [
      portal('south-road', 480, 513, returnLabel(previous), previous, [480, index ? 109 : 458]),
      portal('side-road', 850, 284, branch.name, branch.id, [110, 286]),
      portal('dungeon-entrance', 113, 284, 'Entrada da masmorra', dungeonId(region, 0), [480, 456], { dungeon: region }),
      point('boss-' + region, 'boss', 480, 108, 'Guardião da região'),
      point('chest-' + region + '-1', 'chest', 480, 400, 'Pote de tesouro'),
      point('chest-' + region + '-2', 'chest', 288, 293, 'Pote de tesouro'),
      point('camp-' + region, 'camp', 558, 478, 'Fogueira de descanso'),
      ...ENEMIES[region].map(([x, y], i) => point(region + '-mob-' + i, 'enemy', x, y, 'Criatura', { enemyIndex: i }))
    ];
    if (next) points.push(portal('north-road', 480, 52, 'Rota para ' + NAMES[next], next, [480, 458], { requires: region }));
    if (region === 'forest') points.push(point('apple-forest', 'tree', 347, 439, 'Macieira selvagem'));
    addZone(region, NAMES[region], region, 'surface', points);

    const branchPoints = [
      portal('back-path', 70, 286, returnLabel(region), region, [801, 283]),
      point(branch.object, 'clue', 615, 217, branch.landmark),
      point('chest-' + branch.id, 'chest', 713, 349, 'Baú escondido')
    ];
    if (region === 'forest') {
      branchPoints.push(portal('lume-village', 480, 492, 'Trilha de volta à Vila', 'village', [702, 448]));
      branchPoints.push(point('apple-orchard', 'tree', 343, 319, 'Macieira antiga'));
      branchPoints.push(point('lamp-orchard', 'lamp', 684, 120, 'Lanterna do pomar'));
      branchPoints.push(portal('orchard-shortcut', 480, 52, 'Atalho para a Vila', 'village', [480, 425], { shortcut: true }));
      zones.village.points.push(portal('village-shortcut', 480, 54, 'Atalho do Pomar', 'orchard', [480, 106], { shortcut: true }));
    }
    if (region === 'cave') branchPoints.push(point('letters-grotto', 'clue', 463, 128, 'Carta na margem'));
    if (region === 'castle') branchPoints.push(point('letters-archive', 'clue', 463, 128, 'Correspondência de Vharok'));
    if (region === 'shadow') branchPoints.push(point('lamp-garden', 'lamp', 681, 132, 'Lanterna do jardim'));
    addZone(branch.id, branch.name, region, 'branch', branchPoints);

    DUNGEONS[region].forEach((name, i) => {
      const previousZone = i === 0 ? region : dungeonId(region, i - 1);
      const points = [
        portal('dungeon-back', 480, 511, i ? 'Sala anterior' : 'Voltar à superfície', previousZone, i ? [480, 113] : [169, 283]),
        point('trial', i === 1 ? 'puzzle' : 'dungeonEnemy', 480, i === 1 ? 263 : 237, i === 1 ? 'Inscrição antiga' : 'Encontro da sala')
      ];
      if (i < 3) points.push(portal('dungeon-next', 480, 62, 'Próxima sala', dungeonId(region, i + 1), [480, 458], { requiresRoom: i }));
      else points.push(portal('dungeon-finish', 480, 62, 'Saída do guardião', region, [169, 283], { requiresRoom: i, finish: true }));
      if (region === 'forest' && i === 1) points.push(point('relic-clue', 'clue', 337, 266, 'Inscrição dos Primeiros Reis'));
      if (region === 'forest' && i === 3) points.push(point('relic', 'clue', 606, 303, 'Relicário élfico'));
      addZone(dungeonId(region, i), name, region, 'dungeon', points, i);
    });
  });

  const zone = id => Object.hasOwn(zones, id) ? zones[id] : zones.village;

  function canStand(zoneId, x, y) {
    const grid = zone(zoneId).grid;
    return [[-9, -7], [-9, 7], [9, -7], [9, 7]].every(([dx, dy]) => {
      const tile = grid[Math.floor((y + dy) / TILE)]?.[Math.floor((x + dx) / TILE)];
      return tile === 0 || tile === 2;
    });
  }

  function walk(zoneId, start, dx, dy, dt) {
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = start.x + dx / length * SPEED * dt;
    const ny = start.y + dy / length * SPEED * dt;
    const x = canStand(zoneId, nx, start.y) ? nx : start.x;
    const y = canStand(zoneId, x, ny) ? ny : start.y;
    return { x, y };
  }

  function safePosition(zoneId, x, y) {
    if (Number.isFinite(x) && Number.isFinite(y) && canStand(zoneId, x, y)) return { x, y };
    const [sx, sy] = zone(zoneId).spawn;
    return { x: sx, y: sy };
  }

  function npcPositions(zoneId, now, world = {}) {
    const keys = zoneId === 'village'
      ? ['chronicler', 'healer', 'blacksmith', 'villager']
      : zoneId === 'orchard' ? ['lia'] : [];
    return keys.map(id => {
      const npc = NPCS[id];
      const elapsed = Math.max(0, now - (world.epoch || now));
      const segment = Math.floor(elapsed / 22000) % npc.route.length;
      const fraction = Math.max(0, (elapsed % 22000 - 15500) / 6500);
      const [x, y] = npc.route[segment];
      const [nx, ny] = npc.route[(segment + 1) % npc.route.length];
      return { ...point(id, 'npc', x + (nx - x) * fraction, y + (ny - y) * fraction, npc.fullName),
        name: npc.name, classKey: npc.look, moving: fraction > 0, facing: nx > x ? 'right' : nx < x ? 'left' : ny < y ? 'up' : 'down' };
    });
  }

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const facing = (dx, dy, current) => Math.abs(dx) > Math.abs(dy)
    ? (dx < 0 ? 'left' : 'right') : dy ? (dy < 0 ? 'up' : 'down') : current;

  return { TILE, COLS, ROWS, WIDTH, HEIGHT, SPEED, REGIONS, BRANCHES, NAMES, DUNGEONS, NPCS, zones, zone,
    dungeonId, canStand, walk, safePosition, npcPositions, distance, facing };
});
