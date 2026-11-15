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
    chronicler: { name: 'Aderic', fullName: 'Cronista Aderic', look: 'mage', appearance:{ skinTone:'light', skin:'#d4a17b', hair:'short' }, route: [[480, 273], [416, 272], [416, 211], [480, 222]] },
    healer: { name: 'Mira', fullName: 'Mira, a Curandeira', look: 'cleric', appearance:{ skinTone:'deep', skin:'#8f573f', hair:'curly' }, route: [[338, 356], [299, 356], [299, 288], [336, 302]] },
    blacksmith: { name: 'Eldrin', fullName: 'Eldrin, o Ferreiro', look: 'warrior', appearance:{ skinTone:'deep', skin:'#754532', hair:'short' }, route: [[628, 357], [651, 357], [651, 284], [628, 300]] },
    villager: { name: 'Nara', fullName: 'Nara de Eldoria', look: 'ranger', appearance:{ skinTone:'deep', skin:'#69402f', hair:'braids' }, route: [[550, 204], [581, 239], [548, 272], [519, 229]] },
    lia: { name: 'Lia', fullName: 'Lia, a Guardiã do Pomar', look: 'rogue', appearance:{ skinTone:'medium', skin:'#c88d64', hair:'braids' }, route: [[476, 251], [531, 246], [535, 293], [475, 297]] }
  };
  const HOUSES = [
    { id:'house-aderic', zone:'village', npcId:'chronicler', label:'Casa de Aderic', x:128, y:96, width:192, height:96, door:{ x:224, y:208 } },
    { id:'house-eldrin', zone:'village', npcId:'blacksmith', label:'Casa e forja de Eldrin', x:640, y:96, width:192, height:64, door:{ x:736, y:176 } },
    { id:'house-mira', zone:'village', npcId:'healer', label:'Casa de Mira', x:128, y:352, width:128, height:64, door:{ x:192, y:432 } },
    { id:'house-nara', zone:'village', npcId:'villager', label:'Casa de Nara', x:736, y:352, width:128, height:64, door:{ x:800, y:432 } },
    { id:'house-lia', zone:'orchard', npcId:'lia', label:'Casa de Lia', x:736, y:64, width:128, height:64, door:{ x:800, y:144 } }
  ];
  const RESIDENTS = [
    { id:'resident-tomas', name:'Tomás', look:'warrior', unlock:'forest', homeId:'house-aderic', at:[350,208], appearance:{ skinTone:'medium', skin:'#bc805c', hair:'short' } },
    { id:'resident-elara', name:'Elara', look:'sorceress', unlock:'forest', homeId:'house-mira', at:[390,220], appearance:{ skinTone:'deep', skin:'#80503a', hair:'curly' } },
    { id:'resident-borin', name:'Borin', look:'monk', unlock:'cave', homeId:'house-eldrin', at:[590,250], appearance:{ skinTone:'light', skin:'#d4a17b', hair:'short' } },
    { id:'resident-nilo', name:'Nilo', look:'mage', unlock:'fire', homeId:'house-eldrin', at:[620,220], appearance:{ skinTone:'deep', skin:'#754532', hair:'curly' } },
    { id:'resident-sera', name:'Sera', look:'bard', unlock:'castle', homeId:'house-nara', at:[550,190], appearance:{ skinTone:'medium', skin:'#bc805c', hair:'braids' } },
    { id:'resident-ivo', name:'Ivo', look:'ranger', unlock:'shadow', homeId:'house-aderic', at:[365,265], appearance:{ skinTone:'deep', skin:'#69402f', hair:'short' } },
    { id:'resident-marina', name:'Marina', look:'cleric', unlock:'island', homeId:'house-mira', at:[550,300], appearance:{ skinTone:'deep', skin:'#80503a', hair:'braids' } },
    { id:'resident-caio', name:'Caio', look:'rogue', unlock:'island', homeId:'house-nara', at:[590,300], appearance:{ skinTone:'light', skin:'#d4a17b', hair:'short' } },
    { id:'resident-maria-rita', name:'Maria Rita', look:'princess', unlock:'shadow', homeId:'house-aderic', at:[480,205], appearance:{ skinTone:'medium', skin:'#bc805c', hair:'curly' } }
  ];
  const point = (id, kind, x, y, label, extra = {}) => ({ id, kind, x, y, label, ...extra });
  const returnLabel = region => 'Voltar ' + (['cave','forest','village'].includes(region) ? 'à ' : region === 'fire' ? 'às ' : 'ao ') + NAMES[region];
  const portal = (id, x, y, label, to, spawn, extra) => point(id, 'portal', x, y, label, { to, spawn, ...extra });
  const dungeonId = (region, index) => 'dungeon-' + region + '-' + index;

  function mapGrid(kind, region, dungeonIndex, id) {
    const grid = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) =>
      x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 ? 1 : 0));
    const paint = (x, y, w, h, value) => {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j][i] = value;
    };
    if (id === 'boat') {
      paint(1, 1, 28, 16, 3);
      paint(4, 4, 22, 12, 2);
      return grid;
    }
    if (id === 'island') {
      paint(1, 1, 28, 16, 3);
      paint(3, 3, 24, 13, 0);
      paint(4, 4, 22, 11, 0);
      paint(13, 4, 5, 12, 2);
      paint(4, 13, 22, 2, 2);
      for (const [x,y] of [[4,4],[7,5],[22,5],[24,8],[5,9],[20,10],[8,11]]) paint(x,y,2,2,1);
      return grid;
    }
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
    const grid = mapGrid(kind, region, dungeonIndex, id);
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
    point('echo-bell', 'secret', 700, 188, 'Sino do primeiro amanhecer'),
    point('wishing-well', 'secret', 224, 287, 'Poço dos desejos'),
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
    if (region === 'forest') points.push(point('apple-forest', 'tree', 347, 439, 'Macieira selvagem'),
      point('dawn-sword', 'secret', 660, 456, 'Espada na pedra'));
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
      for (const [i, [x, y]] of [[350,390],[420,390],[350,450],[420,450]].entries()) {
        branchPoints.push(point('garden-' + (i + 1), 'plot', x, y, 'Seu canteiro ' + (i + 1)));
      }
      branchPoints.push(portal('lantern-boat', 780, 440, 'Embarcar para a Ilha das Raízes', 'boat', [190, 440], { requires:'forest' }));
      branchPoints.push(portal('orchard-shortcut', 480, 52, 'Atalho para a Vila', 'village', [480, 425], { shortcut: true }));
      zones.village.points.push(portal('village-shortcut', 480, 54, 'Atalho do Pomar', 'orchard', [480, 106], { shortcut: true }));
    }
    if (region === 'cave') branchPoints.push(point('letters-grotto', 'clue', 463, 128, 'Carta na margem'),
      point('echo-crystal', 'secret', 702, 252, 'Cristal que canta'));
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

  addZone('boat', 'Travessia das Lanternas', 'forest', 'voyage', [
    portal('boat-return', 160, 440, 'Desembarcar no Pomar', 'orchard', [760, 440]),
    point('deck-raider-0', 'voyageEnemy', 380, 330, 'Saqueador do convés', { enemyIndex:0 }),
    point('deck-raider-1', 'voyageEnemy', 620, 280, 'Arauto da tempestade', { enemyIndex:1 }),
    portal('island-shore', 800, 180, 'Chegar à Ilha das Raízes', 'island', [190, 458], { requiresVoyage:'deck' })
  ]);
  addZone('island', 'Ilha das Raízes', 'forest', 'voyage', [
    portal('island-return', 160, 458, 'Voltar ao barco', 'boat', [750, 180]),
    point('island-warden', 'voyageBoss', 480, 180, 'Carcereiro das Raízes'),
    point('island-captives', 'captive', 620, 180, 'Libertar os moradores'),
    point('island-camp', 'camp', 340, 440, 'Fogueira dos navegantes')
  ]);

  // Houses use the same footprint for collision and art. A broad forecourt
  // keeps their doors connected to the roads and available for night services.
  for (const house of HOUSES) {
    const map = zones[house.zone];
    for (let y = house.y / TILE; y < (house.y + house.height) / TILE; y++) {
      for (let x = house.x / TILE; x < (house.x + house.width) / TILE; x++) map.grid[y][x] = 4;
    }
    const tx = Math.floor(house.door.x / TILE);
    const ty = Math.floor(house.door.y / TILE);
    for (let y = ty; y <= Math.min(ROWS - 2, ty + 1); y++) {
      for (let x = Math.max(1, tx - 1); x <= Math.min(COLS - 2, tx + 1); x++) {
        if (map.grid[y][x] !== 2) map.grid[y][x] = 0;
      }
    }
    map.points.push(point(house.id, 'home', house.door.x, house.door.y, house.label,
      { homeId:house.id, npcId:house.npcId }));
  }

  const zone = id => Object.hasOwn(zones, id) ? zones[id] : zones.village;

  function remainingEnemies(map, world) {
    if (world.cleared[map.region]) return 0;
    const defeated = world.defeated[map.region] || [];
    return map.points.filter(point => point.kind === 'enemy' && !defeated.includes(point.enemyIndex)).length;
  }

  function bossVisible(map, world) {
    return !world.cleared[map.region] && remainingEnemies(map, world) === 0;
  }

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

  function dayCycle(now, world = {}) {
    const current = Number.isFinite(now) ? now : 0;
    const epoch = Number.isFinite(world.epoch) ? world.epoch : current;
    const elapsed = Math.max(0, current - epoch);
    const phaseMs = 22000;
    const dayMs = phaseMs * 4;
    const day = Math.floor(elapsed / dayMs);
    const withinDay = elapsed % dayMs;
    const index = Math.floor(withinDay / phaseMs);
    return { phase:['morning', 'afternoon', 'dusk', 'night'][index], index,
      label:['Manhã', 'Tarde', 'Entardecer', 'Noite'][index], progress:(withinDay % phaseMs) / phaseMs,
      elapsed, day, phaseMs, dayMs, isNight:index === 3, startsAt:epoch + day * dayMs + index * phaseMs };
  }

  const walkingGraphs = new Map();
  const routinePaths = new Map();
  const pathKey = (x, y) => x + ',' + y;

  function segmentClear(zoneId, from, to) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4));
    for (let i = 0; i <= steps; i++) {
      const amount = i / steps;
      if (!canStand(zoneId, from.x + (to.x - from.x) * amount, from.y + (to.y - from.y) * amount)) return false;
    }
    return true;
  }

  function walkingGraph(zoneId) {
    if (walkingGraphs.has(zoneId)) return walkingGraphs.get(zoneId);
    const graph = new Map();
    for (let y = 16; y < HEIGHT; y += 16) for (let x = 16; x < WIDTH; x += 16) {
      if (canStand(zoneId, x, y)) graph.set(pathKey(x, y), { x, y });
    }
    walkingGraphs.set(zoneId, graph);
    return graph;
  }

  function routinePath(zoneId, from, to) {
    const key = zoneId + ':' + pathKey(from.x, from.y) + ':' + pathKey(to.x, to.y);
    if (routinePaths.has(key)) return routinePaths.get(key);
    const graph = walkingGraph(zoneId);
    const nearest = endpoint => [...graph.values()]
      .sort((a, b) => Math.hypot(a.x - endpoint.x, a.y - endpoint.y) - Math.hypot(b.x - endpoint.x, b.y - endpoint.y))
      .find(candidate => segmentClear(zoneId, endpoint, candidate));
    const start = nearest(from);
    const finish = nearest(to);
    if (!start || !finish) throw new Error('Rotina sem caminho transitável em ' + zoneId);
    const startKey = pathKey(start.x, start.y);
    const finishKey = pathKey(finish.x, finish.y);
    const parents = new Map([[startKey, null]]);
    const todo = [startKey];
    for (let i = 0; i < todo.length && !parents.has(finishKey); i++) {
      const currentKey = todo[i];
      const current = graph.get(currentKey);
      for (const [dx, dy] of [[16,0],[0,16],[-16,0],[0,-16]]) {
        const nextKey = pathKey(current.x + dx, current.y + dy);
        const next = graph.get(nextKey);
        if (!next || parents.has(nextKey) || !segmentClear(zoneId, current, next)) continue;
        parents.set(nextKey, currentKey);
        todo.push(nextKey);
      }
    }
    if (!parents.has(finishKey)) throw new Error('A casa não possui acesso em ' + zoneId);
    const nodes = [];
    for (let cursor = finishKey; cursor !== null; cursor = parents.get(cursor)) nodes.push(graph.get(cursor));
    const points = [from, ...nodes.reverse(), to].filter((value, index, list) => index === 0
      || value.x !== list[index - 1].x || value.y !== list[index - 1].y);
    const lengths = points.slice(1).map((value, index) => Math.hypot(value.x - points[index].x, value.y - points[index].y));
    const path = { points, lengths, total:lengths.reduce((sum, length) => sum + length, 0) };
    routinePaths.set(key, path);
    return path;
  }

  function alongPath(zoneId, from, to, progress) {
    if (from.x === to.x && from.y === to.y) return { ...from, moving:false, facing:'down' };
    const path = routinePath(zoneId, from, to);
    let remaining = path.total * Math.max(0, Math.min(1, progress));
    for (let i = 0; i < path.lengths.length; i++) {
      const length = path.lengths[i];
      if (remaining > length && i < path.lengths.length - 1) { remaining -= length; continue; }
      const start = path.points[i];
      const end = path.points[i + 1];
      const amount = length ? Math.min(1, remaining / length) : 0;
      return { x:start.x + (end.x - start.x) * amount, y:start.y + (end.y - start.y) * amount,
        moving:progress > 0 && progress < 1, facing:facing(end.x - start.x, end.y - start.y, 'down') };
    }
    return { ...to, moving:false, facing:'down' };
  }

  function dailyPosition(zoneId, route, house, cycle) {
    const from = index => ({ x:route[index][0], y:route[index][1] });
    if (cycle.phase === 'night') return { ...house.door, moving:false, facing:'up', indoors:true, activity:'home' };
    if (cycle.phase === 'dusk') return { ...alongPath(zoneId, from(2), house.door, cycle.progress), indoors:false, activity:'returning' };
    const elapsed = cycle.progress * cycle.phaseMs;
    // A new campaign opens with the village awake. Subsequent mornings begin
    // at home, preserving continuity with the end of the previous night.
    if (cycle.phase === 'morning' && cycle.day > 0 && elapsed < 6500) {
      return { ...alongPath(zoneId, house.door, from(0), elapsed / 6500), indoors:false, activity:'working' };
    }
    const index = cycle.phase === 'morning' ? 0 : 1;
    return { ...alongPath(zoneId, from(index), from(index + 1), Math.max(0, (elapsed - 15500) / 6500)),
      indoors:false, activity:'working' };
  }

  function npcPositions(zoneId, now, world = {}) {
    const cycle = dayCycle(now, world);
    return HOUSES.filter(house => house.zone === zoneId).map(house => {
      const id = house.npcId;
      const npc = NPCS[id];
      const location = dailyPosition(zoneId, npc.route, house, cycle);
      return { ...point(id, 'npc', location.x, location.y, npc.fullName), ...location,
        name:npc.name, classKey:npc.look, homeId:house.id, appearance:{ ...npc.appearance } };
    });
  }

  function residentPositions(zoneId, now, world = {}) {
    if (zoneId !== 'village') return [];
    const cycle = dayCycle(now, world);
    return RESIDENTS.filter(resident => world.rescued?.includes(resident.name)
      || (resident.unlock === 'island' ? world.voyage?.cleared : world.cleared?.[resident.unlock])).map(resident => {
      const house = HOUSES.find(house => house.id === resident.homeId);
      const [x, y] = resident.at;
      const route = [[x,y], [x,y + 16], [x + 16,y + 16]];
      const location = dailyPosition(zoneId, route, house, cycle);
      return { ...point(resident.id, 'resident', location.x, location.y, resident.name), ...location,
        name:resident.name, classKey:resident.look, homeId:house.id, appearance:{ ...resident.appearance } };
    });
  }

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const facing = (dx, dy, current) => Math.abs(dx) > Math.abs(dy)
    ? (dx < 0 ? 'left' : 'right') : dy ? (dy < 0 ? 'up' : 'down') : current;

  return { TILE, COLS, ROWS, WIDTH, HEIGHT, SPEED, REGIONS, BRANCHES, NAMES, DUNGEONS, NPCS, HOUSES, RESIDENTS, zones, zone,
    dungeonId, canStand, walk, safePosition, npcPositions, residentPositions, dayCycle, distance, facing, remainingEnemies, bossVisible };
});
