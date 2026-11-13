/* Plataforma cooperativa 2D: fases horizontais, saltos e chefes por capítulo. */
(() => {
  const canvas = $("worldCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = 960; canvas.height = 540;
  const REGION_WIDTH = 1800, REGION_ORDER = ["village","forest","cave","fire","castle","shadow"], W = REGION_WIDTH * REGION_ORDER.length, FLOOR = 455, SPEED = 255, GRAVITY = 1180, JUMP = -470;
  const keys = new Set();
  let px = 60, py = FLOOR, vy = 0, camera = 0, last = 0, lastSent = 0;
  let grounded = true, facing = "right", enemyCooldown = 0, lastSafeX = 60;
  let region = "village", lastBattle = false;
  const palette = {
    village:["#80b6c5","#d9e9d0","#477b4d","#7a583c","#d4b66c"],
    forest:["#182d29","#385c3d","#274d35","#7a6345","#9bc16b"],
    cave:["#172433","#3c5267","#293c4d","#667887","#9ce1d7"],
    fire:["#4a2630","#a24e37","#633b36","#a36c48","#ffc35b"],
    castle:["#24283c","#50546b","#383c50","#8d7d82","#e1c27a"],
    shadow:["#130f27","#38254f","#251b3b","#675078","#ce8af0"]
  };
  // Cada região tem três percursos próprios. O desenho do cenário e os obstáculos mudam por capítulo.
  const stages = {
    village:[
      {floors:[[0,500],[590,980],[1080,1800]],platforms:[[250,365,130],[690,320,140],[1190,360,150],[1480,300,120]],hazards:[[500,590],[980,1080]]},
      {floors:[[0,360],[450,900],[990,1300],[1390,1800]],platforms:[[150,350,110],[520,280,150],[1080,330,120],[1510,290,130]],hazards:[[360,450],[900,990],[1300,1390]]},
      {floors:[[0,320],[410,760],[850,1180],[1280,1800]],platforms:[[210,340,120],[510,270,140],[930,320,120],[1370,280,150],[1600,350,100]],hazards:[[320,410],[760,850],[1180,1280]]}
    ],
    forest:[
      {floors:[[0,330],[430,720],[830,1120],[1230,1510],[1610,1800]],platforms:[[170,350,130],[510,285,125],[900,330,150],[1290,265,120],[1650,330,100]],hazards:[[330,430],[720,830],[1120,1230],[1510,1610]]},
      {floors:[[0,430],[530,810],[910,1190],[1290,1800]],platforms:[[250,340,120],[590,275,140],[970,320,140],[1370,285,150]],hazards:[[430,530],[810,910],[1190,1290]]},
      {floors:[[0,290],[390,650],[750,1030],[1130,1400],[1500,1800]],platforms:[[130,345,120],[450,260,140],[820,310,130],[1200,250,130],[1570,320,140]],hazards:[[290,390],[650,750],[1030,1130],[1400,1500]]}
    ],
    cave:[
      {floors:[[0,420],[520,790],[890,1160],[1260,1800]],platforms:[[180,355,120],[570,285,130],[940,335,120],[1320,275,150],[1600,350,100]],hazards:[[420,520],[790,890],[1160,1260]]},
      {floors:[[0,300],[400,680],[780,1060],[1160,1440],[1540,1800]],platforms:[[140,345,120],[470,265,120],[850,320,130],[1230,250,130],[1600,320,120]],hazards:[[300,400],[680,780],[1060,1160],[1440,1540]]},
      {floors:[[0,360],[460,740],[840,1120],[1220,1500],[1600,1800]],platforms:[[210,315,120],[510,245,140],[900,300,130],[1280,230,140],[1640,320,100]],hazards:[[360,460],[740,840],[1120,1220],[1500,1600]]}
    ],
    fire:[
      {floors:[[0,300],[400,650],[750,1000],[1100,1350],[1450,1800]],platforms:[[140,345,120],[440,265,130],[790,325,120],[1140,255,130],[1510,315,140]],hazards:[[300,400],[650,750],[1000,1100],[1350,1450]]},
      {floors:[[0,460],[560,810],[910,1160],[1260,1800]],platforms:[[220,350,130],[610,275,130],[960,330,140],[1330,270,150]],hazards:[[460,560],[810,910],[1160,1260]]},
      {floors:[[0,280],[380,620],[720,970],[1070,1320],[1420,1800]],platforms:[[120,330,130],[430,245,120],[770,300,140],[1120,235,130],[1480,300,150]],hazards:[[280,380],[620,720],[970,1070],[1320,1420]]}
    ],
    castle:[
      {floors:[[0,380],[480,760],[860,1140],[1240,1520],[1620,1800]],platforms:[[180,345,130],[520,265,120],[900,325,140],[1280,255,130],[1650,330,100]],hazards:[[380,480],[760,860],[1140,1240],[1520,1620]]},
      {floors:[[0,300],[400,700],[800,1100],[1200,1500],[1600,1800]],platforms:[[130,340,120],[460,250,140],[860,315,120],[1260,245,130],[1640,310,100]],hazards:[[300,400],[700,800],[1100,1200],[1500,1600]]},
      {floors:[[0,420],[520,780],[880,1140],[1240,1500],[1600,1800]],platforms:[[210,340,120],[570,260,130],[930,320,130],[1290,250,140],[1650,325,100]],hazards:[[420,520],[780,880],[1140,1240],[1500,1600]]}
    ],
    shadow:[
      {floors:[[0,280],[380,640],[740,1000],[1100,1360],[1460,1800]],platforms:[[120,340,130],[430,255,130],[790,315,120],[1150,245,130],[1510,305,150]],hazards:[[280,380],[640,740],[1000,1100],[1360,1460]]},
      {floors:[[0,360],[460,700],[800,1040],[1140,1380],[1480,1800]],platforms:[[190,320,120],[500,240,120],[850,300,130],[1190,230,130],[1530,290,140]],hazards:[[360,460],[700,800],[1040,1140],[1380,1480]]},
      {floors:[[0,300],[400,650],[750,1000],[1100,1350],[1450,1800]],platforms:[[140,335,120],[450,245,130],[800,300,130],[1150,235,130],[1500,290,160]],hazards:[[300,400],[650,750],[1000,1100],[1350,1450]]}
    ]
  };
  const regionBase = id => Math.max(0, REGION_ORDER.indexOf(id)) * REGION_WIDTH;
  const regionForX = x => REGION_ORDER[Math.max(0,Math.min(REGION_ORDER.length-1,Math.floor(x/REGION_WIDTH)))];
  const worldTerrain = {floors:[],platforms:[],hazards:[]};
  REGION_ORDER.forEach((id,index)=>{
    const offset=index*REGION_WIDTH, map=(stages[id]||stages.village)[0];
    map.floors.forEach(([a,b])=>worldTerrain.floors.push([a+offset,b+offset]));
    map.platforms.forEach(([x,y,w])=>worldTerrain.platforms.push([x+offset,y,w]));
    map.hazards.forEach(([a,b])=>worldTerrain.hazards.push([a+offset,b+offset]));
  });
  const mobsByRegion = {village:[],forest:[470,930,1390],cave:[250,650,1450],fire:[500,850,1550],castle:[250,620,1390],shadow:[200,500,1550]};
  const mobs = () => (mobsByRegion[region] || []).map(x=>x+regionBase(region));
  const levelData = () => worldTerrain;
  const me = () => latestState?.players?.find(p => p.id === socket.id);
  const areaName = () => window.regionScenes?.[region]?.title || (region === "village" ? "Vila de Eldoria" : region);
  function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function drawBiomeBackground(c){
    const pal=palette[region]||palette.village, time=performance.now()/1000;
    const grad=ctx.createLinearGradient(0,0,0,540);
    grad.addColorStop(0,pal[0]);grad.addColorStop(.68,pal[1]);grad.addColorStop(1,pal[2]);
    ctx.fillStyle=grad;ctx.fillRect(0,0,960,540);
    const shift=c*.2;
    // Silhuetas e marcos exclusivos de cada região, com deslocamento em parallax.
    if(region==="village"){
      rect(0,300,960,145,"#799b82");
      for(let i=0;i<7;i++){const x=((i*310-shift*.7)%2300+2300)%2300-120;
        rect(x+20,270,115,175,"#5c5949");rect(x+9,255,137,28,"#754b3e");
        rect(x+36,300,30,55,"#d4b66c");rect(x+80,315,24,25,"#9ec3b5");
        rect(x+60,375,35,70,"#3b3030");}
      rect(0,390,960,8,"#d3ba7a");
    }else if(region==="forest"){
      rect(0,300,960,150,"#1b382a");
      for(let i=0;i<12;i++){const x=((i*190-shift*.8)%2200+2200)%2200-80,h=125+(i%4)*28;
        rect(x+23,300-h*.35,24,h,"#3d4d32");rect(x,260-h*.35,72,90,"#244c35");
        rect(x+10,230-h*.35,52,65,i%2?"#315c3c":"#3b6943");}
      for(let i=0;i<18;i++){const x=((i*83-shift+time*12)%1000+1000)%1000,y=120+(i*47)%280+Math.sin(time*1.8+i)*8;rect(x,y,4,4,"#a8d879");}
    }else if(region==="cave"){
      rect(0,0,960,445,"#101b2a");
      for(let i=0;i<13;i++){const x=((i*170-shift*.65)%2100+2100)%2100-70,h=80+(i%4)*32;
        rect(x,0,18,h,"#34475b");rect(x-8,h-18,34,18,"#536b7c");}
      for(let i=0;i<9;i++){const x=((i*230-shift)%2100+2100)%2100-50,y=290+(i%3)*34;
        rect(x,y,10,80,"#4b7890");rect(x-7,y+18,24,8,"#9ce1d7");rect(x+2,y+8,6,55,"#b7f5e7");}
    }else if(region==="fire"){
      rect(0,300,960,150,"#3a2225");
      for(let i=0;i<7;i++){const x=((i*330-shift*.7)%2300+2300)%2300-160;
        rect(x,180,210,270,"#542d32");rect(x+20,150,170,45,"#763b34");rect(x+70,115,75,45,"#a24e37");
        rect(x+90,90+Math.sin(time*2+i)*5,35,35,"#f08b43");}
      for(let i=0;i<24;i++){const x=((i*71-shift+time*(18+i%5))%980+980)%980,y=180+((i*37+time*22)%250);rect(x,y,3,5,i%2?"#ffbf58":"#e66b3b");}
    }else if(region==="castle"){
      rect(0,300,960,150,"#24283c");
      for(let i=0;i<6;i++){const x=((i*260-shift*.72)%2200+2200)%2200-80;
        rect(x,130,115,315,"#3c4054");rect(x-10,112,135,22,"#8d7d82");
        for(let j=0;j<4;j++)rect(x+8+j*30,92,16,26,"#56566b");
        rect(x+42,190,30,70,"#202638");rect(x+50,205,14,30,"#e1c27a");}
      rect(390,210,180,235,"#30344a");rect(425,165,110,85,"#53546a");
    }else{
      rect(0,300,960,150,"#171127");
      for(let i=0;i<10;i++){const x=((i*210-shift*.75)%2200+2200)%2200-80,y=90+(i%3)*75;
        rect(x,y,55,270,"#29203e");rect(x-8,y-20,71,24,"#604477");rect(x+17,y+65,21,80,"#3f2b59");}
      for(let i=0;i<28;i++){const x=((i*59-shift+time*(5+i%4))%1000+1000)%1000,y=60+(i*43)%330+Math.sin(time+i)*7;rect(x,y,3,3,"#d08bf2");}
    }
    // Céu e horizonte com detalhes que se movem sem depender de imagens externas.
    const glow=region==="fire"?"#ffb347":region==="cave"?"#8be9e4":region==="shadow"?"#d08bf2":"#f4cf72";
    ctx.globalAlpha=.22;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(790,100,38+Math.sin(time*1.4)*3,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    rect(0,440,960,100,region==="cave"?"#111923":region==="fire"?"#281b20":region==="shadow"?"#0c0a17":"#17251f");
  }
  function drawBackground(c){
    const first=Math.max(0,Math.floor(c/REGION_WIDTH)),last=Math.min(REGION_ORDER.length-1,Math.floor((c+959)/REGION_WIDTH));
    for(let i=first;i<=last;i++){const left=i*REGION_WIDTH-c,right=left+REGION_WIDTH,clipLeft=Math.max(0,left),clipRight=Math.min(960,right);if(clipRight<=clipLeft)continue;
      ctx.save();ctx.beginPath();ctx.rect(clipLeft,0,clipRight-clipLeft,540);ctx.clip();const previous=region;region=REGION_ORDER[i];drawBiomeBackground(c);region=previous;ctx.restore();}
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
      if(b<camera-100||a>camera+1060)continue;
      rect(a-camera,FLOOR,b-a,85,pal[2]);rect(a-camera,FLOOR,b-a,8,pal[4]);
      for(let x=a+12;x<b;x+=34)rect(x-camera,FLOOR+22,15,5,pal[3]);
    }
    for(const [x,y,w] of data.platforms){if(x+w<camera-100||x>camera+1060)continue;drawPlatform(x-camera,y,w,pal);}
    for(const [a,b] of data.hazards){
      if(b<camera-100||a>camera+1060)continue;
      for(let x=a;x<b;x+=24){ctx.fillStyle="#d85d4d";ctx.beginPath();ctx.moveTo(x-camera,FLOOR);ctx.lineTo(x+12-camera,FLOOR-24);ctx.lineTo(x+24-camera,FLOOR);ctx.fill();}
    }
    if(region!=="village"){
      const defeated=latestState.defeatedEnemies?.[region]||[];
      mobs().forEach((x,i)=>{if(!defeated.includes(i))drawMob(x,i,pal);});
    }
    const zoneEnd=regionBase(region)+REGION_WIDTH,gateX=zoneEnd-camera;
    if(gateX>-80&&gateX<1040){rect(gateX-28,330,56,125,"#735b43");rect(gateX-19,342,38,108,"#19232d");rect(gateX-9,350,18,92,pal[4]);ctx.fillStyle="#fff0c2";ctx.font="bold 12px monospace";ctx.textAlign="center";ctx.fillText(region==="shadow"?"FIM DO REINO":"PASSAGEM",gateX,315);}
    if(region!=="village"&&!latestState.world?.[region]){const boss=window.gameRegions?.find(r=>r.id===region)?.boss;if(boss){const bossX=regionBase(region)+1630;pixelMonster(ctx,boss.name,bossX-camera,FLOOR-35,3.8,true,performance.now());ctx.fillStyle="#f4cf72";ctx.font="bold 12px monospace";ctx.textAlign="center";ctx.fillText("GUARDIÃO",bossX-camera,FLOOR-83);}}
    const players=latestState.players||[];
    players.forEach(p=>{
      const x=(p.id===socket.id?px:p.x)-camera, y=p.id===socket.id?py:p.y;
      if(x>-80&&x<1040)drawHero(p,x,y,p.id===socket.id);
    });
    // HUD dentro da própria fase, sem cobrir a ação.
    rect(12,12,330,55,"#101a23d9");ctx.fillStyle="#f4cf72";ctx.font="12px monospace";ctx.textAlign="left";
    ctx.fillText(areaName().toUpperCase(),24,34);ctx.fillStyle="#fff0c2";
    ctx.fillText(region==="village"?"PRÓLOGO • MUNDO ABERTO":(latestState.world?.[region]?"GUARDIÃO DERROTADO":"EXPLORE • ENCONTRE O GUARDIÃO"),24,54);
    rect(760,14,188,10,"#101a23");rect(760,14,188*(Math.max(0,Math.min(1,(px-regionBase(region))/REGION_WIDTH))),10,pal[4]);ctx.fillStyle="#fff0c2";ctx.textAlign="right";ctx.fillText("REGIÃO",945,39);
    $("mapTitle").textContent=areaName().toUpperCase()+" • MUNDO ABERTO";const bossX=regionBase(region)+1630;
    $("nearbyPrompt").textContent=region!=="village"&&!latestState.world?.[region]&&Math.abs(px-bossX)<100?"E — ENFRENTAR O GUARDIÃO":"A/D OU ← → ANDAR • ESPAÇO PULAR • EXPLORE LIVREMENTE";
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
    const inPit=data.hazards.some(([a,b])=>px>a-4&&px<b+4);if(grounded&&!inPit)lastSafeX=px;
    if(py>540||inPit&&py>FLOOR-18){px=Math.max(60,lastSafeX-35);py=FLOOR;vy=0;grounded=true;toast("Você caiu! Voltou ao último ponto seguro.");}
    if(region!=="village"&&Date.now()>enemyCooldown){
      const defeated=latestState.defeatedEnemies?.[region]||[];
      for(let i=0;i<mobs().length;i++)if(!defeated.includes(i)&&Math.abs(px-mobs()[i])<35&&Math.abs(py-FLOOR)<55){
        enemyCooldown=Date.now()+2200;socket.emit("explore",{area:region,action:"enter",enemyIndex:i});break;
      }
    }
    if(Date.now()-lastSent>45){
      socket.emit("movePlayer",{x:px,y:py,facing});lastSent=Date.now();
    }
    const bossX=regionBase(region)+1630;if(region!=="village"&&!latestState.world?.[region]&&Math.abs(px-bossX)<48&&Date.now()>enemyCooldown){enemyCooldown=Date.now()+2200;socket.emit("explore",{area:region,action:"enter",boss:true});}
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
    if(code==="KeyE"&&down){const bossX=regionBase(region)+1630;if(region!=="village"&&!latestState?.world?.[region]&&Math.abs(px-bossX)<100&&Date.now()>enemyCooldown){enemyCooldown=Date.now()+2200;socket.emit("explore",{area:region,action:"enter",boss:true});}else if(region!=="village"&&!latestState?.world?.[region])toast("Explore a região e encontre o guardião.");return true;}
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
    if(button.dataset.interact){keys.add("interact");button.setPointerCapture?.(e.pointerId);return;}
    const direction=button.dataset.move;
    if(direction==="left")keys.add("left");if(direction==="right")keys.add("right");
    button.setPointerCapture?.(e.pointerId);
  },true);
  ["pointerup","pointercancel","lostpointercapture"].forEach(type=>document.addEventListener(type,e=>{
    const button=e.target.closest?.("[data-move],[data-interact]");if(button){if(button.dataset.interact)keys.delete("interact");else keys.delete(button.dataset.move);e.stopImmediatePropagation();}
  },true));
  window.platformerMode=true;
  window.renderMap=paint;
  window.worldAnimation=()=>{};
  socket.on("state",state=>{
    const current=state.players?.find(p=>p.id===socket.id);
    const changed=region!==(state.activeRegion||"village");
    if(changed){
      region=state.activeRegion||"village";px=current?.x??60;py=current?.y??FLOOR;vy=0;grounded=true;camera=0;lastSafeX=px;
    } else if(current&&Math.abs(current.x-px)>95){px=current.x;py=current.y;}
    lastBattle=!!state.battle;
    if(state.battle){keys.clear();$("overworld").classList.add("hidden");}
    else $("overworld").classList.remove("hidden");
    paint();
  });
  socket.on("joined",()=>{region=latestState?.activeRegion||"village";px=latestState?.players?.find(p=>p.id===socket.id)?.x??60;py=FLOOR;vy=0;lastSafeX=px;});
  // O canvas da fase fica em foco; os menus e a batalha continuam usando a estrutura existente.
  $("overworld").setAttribute("aria-label","Mundo aberto 2D cooperativo. A/D ou setas para andar, espaço para pular e E para interagir com guardiões.");
  requestAnimationFrame(loop);
})();
