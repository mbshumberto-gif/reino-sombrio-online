/* RPG de cima (estilo Pokémon): câmera, visual, movimento e diálogos.
   Carregue DEPOIS do game.js. Não altera nenhuma comunicação online. */
(() => {
  const W = 960, H = 576, FADE_MS = 1100;
  const Z = 1.5;                       // zoom da câmera (2 = mais perto, 1 = vê o mapa todo)
  const VW = W / Z, VH = H / Z;        // parte do mundo visível na tela
  const cam = { x: 0, y: 0, init: false };
  const smooth = new Map();
  let lastArea = null, fadeStart = 0, rescue = null;
  let tsTimer = null;

  // ---------- Proteções contra travamento ----------
  // Se algo der erro ao atualizar a tela, o jogo não congela: mostra o erro e corrige qual tela aparece.
  const originalStateHandlers = typeof socket.listeners === "function" ? socket.listeners("state") : [];
  if (originalStateHandlers.length) {
    originalStateHandlers.forEach(fn => socket.off("state", fn));
    let lastErr = "";
    socket.on("state", state => {
      originalStateHandlers.forEach(fn => {
        try { fn(state); } catch (error) {
          console.error("Erro ao atualizar a tela:", error);
          if (error.message !== lastErr) { lastErr = error.message; toast("Erro na tela: " + error.message); }
        }
      });
      const battleEl = $("battle"), worldEl = $("overworld");
      if (battleEl && worldEl) {
        battleEl.classList.toggle("hidden", !state.battle);
        worldEl.classList.toggle("hidden", !!state.battle);
      }
      const ts = $("transitionScreen");
      if (ts && !ts.classList.contains("hidden")) {
        clearTimeout(tsTimer);
        tsTimer = setTimeout(() => ts.classList.add("hidden"), 6000); // fecha sozinha
      }
    });
  }
  $("transitionScreen")?.addEventListener("pointerdown", () => $("transitionScreen").classList.add("hidden"));
  socket.on("disconnect", () => toast("A conexão com o servidor caiu. Recarregue a página para voltar ao jogo."));

  // ---------- Partículas ambiente por região ----------
  const PART = {
    village: { c: "#fff3b0", n: 26, dy: -8, dx: 6, s: 3 },
    forest:  { c: "#c8ff7a", n: 34, dy: -6, dx: 5, s: 4 },
    cave:    { c: "#8be9e4", n: 30, dy: -4, dx: 3, s: 3 },
    fire:    { c: "#ffb347", n: 46, dy: -42, dx: 6, s: 3 },
    castle:  { c: "#d9cfc2", n: 28, dy: -5, dx: 8, s: 3 },
    shadow:  { c: "#d08bf2", n: 40, dy: -14, dx: 9, s: 4 }
  };
  const seeds = Array.from({ length: 60 }, (_, i) => ({ a: (i * 97) % W, b: (i * 53) % H, p: i * 0.7 }));

  function drawAmbient(ctx, area, t) {
    const cfg = PART[area] || PART.village, sec = t / 1000;
    ctx.save();
    ctx.fillStyle = cfg.c;
    for (let i = 0; i < cfg.n; i++) {
      const s = seeds[i];
      const x = (((s.a + Math.sin(sec * 0.6 + s.p) * 18 + sec * cfg.dx * (i % 2 ? 1 : -1)) % W) + W) % W;
      const y = (((s.b + sec * cfg.dy) % H) + H) % H;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(sec * 2 + s.p);
      ctx.fillRect(Math.round(x), Math.round(y), cfg.s, cfg.s);
    }
    ctx.restore();
  }

  function drawWater(ctx, area, t) {
    const base = worldCache.get(area);
    if (!base) return;
    const c = colorSet(area);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = c.glow;
    for (let y = 0; y < MAP_ROWS; y++) for (let x = 0; x < MAP_COLS; x++) {
      if (base.tiles[y][x] !== 3) continue;
      const o = (Math.sin(t / 400 + x * 1.7 + y * 0.9) + 1) * 5;
      ctx.fillRect(x * 32 + 4 + o, y * 32 + 10, 10, 2);
    }
    ctx.restore();
  }

  function drawVignette(ctx) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,.38)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function glow(ctx, x, y, color, t) {
    const r = 38 + Math.sin(t / 300) * 5;
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  function gateShape(ctx, x, y, locked) {
    rect(ctx, x - 25, y - 20, 50, 40, locked ? "#51424a" : "#72523a");
    rect(ctx, x - 19, y - 16, 38, 34, locked ? "#2b2534" : "#263e45");
    rect(ctx, x - 13, y - 12, 26, 27, locked ? "#473047" : "#73a6a0");
    rect(ctx, x - 7, y - 7, 14, 20, locked ? "#332239" : "#b6d28c");
  }

  function smoothPos(p) {
    let s = smooth.get(p.id);
    if (!s) { s = { x: p.x, y: p.y }; smooth.set(p.id, s); }
    s.x += (p.x - s.x) * 0.28;
    s.y += (p.y - s.y) * 0.28;
    if (Math.hypot(p.x - s.x, p.y - s.y) > 150) { s.x = p.x; s.y = p.y; }
    return s;
  }

  const REGION_IDS = ["forest", "cave", "fire", "castle", "shadow"];
  const NPC_NAMES = { chronicler: "Aderic", healer: "Mira", blacksmith: "Eldrin" };

  // ---------- Personagens com visual próprio por classe (armas, escudos, chapéus...) ----------
  const ROBES = ["mage", "sorceress", "cleric", "monk"];
  window.pixelHero = function (ctx, p, time = 0) {
    const cls = HEROES[p.classKey] ? p.classKey : "warrior", k = HEROES[cls];
    const face = p.facing || "down", dir = face === "left" ? -1 : 1, back = face === "up";
    const X = Math.round(p.x), Y = Math.round(p.y);
    const step = p.moving ? Math.sin(time / 90) : 0, bob = p.moving ? Math.round(Math.abs(step) * 3) : 0;
    const lift = Math.round(step * 3), lL = Math.max(0, lift), lR = Math.max(0, -lift), sw = Math.round(step * 2), wy = sw;
    const r = (dx, dy, w, h, c, fixed) => rect(ctx, dir > 0 ? X + dx : X - dx - w, Y + dy - (fixed ? 0 : bob), w, h, c);
    const eq = p.equipment || {};
    const armorTone = eq.armor === "shadowCloak" ? "#382b4f" : eq.armor === "chainArmor" ? "#9da9b2" : eq.armor ? "#9a6844" : null;
    const STEEL = "#aeb9c2", STEEL_D = "#6d7a86", GOLD = "#e5c46a", WOOD = "#8a603c", WHITE = "#f1ebd8", RED = "#b5424b";
    const robe = ROBES.includes(cls);
    let tip = null;

    rect(ctx, X - 16, Y + 17, 32, 7, "rgba(0,0,0,.35)");

    // Capas e itens nas costas
    if (cls === "paladin") r(-19, -8, 38, 30, "#a3333c");
    if (cls === "rogue") r(-19, -8, 38, 28, "#23232d");
    if (cls === "ranger") { r(-19, -8, 38, 26, k.trim); r(-22, -20, 7, 28, "#6a4a30"); r(-21, -26, 2, 7, WHITE); r(-18, -25, 2, 6, WHITE); }

    // Pernas e botas
    const pants = robe ? k.trim : cls === "rogue" ? "#2b2b36" : cls === "ranger" ? "#5a4a33" : cls === "paladin" ? STEEL_D : "#4b3c39";
    const boot = cls === "paladin" || cls === "warrior" ? STEEL_D : "#2a2f38";
    r(-12, 8 - lL, 9, 13 + lL, pants, true); r(3, 8 - lR, 9, 13 + lR, pants, true);
    r(-13, 18 - lL, 11, 4, boot, true); r(2, 18 - lR, 11, 4, boot, true);
    if (robe) { r(-17, 6, 34, 14, k.outfit); r(-17, 17, 34, 3, cls === "cleric" ? GOLD : k.accent); }

    // Tronco e armadura
    r(-15, -9, 30, 18, k.outfit);
    if (armorTone) r(-11, -8, 22, 15, armorTone);
    switch (cls) {
      case "warrior": r(-11, -8, 22, 15, STEEL); r(-4, -4, 8, 8, GOLD); r(-15, 6, 30, 3, k.trim); break;
      case "paladin": r(-13, -8, 26, 16, STEEL); r(-2, -6, 4, 14, GOLD); r(-6, -1, 12, 4, GOLD); r(-8, 8, 16, 14, WHITE); r(-8, 19, 16, 3, GOLD); break;
      case "mage": r(-15, 6, 30, 3, k.accent); r(-4, -9, 8, 18, k.trim); break;
      case "sorceress": r(-15, 5, 30, 3, k.accent); r(-5, -9, 10, 6, k.accent); break;
      case "cleric": r(-2, -6, 4, 14, GOLD); r(-6, -1, 12, 4, GOLD); r(-15, -9, 30, 3, GOLD); break;
      case "rogue": r(-15, 5, 30, 3, "#5a4a37"); r(7, 6, 8, 8, "#5a4a37"); r(-15, -9, 12, 5, RED); break;
      case "bard": r(-15, -3, 30, 4, k.accent); r(-15, 5, 30, 3, k.trim); r(-4, -9, 8, 18, "#d1a24a"); break;
      case "ranger": r(-15, 5, 30, 3, "#5a4a33"); r(-2, -9, 4, 4, GOLD); break;
      case "monk": r(-6, -9, 12, 12, k.skin); r(-15, 5, 30, 4, "#6b3a24"); r(-8, -9, 16, 3, "#e5c46b"); break;
    }

    // Braços, mãos e ombreiras
    const sleeve = cls === "warrior" || cls === "paladin" ? STEEL : cls === "monk" ? k.skin : cls === "rogue" ? "#2b2b36" : cls === "ranger" ? "#3d5f45" : k.outfit;
    r(-21, -8 - sw, 8, 15, sleeve); r(13, -8 + sw, 8, 15, sleeve);
    r(-21, 6 - sw, 8, 6, cls === "monk" ? WHITE : k.skin); r(13, 6 + sw, 8, 6, cls === "monk" ? WHITE : k.skin);
    if (cls === "warrior") { r(-24, -12, 12, 8, STEEL); r(12, -12, 12, 8, STEEL); r(-24, -12, 12, 2, GOLD); r(12, -12, 12, 2, GOLD); }
    if (cls === "paladin") { r(-26, -13, 14, 9, STEEL); r(12, -13, 14, 9, STEEL); r(-26, -13, 14, 2, GOLD); r(12, -13, 14, 2, GOLD); }

    // Cabeça
    r(-13, -31, 26, 22, k.skin);
    if (!back && cls !== "paladin") { const s = face === "down" ? 0 : 4; r(-8 + s, -21, 4, 4, "#20232a"); r(4 + s, -21, 4, 4, "#20232a"); }
    if (back) r(-13, -31, 26, 22, cls === "warrior" || cls === "paladin" ? STEEL : cls === "rogue" ? "#23232d" : cls === "ranger" ? "#3d5f45" : cls === "monk" ? k.skin : k.hair);
    switch (cls) {
      case "warrior":
        r(-13, -31, 26, 8, k.hair); r(-15, -35, 30, 11, STEEL); r(-15, -27, 5, 12, STEEL); r(10, -27, 5, 12, STEEL);
        r(-2, -27, 4, 10, STEEL_D); r(-3, -44, 6, 10, "#c0392b"); r(-3, -35, 6, 3, GOLD); break;
      case "paladin":
        r(-15, -36, 30, 25, STEEL); r(-12, -26, 24, 4, "#2a3441"); r(-2, -26, 4, 13, "#2a3441");
        r(-22, -37, 8, 6, WHITE); r(14, -37, 8, 6, WHITE); r(-3, -46, 6, 11, WHITE); r(-15, -36, 30, 3, GOLD); break;
      case "mage":
        r(-13, -31, 26, 7, k.hair); if (!back) r(-9, -14, 18, 12, "#e8e6e0");
        r(-18, -35, 36, 5, "#513b78"); r(-11, -44, 22, 10, "#513b78"); r(-6, -53, 12, 10, "#513b78");
        r(-11, -37, 22, 3, k.accent); r(-2, -45, 4, 4, "#fff0a8"); break;
      case "sorceress":
        r(-17, -31, 6, 36, k.hair); r(11, -31, 6, 36, k.hair); r(-13, -31, 26, 9, k.hair);
        if (back) r(-17, -31, 34, 38, k.hair);
        r(-10, -34, 20, 3, GOLD); r(-3, -39, 6, 6, "#ff7ad9"); break;
      case "cleric":
        r(-13, -31, 26, 7, k.hair); r(-15, -35, 30, 8, WHITE); r(-15, -28, 4, 14, WHITE); r(11, -28, 4, 14, WHITE);
        r(-6, -44, 12, 10, WHITE); r(-1, -43, 2, 6, GOLD); r(-3, -41, 6, 2, GOLD); break;
      case "rogue":
        r(-15, -35, 30, 12, "#23232d"); r(-15, -28, 5, 18, "#23232d"); r(10, -28, 5, 18, "#23232d");
        if (!back) r(-10, -16, 20, 8, RED); break;
      case "bard":
        r(-13, -31, 26, 7, k.hair); r(-18, -34, 36, 4, "#8b4e67"); r(-12, -42, 24, 9, "#8b4e67"); r(-12, -35, 24, 3, k.accent);
        r(9, -52, 4, 18, "#d24d57"); r(9, -53, 4, 4, "#f0d36a"); break;
      case "ranger":
        r(-13, -31, 26, 7, k.hair); r(-16, -35, 32, 12, "#3d5f45"); r(-16, -28, 5, 16, "#3d5f45"); r(11, -28, 5, 16, "#3d5f45"); r(-6, -42, 12, 9, "#3d5f45"); break;
      case "monk":
        r(-14, -26, 28, 5, "#d24d3b"); r(-19, -25, 6, 3, "#d24d3b"); r(-21, -22, 4, 10, "#d24d3b"); break;
    }

    // Escudos e armas
    switch (cls) {
      case "warrior":
        r(-30, -8, 15, 24, "#2f5f86"); r(-30, -8, 15, 3, GOLD); r(-30, 13, 15, 3, GOLD); r(-30, -8, 3, 24, GOLD); r(-18, -8, 3, 24, GOLD); r(-25, 0, 6, 8, GOLD);
        r(21, -22 + wy, 4, 28, "#e3eaee"); r(22, -27 + wy, 2, 5, "#e3eaee"); r(16, 5 + wy, 14, 3, GOLD); r(21, 8 + wy, 4, 8, WOOD); tip = [23, -27 + wy]; break;
      case "paladin":
        r(-34, -14, 18, 36, "#c7d2db"); r(-34, -14, 18, 3, GOLD); r(-34, 19, 18, 3, GOLD); r(-34, -14, 3, 36, GOLD); r(-19, -14, 3, 36, GOLD);
        r(-27, -6, 4, 20, GOLD); r(-31, 0, 12, 4, GOLD);
        r(19, -30 + wy, 9, 36, "rgba(255,240,170,.28)"); r(21, -30 + wy, 5, 36, "#f1f6f8"); r(15, 5 + wy, 17, 4, GOLD); r(22, 9 + wy, 3, 8, WOOD); tip = [23, -30 + wy]; break;
      case "mage":
        r(22, -32 + wy, 4, 60, WOOD); r(18, -42 + wy, 12, 12, k.accent); r(21, -39 + wy, 6, 6, "#fff7c8");
        r(-26, -2 - sw, 10, 13, "#7a2f3a"); r(-26, -2 - sw, 10, 2, GOLD); r(-17, 0 - sw, 2, 9, WHITE); tip = [24, -42 + wy]; break;
      case "sorceress":
        r(22, -26 + wy, 4, 56, WOOD); r(17, -40 + wy, 12, 4, k.accent); r(17, -40 + wy, 4, 14, k.accent); r(17, -30 + wy, 12, 4, k.accent);
        r(23, -37 + wy, 4, 6, "#ffe9ff"); tip = [22, -40 + wy]; break;
      case "cleric":
        r(-31, -7, 16, 16, GOLD); r(-29, -5, 12, 12, WHITE); r(-24, -4, 2, 10, GOLD); r(-27, -1, 8, 3, GOLD);
        r(22, -8 + wy, 4, 28, WOOD); r(18, -22 + wy, 12, 12, "#d9c27a"); r(20, -20 + wy, 3, 3, "#fff0b0");
        r(16, -18 + wy, 3, 4, STEEL); r(29, -18 + wy, 3, 4, STEEL); r(22, -25 + wy, 4, 3, STEEL); tip = [24, -25 + wy]; break;
      case "rogue":
        r(22, -12 + wy, 4, 20, "#dfe7ea"); r(19, 8 + wy, 10, 3, "#2a2a33"); r(22, 11 + wy, 4, 5, "#4a3a2a");
        r(-26, -12 - wy, 4, 20, "#dfe7ea"); r(-29, 8 - wy, 10, 3, "#2a2a33"); r(-26, 11 - wy, 4, 5, "#4a3a2a"); tip = [24, -12 + wy]; break;
      case "bard":
        r(16, 2 + wy, 15, 15, "#b8803f"); r(21, 7 + wy, 5, 5, "#3a2615"); r(21, -24 + wy, 4, 28, WOOD); r(19, -30 + wy, 8, 7, "#5c3b22"); r(23, -22 + wy, 2, 26, WHITE); tip = [23, -30 + wy]; break;
      case "ranger":
        r(25, -30 + wy, 4, 7, WOOD); r(28, -24 + wy, 4, 10, WOOD); r(30, -15 + wy, 4, 24, WOOD); r(28, 8 + wy, 4, 10, WOOD); r(25, 17 + wy, 4, 7, WOOD);
        r(24, -26 + wy, 2, 46, WHITE); tip = [27, -30 + wy]; break;
      case "monk":
        r(-24, 3 - sw, 14, 12, "rgba(255,214,102,.35)"); r(11, 3 + sw, 14, 12, "rgba(255,214,102,.35)");
        r(24, -36 + wy, 4, 70, WOOD); r(23, -38 + wy, 6, 4, GOLD); r(23, 30 + wy, 6, 4, GOLD); tip = [25, -38 + wy]; break;
    }
    // Brilho nas armas equipadas
    if (eq.weapon && tip && Math.sin(time / 180) > 0.2) { r(tip[0] - 2, tip[1] - 3, 6, 2, "#fff"); r(tip[0], tip[1] - 5, 2, 6, "#fff"); }
  };

  // ---------- Desenho principal do mundo, com câmera que segue o jogador ----------
  window.drawWorld = function () {
    const canvas = $("worldCanvas");
    if (!canvas || !latestState) return;
    const area = latestState.activeRegion || "village";
    if (!worldCache.has(area)) worldCache.set(area, drawMapBase(area));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext("2d"), base = worldCache.get(area), now = performance.now();
    const me = currentPlayer();

    if (area !== lastArea) {
      if (lastArea !== null) fadeStart = now;
      lastArea = area;
      smooth.clear();
      cam.init = false;
    }

    // Câmera: acompanha o jogador, sem sair do mapa
    const mine = me ? { ...me, ...(localPosition || {}) } : { x: W / 2, y: H / 2 };
    const tx = Math.max(0, Math.min(W - VW, mine.x - VW / 2));
    const ty = Math.max(0, Math.min(H - VH, mine.y - VH / 2));
    if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
    else { cam.x += (tx - cam.x) * 0.18; cam.y += (ty - cam.y) * 0.18; }
    const camX = Math.round(cam.x * Z) / Z, camY = Math.round(cam.y * Z) / Z;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#05070b";
    ctx.fillRect(0, 0, W, H);

    // ----- Mundo (com zoom) -----
    ctx.save();
    ctx.setTransform(Z, 0, 0, Z, -camX * Z, -camY * Z);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base.canvas, 0, 0);
    drawWater(ctx, area, now);

    const labels = [];
    const cleared = !!latestState.world?.[area];
    const idx = REGION_IDS.indexOf(area);

    if (area === "village") {
      glow(ctx, 480, 550, "#9be58f", now);
      gateShape(ctx, 480, 550, false);
      labels.push({ t: "FLORESTA", x: 480, y: 524, c: "#f4cf72" });
      NPC_POINTS.forEach((n, i) => {
        pixelHero(ctx, { x: n.x, y: n.y, facing: "down", classKey: i === 0 ? "mage" : i === 1 ? "cleric" : "warrior" }, now);
        labels.push({ t: NPC_NAMES[n.npc] || "", x: n.x, y: n.y - 62, c: "#e3f0f7", bg: true });
      });
    } else {
      const previous = idx === 0 ? "VILA" : (REGION_IDS[idx - 1] || "VILA").toUpperCase();
      const next = REGION_IDS[idx + 1];
      glow(ctx, 480, 550, "#8fc8e5", now);
      gateShape(ctx, 480, 550, false);
      labels.push({ t: previous, x: 480, y: 524, c: "#f4cf72" });
      glow(ctx, 480, 25, cleared ? "#9be58f" : "#c16d63", now);
      gateShape(ctx, 480, 25, !cleared);
      labels.push({ t: next ? (cleared ? "PRÓXIMA" : "SELADO") : "FIM", x: 480, y: 0, c: cleared ? "#f4cf72" : "#c16d63" });

      const region = window.gameRegions?.find(r => r.id === area);
      const enemies = region?.enemies || [], defeated = latestState.defeatedEnemies?.[area] || [];
      if (!cleared) {
        enemies.forEach((enemy, i) => {
          if (defeated.includes(i) || !ENEMY_POINTS[area]?.[i]) return;
          const p = ENEMY_POINTS[area][i];
          pixelMonster(ctx, enemy.name, p.x, p.y, 2.2, false, now);
          labels.push({ t: enemy.name, x: p.x, y: p.y + 38, c: "#fff0c2", bg: true });
        });
        if (region?.boss) {
          pixelMonster(ctx, region.boss.name, BOSS_POINTS[area].x, BOSS_POINTS[area].y, 3.5, true, now);
          labels.push({ t: "GUARDIÃO", x: 480, y: 135, c: "#f4cf72", bold: true });
        }
      }
    }

    // Jogadores (ordenados por altura para dar profundidade)
    const actors = [];
    (latestState.players || []).forEach(p => {
      if (me && p.id === me.id) {
        const pos = { ...me, ...(localPosition || {}), moving: heldKeys.size > 0 };
        actors.push({ y: pos.y, draw() {
          pixelHero(ctx, pos, now);
          labels.push({ t: me.name, x: pos.x, y: pos.y - 62, c: "#ffe08a", bg: true });
          labels.push({ t: "▼", x: pos.x, y: pos.y - 75 + Math.sin(now / 200) * 2, c: "#ffe08a" });
        } });
      } else {
        const s = smoothPos(p), moving = Math.hypot(p.x - s.x, p.y - s.y) > 1.5;
        actors.push({ y: s.y, draw() {
          pixelHero(ctx, { ...p, x: s.x, y: s.y, moving }, now);
          labels.push({ t: p.name, x: s.x, y: s.y - 62, c: "#e3f0f7", bg: true });
        } });
      }
    });
    actors.sort((a, b) => a.y - b.y).forEach(a => a.draw());
    ctx.restore();

    // ----- Tela (sem zoom): nomes, partículas, vinheta, transição -----
    ctx.textAlign = "center";
    labels.forEach(l => {
      const sx = Math.round((l.x - camX) * Z), sy = Math.round((l.y - camY) * Z);
      if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + 20) return;
      ctx.font = (l.bold ? "bold " : "bold ") + "13px monospace";
      if (l.bg) {
        const w = ctx.measureText(l.t).width + 10;
        ctx.fillStyle = "rgba(10,16,24,.72)";
        ctx.fillRect(Math.round(sx - w / 2), sy - 12, Math.round(w), 17);
      }
      ctx.fillStyle = l.c;
      ctx.fillText(l.t, sx, Math.max(12, sy));
    });

    drawAmbient(ctx, area, now);
    drawVignette(ctx);

    if (fadeStart) {
      const k = (now - fadeStart) / FADE_MS;
      if (k < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = "#05070b";
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = Math.min(1, (1 - k) * 1.6);
        ctx.fillStyle = "#f4cf72";
        ctx.font = "bold 30px monospace";
        ctx.fillText((window.regionScenes?.[area]?.title || "Eldoria").toUpperCase(), W / 2, H / 2);
        ctx.restore();
      } else fadeStart = 0;
    }

    $("nearbyPrompt").textContent = worldInteractionPrompt();
  };

  // ---------- Movimento (corrige personagem preso e evita desenho duplicado) ----------
  window.movementLoop = function (timestamp) {
    moveFrame = null;
    const me = currentPlayer();
    if (!me || latestState?.battle) { localPosition = null; return; }
    if (rescue) return;
    if (heldKeys.size === 0) { me.moving = false; return; }
    const dt = lastFrameTime ? Math.min(0.04, (timestamp - lastFrameTime) / 1000) : 0.016;
    lastFrameTime = timestamp;
    let dx = 0, dy = 0;
    if (heldKeys.has("left")) dx--;
    if (heldKeys.has("right")) dx++;
    if (heldKeys.has("up")) dy--;
    if (heldKeys.has("down")) dy++;
    const len = Math.hypot(dx, dy) || 1, speed = 200;
    const base = localPosition || { x: me.x, y: me.y };
    const nx = Math.max(20, Math.min(940, base.x + dx / len * speed * dt));
    const ny = Math.max(30, Math.min(520, base.y + dy / len * speed * dt));
    let x = base.x, y = base.y;
    if (moveBlocked(base.x, base.y)) { x = nx; y = ny; } // preso dentro de um bloco: deixa sair
    else {
      if (!moveBlocked(nx, base.y)) x = nx;
      if (!moveBlocked(x, ny)) y = ny;
    }
    let facing = me.facing || "down";
    if (Math.abs(dx) > Math.abs(dy)) facing = dx < 0 ? "left" : "right";
    else if (dy) facing = dy < 0 ? "up" : "down";
    localPosition = { x, y };
    me.x = x; me.y = y; me.facing = facing; me.moving = true;
    if (timestamp - lastMoveSent > 55) { socket.emit("movePlayer", { x, y, facing }); lastMoveSent = timestamp; }
    moveFrame = requestAnimationFrame(movementLoop);
  };

  // ---------- Resgate: se o jogador ficar fora do mapa (ex.: após o chefão), traz de volta ----------
  const offMap = p => p && (p.x > 945 || p.x < 12 || p.y < 20 || p.y > 545);
  function startRescue() {
    if (rescue) return;
    const me = currentPlayer();
    if (!me) return;
    const pos = { x: me.x, y: me.y };
    toast("Voltando você para a trilha...");
    rescue = setInterval(() => {
      const cur = currentPlayer();
      if (!cur || latestState?.battle) { clearInterval(rescue); rescue = null; return; }
      const dx = 480 - pos.x, dy = 470 - pos.y, d = Math.hypot(dx, dy);
      const done = d < 18;
      if (done) { pos.x = 480; pos.y = 470; } else { pos.x += dx / d * 18; pos.y += dy / d * 18; }
      const facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
      socket.emit("movePlayer", { x: pos.x, y: pos.y, facing });
      cur.x = pos.x; cur.y = pos.y; localPosition = { x: pos.x, y: pos.y };
      if (done) { clearInterval(rescue); rescue = null; }
    }, 50);
  }
  socket.on("state", () => { if (offMap(currentPlayer())) startRescue(); });

  // ---------- Botão E para celular ----------
  const ov = $("overworld");
  if (ov && !$("interactBtn")) {
    if (getComputedStyle(ov).position === "static") ov.style.position = "relative";
    const b = document.createElement("button");
    b.id = "interactBtn"; b.type = "button"; b.textContent = "E";
    Object.assign(b.style, {
      position: "absolute", right: "14px", bottom: "14px", width: "56px", height: "56px",
      borderRadius: "50%", border: "3px solid #f4cf72", background: "rgba(16,26,35,.85)",
      color: "#f4cf72", font: "bold 22px monospace", zIndex: "5", touchAction: "manipulation"
    });
    b.addEventListener("pointerdown", e => { e.preventDefault(); interactWorld(); });
    ov.appendChild(b);
  }

  // ---------- Caixa de diálogo dos NPCs ----------
  let dlg = null, dlgTitle = "", dlgLines = [], dlgIdx = 0;
  function renderLine() {
    const t = document.createElement("strong");
    t.textContent = dlgTitle;
    const p = document.createElement("p");
    p.style.margin = "6px 0";
    p.textContent = dlgLines[dlgIdx] || "";
    const h = document.createElement("small");
    h.style.opacity = ".7";
    h.textContent = dlgIdx < dlgLines.length - 1 ? "Toque ou E para continuar ▶" : "Toque ou E para fechar ■";
    dlg.replaceChildren(t, p, h);
  }
  function nextLine() {
    dlgIdx++;
    if (dlgIdx >= dlgLines.length) dlg.style.display = "none"; else renderLine();
  }
  socket.on("dialogue", data => {
    dlgTitle = data?.title || "";
    dlgLines = Array.isArray(data?.lines) ? data.lines : [];
    dlgIdx = 0;
    if (!dlgLines.length) return;
    if (!dlg) {
      dlg = document.createElement("div");
      dlg.id = "dialogueBox";
      Object.assign(dlg.style, {
        position: "fixed", left: "50%", bottom: "16px", transform: "translateX(-50%)",
        width: "min(92vw,640px)", background: "rgba(14,20,30,.95)", border: "3px solid #f4cf72",
        borderRadius: "10px", padding: "12px 16px", color: "#fff0c2", font: "15px/1.4 monospace",
        zIndex: "50", cursor: "pointer"
      });
      dlg.addEventListener("pointerdown", e => { e.preventDefault(); nextLine(); });
      document.body.appendChild(dlg);
    }
    dlg.style.display = "block";
    renderLine();
  });
  window.addEventListener("keydown", e => {
    if (dlg && dlg.style.display === "block" && ["KeyE", "Enter", "Space"].includes(e.code)) {
      e.preventDefault(); e.stopImmediatePropagation(); nextLine();
    }
  }, true);
})();
