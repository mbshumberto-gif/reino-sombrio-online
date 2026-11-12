/* RPG de cima (estilo Pokémon): câmera, visual, movimento e diálogos.
   Carregue DEPOIS do game.js. Não altera nenhuma comunicação online. */
(() => {
  const W = 960, H = 576, FADE_MS = 1100;
  const Z = 1.5;                       // zoom da câmera (2 = mais perto, 1 = vê o mapa todo)
  const VW = W / Z, VH = H / Z;        // parte do mundo visível na tela
  const cam = { x: 0, y: 0, init: false };
  const smooth = new Map();
  let lastArea = null, fadeStart = 0, rescue = null;

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
        labels.push({ t: NPC_NAMES[n.npc] || "", x: n.x, y: n.y - 38, c: "#e3f0f7", bg: true });
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
          labels.push({ t: me.name, x: pos.x, y: pos.y - 40, c: "#ffe08a", bg: true });
          labels.push({ t: "▼", x: pos.x, y: pos.y - 52 + Math.sin(now / 200) * 2, c: "#ffe08a" });
        } });
      } else {
        const s = smoothPos(p), moving = Math.hypot(p.x - s.x, p.y - s.y) > 1.5;
        actors.push({ y: s.y, draw() {
          pixelHero(ctx, { ...p, x: s.x, y: s.y, moving }, now);
          labels.push({ t: p.name, x: s.x, y: s.y - 40, c: "#e3f0f7", bg: true });
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
      const done = d < 16;
      if (done) { pos.x = 480; pos.y = 470; } else { pos.x += dx / d * 16; pos.y += dy / d * 16; }
      const facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
      socket.emit("movePlayer", { x: pos.x, y: pos.y, facing });
      cur.x = pos.x; cur.y = pos.y; localPosition = { x: pos.x, y: pos.y };
      if (done) { clearInterval(rescue); rescue = null; }
    }, 60);
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
