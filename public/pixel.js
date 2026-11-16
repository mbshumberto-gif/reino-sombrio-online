/* Original indexed-palette artwork for Eldoria. All positions use world pixels. */
(() => {
  'use strict';

  const W = window.EldoriaWorld;
  const palettes = {
    village: ['#26493c','#365c45','#43704a','#658550','#a0855f','#bd9c6e','#d9bb82','#193446','#2a5870','#56a2a2'],
    forest: ['#17393b','#244c3e','#366347','#598252','#726a55','#958366','#b9a476','#122b40','#24526c','#42959a'],
    cave: ['#1d293a','#2e3d54','#40526b','#5d6882','#534f6c','#6e6a8e','#968ba7','#142841','#245371','#57aab5'],
    fire: ['#432b37','#5f3941','#78484b','#9e594f','#6d4647','#93615a','#bd8360','#552b43','#aa4549','#ec854d'],
    castle: ['#242d42','#353e53','#475066','#626782','#554f64','#72657d','#9c8a9a','#192b49','#354f73','#5d7897'],
    shadow: ['#282139','#392946','#4d3455','#694666','#4a375b','#655178','#907099','#211b38','#4e386b','#875793'],
    orchard: ['#294b41','#3c6548','#4e7a4d','#769457','#867050','#a6855b','#caac72','#19324a','#2b6779','#62b5a4']
  };
  const clothes = {
    warrior: ['#243952','#4e7293','#99b0be','#f1bd62'],
    mage: ['#3e2857','#6b4a8b','#a881c1','#e4bbf3'],
    sorceress: ['#3f254d','#8d4c79','#c974a8','#8af0d7'],
    cleric: ['#67504c','#a68667','#e8d5a3','#ffe199'],
    rogue: ['#2f3042','#4c5268','#8c7485','#ee786f'],
    bard: ['#562b4c','#9a4d72','#dc8b86','#f8cb7f'],
    paladin: ['#4d4255','#777b9d','#c8cad2','#ffd976'],
    ranger: ['#263e3c','#456549','#86a16a','#d6d78c'],
    monk: ['#5a3743','#9e5350','#d98160','#a3ded0'],
    druid: ['#243e36','#49764c','#9bbf70','#e7d394']
  };
  const cache = new Map();
  const followerPositions = new Map();
  let followerZone;
  const ink = '#152236';

  function rect(ctx, x, y, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), width, height);
  }

  function shape(ctx, x, y, rows, colors, scale = 2) {
    rows.forEach((row, dy) => {
      let start = 0;
      while (start < row.length) {
        const char = row[start];
        let end = start + 1;
        while (row[end] === char) end++;
        if (colors[char]) rect(ctx, x + start * scale, y + dy * scale, (end - start) * scale, scale, colors[char]);
        start = end;
      }
    });
  }

  function label(ctx, text, x, y, color = '#f7e5bd') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '16px VT323, monospace';
    const width = Math.ceil(ctx.measureText(text).width + 12);
    rect(ctx, x - width / 2, y - 8, width, 17, '#131e30e8');
    rect(ctx, x - width / 2, y + 8, width, 1, '#947657');
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(x), Math.round(y));
  }

  function tree(ctx, x, y, palette, appleTree = false, variant = 0) {
    const [, base, light, bright] = palette;
    rect(ctx, x - 24, y - 16, 50, 8, '#182d32');
    rect(ctx, x - 17, y - 20, 37, 7, '#20373a');
    shape(ctx, x - 28, y - 44, [
      '.........oooooo.............','......oooccccccooo..........','....oocccchhhhcccco.........',
      '...occhhhhccchhhcccoo.......','..occhhcccchhhhcccccoco.....','.occccchhcccccccccccccco....',
      '.occhhhhccchhcccchhhcccco...','occhhhccccccccchhhhcccccbo..','occhhccccchhccchhhccccccbo..',
      'occcccccchhccchhccccccccbbo.','occcchhccccccccccccbbbbbbo..','.obcccccccccccccbboooobbo...',
      '..oobbccccbbboocbooooooo....','....oooooooo...ooo..........','............ttto............',
      '...........otjto............','...........otjto............','..........ootjtoo...........',
      '.........ottotooto..........','.........ooto..oto..........'
    ], { o: '#1a2e35', b: base, c: light, h: bright, t: '#5e433f', j: '#aa7754' });
    if (appleTree) {
      for (const [dx, dy] of [[-18,-31],[1,-38],[13,-21],[-5,-16],[23,-26]]) apple(ctx, x + dx, y + dy, 1);
    } else if (variant % 3 === 0) {
      for (const [dx, dy] of [[-9,-34],[17,-30],[-18,-18]]) rect(ctx, x + dx, y + dy, 4, 3, '#bd9366');
    }
  }

  function apple(ctx, x, y, size = 2) {
    shape(ctx, x - 3 * size, y - 5 * size, ['...l..','..tl..','.rrr..','rhrdr.','rrrdr.','.rdd..'],
      { l:'#acd27f', t:'#564836', r:'#cd6257', h:'#ffe39b', d:'#8b3b4c' }, size);
  }

  function stone(ctx, x, y, palette, crystal) {
    const [a,b,c,d] = palette;
    rect(ctx, x - 11, y + 4, 25, 6, a);
    if (crystal) {
      shape(ctx, x - 11, y - 24, ['.....h......','....hch.....','....hcc.....','...hccd..h..',
        '..hccdd.hh..','..hccdd.hcd.','.hccddd.hcd.','..cddddcddd.','...dddddd...','...oooooo...'],
      { o: '#24334a', h: '#b6e9d0', c: '#629db0', d: '#48698d' });
      return;
    }
    shape(ctx, x - 12, y - 12, ['..ooddo....','.odcddoo...','odccddddo..','occbdddbbo.',
      'obddddbbbo.','.obbbbbboo.','..oooooo...'], { o:a, b, c:d, d:c });
  }

  function flower(ctx, x, y, index) {
    const colors = ['#f1bd7d', '#b89bd1', '#e3dcaa', '#d88c87'];
    const color = colors[index % colors.length];
    rect(ctx, x, y, 2, 6, '#75915a');
    rect(ctx, x - 2, y, 6, 2, color);
    rect(ctx, x, y - 2, 2, 6, color);
    rect(ctx, x, y, 2, 2, '#f9df91');
  }

  function house(ctx, home, night) {
    const { x, y, width, height, door } = home;
    const roof = { chronicler:['#715479','#957394'], blacksmith:['#526382','#7f8a9c'],
      healer:['#a46d5c','#c59578'], villager:['#637b62','#93a174'], lia:['#8b6859','#b28d6c'] }[home.npcId] || ['#87514e','#ce8465'];
    const roofHeight = Math.round(height * 0.5);
    rect(ctx, x + 3, y + height - 2, width - 6, 5, '#1a2e34');
    rect(ctx, x + 4, y + roofHeight - 5, width - 8, height - roofHeight + 5, '#b39473');
    rect(ctx, x + 4, y + height - 10, width - 8, 10, '#836757');
    for (let k = 0; k < 6; k++) {
      const inset = Math.round((5 - k) * width / 19);
      const yy = y + Math.round(k * roofHeight / 6);
      rect(ctx, x + inset, yy, width - inset * 2, Math.ceil(roofHeight / 6) + 1, roof[k % 2]);
      for (let xx = x + inset + 6; xx < x + width - inset - 4; xx += 17) rect(ctx, xx, yy + 2, 10, 2, roof[1]);
    }
    rect(ctx, x, y + roofHeight - 2, width, 5, '#51414a');
    for (const xx of [x + 10, x + width - 15]) rect(ctx, xx, y + roofHeight + 3, 4, height - roofHeight - 4, '#72594d');
    const doorHeight = Math.min(32, height - roofHeight - 2);
    rect(ctx, door.x - 13, y + height - doorHeight, 26, doorHeight, '#352a37');
    rect(ctx, door.x - 9, y + height - doorHeight + 2, 18, doorHeight - 2, '#725244');
    rect(ctx, door.x + 5, y + height - 14, 3, 4, '#e4bd76');
    rect(ctx, door.x - 17, y + height + 1, 34, 6, '#b29b7b');
    for (const xx of [x + 25, x + width - 41]) {
      if (night) rect(ctx, xx - 7, y + height - 32, 30, 29, '#f2c1741d');
      rect(ctx, xx - 2, y + height - 27, 20, 18, '#51434c');
      rect(ctx, xx + 1, y + height - 24, 14, 12, night ? '#ffd78a' : '#9cb6b4');
      rect(ctx, xx + 6, y + height - 25, 2, 15, '#6b5349');
      rect(ctx, xx, y + height - 19, 16, 2, '#6b5349');
    }
    label(ctx, home.label, x + width / 2, y + roofHeight - 11, '#ead6b3');
  }

  function royalCastle(ctx, castle, state, night) {
    const { x, y, width, height, door } = castle;
    const open = !!state.world.cleared.shadow;
    const bottom = y + height;
    rect(ctx, x + 4, bottom - 5, width - 8, 9, '#52635b');
    rect(ctx, x + 38, y + 26, width - 76, height - 26, '#b3b6b0');
    for (let row = 0; row < 5; row++) {
      const yy = y + 30 + row * 13;
      rect(ctx, x + 43, yy, width - 86, 2, '#8e9695');
      for (let xx = x + 52 + row % 2 * 14; xx < x + width - 42; xx += 29) rect(ctx, xx, yy + 2, 2, 11, '#929b96');
    }
    for (const xx of [x, x + width - 48]) {
      rect(ctx, xx + 2, y + 10, 44, height - 10, '#8a9698');
      rect(ctx, xx + 6, y + 12, 36, height - 14, '#c7c9bd');
      rect(ctx, xx + 7, y + 12, 5, height - 17, '#e2dcc5');
      for (let row = 1; row < 7; row++) {
        const yy = y + 13 + row * 11;
        rect(ctx, xx + 5, yy, 38, 2, '#9da5a2');
        rect(ctx, xx + 17 + row % 2 * 9, yy + 2, 2, 9, '#adb4ac');
      }
      rect(ctx, xx, y + 9, 48, 7, '#e0d9c5');
      for (const tooth of [0,16,32]) {
        rect(ctx, xx + tooth, y, 12, 12, '#d9d5c4');
        rect(ctx, xx + tooth, y, 12, 3, '#ede3c9');
      }
      rect(ctx, xx + 18, y + 24, 12, 22, '#4c5365');
      rect(ctx, xx + 20, y + 27, 8, 16, night || open ? '#f2c98a' : '#8fa5af');
      rect(ctx, xx + 23, y + 27, 2, 17, '#6e747b');
      rect(ctx, xx + 14, y + 55, 20, 30, '#94657f');
      rect(ctx, xx + 16, y + 57, 16, 25, '#cf98ac');
      shape(ctx, xx + 18, y + 62, ['g...g','.ggg.','..g..'], { g:'#f4d78b' }, 2);
      rect(ctx, xx + 13, y + 53, 22, 3, '#d5bd80');
    }
    for (let xx = x + 55; xx < x + width - 51; xx += 25) {
      rect(ctx, xx, y + 17, 15, 12, '#d8d4c2');
      rect(ctx, xx, y + 17, 15, 3, '#eee2ca');
    }
    rect(ctx, door.x - 28, bottom - 44, 56, 44, '#777e87');
    rect(ctx, door.x - 21, bottom - 51, 42, 10, '#cbd0c4');
    rect(ctx, door.x - 25, bottom - 43, 50, 43, '#d5d4c3');
    rect(ctx, door.x - 18, bottom - 40, 36, 40, open ? '#694758' : '#394151');
    if (open) {
      rect(ctx, door.x - 14, bottom - 35, 28, 34, '#d6b386');
      rect(ctx, door.x - 10, bottom - 20, 20, 23, '#b27990');
      rect(ctx, door.x - 18, bottom - 40, 36, 5, '#65717b');
    } else {
      for (let dx = -14; dx <= 14; dx += 7) rect(ctx, door.x + dx, bottom - 39, 3, 39, '#929a9b');
      rect(ctx, door.x - 18, bottom - 25, 36, 4, '#aeb6ad');
      rect(ctx, door.x - 5, bottom - 22, 10, 11, '#d2b77a');
      rect(ctx, door.x - 1, bottom - 18, 3, 5, '#6c5058');
    }
    rect(ctx, door.x - 25, bottom + 1, 50, 7, '#c9c0a8');
    rect(ctx, door.x - 21, bottom + 8, 42, 6, '#a9aaa0');
    label(ctx, 'Castelinho de Maria Rita', door.x, y + 40, '#f1d7ab');
  }

  function royalHall(ctx, map) {
    for (const [row, tiles] of map.grid.entries()) for (const [col, tile] of tiles.entries()) {
      const x = col * W.TILE, y = row * W.TILE;
      const floor = tile === 0 || tile === 2;
      rect(ctx, x, y, 32, 32, floor ? (col + row) % 2 ? '#bcb0a0' : '#c9bdab' : '#6f6c7b');
      if (floor) {
        rect(ctx, x, y, 32, 2, '#d4cbbb');
        rect(ctx, x, y, 2, 32, '#ada395');
        if ((col * 3 + row) % 5 === 0) rect(ctx, x + 13, y + 13, 5, 5, '#b2a48f');
      } else {
        rect(ctx, x + 2, y + 3, 28, 22, '#95919a');
        rect(ctx, x + 2, y + 3, 28, 4, '#bdb5b0');
        rect(ctx, x + 15, y + 7, 2, 19, '#7c7b8a');
      }
    }
    rect(ctx, 416, 176, 128, 336, '#9f627d');
    rect(ctx, 421, 176, 118, 336, '#c487a2');
    for (const x of [422,534]) rect(ctx, x, 176, 4, 336, '#e2c991');
    for (let y = 190; y < 500; y += 31) {
      shape(ctx, 474, y, ['..g..','.g.g.','g...g','.g.g.','..g..'], { g:'#edd9b0' }, 2);
    }
    // Framed mural, rather than a second princess NPC.
    rect(ctx, 433, 43, 94, 87, '#5e465d');
    rect(ctx, 438, 48, 84, 77, '#d5bb84');
    rect(ctx, 442, 52, 76, 69, '#94758b');
    rect(ctx, 449, 59, 62, 55, '#b6a2a5');
    princess(ctx, { x:480, y:113, name:'Maria Rita' }, 0, { nickname:false, scale:2.2 });
    label(ctx, 'Maria Rita', 480, 132, '#f3dca8');
    rect(ctx, 446, 140, 68, 35, '#75566b');
    rect(ctx, 451, 140, 58, 31, '#cb9dac');
    rect(ctx, 446, 169, 68, 8, '#9d7085');
    for (const x of [442,510]) {
      rect(ctx, x, 150, 8, 32, '#d7bb80');
      rect(ctx, x - 2, 145, 12, 8, '#eee0aa');
    }
    for (const x of [47,881]) {
      rect(ctx, x, 124, 31, 78, '#93637e');
      rect(ctx, x + 3, 127, 25, 70, '#cc98ad');
      shape(ctx, x + 5, 140, ['g...g','.ggg.','..g..'], { g:'#f3d590' }, 4);
      rect(ctx, x - 3, 121, 37, 5, '#dfc99b');
      rect(ctx, x + 5, 227, 21, 31, '#5f6073');
      rect(ctx, x + 8, 230, 15, 25, '#f6d29d');
      rect(ctx, x + 14, 231, 3, 23, '#bdac8e');
    }
  }

  function water(ctx, x, y, time, palette, lava = false) {
    rect(ctx, x, y, 32, 32, palette[7]);
    rect(ctx, x + 2, y + 2, 28, 28, palette[8]);
    for (let n = 0; n < 4; n++) {
      const shift = (Math.floor(time / 240) + n * 7 + x / 8) % 19;
      rect(ctx, x + 3 + shift, y + n * 7 + 3, n % 2 ? 5 : 9, 2, palette[9]);
    }
    if (lava) rect(ctx, x + 6, y + 16, 5, 3, '#ffbd6a');
  }

  function pathEdge(ctx, map, tile, x, y, palette) {
    const px = x * W.TILE;
    const py = y * W.TILE;
    if (tile !== 2) return;
    if (map.grid[y - 1]?.[x] !== 2) rect(ctx, px, py, 32, 3, palette[4]);
    if (map.grid[y + 1]?.[x] !== 2) rect(ctx, px, py + 29, 32, 3, palette[4]);
    if (map.grid[y]?.[x - 1] !== 2) rect(ctx, px, py, 3, 32, palette[4]);
    if (map.grid[y]?.[x + 1] !== 2) rect(ctx, px + 29, py, 3, 32, palette[4]);
  }

  function grass(ctx, x, y, palette, n) {
    rect(ctx, x - 3, y, 8, 2, palette[0]);
    rect(ctx, x - 3, y - 3, 2, 3, palette[3]);
    rect(ctx, x, y - 5 - n % 2, 2, 6, palette[3]);
    rect(ctx, x + 3, y - 2, 2, 3, palette[2]);
  }

  function fountain(ctx, x, y, time) {
    shape(ctx, x - 26, y - 17, [
      '.....ooooooo.....','...oootttttooo...','..ootbccccbtoo...','.ottbccbbccbtto..',
      '.otbccbbccccbto..','.otbcccccbbcbto..','..otbbbcccbbto...','...oottbttoo.....','....ooooooo......'
    ], { o:'#374353', t:'#a2989c', b:'#4e8293', c:'#64b3b6' }, 3);
    const wave = Math.floor(time / 190) % 7;
    rect(ctx, x - 3, y - 17, 6, 22, '#6195aa');
    rect(ctx, x - 1, y - 23 + wave, 2, 8, '#c0dad2');
    rect(ctx, x - 10 + wave, y + 1, 8, 2, '#d0e6cd');
    rect(ctx, x + 9 - wave, y - 4, 5, 2, '#b3dcd5');
  }

  function mapPalette(map) {
    return palettes[map.id === 'orchard' ? 'orchard' : map.region] || palettes.village;
  }

  function baseMap(map) {
    const canvas = document.createElement('canvas');
    canvas.width = W.WIDTH;
    canvas.height = W.HEIGHT;
    const ctx = canvas.getContext('2d');
    const palette = mapPalette(map);
    if (map.id === 'royal-castle') {
      royalHall(ctx, map);
      return { canvas, animatedWater:[] };
    }
    if (map.id === 'boat') {
      rect(ctx, 0, 0, W.WIDTH, W.HEIGHT, '#183e58');
      for (let i = 0; i < 22; i++) rect(ctx, i * 47 % W.WIDTH, 18 + i * 83 % W.HEIGHT, 44, 3, '#2d657b');
      rect(ctx, 112, 116, 736, 405, '#382d35');
      rect(ctx, 122, 124, 716, 389, '#684a3f');
      rect(ctx, 128, 128, 704, 384, '#ae8054');
      for (let y = 128; y < 512; y += 24) {
        rect(ctx, 128, y, 704, 3, '#6a4c43');
        for (let x = 142 + (y / 24 % 2) * 40; x < 820; x += 94) rect(ctx, x, y + 3, 2, 20, '#886242');
      }
      for (const y of [118,515]) {
        rect(ctx, 112, y, 736, 6, '#d8b77d');
        for (let x = 118; x < 849; x += 55) rect(ctx, x, y - 8, 5, 19, '#735144');
      }
      rect(ctx, 506, 137, 10, 103, '#513b3a');
      rect(ctx, 486, 135, 50, 6, '#d7be8c');
      shape(ctx, 521, 145, ['tttttttttttt','ttttttttttt.','tbbbbbbbbt..','tbbbbbbbt...','tbbbbbbt....','ttttttt.....'],
        { t:'#ead9ad', b:'#bba984' }, 7);
      rect(ctx, 728, 405, 65, 42, '#594446');
      rect(ctx, 732, 402, 57, 5, '#d2a86e');
      label(ctx, 'AS SETE LANTERNAS', 481, 489, '#f4d49b');
      return { canvas, animatedWater:[] };
    }
    const meadow = ['village', 'forest'].includes(map.region) && map.kind !== 'dungeon';
    const obstacles = [];
    const animatedWater = [];
    for (const [y, row] of map.grid.entries()) {
      for (const [x, tile] of row.entries()) {
        const px = x * W.TILE;
        const py = y * W.TILE;
        const seed = (x * 79 + y * 51 + x * y * 13) % 37;
        rect(ctx, px, py, 32, 32, tile === 2 ? palette[5] : tile === 3 ? palette[8]
          : map.id === 'island' && (x < 5 || x > 24 || y < 4 || y > 14) ? '#b9a376' : palette[1]);
        if (tile === 0 && seed % 8 < 3) {
          rect(ctx, px + 1 + seed % 6, py + 3, 15, 11, palette[2] + '58');
          rect(ctx, px + 9, py + 10, 17, 8, palette[2] + '45');
        }
        pathEdge(ctx, map, tile, x, y, palette);
        if (tile === 2) {
          rect(ctx, px + 4 + seed % 15, py + 7, 5, 2, palette[6]);
          rect(ctx, px + 6 + seed % 18, py + 23, 4, 2, palette[4]);
          if (map.kind === 'dungeon' || ['castle','shadow'].includes(map.region)) {
            rect(ctx, px, py, 32, 2, palette[4]);
            rect(ctx, px + (y % 2 ? 15 : 0), py, 2, 32, palette[4]);
          }
        } else if (tile === 3) {
          animatedWater.push([px,py]);
          water(ctx, px, py, 0, palette, map.region === 'fire');
        } else if (tile === 0) {
          rect(ctx, px + 4 + seed % 19, py + 5 + seed % 16, 3 + seed % 5, 2, palette[2]);
          rect(ctx, px + 11 + seed % 9, py + 22, 2, 4, palette[0]);
          if (meadow && seed % 4 === 0) grass(ctx, px + 12, py + 19, palette, seed);
          if (meadow && seed % 7 === 0) flower(ctx, px + 8, py + 10, seed);
          if (meadow && seed % 9 === 0) flower(ctx, px + 20, py + 19, seed + 1);
          if (!meadow && seed % 8 === 0) rect(ctx, px + 6, py + 11, 8, 2, palette[3]);
        } else if (tile === 1 && meadow) {
          obstacles.push(() => tree(ctx, px + 16 + seed % 9, py + 27, palette, false, seed));
        } else if (tile === 1 || tile === 5) {
          if (map.kind === 'dungeon' && tile === 5 && seed % 4) {
            rect(ctx, px, py, 32, 32, palette[0]);
            rect(ctx, px + 1, py + 5, 30, 18, palette[1]);
            rect(ctx, px + 1, py + 4, 30, 3, palette[2]);
            rect(ctx, px + 14, py + 7, 2, 16, palette[0]);
          } else obstacles.push(() => stone(ctx, px + 16, py + 21, palette, map.region === 'cave' && seed % 3 !== 0));
        } else if (map.id !== 'village') {
          rect(ctx, px, py, 32, 32, palette[0]);
          rect(ctx, px + 2, py + 3, 28, 15, palette[2]);
          rect(ctx, px + 2, py + 21, 28, 9, palette[1]);
        }
      }
    }
    obstacles.forEach(draw => draw());
    if (map.id === 'village') {
      for (const px of [288, 321, 602, 640]) flower(ctx, px, 397, px);
    }
    if (map.kind === 'branch') {
      for (const px of [398, 432, 568, 601]) {
        rect(ctx, px, 144, 10, 26, palette[4]);
        rect(ctx, px - 3, 142, 16, 4, palette[6]);
      }
    }
    return { canvas, animatedWater };
  }

  function prop(ctx, p, map, state, time) {
    const { x, y } = p;
    if (p.id === 'royal-castle-gate' && map.id === 'village') return;
    if (p.kind === 'royalMemory') {
      rect(ctx, x - 16, y - 4, 32, 10, '#725c70');
      rect(ctx, x - 11, y - 15, 22, 15, '#eed5aa');
      rect(ctx, x - 10, y - 14, 9, 12, '#d1a2ad');
      rect(ctx, x + 1, y - 14, 9, 12, '#b67e99');
      rect(ctx, x - 1, y - 14, 2, 14, '#d9ba83');
      return;
    }
    if (p.kind === 'liaRescue') {
      liaEcho(ctx, { x, y, classKey:'rogue', facing:'down', appearance:W.NPCS.lia?.appearance }, time,
        { nickname:false, scale:1.9 });
      for (const [dx, dy, width] of [[-25,-4,49],[-19,-18,38],[-13,-31,27]]) {
        rect(ctx, x + dx, y + dy, width, 3, '#5d879e');
        rect(ctx, x + dx + 5, y + dy - 3, Math.max(3,width - 10), 2, '#a3cee0');
      }
      shape(ctx, x - 8, y - 7, ['..ll....','..lll...','.lllll..','...t....','...t....'],
        { l:'#b6dba7', t:'#659d95' }, 2);
      label(ctx, 'Libertar Eco de Lia', x, y - 58, '#c1dfd9');
      return;
    }
    if (p.kind === 'memorial') {
      rect(ctx, x - 20, y - 2, 40, 9, '#42515a');
      rect(ctx, x - 14, y - 24, 28, 27, '#7c8790');
      rect(ctx, x - 11, y - 28, 22, 6, '#a5b2ac');
      shape(ctx, x - 7, y - 22, ['...ll..','..lll..','.lll...','..t....'],
        { l:'#c1d7a0', t:'#e4d5a1' }, 2);
      for (const side of [-1,1]) flower(ctx, x + side * 23, y + 2, 2);
      label(ctx, 'Memorial dos Ecos', x, y - 43, '#d7d7b9');
      return;
    }
    if (p.kind === 'tree') {
      tree(ctx, x, y, mapPalette(map), true);
      const fruit = state.fruit.find(candidate => candidate.id === p.id && !candidate.claimed && candidate.expires > time);
      if (fruit) {
        const elapsed = Math.max(0, time - fruit.at);
        const drop = Math.min(1, elapsed / 700);
        rect(ctx, x + 8, y + 13, 16, 4, '#202d32');
        apple(ctx, x + Math.min(15, elapsed / 44), y - 37 + drop * drop * 49);
      }
      return;
    }
    if (p.kind === 'secret') {
      const active = p.id === 'dawn-sword' ? state.self.owned.includes('dawnBlade') : state.world.opened.includes(p.id);
      const shimmer = Math.floor(time / 140) % 9;
      rect(ctx, x - 23, y + 4, 46, 7, '#17233785');
      if (p.id === 'dawn-sword') {
        shape(ctx, x - 20, y - 16, ['...tttt...','..ttbbtt..','.tbbbbbbt.','tbbbddbbbt','bbbbddbbbb','.dddddddd.'],
          { t:'#a6a2a9', b:'#68677b', d:'#44475a' }, 4);
        if (!active) {
          rect(ctx, x - 2, y - 34, 5, 23, '#dbedf2');
          rect(ctx, x + 1, y - 34, 2, 23, '#8eacbf');
          rect(ctx, x - 8, y - 35, 17, 4, '#f4bf67');
          rect(ctx, x - 2, y - 44, 5, 9, '#803f50');
          rect(ctx, x - 3, y - 46, 7, 3, '#f4bf67');
        }
      } else if (p.id === 'echo-bell') {
        rect(ctx, x - 17, y - 32, 5, 39, '#684b43');
        rect(ctx, x + 12, y - 32, 5, 39, '#684b43');
        rect(ctx, x - 19, y - 38, 38, 7, '#be8362');
        const swing = active ? Math.round(Math.sin(time / 130) * 2) : 0;
        shape(ctx, x - 10 + swing, y - 30, ['...tt...','..tbbt..','..tbbt..','.ttbbtt.','tttttttt','...bb...'],
          { t:'#f2c67c', b:'#a86a46' }, 3);
      } else if (p.id === 'wishing-well') {
        rect(ctx, x - 20, y - 12, 40, 20, '#66677d');
        rect(ctx, x - 18, y - 17, 36, 10, '#a99aa4');
        rect(ctx, x - 13, y - 14, 26, 7, '#28506d');
        rect(ctx, x - 11 + shimmer, y - 12, 13, 2, '#7ecfc4');
        rect(ctx, x - 19, y - 8, 38, 2, '#858197');
      } else {
        shape(ctx, x - 15, y - 35, ['....t....','...ttt...','..thht...','..thht.t.','.tthtttt.','ttttbttt.','.bbbbb...'],
          { t:'#64acc8', h:active ? '#e8ffce' : '#c0efff', b:'#46506f' }, 4);
      }
      if ((!active || p.id !== 'dawn-sword') && shimmer < 6) {
        const sparkY = y - 46 - shimmer * 2;
        rect(ctx, x + 12, sparkY, 9, 2, '#ffe2a0');
        rect(ctx, x + 15, sparkY - 3, 2, 8, '#ffe2a0');
      }
      return;
    }
    if (p.kind === 'portal') {
      const shut = p.requires && !state.world.cleared[p.requires] || p.shortcut && !state.world.orchardOpen
        || p.requiresVoyage && !['deck-raider-0','deck-raider-1'].every(id => state.world.voyage?.defeated?.includes(id))
        || p.requiresRoom !== undefined && !state.world.rooms[map.region]?.includes(p.requiresRoom);
      const wall = map.kind === 'dungeon' || p.dungeon || p.shortcut ? '#8a8b9f' : '#ab9775';
      rect(ctx, x - 23, y - 5, 46, 16, '#152537');
      if (p.dungeon) {
        rect(ctx, x - 33, y - 16, 12, 24, '#4b5869');
        rect(ctx, x + 21, y - 16, 12, 24, '#4b5869');
        rect(ctx, x - 28, y - 34, 56, 10, '#5c6879');
        rect(ctx, x - 26, y - 36, 52, 4, '#9299a0');
      }
      rect(ctx, x - 16, y - 28, 32, 34, '#263349');
      rect(ctx, x - 20, y - 22, 7, 34, wall);
      rect(ctx, x + 13, y - 22, 7, 34, wall);
      rect(ctx, x - 17, y - 30, 34, 8, wall);
      rect(ctx, x - 12, y - 34, 24, 5, '#dbbf92');
      rect(ctx, x - 16, y - 10, 8, 3, '#574b60');
      rect(ctx, x + 9, y - 10, 8, 3, '#574b60');
      if (shut) {
        for (let n = -9; n <= 9; n += 6) rect(ctx, x + n, y - 21, 3, 27, '#a46161');
        rect(ctx, x - 11, y - 2, 22, 3, '#b88272');
      } else {
        rect(ctx, x - 9, y - 9 + Math.floor(time / 180) % 6, 18, 2, '#91b9b3');
        rect(ctx, x - 12, y + 6, 24, 4, '#bcb391');
      }
      return;
    }
    if (p.kind === 'captive') {
      prison(ctx, x, y, time, !!state.world.voyage?.cleared, ['Marina', 'Caio']);
      return;
    }
    if (p.kind === 'chest') {
      const open = state.world.opened.includes(p.id);
      rect(ctx, x - 14, y + 4, 28, 6, '#192c36');
      rect(ctx, x - 12, y - 10, 24, 16, open ? '#52454e' : '#815650');
      rect(ctx, x - 14, y - 11, 28, 5, open ? '#63576a' : '#b78154');
      rect(ctx, x - 3, y - 7, 6, 7, open ? '#796955' : '#f0c57c');
      return;
    }
    if (p.kind === 'camp') {
      rect(ctx, x - 19, y - 1, 38, 8, '#293748');
      for (const offset of [-16,-10,7,13]) {
        rect(ctx, x + offset, y - 4 + (offset % 3), 8, 7, '#716c79');
        rect(ctx, x + offset, y - 4 + (offset % 3), 5, 2, '#a39998');
      }
      const spark = Math.floor(time / 120) % 5;
      shape(ctx, x - 9, y - 20 + spark % 3, ['...f.....','...ff....','..fff.f..','.ffffff..',
        '.ffcffff.','ffccffcf.','ffcccccf.','.fccccf..','..oooo...'],
        { f:'#d5825d', c:'#f6cd81', o:'#63404b' }, 2);
      rect(ctx, x + spark - 4, y - 26 - spark, 2, 2, '#fae0a0');
    } else if (p.kind === 'clue' && p.id === 'spirit') {
      rect(ctx, x - 21, y - 4, 42, 13, '#49485c');
      rect(ctx, x - 18, y - 11, 36, 8, '#9186a2');
      rect(ctx, x - 12, y - 19, 24, 7, '#5e5973');
      lume(ctx, x, y - 30, time, true);
    } else if (p.kind === 'lamp') {
      rect(ctx, x - 5, y - 2, 10, 6, '#493d4c');
      rect(ctx, x - 2, y - 24, 4, 23, '#80624c');
      rect(ctx, x - 6, y - 29, 12, 11, '#633a47');
      const lit = state.world.lamps.includes(p.id);
      if (lit) {
        rect(ctx, x - 12, y - 32, 24, 24, '#e9a86f38');
        rect(ctx, x - 8, y - 29, 16, 16, '#f3ca8e48');
      }
      rect(ctx, x - 4, y - 27, 8, 7, lit ? '#ffe2a0' : '#85666c');
      rect(ctx, x - 5, y - 31, 10, 3, '#ad8766');
    } else if (p.kind === 'puzzle' || p.kind === 'clue') {
      rect(ctx, x - 14, y, 28, 6, '#242c3b');
      rect(ctx, x - 11, y - 24, 22, 27, '#675e76');
      rect(ctx, x - 7, y - 21, 15, 21, '#9b93aa');
      for (let i = 0; i < 3; i++) {
        rect(ctx, x - 4, y - 17 + i * 5, 9 - i * 2, 2, '#4f4768');
        rect(ctx, x + i, y - 18 + i * 5, 2, 4, '#d3b583');
      }
    }
  }

  const commonBody = [
    '...............','...............','...............','...............',
    '.....ooooo.....','....ohhhho.....','....ohhhho.....','....osssso.....',
    '....oseeso.....','...obsssaao....','..obbbbbbbo....','..obbtbbtbo....',
    '..obbtbbtbo....','..osbttbbso....','...oddodd......','...oddodd......','...oo.oo.......'
  ];
  const headwear = {
    warrior:['.....oao.......','....oaao.......','...oaaaaao.....','...oddaddo.....','....ottdo......'],
    mage:['........o......','.......obo.....','......obbo.....','.....obtbo.....','..oobttbbbooo..','..ooooooooooo..'],
    sorceress:['......ao.......','.....oabo......','....oabbbo.....','...oabbbtbo....','...oabbtooo....','...oboo..ob....','...o.....ob....'],
    cleric:['......ao.......','.....oaao......','....otaato.....','....otatoo.....','....oaoaoo.....'],
    rogue:['...............','.....oooo......','....obbbbo.....','...obbdddbo....','...oboooooo....','...oo.....o....'],
    bard:['......aa.......','.....aao.......','....oabbo......','..oobbbbboo....','...ooooooo.....'],
    paladin:['...a......a....','...oa.oo.ao....','....oaaaao.....','....oattao.....','....odddoo.....'],
    ranger:['.......a.......','......aa.......','.....aooo......','...ooobbooo....','..oobbbbbboo...','...oooooooo....'],
    monk:['...............','......oo.......','....oooooo.....','....ohhhho.....','...aataata.....','...o......a....'],
    druid:['...a.....a.....','...oa...ao.....','....oaaao......','...obtttbo.....','..oobbbbboo....','...ooooooo.....']
  };
  const naturalHair = {
    curly:['...............','...............','....hhhhh......','...hkhhkhh.....','..hhkhhkhhh....',
      '..hkhhhkhkh....','...hhhhhhh.....','...hh....hh....','...kh....hk....','....h....h.....'],
    short:['...............','...............','.....hhhhh.....','....hhhhhhh....','....hkhhhkh....',
      '....hhhhhhh....','....hh...hh....'],
    braids:['...............','...............','....hhhhhhh....','...hkhkhkhkh...','...hhhhhhhhh...',
      '...hhhhhhhhh...','...hh.....hh...','...kh.....hk...','...hk.....kh...','...kh.....hk...',
      '...hk.....kh...','...kh.....hk...','...hk.....kh...','....a.....a....']
  };

  function weapon(ctx, id, key, x, y, palette, scale, swinging) {
    const t = swinging ? -3 * scale : 0;
    const look = id === 'oakStaff' ? 'staff' : id === 'eclipseEdge' ? 'eclipse' : id ? 'sword' : key;
    const cs = { o: ink, t: id === 'dawnBlade' ? '#eab66d' : palette[2], a: palette[3], b: '#9b654a', d: palette[0], e: '#eff6db' };
    const icons = {
      sword:['...oe','..oet','..oto','.oto.','oao..','.bo..','bo...'],
      eclipse:['...ea','..ata','.atao','atao.','tao..','ao...','b....'],
      staff:['.ao..','aea..','.ato.','..bo.','..bo.','..bo.','..bo.','..bo.'],
      mage:['.ao..','aea..','.ato.','..bo.','..bo.','..bo.','..bo.','..bo.'],
      druid:['aa.aa','ataat','.aba.','..bo.','..bo.','..bo.','..bo.','..bo.'],
      sorceress:['.aa..','aeea.','aeta.','.aa..','..o..'],
      warrior:['...oe','..oet','..oto','.oto.','oao..','.bo..','bo...'],
      cleric:['.odo.','otato','.ota.','..bo.','..bo.','..bo.'],
      rogue:['...e.','..et.','.et..','ta...','.bo..','...e.','..ta.'],
      bard:['...bo','..bo.','..bo.','.ato.','aetao','attbo','.abo.'],
      paladin:['.ooo.','otato','otaao','.obo.','..bo.','..bo.'],
      ranger:['..bb.','..aob','..a.b','..a.b','..aob','..bb.'],
      monk:['.ata.','aataa','atoao','.ooo.']
    };
    shape(ctx, x, y + t, icons[look] || icons.sword, cs, scale);
  }

  function hero(ctx, entry, time, { nickname = true, scale = 2, attacking = false } = {}) {
    if (entry.classKey === 'princess') return princess(ctx, entry, time, { nickname, scale });
    const key = clothes[entry.classKey] ? entry.classKey : 'warrior';
    const palette = entry.appearance?.echo ? ['#253f43','#4c7973','#a5c8a3','#e3e8b6'] : clothes[key];
    const [dark, main, light, accent] = palette;
    const step = entry.moving ? Math.floor(time / 125) % 4 : 0;
    const x = Math.round(entry.x);
    const y = Math.round(entry.y);
    const up = entry.facing === 'up';
    const left = entry.facing === 'left';
    rect(ctx, x - 6 * scale, y - 2, 12 * scale, 3 * scale, '#1626309e');
    ctx.save();
    ctx.translate(x, y - (step % 2) * scale - (attacking ? scale : 0));
    if (left) ctx.scale(-1, 1);
    if (!entry.online && entry.online !== undefined) ctx.globalAlpha = 0.5;
    if (entry.hp === 0) ctx.globalAlpha *= 0.55;
    const appearance = entry.appearance || {};
    const skin = appearance.skin || (appearance.skinTone === 'deep' ? '#8f573f' : '#e8a67d');
    const hair = appearance.hair ? '#2e2228' : key === 'cleric' ? '#c5955f' : '#67445a';
    const cs = { o: ink, h: hair, k:'#5a3e3c', s: up ? hair : skin,
      e: up ? '#664557' : '#382c40', a: accent, b: main, d: dark, t: light };
    shape(ctx, -7 * scale, -17 * scale, commonBody, cs, scale);
    shape(ctx, -7 * scale, -18 * scale, naturalHair[appearance.hair] || headwear[key], cs, scale);
    if (key === 'warrior' || key === 'paladin') {
      rect(ctx, -6 * scale, -8 * scale, 4 * scale, 3 * scale, light);
      rect(ctx, 4 * scale, -8 * scale, 3 * scale, 3 * scale, light);
    }
    if (key === 'mage' || key === 'sorceress' || key === 'druid') {
      rect(ctx, -5 * scale, -4 * scale, 11 * scale, 3 * scale, dark);
      rect(ctx, -2 * scale, -5 * scale, 4 * scale, 4 * scale, main);
    }
    if (key === 'monk') rect(ctx, -7 * scale, -6 * scale, 4 * scale, 2 * scale, '#e9c392');
    if (key === 'ranger' || key === 'rogue' || key === 'bard') rect(ctx, -6 * scale, -9 * scale, 4 * scale, 6 * scale, dark);
    if (entry.equipment?.armor) {
      const color = { leatherArmor:'#b17e60', chainArmor:'#9ba5b6', shadowCloak:'#725689', rootGuard:'#7f9861' }[entry.equipment.armor] || light;
      rect(ctx, -4 * scale, -8 * scale, 9 * scale, 4 * scale, color);
      rect(ctx, -2 * scale, -7 * scale, 4 * scale, 2 * scale, accent);
    }
    if (entry.equipment?.charm) rect(ctx, -scale, -6 * scale, 2 * scale, 2 * scale, '#ffeaa3');
    if (step === 1 || step === 3) {
      const dx = step === 1 ? -4 : 1;
      rect(ctx, dx * scale, -scale, 3 * scale, 2 * scale, ink);
    }
    weapon(ctx, entry.equipment?.weapon, key, 5 * scale, -9 * scale, palette, scale, attacking);
    if (key === 'paladin') shape(ctx, -10 * scale, -9 * scale, ['.oo.','oato','oato','oato','.oo.'], cs, scale);
    ctx.restore();
    if (nickname && entry.name) label(ctx, entry.name, x, y - 43, entry.self ? '#f7d88f' : '#f1e9c9');
  }

  function lume(ctx, x, y, time, big = false) {
    const scale = big ? 3 : 2;
    const bob = Math.floor(Math.sin(time / 280) * 3);
    rect(ctx, x - 9, y + 7, 18, 3, '#37535a80');
    shape(ctx, x - 4 * scale, y - 8 * scale + bob, [
      '...t....','..tht...','.thhht..','thhhhht.','thshsht.','.thhht..','..ttt...','...t....'
    ], { t:'#61c2ad', h:'#d8f5c2', s:'#31526f' }, scale);
    if (Math.floor(time / 270) % 3) rect(ctx, x + 9, y - 15 + bob, scale, scale, '#f6e4a3');
  }

  function liaEcho(ctx, entry, time, { nickname = true, scale = 2 } = {}) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const orbit = reduced ? 0 : time / 1800;
    ctx.save();
    ctx.strokeStyle = '#b7d9b9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(entry.x, entry.y - 4, 11 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.86;
    hero(ctx, { ...entry, appearance:{ ...(entry.appearance || W.NPCS.lia?.appearance), echo:true } }, time,
      { nickname:false, scale });
    ctx.restore();
    for (let i = 0; i < 4; i++) {
      const angle = orbit + i * Math.PI / 2;
      const x = entry.x + Math.cos(angle) * 12 * scale;
      const y = entry.y - 18 * scale + Math.sin(angle) * 5 * scale;
      shape(ctx, x, y, ['..l.','.ll.','ll..'], { l:i % 2 ? '#d7e9b4' : '#93c6a1' }, Math.max(1, scale * 0.6));
    }
    if (nickname) label(ctx, 'Eco de Lia', entry.x, entry.y - 44, '#d6e9bb');
  }

  function monster(ctx, name, x, y, time, size = 2, boss = false, phase = 1) {
    const word = name.toLowerCase();
    const creature = /morvath|bruxo/.test(word) ? 'wizard' : /goblin/.test(word) ? 'goblin' : /troll/.test(word) ? 'troll' : /lobo|javali|cão/.test(word) ? 'beast' : /aranha|escorpião/.test(word) ? 'spider'
      : /corvo|harpia|morcego|draco/.test(word) ? 'wing' : /ent|raiz/.test(word) ? 'tree' : /vazio|espectro|malakar|sentinela/.test(word) ? 'ghost' : 'armor';
    const colors = {
      beast:['#37394f','#816b84','#cda1a1'], spider:['#423354','#755387','#ba7cad'],
      wing:['#503846','#995457','#e18c68'], tree:['#35473b','#63835b','#acc578'],
      ghost:['#432b5b','#784d89','#b883ac'], armor:['#374257','#6a718e','#a2a9bd'],
      wizard:['#1b172b','#43264f','#865189'], goblin:['#244737','#588748','#a5c56f'],
      troll:boss ? ['#343d4e','#63717b','#9ba99e'] : ['#3b473f','#657c62','#9aa580']
    }[creature];
    const scale = (boss ? size * 1.6 : size) * (creature === 'goblin' ? 0.78 : 1);
    const cs = { o:'#172539', d:colors[0], b:colors[1], t:colors[2], e:phase > 1 ? '#f9a681' : '#ffdf8b', a:'#eee0af' };
    if (creature === 'wizard') Object.assign(cs, { o:'#100f1d', e:'#ff5f65', a:'#cab6c2' });
    if (creature === 'goblin') Object.assign(cs, { c:'#835942', a:'#eee1a8', e:'#f4cc77' });
    if (creature === 'troll') Object.assign(cs, { o:'#17232e', a:'#dfceac', e:phase >= 3 ? '#ffb65b' : '#e9ba66',
      c:phase >= 2 ? '#a6dbdd' : '#6c9ca7', v:'#514c51' });
    const sprites = {
      beast:['..o..o.........','..ototo........','.oottbto.......','oabbebto...oo..','..obbbto.oobto.','...obbbbobto...','...obbbbbbo....','....obdddbo....','....odooobo....','....oo..oo.....'],
      spider:['...o......o....','..obo....obo...','.obo..oo..obo..','obo.oottoo.obo.','oo.ottbbtto.oo.','..otebbbeto....','.oobbbbbbbboo..','odoobbdbboodo..','oo..ooodo..oo..'],
      wing:['o.............o','oto....o....oto','obto..oto..otbo','odbbottttobbdo.','.obbbteetbbbbo.','..oobbttbbboo..','....obttbbo....','.....ooboo.....','......ao.......'],
      tree:['..to.o.to......','.otbobotot..o..','..obttbto.oto..','ootootttooobo..','.obbbteetbboo..','..otbbtbbtoo...','..obbtbtbbto...','...obbbbooo....','..obtdbbto.....','..otodoooto....','.oooo...oooo...'],
      ghost:['......ooo......','....ootttbo....','...ottbbbtbo...','..ottbeebttbo..','.ottbttbbtbddo.','.otbbttbbttbbo.','..odbbddbbbdo..','...odbdddbdo...','....oo.do.o....','.......o.......'],
      armor:['.....ooooo.....','....ottttto....','...ottbbttto...','...oeoddoeoo...','...obbtbbdoo...','..otttbbddboo..','..obtbttbbbo...','..oobbdddboo...','...oddooodo....','...ooo.oooo....'],
      wizard:['...........oo....','.........ootbo...','........otbbo....','.......otbbbo....','......otbbbbo....',
        '.....otbbtbbbo...','..oootttttttbboo.','...oooaddddaooo..','.....odededo.....','.....odadddo.....',
        '....obdaaabdo....','...otbbdddbbto...','..otbbbdtdbbbto..','.otbbbddtddbbbto.',
        '.obbbdddtdddbbbo.','..odddddtdddddo..','..ooooooooooooo..'],
      goblin:['tto.........ott','tttooooooooottt','.otttbbbbbttto.','..otbeooebto...',
        '...otbaaato....','....obbbbo.....','..obccccccbo...','.tobccaccbott..','...occccco.....',
        '...oddoddo.....','...odo.odo.....','...oo...oo.....'],
      troll:['.........oooo........','.......ootttboo......','......otttbbbttbo....',
        '.....otbeodetbbto....','....otbbbdddbbbtbo...','...ootbdooooodbttbo..',
        '..otbbtdbbbbbdbbttbo.','.otbbbbbvvvvbbbbttbo.',
        'otbbbttbbvvbbbccttbo.','obbbttbbdddbbcctbtbo.',
        'obbdtbbbddbbbctbbtbo.','obddtbbddddbbbtbbdoo.',
        '.oootbbddoddbbtooo...','...otdddo.oddto......','...ooooo..ooooo......']
    };
    const bob = Math.floor(Math.sin(time / 350) * 3);
    rect(ctx, x - 6 * scale, y - 2, 12 * scale, 3 * scale, '#13213292');
    shape(ctx, x - (creature === 'wizard' ? 8 : creature === 'troll' ? 10 : 7) * scale,
      y - (creature === 'wizard' ? 16 : creature === 'troll' ? 14 : creature === 'goblin' ? 11 : 10) * scale + bob, sprites[creature], cs, scale);
    if (creature === 'troll') {
      const crown = boss ? ['..c......c...','..tc....ct...','c.ttc..ctt..c','cttttcttttctc','..ttttttttt..'] : ['..c...','..tc..','.cttc.','cttttc'];
      shape(ctx, x + (boss ? -4 : 5) * scale, y - (boss ? 17 : 12) * scale + bob,
        crown, { c:cs.c, t:boss ? '#7d959c' : '#8a9b83' }, scale);
      shape(ctx, x - 4 * scale, y - 9 * scale + bob,
        ['.ooooooo.','oaaoooaao','oaoooooao','.ovvvvvo.','..bbbbb..'],
        { o:'#202936', a:'#daccb2', v:'#665451', b:cs.b }, scale);
      rect(ctx, x - 3 * scale, y - 12 * scale + bob, 3 * scale, scale, '#25313c');
      rect(ctx, x + scale, y - 12 * scale + bob, 3 * scale, scale, '#25313c');
      if (boss && phase >= 2) {
        shape(ctx, x + 6 * scale, y - 9 * scale + bob, ['..c..','.ctc.','.ctc.','ctttc'],
          { c:cs.c, t:'#d7ece0' }, scale);
      }
    }
    if (creature === 'goblin') {
      shape(ctx, x + 6 * scale, y - 5 * scale + bob, ['...w.','..ww.','.ww..','cc...','.c...'],
        { w:'#d9d9bd', c:'#674631' }, scale);
    }
    if (creature === 'wizard') {
      rect(ctx, x + 9 * scale, y - 11 * scale + bob, 1.5 * scale, 12 * scale, '#6d525f');
      shape(ctx, x + 7 * scale, y - 14 * scale + bob,
        ['.aaa.','addda','aedea','.ada.','..a..'], { a:'#d6c6bd', d:'#2c2034', e:'#e76575' }, scale);
      if (phase >= 2) {
        const pulse = 2 + Math.sin(time / 280);
        rect(ctx, x - 10 * scale, y - 5 * scale + bob - pulse, 2 * scale, 2 * scale, '#b879bf');
      }
    }
    if (boss && phase === 3) {
      rect(ctx, x - 6 * scale, y - 10 * scale, 2 * scale, 2 * scale, '#f7ba79');
      rect(ctx, x + 5 * scale, y - 12 * scale, 2 * scale, 2 * scale, '#f7ba79');
    }
  }

  function princess(ctx, entry, time, { nickname = true, scale = 2 } = {}) {
    const x = Math.round(entry.x), y = Math.round(entry.y);
    rect(ctx, x - 6 * scale, y - 1, 12 * scale, 3 * scale, '#16263080');
    shape(ctx, x - 7 * scale, y - 21 * scale, [
      '....g..g..g....','....ggggggg....','.....gjjjg.....','....ohhhhho....','....ohsssho....',
      '....ohesesho...','....ohsssho....','....ohhshho....','...olllglllo...',
      '..ollplllpllo..','..oslllllllso..','...olllglllo...','...ollpgpllo...','..ollplllpllo..',
      '..olplllllplo..','.ollplllllpllo.','.olplllllllplo.','olllllllllllllo',
      '.ooooooooooooo.','....oo...oo....'
    ], { o:ink, g:'#f2cb70', j:'#ce718f', h:'#35242e', s:'#edaf91', e:'#3b2943',
      p:'#ac72a5', l:'#e8bad2' }, scale);
    // Rounded, highlighted ringlets frame the face and hang below the crown.
    for (const [dx, dy] of [[-5,-18],[2,-18],[-6,-15],[3,-15],[-5,-12],[2,-12]]) {
      shape(ctx, x + dx * scale, y + dy * scale,
        ['.hh.','hkhh','hhkh','.hh.'], { h:'#35242e', k:'#815851' }, scale);
    }
    if (nickname) label(ctx, entry.name || 'Maria Rita', x, y - 49, '#ffe2a1');
  }

  function visiblePoint(p, map, state) {
    if (p.kind === 'liaRescue') return !!state.self.companions.liaEcho?.needsRescue;
    if (p.kind === 'enemy') return !state.world.cleared[map.region] && !state.world.defeated[map.region]?.includes(p.enemyIndex);
    if (p.kind === 'boss') return W.bossVisible(map, state.world);
    if (p.kind === 'dungeonEnemy' || p.kind === 'puzzle') return !state.world.rooms[map.region]?.includes(map.dungeonIndex);
    if (p.kind === 'voyageEnemy') return !state.world.voyage?.defeated?.includes(p.id);
    if (p.kind === 'voyageBoss') return !state.world.voyage?.cleared;
    return true;
  }

  function cameraFor(canvas, self) {
    const zoom = window.matchMedia('(pointer: coarse)').matches ? (window.innerHeight < 500 ? 1.75 : 1.4) : 1;
    const viewWidth = canvas.width / zoom;
    const viewHeight = canvas.height / zoom;
    return {
      zoom, x: Math.round(Math.max(0, Math.min(W.WIDTH - viewWidth, (self?.x || 480) - viewWidth / 2))),
      y: Math.round(Math.max(0, Math.min(W.HEIGHT - viewHeight, (self?.y || 450) - viewHeight / 2)))
    };
  }

  function follow(id, x, y) {
    let position = followerPositions.get(id);
    if (!position) {
      position = { x,y };
      followerPositions.set(id, position);
    }
    position.x += (x - position.x) * 0.13;
    position.y += (y - position.y) * 0.13;
    return position;
  }

  function prison(ctx, x, y, time, open, names = ['Morador']) {
    rect(ctx, x - 35, y - 4, 70, 12, '#1c2c32');
    for (const [i, name] of names.entries()) {
      hero(ctx, { name, classKey:name === 'Maria Rita' ? 'princess' : i % 2 ? 'bard' : 'ranger', x:x - (names.length - 1) * 15 + i * 30,
        y, facing:'down' }, time, { nickname:false, scale:1.5 });
    }
    if (open) {
      rect(ctx, x - 40, y - 4, 15, 5, '#718255');
      rect(ctx, x + 27, y - 8, 15, 5, '#718255');
      label(ctx, 'Caminho de volta', x, y - 49, '#c9e0ac');
      return;
    }
    for (const dx of [-36,-18,0,18,36]) {
      rect(ctx, x + dx, y - 45, 5, 50, '#435747');
      rect(ctx, x + dx + 2, y - 43, 2, 45, '#9ba572');
    }
    rect(ctx, x - 38, y - 45, 79, 6, '#8c9a64');
    rect(ctx, x - 37, y - 14, 77, 4, '#70845a');
    const pulse = Math.floor(time / 220) % 4;
    rect(ctx, x - 5, y - 25, 12, 10, pulse < 2 ? '#b57580' : '#8c6576');
    label(ctx, 'Memórias aprisionadas', x, y - 59, '#f1c0a2');
  }

  function gardenPlot(ctx, point, state, data, time) {
    const { x,y } = point;
    const crop = state.self.farm?.plots?.find(plot => plot.id === point.id);
    rect(ctx, x - 26, y - 16, 52, 32, '#382c31');
    rect(ctx, x - 24, y - 14, 48, 28, crop?.watered ? '#554339' : '#75513c');
    for (let row = -10; row <= 10; row += 7) rect(ctx, x - 23, y + row, 46, 2, '#3b3030');
    if (!crop?.crop) {
      rect(ctx, x + 21, y - 26, 3, 24, '#b99a6b');
      rect(ctx, x + 14, y - 28, 17, 9, '#e0c28a');
      return;
    }
    const progress = Math.max(0, Math.min(1, (time - crop.plantedAt) / Math.max(1, crop.readyAt - crop.plantedAt)));
    for (const dx of [-14,0,14]) {
      rect(ctx, x + dx - 1, y - 3, 3, 10, '#81a567');
      rect(ctx, x + dx - 5, y - 5, 5, 4, '#4d8c58');
      rect(ctx, x + dx + 2, y - 7, 5, 4, '#a9c371');
      if (progress < 0.4) continue;
      const size = progress >= 1 ? 9 : 5;
      if (crop.crop === 'melon') {
        rect(ctx, x + dx - size / 2, y - 3, size + 2, size, '#6cac58');
        for (const offset of [-2,2]) rect(ctx, x + dx + offset, y - 3, 2, size, '#315c41');
      } else if (crop.crop === 'pumpkin') {
        rect(ctx, x + dx - size / 2, y - 2, size + 2, size - 1, '#de9351');
        rect(ctx, x + dx, y - 1, 2, size - 3, '#ad613e');
        rect(ctx, x + dx, y - 5, 2, 4, '#53784b');
      } else if (crop.crop === 'corn') {
        rect(ctx, x + dx, y - size, 3, size + 11, '#4e8853');
        rect(ctx, x + dx - 4, y - size + 2, 5, size, '#ecd080');
        rect(ctx, x + dx - 3, y - size + 4, 2, size - 2, '#d39550');
      } else {
        rect(ctx, x + dx - 2, y + 1, 5, size - 1, '#e6a16a');
        rect(ctx, x + dx - 1, y + size - 1, 2, 3, '#c87746');
      }
    }
    if (progress >= 1) label(ctx, (data.crops?.[crop.crop]?.name || 'Colheita') + ' · pronta', x, y - 32, '#e1db91');
  }

  function echoMemorial(ctx, memorial, slot) {
    const x = slot.x ?? slot[0], y = slot.y ?? slot[1];
    rect(ctx, x - 12, y, 24, 5, '#293d3e');
    rect(ctx, x - 10, y - 14, 20, 17, '#718280');
    rect(ctx, x - 7, y - 17, 14, 4, '#9daea1');
    shape(ctx, x - 3, y - 13, ['..ll.','.lll.','ll...','..t..'],
      { l:'#c2d8b3', t:'#d6d5ae' }, 1.2);
    flower(ctx, x + 13, y + 1, 2);
    ctx.save();
    ctx.fillStyle = '#e4dfc5';
    ctx.font = '12px VT323, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(memorial.generation), x, y + 1);
    ctx.restore();
  }

  function dangerZones(ctx, battle, time) {
    for (const warning of battle.telegraphs || []) {
      const remaining = warning.resolvesAt - time;
      const lightning = warning.type === 'lightning';
      const color = lightning ? '#eacb82' : '#e7987d';
      ctx.beginPath();
      ctx.arc(warning.x, warning.y, warning.radius, 0, Math.PI * 2);
      ctx.fillStyle = lightning ? '#e7c77a38' : '#d9786240';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([7,4]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (remaining <= 250) {
        ctx.beginPath();
        ctx.moveTo(warning.x + 13, warning.y - 100);
        ctx.lineTo(warning.x - 9, warning.y - 52);
        ctx.lineTo(warning.x + 9, warning.y - 55);
        ctx.lineTo(warning.x, warning.y);
        ctx.strokeStyle = lightning ? '#fff3be' : '#a5be7b';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      label(ctx, remaining > 0 ? (remaining / 1000).toFixed(1) + 's · SAIA' : '!', warning.x, warning.y + 5, color);
    }
  }

  function flyingWildlife(ctx, map, cycle, reducedMotion) {
    if (['dungeon','interior'].includes(map.kind) || !['village','forest'].includes(map.region)) return;
    const night = cycle.isNight;
    const elapsed = reducedMotion ? 8500 : cycle.elapsed;
    const count = reducedMotion ? 2 : night ? 3 : 4;
    const poses = night ? [
      ['o.......o','oto...oto','obto.otbo','.obbbbbo.','...oeo...'],
      ['.........','oo.....oo','.oto.oto.','..obbbo..','...oeo...'],
      ['.........','...ooo...','..otbto..','.oboeobo.','oo.....oo']
    ] : [
      ['t.....t','.t.b.t.','..tbt..','...b.a.'],
      ['.......','tt.b.tt','..tbt..','...b.a.'],
      ['.......','...b...','..tbt..','.t.b.ta']
    ];
    for (let i = 0; i < count; i++) {
      const drift = elapsed / (night ? 48 : 55);
      const x = (drift + i * 271 + map.id.length * 37) % (W.WIDTH + 90) - 45;
      const y = 72 + i * 104 + (reducedMotion ? 0 : Math.sin(elapsed / 1700 + i * 2.1) * 15);
      const pose = reducedMotion ? 1 : Math.floor(elapsed / (night ? 240 : 310) + i) % poses.length;
      shape(ctx, x, y, poses[pose], night
        ? { o:'#1b2031', t:'#625778', b:'#3d3652', e:'#ddad83' }
        : { t:'#c7d4c7', b:'#4d5350', a:'#ddba7c' }, night ? 2 : 1.7);
    }
  }

  function drawWorld(canvas, state, positions, data, time) {
    const ctx = canvas.getContext('2d');
    const map = W.zone(state.zone);
    const palette = mapPalette(map);
    const cycle = W.dayCycle ? W.dayCycle(time, state.world) : {
      index:Math.floor(Math.max(0, time - state.world.epoch) / 22000) % 4,
      elapsed:Math.max(0, time - state.world.epoch)
    };
    cycle.isNight ??= cycle.index === 3;
    if (followerZone !== state.campaignId + ':' + map.id) {
      followerZone = state.campaignId + ':' + map.id;
      followerPositions.clear();
    }
    const camera = cameraFor(canvas, positions.get(state.id));
    if (!cache.has(map.id)) {
      if (cache.size >= 7) cache.delete(cache.keys().next().value);
      cache.set(map.id, baseMap(map));
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
    const base = cache.get(map.id);
    ctx.drawImage(base.canvas, 0, 0);
    for (const [x,y] of base.animatedWater) water(ctx, x, y, time, palette, map.region === 'fire');
    if (map.id === 'boat') {
      for (let i = 0; i < 23; i++) {
        const x = (i * 157 + time / 22) % W.WIDTH;
        const y = (i * 79) % W.HEIGHT;
        if (x < 104 || x > 854 || y < 103 || y > 533) {
          rect(ctx, x, y, 31, 3, '#6ca1ac');
          rect(ctx, x + 8, y + 5, 30, 2, '#397388');
        }
      }
    }
    if (map.id === 'village') fountain(ctx, 493, 325, time);
    if (map.id === 'cave' || map.id === 'grotto') {
      for (let i = 0; i < 14; i++) {
        const x = (map.id === 'cave' ? 743 : 155) + i * 5;
        const shift = (time / 12 + i * 11) % 26;
        rect(ctx, x, 122 + shift, 3, 87, i % 4 ? '#78b7bd' : '#b4d9d4');
        rect(ctx, x - 5 + shift % 11, 220 + i % 3 * 4, 5, 2, '#b4d9d4');
      }
    }
    const actors = [];
    if (map.id === 'village' && W.ROYAL_CASTLE) {
      actors.push({ y:W.ROYAL_CASTLE.y + W.ROYAL_CASTLE.height,
        draw: () => royalCastle(ctx, W.ROYAL_CASTLE, state, cycle.isNight) });
    }
    for (const home of (W.HOUSES || []).filter(home => home.zone === map.id)) {
      actors.push({ y:home.y + home.height, draw: () => house(ctx, home, cycle.isNight) });
    }
    if (map.id === 'orchard') {
      const memorials = (state.world.liaMemorials || []).slice(-8);
      for (const [i, memorial] of memorials.entries()) {
        const slot = W.LIA_MEMORIAL_SLOTS?.[i];
        if (slot) actors.push({ y:slot.y ?? slot[1], draw: () => echoMemorial(ctx, memorial, slot) });
      }
    }
    const field = state.battle?.mode === 'field' ? state.battle : null;
    if (field) dangerZones(ctx, field, time);
    const region = data.regions.find(entry => entry.id === map.region);
    for (const p of map.points.filter(point => visiblePoint(point, map, state))) {
      if (p.kind === 'plot') {
        gardenPlot(ctx, p, state, data, time);
        continue;
      }
      if (field && (field.target.pointId === p.id || field.target.kind === p.kind &&
          (p.kind === 'boss' || p.kind === 'voyageBoss' || p.kind === 'dungeonEnemy' || field.target.index === p.enemyIndex))) continue;
      const enemy = p.kind === 'enemy' ? region.enemies[p.enemyIndex] : p.kind === 'boss' ? region.boss
        : p.kind === 'dungeonEnemy' ? data.dungeons[map.region]?.[map.dungeonIndex]
        : p.kind === 'voyageEnemy' ? { name:p.label } : p.kind === 'voyageBoss' ? { name:'Carcereiro das Raízes' } : null;
      if (enemy) {
        const mob = state.mobs?.[p.id];
        const { x, y } = mob ? follow('mob:' + p.id, mob.x, mob.y) : p;
        actors.push({ y, draw: () => {
          monster(ctx, enemy.name || enemy.enemy, x, y, time, 3, p.kind === 'boss' || p.kind === 'voyageBoss' || map.dungeonIndex === 3);
          if (mob?.alert) label(ctx, '!', x, y - 50);
        } });
      } else actors.push({ y:p.y, draw: () => prop(ctx, p, map, state, time) });
    }
    if (field) {
      const boss = field.position;
      actors.push({ y:boss.y, draw: () => {
        monster(ctx, field.name, boss.x, boss.y, time, 3, field.boss, field.phase);
        const width = field.boss ? 135 : 80;
        const barY = Math.max(30, boss.y - (field.boss ? 92 : 57));
        rect(ctx, boss.x - width / 2, barY, width, 8, '#342d3a');
        rect(ctx, boss.x - width / 2, barY, width * field.hp / field.maxHp, 8, '#e3957e');
        label(ctx, field.name + (field.boss ? ' · Fase ' + field.phase + '/3' : ''), boss.x,
          barY - 14, '#f0d7a4');
      } });
      for (const totem of field.totems || []) {
        if (totem.hp <= 0) continue;
        actors.push({ y:totem.y, draw: () => {
          rect(ctx, totem.x - 10, totem.y - 28, 20, 31, '#536745');
          rect(ctx, totem.x - 13, totem.y - 32, 26, 7, '#92af6d');
          rect(ctx, totem.x - 5, totem.y - 22, 11, 9, '#eed589');
          label(ctx, 'Totem · QUEBRAR', totem.x, totem.y - 46, '#dbe59f');
        } });
      }
    }
    if (map.kind === 'surface' && W.REGIONS.includes(map.region)) {
      const captives = { forest:['Tomás','Elara'], cave:['Borin'], fire:['Nilo'], castle:['Sera'], shadow:['Ivo','Maria Rita'] };
      actors.push({ y:153, draw: () => prison(ctx, 648, 153, time, !!state.world.cleared[map.region], captives[map.region]) });
    }
    for (const npc of W.npcPositions(map.id, time, state.world).filter(npc => !npc.indoors)) {
      actors.push({ y:npc.y, draw: () => hero(ctx, npc, time) });
    }
    for (const entry of state.players) {
      const p = { ...entry, ...positions.get(entry.id), self: entry.id === state.id };
      const action = field?.lastAction;
      const attacking = action?.heroId === entry.id && time - (action.at || 0) < 350;
      actors.push({ y:p.y, draw: () => hero(ctx, p, time, { attacking }) });
      if (p.companions.lume) {
        const side = p.facing === 'right' ? -1 : 1;
        const pet = follow('lume:' + p.id, p.x + side * 25, p.y - 6);
        actors.push({ y:pet.y, draw: () => {
          lume(ctx, pet.x, pet.y, time, p.self);
          if (p.self) label(ctx, 'Lume', pet.x, pet.y - 31);
        } });
      }
      if (p.companions.lia) {
        const location = follow('lia:' + p.id, p.x + (p.facing === 'right' ? -38 : 37), p.y + 9);
        const ally = { ...p, ...location, classKey:'rogue', equipment:{}, name:'Eco de Lia',
          appearance:{ ...(W.NPCS.lia?.appearance || {}), echo:true } };
        actors.push({ y:ally.y, draw: () => liaEcho(ctx, ally, time, { scale:1.75, nickname:p.self }) });
      }
    }
    if (W.residentPositions) {
      for (const resident of W.residentPositions(map.id, time, state.world).filter(resident => !resident.indoors)) {
        actors.push({ y:resident.y, draw: () => hero(ctx, resident, time,
          { scale:resident.classKey === 'princess' ? 2 : 1.6 }) });
      }
    } else if (map.id === 'village') {
      const freed = state.world.rescued || (state.world.cleared.shadow ? ['Tomás','Elara','Borin','Nilo','Sera','Ivo','Maria Rita'] : []);
      for (const [i, name] of [...new Set(freed)].filter(Boolean).entries()) {
        const resident = { name, classKey:name === 'Maria Rita' ? 'princess' : Object.keys(clothes)[i + 2],
          x:350 + i * 47, y:184 + i % 2 * 20, facing:'down',
          appearance:{ skin:['#8f573f','#dca17e','#bc805d','#724635'][i % 4] } };
        actors.push({ y:resident.y, draw: () => hero(ctx, resident, time, { scale:1.6 }) });
      }
    }
    actors.sort((a, b) => a.y - b.y).forEach(actor => actor.draw());
    for (let i = 0; map.kind !== 'interior' && i < 18; i++) {
      const x = (i * 127 + time / 146) % W.WIDTH;
      const y = (i * 58 + Math.sin(time / 1400 + i) * 11) % W.HEIGHT;
      rect(ctx, x, y, 2, 2, ['#eac576','#8ec3b2','#a69bc5'][i % 3] + (i % 2 ? 'a8' : '75'));
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    flyingWildlife(ctx, map, cycle, reducedMotion);
    if (cycle.isNight && !['dungeon','interior'].includes(map.kind) && ['village','forest'].includes(map.region)) {
      rect(ctx, 0, 0, W.WIDTH, W.HEIGHT, '#1e284d38');
    }
    ctx.restore();
  }

  function arenaBackdrop(ctx, map, width, height, palette, image, time) {
    if (map.kind === 'surface' && map.region === 'forest' && image.complete && image.naturalWidth) {
      ctx.drawImage(image, 0, 0, width, height);
      rect(ctx, 0, 0, width, height, palette[0] + '50');
      return;
    }
    rect(ctx, 0, 0, width, height, palette[0]);
    for (let i = 0; i < 20; i++) {
      const x = i * 41;
      const high = 20 + (i * 73) % 96;
      if (map.region === 'cave' || map.kind === 'dungeon') {
        rect(ctx, x, 0, 41, high / 2, palette[1]);
        rect(ctx, x + 4, high / 2, 25, high / 2, palette[2]);
        rect(ctx, x + 10, high, 14, high / 3, palette[1]);
      } else {
        rect(ctx, x, 140 - high, 42, high + 39, palette[1]);
        rect(ctx, x + 9, 149 - high, 26, high, palette[2]);
        rect(ctx, x + 14, 155 - high, 5, high * 0.75, palette[3]);
      }
    }
    for (let y = 133; y < height; y += 13) {
      rect(ctx, 0, y, width, 13, y % 2 ? palette[1] : palette[4]);
      for (let n = 0; n < 17; n++) rect(ctx, (n * 67 + y * 7) % width, y + 7, 11 + n % 8, 2, palette[5]);
    }
    for (const [i, x] of [52,172,278,416,682,734].entries()) {
      if (map.region === 'fire') {
        rect(ctx, x, 118 + i % 3 * 16, 21, 5, '#d57d65');
        rect(ctx, x + (time / 110 + i) % 14, 104 + i % 3 * 16, 3, 3, '#ffd189');
      } else if (map.region === 'cave') stone(ctx, x, 120 + i % 3 * 23, palette, true);
      else if (map.region === 'castle' || map.region === 'shadow') {
        rect(ctx, x, 41 + i % 2 * 9, 7, 123, palette[3]);
        rect(ctx, x - 2, 39 + i % 2 * 9, 11, 7, palette[6]);
      }
    }
  }

  function battleProjectile(ctx, from, to, progress, color, large) {
    if (progress < 0 || progress > 0.78) return;
    const t = Math.min(1, progress / 0.68);
    const size = large ? 10 : 6;
    for (let i = 5; i >= 0; i--) {
      const trail = Math.max(0, t - i * 0.045);
      const x = from.x + (to.x - from.x) * trail;
      const y = from.y + (to.y - from.y) * trail - Math.sin(trail * Math.PI) * 32;
      const radius = size - i;
      rect(ctx, x - radius, y - radius, radius * 2, radius * 2, color);
      if (!i) rect(ctx, x - 3, y - 3, 6, 6, '#fff5ce');
    }
  }

  function drawBattle(canvas, state, time, backdrop, previousTime) {
    const ctx = canvas.getContext('2d');
    const battle = state.battle;
    const map = W.zone(state.zone);
    const palette = mapPalette(map);
    ctx.imageSmoothingEnabled = false;
    arenaBackdrop(ctx, map, canvas.width, canvas.height, palette, backdrop, time);
    const group = state.players.filter(entry => battle.heroes.includes(entry.id));
    const progress = previousTime ? (time - previousTime) / 700 : 1;
    const action = progress >= 0 && progress < 1 ? battle.lastAction : null;
    const foe = { x:602, y:151 };
    const enemyAction = action?.side === 'enemy';
    const heroColors = { warrior:'#ffc781', mage:'#ff7349', sorceress:'#ba8dfb', cleric:'#fff3a5',
      rogue:'#b498db', bard:'#ffc2e2', paladin:'#f7d475', ranger:'#a2de79', monk:'#72f1ce', druid:'#b2d993' };
    const enemyColors = { forest:'#c18cdd', cave:'#7ad7f5', fire:'#ff7b4d', castle:'#f6cb8a', shadow:'#d19cff' };
    const effects = [];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (battle.move?.type === 'charge' || battle.move?.type === 'area') {
      ctx.fillStyle = '#8c263744';
      ctx.fillRect(0, canvas.height - 42, canvas.width, 42);
    }
    for (const [i, entry] of group.entries()) {
      const x = 82 + (i % 4) * 83;
      const y = 170 + Math.floor(i / 4) * 69;
      if (entry.id === battle.active) rect(ctx, x - 16, y + 9, 32, 2, '#ffe3a2');
      const active = action?.heroId === entry.id;
      const attack = active && (action.action === 'attack' || action.action === 'skill' || action.action === 'technique');
      const hit = enemyAction && action.hits.find(target => target.id === entry.id);
      const lift = Math.sin(progress * Math.PI) * 21;
      hero(ctx, { ...entry, x:x + (attack ? lift : hit && progress > 0.65 && !hit.guarded ? -7 : 0), y, facing:'right' },
        time, { scale:2.7, attacking:attack });
      const center = { x, y:y - 28 };
      if (battle.move?.target === entry.id || battle.move?.type === 'area') {
        rect(ctx, x - 10, y + 13, 20, 2, '#f98270');
      }
      if (entry.companions.lume) lume(ctx, x - 24, y - 14, time);
      if (attack && action.damage) effects.push(() => battleProjectile(ctx, center, foe, progress, heroColors[entry.classKey], action.action !== 'attack'));
      if ((active && !action.damage && action.action !== 'attack') || (hit?.guarded && progress > 0.57)) {
        effects.push(() => {
          const size = 19 + Math.round(lift / 2);
          rect(ctx, x - size, center.y - size, size * 2, 2, '#a8e9ff');
          rect(ctx, x - size, center.y + size, size * 2, 2, '#a8e9ff');
          rect(ctx, x - size, center.y - size, 2, size * 2, '#a8e9ff');
          rect(ctx, x + size, center.y - size, 2, size * 2, '#a8e9ff');
        });
      }
      if (hit) effects.push(() => {
        battleProjectile(ctx, foe, center, progress, enemyColors[map.region], action.action !== 'hit');
        if (progress > 0.61) {
          if (hit.damage) impact(ctx, center, progress, hit.guarded ? '#a8e9ff' : enemyColors[map.region]);
          label(ctx, hit.damage ? '−' + hit.damage : 'ESQUIVA', x, y - 54 - progress * 12);
        }
      });
    }
    const recoil = !reducedMotion && action?.damage && progress > 0.61 ? Math.sin(progress * 86) * (1 - progress) * 22 : 0;
    if (action?.action === 'companion') liaEcho(ctx,
      { x:382, y:246, classKey:'rogue', facing:'right', appearance:W.NPCS.lia?.appearance }, time, { scale:2.7 });
    monster(ctx, battle.name, foe.x + recoil - (enemyAction ? Math.sin(progress * Math.PI) * 34 : 0), 224, time,
      battle.boss ? 8.1 : 9, battle.boss, battle.phase);
    for (let i = 0; i < battle.totems; i++) {
      stone(ctx, 535 + i * 115, 253, palette, true);
      label(ctx, 'Totem', 535 + i * 115, 264);
    }
    for (const draw of effects) draw();
    if (action?.damage && progress > 0.61) {
      impact(ctx, foe, progress, action.phaseChange ? '#ffd894' : '#f5b7a2');
      label(ctx, '−' + action.damage, foe.x, foe.y - progress * 24);
    }
    if (action?.phaseChange) label(ctx, 'FASE ' + battle.phase, 380, 64);
  }

  function impact(ctx, at, progress, color) {
    const expansion = (progress - 0.61) / 0.39;
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5;
      const radius = 9 + expansion * (i % 2 ? 28 : 48);
      const size = Math.max(2, 7 - expansion * 6);
      rect(ctx, at.x + Math.cos(angle) * radius, at.y + Math.sin(angle) * radius, size, size, color);
    }
  }

  function drawBossIntro(canvas, battle, self, elapsedMs) {
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const time = reduced ? 2400 : Math.max(0, Math.min(4500, elapsedMs));
    const region = battle.target?.region || 'forest';
    const palette = palettes[region] || palettes.shadow;
    const reveal = Math.min(1, Math.max(0, (time - 400) / 850));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.scale(canvas.width / 760, canvas.height / 296);
    arenaBackdrop(ctx, W.zone(region), 760, 296, palette, { complete:false }, time);
    rect(ctx, 0, 0, 760, 296, '#18112585');
    const wizard = /morvath|bruxo/i.test(battle.name);
    const bossX = reduced ? 560 : 590 - reveal * 30;
    const ring = 83 + (reduced ? 0 : Math.sin(time / 350) * 4);
    ctx.strokeStyle = wizard ? '#a273bd' : '#e2b38a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(bossX, 236, ring, 17, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7 + (reduced ? 0 : time / 6000);
      const x = bossX + Math.cos(angle) * (ring + 5);
      const y = 210 + Math.sin(angle) * 57;
      rect(ctx, x, y, 4, 7, '#d3b4db');
    }
    ctx.save();
    if (reveal < 0.8) ctx.filter = 'brightness(0.12)';
    ctx.globalAlpha = 0.35 + reveal * 0.65;
    monster(ctx, battle.name || 'Guardião', bossX, 228, time, wizard ? 6.3 : 7.4, true, 1);
    ctx.restore();
    hero(ctx, { ...self, x:137, y:237, facing:'right' }, time, { nickname:false, scale:4 });
    if (self?.companions?.lume) lume(ctx, 92, 187, time, true);
    if (self?.companions?.lia) liaEcho(ctx,
      { classKey:'rogue', x:76, y:249, facing:'right', appearance:W.NPCS.lia?.appearance }, time,
      { nickname:false, scale:2.7 });
    if (!reduced && time > 650 && time < 1100) {
      const glow = Math.sin((time - 650) / 450 * Math.PI) * 0.12;
      ctx.fillStyle = 'rgba(233,211,248,' + glow + ')';
      ctx.fillRect(0, 0, 760, 296);
    }
    // One gentle reveal, with a static full scene for reduced motion.
    rect(ctx, 0, 0, 760, 28, '#0e111ee8');
    rect(ctx, 0, 261, 760, 35, '#0e111eeb');
    rect(ctx, 0, 28, 20, 233, '#0e111e65');
    rect(ctx, 740, 28, 20, 233, '#0e111e65');
    label(ctx, 'O GUARDIÃO DO SELO', 380, 15, '#c9b5d9');
    label(ctx, battle.name || 'Guardião', 380, 279, '#f4d49d');
    ctx.restore();
  }

  function drawChapter(canvas, chapter, player, elapsed, backdrop) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    const { region, step } = chapter;
    const village = chapter.final && step >= 2;
    const colors = village ? palettes.village : palettes[region];
    const time = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1200 : Math.max(0, elapsed);
    const light = Math.min(1, time / 1200);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    arenaBackdrop(ctx, W.zone(village ? 'village' : region), width, height, colors, backdrop, time);
    rect(ctx, 0, 0, width, height, village ? '#ae754830' : '#121c3540');
    rect(ctx, 0, 143, width, 21, colors[1]);
    hero(ctx, { ...player, x:109, y:143, facing:'right' }, time, { nickname:false, scale:3 });
    const gold = '#ffda8d';
    if (region === 'forest') {
      rect(ctx, 304, 109, 9, 35, '#59405f');
      shape(ctx, 294, 101 + 16 * light, ['..aaa..','.addda.','aededa.','.addda.','..aaa..'],
        { a:'#c7b6c9', d:'#4b2d55', e:'#bd6a98' }, 4);
      const split = light * 24;
      rect(ctx, 290 - split, 143, 18, 5, '#8a5c94');
      rect(ctx, 312 + split, 140, 17, 5, '#8a5c94');
      rect(ctx, 304, 89 - light * 18, 10, 14, gold);
    } else if (region === 'cave' || region === 'shadow' && step === 1) {
      const split = region === 'cave' ? 3 : 10 + 38 * light;
      rect(ctx, 305 - split, 39, split * 2, 105, gold);
      rect(ctx, 251 - split, 31, 54, 115, colors[2]);
      rect(ctx, 305 + split, 31, 54, 115, colors[2]);
      for (const x of [260 - split, 314 + split]) rect(ctx, x, 40, 9, 103, colors[3]);
    } else if (region === 'castle') {
      const swing = step === 0 ? Math.sin(time / 155) * 6 : 0;
      rect(ctx, 294, 21, 6, 92, colors[3]);
      shape(ctx, 281 + swing, 43, ['...tt...','..tbbt..','..tbbt..','.ttbbtt.','tttttttt','...bb...'],
        { t:gold, b:'#bc804f' }, 4);
    } else if (village) {
      if (step === 3) {
        const rise = 74 - 35 * light;
        rect(ctx, 357, rise, 66, 27, '#d58c6170');
        rect(ctx, 373, rise + 3, 35, 21, '#ffd193');
        rect(ctx, 380, rise, 21, 27, '#ffd193');
      }
      for (let i = 0; i < 5; i++) {
        const x = 211 + i * 55;
        hero(ctx, { x, y:145 - i % 2 * 5, facing:'left', classKey:Object.keys(clothes)[i + 1] }, time,
          { nickname:false, scale:2.5 });
        if (light * 5 > i) rect(ctx, x - 3, 60 - i % 2 * 8, 7, 10, gold);
      }
      princess(ctx, { name:'Maria Rita', x:381, y:148 }, time, { nickname:false, scale:2.5 });
    } else {
      rect(ctx, 304, 116, 15, 22, '#674e54');
      rect(ctx, 307, 120 - 9 * light, 9, 16 + 9 * light, gold);
    }
    const sparks = { forest:5, cave:9, fire:16, castle:19, shadow:26 }[region];
    for (let i = 0; i < sparks; i++) {
      const x = 188 + i * 71 % 292;
      const y = 142 - (time / (18 + i % 5) + i * 31) % 113;
      rect(ctx, x, y, i % 4 ? 2 : 4, i % 4 ? 2 : 4, i % 3 ? gold : '#fff5cc');
    }
    ctx.restore();
  }

  function portrait(canvas, key, time = 0, equipment, appearance) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (key === 'lume') lume(ctx, canvas.width / 2, canvas.height * 0.69, time, true);
    else if (key === 'liaEcho') liaEcho(ctx,
      { x:canvas.width / 2, y:canvas.height * 0.83, classKey:'rogue', appearance:W.NPCS.lia?.appearance }, time,
      { nickname:false, scale:2.4 });
    else if (key === 'princess' || key === 'mariaRita') princess(ctx,
      { name:'Maria Rita', x:canvas.width / 2, y:canvas.height * 0.91 }, time, { nickname:false, scale:2.4 });
    else hero(ctx, { x:canvas.width / 2, y:canvas.height * 0.83, classKey:key, equipment, appearance }, time, { nickname:false, scale:2.75 });
  }

  window.EldoriaPixel = { drawWorld, drawBattle, drawChapter, drawBossIntro, portrait, visiblePoint };
})();
