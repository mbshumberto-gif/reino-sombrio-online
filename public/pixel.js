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
    monk: ['#5a3743','#9e5350','#d98160','#a3ded0']
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

  function house(ctx, x, y, roof, sign) {
    rect(ctx, x - 7, y + 12, 168, 88, '#1a2e34');
    rect(ctx, x + 1, y + 14, 150, 79, '#684a48');
    rect(ctx, x + 7, y + 26, 138, 60, '#be9b73');
    rect(ctx, x + 7, y + 66, 138, 20, '#93715e');
    for (let i = 0; i < 19; i++) {
      rect(ctx, x + 11 + (i * 31) % 127, y + 33 + (i * 17) % 44, 3 + i % 4, 2, i % 3 ? '#aa8869' : '#cdaa7d');
    }
    for (let xx = 15; xx < 150; xx += 33) rect(ctx, x + xx, y + 33, 4, 55, '#71534f');
    for (let k = 0; k < 8; k++) {
      const offset = Math.abs(6 - k) * 8;
      rect(ctx, x + offset - 12, y - 25 + k * 7, 175 - 2 * offset, 8, k % 2 ? roof[1] : roof[0]);
      for (let xx = offset - 6; xx < 156 - offset; xx += 13) rect(ctx, x + xx, y - 21 + k * 7, 8, 2, roof[2]);
    }
    rect(ctx, x - 10, y + 25, 171, 6, '#523644');
    rect(ctx, x + 65, y + 47, 25, 45, '#472f3d');
    rect(ctx, x + 71, y + 49, 15, 39, '#76504a');
    rect(ctx, x + 81, y + 65, 3, 4, '#efbc69');
    for (const xx of [23, 113]) {
      rect(ctx, x + xx, y + 45, 18, 19, '#554049');
      rect(ctx, x + xx + 3, y + 49, 12, 10, '#edc575');
      rect(ctx, x + xx + 8, y + 48, 2, 12, '#795952');
      rect(ctx, x + xx + 3, y + 54, 12, 2, '#795952');
    }
    rect(ctx, x + 59, y + 89, 36, 6, '#846b64');
    rect(ctx, x + 4, y + 87, 45, 4, '#56585c');
    rect(ctx, x + 104, y + 87, 39, 4, '#56585c');
    label(ctx, sign, x + 75, y + 5);
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
    const meadow = ['village', 'forest'].includes(map.region) && map.kind !== 'dungeon';
    const obstacles = [];
    const animatedWater = [];
    for (const [y, row] of map.grid.entries()) {
      for (const [x, tile] of row.entries()) {
        const px = x * W.TILE;
        const py = y * W.TILE;
        const seed = (x * 79 + y * 51 + x * y * 13) % 37;
        rect(ctx, px, py, 32, 32, tile === 2 ? palette[5] : tile === 3 ? palette[8] : palette[1]);
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
      house(ctx, 137, 101, ['#87514e','#a35c54','#ce8465'], 'ESTALAGEM');
      house(ctx, 648, 101, ['#485878','#65728c','#8794a3'], 'FORJA');
      for (const px of [303, 619]) {
        rect(ctx, px, 119, 24, 53, '#473b48');
        rect(ctx, px + 4, 120, 16, 40, '#777482');
        rect(ctx, px + 7, 126, 10, 15, '#c1a77f');
      }
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
    if (p.kind === 'portal') {
      const shut = p.requires && !state.world.cleared[p.requires] || p.shortcut && !state.world.orchardOpen
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
    monk:['...............','......oo.......','....oooooo.....','....ohhhho.....','...aataata.....','...o......a....']
  };

  function weapon(ctx, id, key, x, y, palette, scale, swinging) {
    const t = swinging ? -3 * scale : 0;
    const look = id === 'oakStaff' ? 'staff' : id === 'eclipseEdge' ? 'eclipse' : id ? 'sword' : key;
    const cs = { o: ink, t: palette[2], a: palette[3], b: '#9b654a', d: palette[0], e: '#eff6db' };
    const icons = {
      sword:['...oe','..oet','..oto','.oto.','oao..','.bo..','bo...'],
      eclipse:['...ea','..ata','.atao','atao.','tao..','ao...','b....'],
      staff:['.ao..','aea..','.ato.','..bo.','..bo.','..bo.','..bo.','..bo.'],
      mage:['.ao..','aea..','.ato.','..bo.','..bo.','..bo.','..bo.','..bo.'],
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
    const key = clothes[entry.classKey] ? entry.classKey : 'warrior';
    const palette = clothes[key];
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
    const cs = { o: ink, h: key === 'cleric' ? '#c5955f' : '#67445a', s: up ? '#664557' : '#e8a67d',
      e: up ? '#664557' : '#382c40', a: accent, b: main, d: dark, t: light };
    shape(ctx, -7 * scale, -17 * scale, commonBody, cs, scale);
    shape(ctx, -7 * scale, -18 * scale, headwear[key], cs, scale);
    if (key === 'warrior' || key === 'paladin') {
      rect(ctx, -6 * scale, -8 * scale, 4 * scale, 3 * scale, light);
      rect(ctx, 4 * scale, -8 * scale, 3 * scale, 3 * scale, light);
    }
    if (key === 'mage' || key === 'sorceress') {
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

  function monster(ctx, name, x, y, time, size = 2, boss = false, phase = 1) {
    const word = name.toLowerCase();
    const creature = /lobo|javali|cão/.test(word) ? 'beast' : /aranha|escorpião/.test(word) ? 'spider'
      : /corvo|harpia|morcego|draco/.test(word) ? 'wing' : /ent|raiz/.test(word) ? 'tree' : /vazio|espectro|malakar|sentinela/.test(word) ? 'ghost' : 'armor';
    const colors = {
      beast:['#37394f','#816b84','#cda1a1'], spider:['#423354','#755387','#ba7cad'],
      wing:['#503846','#995457','#e18c68'], tree:['#35473b','#63835b','#acc578'],
      ghost:['#432b5b','#784d89','#b883ac'], armor:['#374257','#6a718e','#a2a9bd']
    }[creature];
    const scale = boss ? size * 1.6 : size;
    const cs = { o:'#172539', d:colors[0], b:colors[1], t:colors[2], e:phase > 1 ? '#f9a681' : '#ffdf8b', a:'#eee0af' };
    const sprites = {
      beast:['..o..o.........','..ototo........','.oottbto.......','oabbebto...oo..','..obbbto.oobto.','...obbbbobto...','...obbbbbbo....','....obdddbo....','....odooobo....','....oo..oo.....'],
      spider:['...o......o....','..obo....obo...','.obo..oo..obo..','obo.oottoo.obo.','oo.ottbbtto.oo.','..otebbbeto....','.oobbbbbbbboo..','odoobbdbboodo..','oo..ooodo..oo..'],
      wing:['o.............o','oto....o....oto','obto..oto..otbo','odbbottttobbdo.','.obbbteetbbbbo.','..oobbttbbboo..','....obttbbo....','.....ooboo.....','......ao.......'],
      tree:['..to.o.to......','.otbobotot..o..','..obttbto.oto..','ootootttooobo..','.obbbteetbboo..','..otbbtbbtoo...','..obbtbtbbto...','...obbbbooo....','..obtdbbto.....','..otodoooto....','.oooo...oooo...'],
      ghost:['......ooo......','....ootttbo....','...ottbbbtbo...','..ottbeebttbo..','.ottbttbbtbddo.','.otbbttbbttbbo.','..odbbddbbbdo..','...odbdddbdo...','....oo.do.o....','.......o.......'],
      armor:['.....ooooo.....','....ottttto....','...ottbbttto...','...oeoddoeoo...','...obbtbbdoo...','..otttbbddboo..','..obtbttbbbo...','..oobbdddboo...','...oddooodo....','...ooo.oooo....']
    };
    const bob = Math.floor(Math.sin(time / 350) * 3);
    rect(ctx, x - 6 * scale, y - 2, 12 * scale, 3 * scale, '#13213292');
    shape(ctx, x - 7 * scale, y - 10 * scale + bob, sprites[creature], cs, scale);
    if (boss && phase === 3) {
      rect(ctx, x - 6 * scale, y - 10 * scale, 2 * scale, 2 * scale, '#f7ba79');
      rect(ctx, x + 5 * scale, y - 12 * scale, 2 * scale, 2 * scale, '#f7ba79');
    }
  }

  function visiblePoint(p, map, state) {
    if (p.kind === 'enemy') return !state.world.defeated[map.region]?.includes(p.enemyIndex);
    if (p.kind === 'boss') return !state.world.cleared[map.region];
    if (p.kind === 'dungeonEnemy' || p.kind === 'puzzle') return !state.world.rooms[map.region]?.includes(map.dungeonIndex);
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

  function drawWorld(canvas, state, positions, data, time) {
    const ctx = canvas.getContext('2d');
    const map = W.zone(state.zone);
    const palette = mapPalette(map);
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
    const region = data.regions.find(entry => entry.id === map.region);
    for (const p of map.points.filter(point => visiblePoint(point, map, state))) {
      const enemy = p.kind === 'enemy' ? region.enemies[p.enemyIndex] : p.kind === 'boss' ? region.boss
        : p.kind === 'dungeonEnemy' ? data.dungeons[map.region]?.[map.dungeonIndex] : null;
      if (enemy) {
        const mob = state.mobs?.[p.id];
        const { x, y } = mob ? follow('mob:' + p.id, mob.x, mob.y) : p;
        actors.push({ y, draw: () => {
          monster(ctx, enemy.name || enemy.enemy, x, y, time, 2, p.kind === 'boss' || map.dungeonIndex === 3);
          if (mob?.alert) label(ctx, '!', x, y - 39);
        } });
      } else actors.push({ y:p.y, draw: () => prop(ctx, p, map, state, time) });
    }
    for (const npc of W.npcPositions(map.id, time, state.world)) actors.push({ y:npc.y, draw: () => hero(ctx, npc, time) });
    for (const entry of state.players) {
      const p = { ...entry, ...positions.get(entry.id), self: entry.id === state.id };
      actors.push({ y:p.y, draw: () => hero(ctx, p, time) });
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
        const ally = { ...p, ...location, classKey:'rogue', equipment:{}, name:'Lia' };
        actors.push({ y:ally.y, draw: () => hero(ctx, ally, time, { scale:1.75 }) });
      }
    }
    if (state.world.cleared.shadow && map.id === 'village') {
      for (const [i, name] of ['Tomás','Elara','Borin','Nilo','Sera','Ivo'].entries()) {
        const resident = { name, classKey:Object.keys(clothes)[i + 2], x:350 + i * 47, y:184 + i % 2 * 20, facing:'down' };
        actors.push({ y:resident.y, draw: () => hero(ctx, resident, time, { scale:1.6 }) });
      }
    }
    actors.sort((a, b) => a.y - b.y).forEach(actor => actor.draw());
    for (let i = 0; i < 18; i++) {
      const x = (i * 127 + time / 146) % W.WIDTH;
      const y = (i * 58 + Math.sin(time / 1400 + i) * 11) % W.HEIGHT;
      rect(ctx, x, y, 2, 2, ['#eac576','#8ec3b2','#a69bc5'][i % 3] + (i % 2 ? 'a8' : '75'));
    }
    const period = Math.floor(Math.max(0, time - state.world.epoch) / 22000) % 4;
    if (period === 3 && map.kind !== 'dungeon' && ['village','forest'].includes(map.region)) {
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
    const foe = { x:608, y:169 };
    const enemyAction = action?.side === 'enemy';
    const heroColors = { warrior:'#ffc781', mage:'#ff7349', sorceress:'#ba8dfb', cleric:'#fff3a5',
      rogue:'#b498db', bard:'#ffc2e2', paladin:'#f7d475', ranger:'#a2de79', monk:'#72f1ce' };
    const enemyColors = { forest:'#aee16f', cave:'#7ad7f5', fire:'#ff7b4d', castle:'#f6cb8a', shadow:'#d19cff' };
    const effects = [];
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
        if (progress > 0.61) label(ctx, hit.damage ? '−' + hit.damage : 'ESQUIVA', x, y - 54 - progress * 12);
      });
    }
    monster(ctx, battle.name, foe.x - (enemyAction ? Math.sin(progress * Math.PI) * 28 : 0), 209, time, 7, battle.boss, battle.phase);
    for (let i = 0; i < battle.totems; i++) {
      stone(ctx, 535 + i * 115, 253, palette, true);
      label(ctx, 'Totem', 535 + i * 115, 264);
    }
    for (const draw of effects) draw();
    if (action?.damage && progress > 0.61) label(ctx, '−' + action.damage, foe.x, foe.y - progress * 24);
  }

  function portrait(canvas, key, time = 0, equipment) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (key === 'lume') lume(ctx, canvas.width / 2, canvas.height * 0.69, time, true);
    else hero(ctx, { x:canvas.width / 2, y:canvas.height * 0.83, classKey:key, equipment }, time, { nickname:false, scale:2.75 });
  }

  window.EldoriaPixel = { drawWorld, drawBattle, portrait, visiblePoint };
})();
