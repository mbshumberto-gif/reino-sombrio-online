/* Plataforma cooperativa 2D: fases horizontais, saltos e chefes por capítulo. */
(() => {
  const canvas = $("worldCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = 960; canvas.height = 540;
  const W = 1800, FLOOR = 455, SPEED = 255, GRAVITY = 1180, JUMP = -470;
  const keys = new Set();
  let px = 60, py = FLOOR, vy = 0, camera = 0, last = 0, lastSent = 0;
  let grounded = true, facing = "right", stageKey = "", finishSent = false, enemyCooldown = 0;
  let stage = 0, region = "village", lastBattle = false, bossCleared = false;
  const palette = {
    village:["#80b6c5","#d9e9d0","#477b4d","#7a583c","#d4b66c"],
    forest:["#182d29","#385c3d","#274d35","#7a6345","#9bc16b"],
    cave:["#172433","#3c5267","#293c4d","#667887","#9ce1d7"],
    fire:["#4a2630","#a24e37","#633b36","#a36c48","#ffc35b"],
    castle:["#24283c","#50546b","#383c50","#8d7d82","#e1c27a"],
    shadow:["#130f27","#38254f","#251b3b","#675078","#ce8af0"]
  };
  const stages = [
    {floors:[[0,390],[490,760],[860,1200],[1300,1800]], platforms:[[250,360,130],[600,310,120],[980,350,150],[1450,300,150]], hazards:[[760,860],[1200,1300]]},
    {floors:[[0,300],[390,680],[770,1060],[1150,1450],[1540,1800]], platforms:[[180,345,130],[470,280,120],[850,340,140],[1230,290,120],[1600,345,100]], hazards:[[300,390],[680,770],[1060,1150],[1450,1540]]},
    {floors:[[0,340],[430,820],[920,1260],[1360,1800]], platforms:[[260,330,120],[520,270,140],[900,330,120],[1120,260,130],[1480,310,130]], hazards:[[340,430],[820,920],[1260,1360]]}
  ];
  const mobs = [500, 990, 1450];
  const levelData = () => stages[Math.min(stage,2)];
  const me = () => latestState?.players?.find(p => p.id === socket.id);
  const areaName = () => window.regionScenes?.[region]?.title || (region === "village" ? "Vila de Eldoria" : region);
  function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function drawBackground(c){
    const pal=palette[region]||palette.village;
    const grad=ctx.createLinearGradient(0,0,0,540);grad.addColorStop(0,pal[0]);grad.addColorStop(1,pal[1]);ctx.fillStyle=grad;ctx.fillRect(0,0,960,540);
    // Camadas de cenário em parallax, para dar sensação de avanço.
    const shift=camera*.22;
    for(let i=0;i<8;i++){
      const x=((i*280-shift)%2200+2200)%2200-100;
      if(region==="village"||region==="forest"){
        rect(x+30,245,22,210,"#294638");rect(x,220,82,92,pal[2]);rect(x+13,190,56,75,pal[1]);
      } else if(region==="cave"){
        rect(x+20,0,36,250,pal[2]);rect(x+5,0,70,35,pal[3]);rect(x+32,210,12,70,pal[4]);
      } else if(region==="fire"){
        rect(x+20,150,38,300,pal[2]);rect(x,130,75,50,pal[3]);rect(x+34,310,10,110,pal[4]);
      } else {
        rect(x+12,100,55,355,pal[2]);rect(x,85,80,35,pal[3]);rect(x+27,190,24,85,pal[4]);
      }
    }
    rect(0,440,960,100,"#17251f");
  }
  function drawPlatform(x,y,w,pal){
    rect(x,y,w,18,pal[3]);rect(x,y+18,w,9,pal[2]);rect(x,y,w,5,pal[4]);
    for(let i=8;i<w;i+=24)rect(x+i,y+23,8,4,pal[3]);
  }
  function drawHero(p,x,y,isMe=false){
    if(typeof pixelHero==="function"){
      pixelHero(ctx,{...p,x,y:y-18,facing:p.facing||"right",moving:isMe&&keys.size>0},performance.now());
    } else {
      rect(x-13,y-35,26,35,"#e2bd61");rect(x-10,y-48,20,16,"#d9a77b");
    }
    ctx.font="13px monospace";ctx.textAlign="center";ctx.fillStyle=isMe?"#fff0c2":"#d7e8f1";
    ctx.fillText(p.name||"Herói",x,y-62);
  }
  function drawMob(x,idx,pal){
    const name=(window.gameRegions?.find(r=>r.id===region)?.enemies||[])[idx]?.name||"Criatura";
    if(typeof pixelMonster==="function")pixelMonster(ctx,name,x-camera,FLOOR-32,2.8,false,performance.now());
    ctx.fillStyle="#fff0c2";ctx.font="12px monospace";ctx.textAlign="center";ctx.fillText(name,x-camera,FLOOR-62);
  }
  function paint(){
    if(!latestState||latestState.battle)return;
    const pal=palette[region]||palette.village, data=levelData();
    camera=Math.max(0,Math.min(W-960,px-360));
    drawBackground(camera);
    for(const [a,b] of data.floors){
      rect(a-camera,FLOOR,b-a,85,pal[2]);rect(a-camera,FLOOR,b-a,8,pal[4]);
      for(let x=a+12;x<b;x+=34)rect(x-camera,FLOOR+22,15,5,pal[3]);
    }
    for(const [x,y,w] of data.platforms)drawPlatform(x-camera,y,w,pal);
    for(const [a,b] of data.hazards){
      for(let x=a;x<b;x+=24){ctx.fillStyle="#d85d4d";ctx.beginPath();ctx.moveTo(x-camera,FLOOR);ctx.lineTo(x+12-camera,FLOOR-24);ctx.lineTo(x+24-camera,FLOOR);ctx.fill();}
    }
    if(region!=="village"){
      const defeated=latestState.defeatedEnemies?.[region]||[];
      mobs.forEach((x,i)=>{if(!defeated.includes(i)&&stage===0)drawMob(x,i,pal);});
    }
    // Portal de fim de fase e identificação da campanha.
    const gateX=1715-camera;
    rect(gateX-23,330,46,125,latestState.world?.[region]?"#d9bd72":"#735b43");
    rect(gateX-15,342,30,108,"#19232d");rect(gateX-8,350,16,92,pal[4]);
    ctx.fillStyle="#fff0c2";ctx.font="bold 14px monospace";ctx.textAlign="center";
    ctx.fillText("PORTAL",gateX,315);
    const players=latestState.players||[];
    players.forEach(p=>{
      const x=(p.id===socket.id?px:p.x)-camera, y=p.id===socket.id?py:p.y;
      if(x>-80&&x<1040)drawHero(p,x,y,p.id===socket.id);
    });
    // HUD dentro da própria fase, sem cobrir a ação.
    rect(12,12,330,55,"#101a23d9");ctx.fillStyle="#f4cf72";ctx.font="12px monospace";ctx.textAlign="left";
    ctx.fillText(areaName().toUpperCase(),24,34);ctx.fillStyle="#fff0c2";
    ctx.fillText(region==="village"?"PRÓLOGO • ELDORIA":("FASE "+(stage+1)+" DE 3 • "+(latestState.world?.[region]?"GUARDIÃO DERROTADO":"CAMINHO DO GUARDIÃO")),24,54);
    rect(760,14,188,10,"#101a23");rect(760,14,188*(Math.min(W,px)/W),10,pal[4]);
    ctx.fillStyle="#fff0c2";ctx.textAlign="right";ctx.fillText("AVANÇO",945,39);
    $("mapTitle").textContent=areaName().toUpperCase()+" • FASE "+(stage+1);
    $("nearbyPrompt").textContent=px>1580?(latestState.world?.[region]?"E — PRÓXIMA REGIÃO":"E — AVANÇAR / ENFRENTAR CHEFE"):"A/D OU ← → ANDAR • ESPAÇO PULAR • E NO PORTAL";
  }
  function solidAt(x,y){
    const data=levelData();
    return data.floors.some(([a,b])=>x>=a&&x<=b&&y>=FLOOR-3) ||
      data.platforms.some(([a,top,w])=>x>=a&&x<=a+w&&y>=top-3&&y<=top+20);
  }
  function onGround(){
    const data=levelData();
    return data.floors.some(([a,b])=>px+12>a&&px-12<b&&py>=FLOOR-2) ||
      data.platforms.some(([a,top,w])=>px+10>a&&px-10<a+w&&py>=top-2&&py<=top+10&&vy>=0);
  }
  function advance(){
    if(px<1580)return toast("Continue avançando até o portal no fim da fase.");
    if(finishSent)return;
    finishSent=true;socket.emit("platformerAdvance");
    setTimeout(()=>{finishSent=false;},1800);
  }
  function update(dt){
    if(!latestState||latestState.battle)return;
    const current=me();if(!current)return;
    let dir=0;if(keys.has("left"))dir--;if(keys.has("right"))dir++;
    if(dir)facing=dir<0?"left":"right";
    const oldY=py;
    px=Math.max(24,Math.min(W-35,px+dir*SPEED*dt));
    if(!grounded)vy+=GRAVITY*dt;
    py+=vy*dt;
    const data=levelData();
    const wasAbovePlatform=data.platforms.find(([x,y,w])=>px+9>x&&px-9<x+w&&oldY<=y+5&&py>=y&&vy>=0);
    if(wasAbovePlatform){py=wasAbovePlatform[1];vy=0;grounded=true;}
    else if(data.floors.some(([a,b])=>px+10>a&&px-10<b&&py>=FLOOR)){py=FLOOR;vy=0;grounded=true;}
    else grounded=false;
    const inPit=data.hazards.some(([a,b])=>px>a-4&&px<b+4);
    if(py>540||inPit&&py>FLOOR-18){px=Math.max(60,Math.floor(px/360)*360-180);py=FLOOR;vy=0;grounded=true;toast("Você caiu! Voltou ao último trecho seguro.");}
    if(region!=="village"&&stage===0&&Date.now()>enemyCooldown){
      const defeated=latestState.defeatedEnemies?.[region]||[];
      for(let i=0;i<mobs.length;i++)if(!defeated.includes(i)&&Math.abs(px-mobs[i])<35&&Math.abs(py-FLOOR)<55){
        enemyCooldown=Date.now()+2200;socket.emit("explore",{area:region,action:"enter",enemyIndex:i});break;
      }
    }
    if(Date.now()-lastSent>45){
      socket.emit("movePlayer",{x:px,y:py,facing});lastSent=Date.now();
    }
    if(px>1580&&keys.has("interact"))advance();
  }
  function loop(t){
    const dt=last?Math.min(.035,(t-last)/1000):.016;last=t;
    update(dt);paint();requestAnimationFrame(loop);
  }
  function setKey(code,down){
    const map={ArrowLeft:"left",KeyA:"left",ArrowRight:"right",KeyD:"right"};
    if(map[code]){down?keys.add(map[code]):keys.delete(map[code]);return true;}
    if(code==="Space"&&down){
      if(latestState?.battle)return false;
      if(grounded){vy=JUMP;grounded=false;}return true;
    }
    if(code==="KeyE"&&down){if(px>1580)advance();return true;}
    return false;
  }
  window.addEventListener("keydown",e=>{
    if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName))return;
    if(setKey(e.code,true)){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  window.addEventListener("keyup",e=>{if(setKey(e.code,false)){e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener("blur",()=>keys.clear());
  document.addEventListener("pointerdown",e=>{
    const button=e.target.closest("[data-move],[data-jump],[data-interact]");
    if(!button)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(button.dataset.jump){if(grounded){vy=JUMP;grounded=false;}return;}
    if(button.dataset.interact){keys.add("interact");return;}
    const direction=button.dataset.move;
    if(direction==="left")keys.add("left");if(direction==="right")keys.add("right");
    button.setPointerCapture?.(e.pointerId);
  },true);
  ["pointerup","pointercancel","lostpointercapture"].forEach(type=>document.addEventListener(type,e=>{
    const button=e.target.closest?.("[data-move],[data-interact]");if(button){if(button.dataset.interact)keys.delete("interact");else keys.delete(button.dataset.move);e.stopImmediatePropagation();}
  },true));
  window.renderMap=paint;
  window.worldAnimation=()=>{};
  socket.on("state",state=>{
    const current=state.players?.find(p=>p.id===socket.id);
    const changed=region!==state.activeRegion||stage!==Number(state.levelIndex||0);
    if(changed){
      region=state.activeRegion||"village";stage=Number(state.levelIndex||0);
      px=current?.x??60;py=current?.y??FLOOR;vy=0;grounded=true;camera=0;finishSent=false;
    } else if(current&&Math.abs(current.x-px)>95){px=current.x;py=current.y;}
    if(lastBattle&&!state.battle&&state.world?.[region])bossCleared=true;
    lastBattle=!!state.battle;
    if(state.battle){keys.clear();$("overworld").classList.add("hidden");}
    else $("overworld").classList.remove("hidden");
    paint();
  });
  socket.on("joined",()=>{region=latestState?.activeRegion||"village";stage=Number(latestState?.levelIndex||0);px=60;py=FLOOR;vy=0;finishSent=false;});
  // O canvas da fase fica em foco; os menus e a batalha continuam usando a estrutura existente.
  $("overworld").setAttribute("aria-label","Plataforma 2D cooperativa. A/D ou setas para andar, espaço para pular e E no portal.");
  requestAnimationFrame(loop);
})();
