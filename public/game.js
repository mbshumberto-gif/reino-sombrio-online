const socket = io();
const $ = id => document.getElementById(id);
$("startAdventureBtn")?.addEventListener("click",()=>{$("titleScreen").classList.add("hidden");$("gameHeader").classList.remove("hidden");$("entry").classList.remove("hidden");});
$("backTitleBtn")?.addEventListener("click",()=>{$("entry").classList.add("hidden");$("gameHeader").classList.add("hidden");$("titleScreen").classList.remove("hidden");});
let currentCode = null, latestState = null, toastTimer;
const characterId=localStorage.getItem('eldoriaCharacterId')||(crypto.randomUUID?crypto.randomUUID():'hero-'+Math.random().toString(36).slice(2));localStorage.setItem('eldoriaCharacterId',characterId);
let localPosition = null;
const heldKeys = new Set();
let moveFrame = null, lastMoveSent = 0;

const HEROES = {
 warrior:{label:'Guerreiro',skin:'#d9a77b',hair:'#6b422b',outfit:'#416f91',accent:'#e2bd61',trim:'#263b55',gear:'sword'},
 mage:{label:'Mago',skin:'#e6bb98',hair:'#3a294b',outfit:'#65518f',accent:'#c58bf0',trim:'#392c5e',gear:'staff'},
 sorceress:{label:'Feiticeira',skin:'#e7c1a5',hair:'#432c58',outfit:'#704b91',accent:'#dc91ed',trim:'#432b62',gear:'staff'},
 cleric:{label:'Clérigo',skin:'#e5bd91',hair:'#a17b42',outfit:'#e8e0c9',accent:'#e3bf5c',trim:'#8d7545',gear:'staff'},
 rogue:{label:'Ladino',skin:'#c98e65',hair:'#30252b',outfit:'#4a4d5e',accent:'#ad4554',trim:'#282b39',gear:'sword'},
 bard:{label:'Bardo',skin:'#e3b88d',hair:'#70452e',outfit:'#8b4e67',accent:'#e1b65c',trim:'#56364e',gear:'staff'},
 paladin:{label:'Paladino',skin:'#d9a77b',hair:'#6b422b',outfit:'#b9c4ce',accent:'#e5c46a',trim:'#617488',gear:'sword'},
 ranger:{label:'Ranger',skin:'#c98e65',hair:'#493c27',outfit:'#557b55',accent:'#a8c66c',trim:'#314b3b',gear:'bow'},
 monk:{label:'Monge',skin:'#d9a77b',hair:'#493c27',outfit:'#a45c38',accent:'#e4c46b',trim:'#633b2d',gear:'sword'}
};

function toast(msg){ $("toast").textContent=msg; $("toast").classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3000); }
function log(msg){ const el=document.createElement("div"); el.className="logline"; el.textContent=msg; $("log").prepend(el); }
function enterGame(){ $("titleScreen")?.classList.add("hidden"); $("entry").classList.add("hidden"); $("gameHeader")?.classList.remove("hidden"); $("game").classList.remove("hidden"); $("roomLabel").textContent=currentCode; }
function chosenHero(){ return $("heroClass").value || 'warrior'; }

$("createBtn").onclick=()=>socket.emit("createRoom",{name:$("playerName").value,heroClass:chosenHero(),characterId});
$("continueSaveBtn").onclick=()=>socket.emit("continueSave",{name:$("playerName").value||"Aventureiro",characterId});
$("saveGameBtn").onclick=()=>socket.emit("saveGame");
$("dialogueNext").onclick=()=>$("dialoguePanel").classList.add("hidden");
$("joinBtn").onclick=()=>socket.emit("joinRoom",{name:$("playerName").value,roomCode:$("roomCode").value,heroClass:chosenHero(),characterId});
$("copyBtn").onclick=async()=>{try{await navigator.clipboard.writeText(currentCode);toast("Código copiado! Envie para seus amigos.")}catch{toast("Código da sala: "+currentCode)}};
$("readyBtn").onclick=()=>socket.emit("ready");
$("restBtn").onclick=()=>socket.emit("rest");
document.querySelectorAll("[data-area]").forEach(b=>b.onclick=()=>socket.emit("explore",{area:b.dataset.area,action:b.dataset.action||"enter"}));
$("treasureForestBtn").onclick=()=>socket.emit("explore",{area:"forest",action:"treasure"});
$("treasureCaveBtn").onclick=()=>socket.emit("explore",{area:"cave",action:"treasure"});
$("merchantBtn").onclick=()=>$("merchant").classList.toggle("hidden");
$("closeMerchant").onclick=()=>$("merchant").classList.add("hidden");
document.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>socket.emit("shop",{item:b.dataset.buy}));
$("attackBtn").onclick=()=>socket.emit("battleAction",{action:"attack"});
window.addEventListener("keydown",event=>{if(event.code!=="Space"||event.repeat)return;if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName))return;if(latestState?.battle){event.preventDefault();$("attackBtn")?.click();}});
$("potionBtn").onclick=()=>socket.emit("battleAction",{action:"potion"});
$("fleeBtn").onclick=()=>socket.emit("battleAction",{action:"flee"});
document.querySelectorAll("[data-npc]").forEach(button=>button.onclick=()=>socket.emit("talkNpc",{npc:button.dataset.npc}));
$("defendBtn").onclick=()=>socket.emit("battleAction",{action:"defend"});
$("skillBtn").onclick=()=>socket.emit("battleAction",{action:"skill"});
$("skillUpgradeBtn").onclick=()=>socket.emit("upgradeSkill");
$("dungeonStartBtn").onclick=()=>socket.emit('startDungeon',{area:latestState?.activeRegion==='village'?'forest':latestState?.activeRegion});
$("dungeonRoomBtn").onclick=()=>{const d=latestState?.dungeon;const r=window.dungeonData?.[d?.region]?.[d?.currentRoom];const answer=r?.kind==='puzzle'?prompt('Enigma: '+r.description+'\nDica: a palavra que representa o reino onde tudo começou.') : undefined;socket.emit('dungeonAction',{action:'enter',answer});};
$("dungeonAdvanceBtn").onclick=()=>socket.emit('dungeonAction',{action:'advance'});
$("dungeonLeaveBtn").onclick=()=>socket.emit('dungeonAction',{action:'leave'});
$("continueCampaignBtn").onclick=()=>{$("transitionScreen").classList.add('hidden');};
document.querySelectorAll("[data-boss-area]").forEach(button=>button.onclick=()=>socket.emit("explore",{area:button.dataset.bossArea,action:"enter",boss:true}));

// Sprites SVG originais desenhados em blocos para manter o visual pixel art.
function heroSprite(heroKey, walking=false, facing='down', equipment={}) {
  const c = HEROES[heroKey] || HEROES.warrior;
  const armorTone = equipment?.armor === 'shadowCloak' ? '#382b4f' : equipment?.armor === 'chainArmor' ? '#9da9b2' : equipment?.armor === 'leatherArmor' ? '#9a6844' : '';
  const armorOverlay = armorTone ? `<path d="M9 14 L26 14 L28 28 L18 31 L7 28 Z" fill="${armorTone}" stroke="#25232b" stroke-width="1"/><rect x="15" y="17" width="5" height="9" fill="${c.accent}"/>` : '';
  const face = facing === 'left' ? 'scale(-1 1) translate(-32 0)' : '';
  let headgear = '', accessory = '';
  if (heroKey === 'warrior') headgear = `<rect x="7" y="3" width="18" height="5" fill="${c.accent}"/><rect x="5" y="7" width="22" height="5" fill="#8f9ba0"/><rect x="10" y="10" width="3" height="3" fill="#f2d47d"/>`;
  if (heroKey === 'archer') headgear = `<rect x="5" y="3" width="22" height="5" fill="${c.accent}"/><rect x="7" y="7" width="18" height="5" fill="${c.accent}"/><rect x="4" y="10" width="5" height="12" fill="${c.accent}"/>`;
  if (heroKey === 'mage') headgear = `<rect x="12" y="0" width="8" height="5" fill="${c.accent}"/><rect x="8" y="5" width="16" height="5" fill="${c.accent}"/><rect x="5" y="10" width="22" height="4" fill="#513b78"/>`;
  if (heroKey === 'druid') headgear = `<rect x="7" y="4" width="5" height="5" fill="${c.accent}"/><rect x="13" y="1" width="6" height="7" fill="#6d9c55"/><rect x="20" y="4" width="5" height="5" fill="${c.accent}"/>`;
  if (c.gear === 'sword') accessory = `<g class="weapon"><rect x="27" y="15" width="3" height="18" fill="#d8e1e3"/><rect x="25" y="19" width="7" height="3" fill="#e4c46b"/><rect x="27" y="32" width="3" height="6" fill="#75472e"/></g>`;
  if (c.gear === 'bow') accessory = `<g class="weapon"><path d="M28 13 Q38 22 28 34" fill="none" stroke="#b7844c" stroke-width="3"/><path d="M28 13 L28 34" stroke="#e3dfc9" stroke-width="1"/></g>`;
  if (c.gear === 'staff') accessory = `<g class="weapon"><rect x="28" y="9" width="3" height="29" fill="#8a603c"/><rect x="26" y="5" width="7" height="6" fill="${c.accent}"/><rect x="27" y="3" width="5" height="3" fill="#fff0a8"/></g>`;
  return `<svg class="hero-sprite ${walking?'is-walking':''}" viewBox="0 0 36 44" role="img" aria-label="${c.label}" shape-rendering="crispEdges"><g ${face?`transform="${face}"`:''}>
    ${accessory}
    <g class="leg leg-left"><rect x="9" y="29" width="7" height="9" fill="#4b3c39"/><rect x="7" y="37" width="9" height="4" fill="#242b31"/></g>
    <g class="leg leg-right"><rect x="19" y="29" width="7" height="9" fill="#4b3c39"/><rect x="19" y="37" width="9" height="4" fill="#242b31"/></g>
    <rect x="8" y="13" width="19" height="17" fill="${c.outfit}"/>${armorOverlay}<rect x="11" y="14" width="13" height="4" fill="${c.trim}"/><rect x="14" y="18" width="5" height="10" fill="${c.accent}"/>
    <g class="arm arm-left"><rect x="4" y="16" width="6" height="12" fill="${c.outfit}"/><rect x="4" y="26" width="6" height="5" fill="${c.skin}"/></g>
    <g class="arm arm-right"><rect x="25" y="16" width="6" height="12" fill="${c.outfit}"/><rect x="25" y="26" width="6" height="5" fill="${c.skin}"/></g>
    <rect x="10" y="5" width="15" height="12" fill="${c.skin}"/><rect x="10" y="12" width="15" height="4" fill="${c.hair}" opacity=".9"/><rect x="13" y="9" width="2" height="2" fill="#20232a"/><rect x="21" y="9" width="2" height="2" fill="#20232a"/>
    ${headgear}
    <rect x="10" y="28" width="15" height="2" fill="${c.accent}"/>
  </g></svg>`;
}

function renderCampaign(state){
 const scenes=window.regionScenes||{},key=state.activeRegion||'village',scene=scenes[key]||scenes.village;
 if(scene){$('sceneTitle').textContent=scene.title;$('sceneSubtitle').textContent=scene.subtitle;$('mapTitle').textContent=scene.title.toUpperCase();$('regionScene').className='region-scene theme-'+scene.theme;$('overworld').className='overworld pixel-world map-theme-'+scene.theme;$('sceneLandmarks').innerHTML='';scene.landmarks.forEach(place=>{const tag=document.createElement('span');tag.textContent='✦ '+place;$('sceneLandmarks').append(tag);});}
 const regionData=window.gameRegions?.find(r=>r.id===key);$('enemyGallery').innerHTML='';(regionData?.enemies||[]).forEach(enemy=>{const chip=document.createElement('span');chip.className='enemy-chip';chip.textContent='☠ '+enemy.name+' • '+enemy.hp+' HP';$('enemyGallery').append(chip);});
 const dungeon=state.dungeon,dRooms=window.dungeonData?.[dungeon?.region]||[];
 $('dungeonDescription').textContent=dungeon?'Dungeon: '+(scenes[dungeon.region]?.title||dungeon.region):'Entre na dungeon da região atual. Cada dungeon possui quatro salas, incluindo um enigma e um guardião.';
 $('dungeonStatus').innerHTML='';
 if(dungeon){dRooms.forEach((room,i)=>{const line=document.createElement('div');line.className='dungeon-room';line.textContent=(dungeon.cleared[i]?'✓ ':'◇ ')+(i+1)+'. '+room.name+' — '+room.description;$('dungeonStatus').append(line);});$('dungeonRoomBtn').textContent=dRooms[dungeon.currentRoom]?.kind==='puzzle'?'Resolver enigma':'Explorar sala '+(dungeon.currentRoom+1);$('dungeonRoomBtn').disabled=!!dungeon.cleared[dungeon.currentRoom]||!!state.battle;$('dungeonAdvanceBtn').disabled=!dungeon.cleared[dungeon.currentRoom]||!!state.battle;$('dungeonLeaveBtn').disabled=!!state.battle;}else{$('dungeonRoomBtn').disabled=true;$('dungeonAdvanceBtn').disabled=true;$('dungeonLeaveBtn').disabled=true;}
 $('dungeonStartBtn').disabled=!!state.battle||!!dungeon;
 $('sideQuestList').innerHTML='';(window.sideQuestData||[]).filter(q=>q.region===key).forEach(q=>{const p=state.sideQuests?.[q.id]||{};const item=document.createElement('div');item.className='sidequest';const title=document.createElement('strong');title.textContent=q.title;const desc=document.createElement('p');desc.textContent=q.description+' ('+(p.progress||0)+'/'+q.goal+')';item.append(title,desc);const btn=document.createElement('button');btn.textContent=p.completed?'Concluída':p.accepted?(p.progress>=q.goal?'Resgatar recompensa':'Em andamento'):'Aceitar missão';btn.disabled=!!state.battle||p.completed;btn.onclick=()=>socket.emit('sideQuest',{id:q.id,action:p.accepted?(p.progress>=q.goal?'claim':'accept'):'accept'});item.append(btn);$('sideQuestList').append(item);});
 if(state.transition&&window.lastTransitionAt!==state.transition.at){window.lastTransitionAt=state.transition.at;$('transitionTitle').textContent=state.transition.title+' conquistada!';$('transitionMessage').textContent=state.transition.message;$('transitionScreen').classList.remove('hidden');}
}
function enemyGlyph(name='') {
  const n=name.toLowerCase();
  if(n.includes('lobo')) return '🐺';
  if(n.includes('goblin')) return '👺';
  if(n.includes('aranha')) return '🕷️';
  if(n.includes('orc')) return '👹';
  if(n.includes('esqueleto')) return '💀';
  if(n.includes('troll')) return '🧌';
  if(n.includes('salamandra')) return '🦎';
  if(n.includes('cultista')) return '🧙';
  if(n.includes('golem')) return '🗿';
  if(n.includes('cavaleiro')) return '🛡️';
  if(n.includes('necromante')) return '🧟';
  if(n.includes('abominação')) return '👾';
  if(n.includes('drag')||n.includes('draco')) return '🐉';
  if(n.includes('ent')) return '🌳';
  if(n.includes('malakar')||n.includes('vazio')||n.includes('espectro')) return '👻';
  return '👾';
}
const TILE_SIZE = 32, MAP_COLS = 30, MAP_ROWS = 18;
const KEY_DIRECTIONS = {ArrowUp:"up",KeyW:"up",ArrowDown:"down",KeyS:"down",ArrowLeft:"left",KeyA:"left",ArrowRight:"right",KeyD:"right"};
const worldCache = new Map();
const REGION_STORY = {
 village:"Há vinte anos, Malakar foi derrotado e desapareceu nas montanhas. Agora, os sinos de Eldoria tocam sozinhos e uma névoa negra cobre os campos. A cronista Aderic acredita que alguém está reunindo os antigos selos.",
 forest:"A floresta já foi protegida pelos guardiões élficos. Malakar corrompeu suas raízes para alimentar um portal. O Ent Corrompido conhece o caminho até as minas, mas sua memória foi consumida pela escuridão.",
 cave:"Sob a montanha existe uma cidade mineradora esquecida. Seus habitantes encontraram um fragmento de estrela e desapareceram na mesma noite. Os ecos repetem uma voz que chama pelo nome do herói.",
 fire:"As Terras do Fogo escondem a forja onde Malakar criou sua armadura. O Draco de Brasas guarda a última chama capaz de destruir o metal sombrio.",
 castle:"Vharok foi o maior comandante de Eldoria antes de se aliar a Malakar. Os documentos do castelo revelam que ele tentou impedir o ritual e foi corrompido por quem deveria proteger.",
 shadow:"Além do castelo existe um reino preso entre a vida e a morte. Malakar não deseja apenas conquistar Eldoria: ele pretende apagar todas as memórias do mundo e reescrevê-lo sob seu domínio."
};
const ENEMY_POINTS = {
 forest:[{x:220,y:250},{x:730,y:285},{x:470,y:405}],
 cave:[{x:220,y:220},{x:750,y:260},{x:470,y:405}],
 fire:[{x:210,y:260},{x:740,y:220},{x:490,y:405}],
 castle:[{x:220,y:250},{x:740,y:250},{x:480,y:405}],
 shadow:[{x:210,y:230},{x:750,y:245},{x:480,y:405}]
};
const BOSS_POINTS = {forest:{x:480,y:92},cave:{x:480,y:92},fire:{x:480,y:92},castle:{x:480,y:92},shadow:{x:480,y:92}};
const NPC_POINTS = [{x:480,y:275,npc:"chronicler"},{x:340,y:360,npc:"healer"},{x:620,y:360,npc:"blacksmith"}];
function makeTileMap(area){
 const g=Array.from({length:MAP_ROWS},()=>Array(MAP_COLS).fill(0));
 for(let y=0;y<MAP_ROWS;y++)for(let x=0;x<MAP_COLS;x++)if(x===0||y===0||x===MAP_COLS-1||y===MAP_ROWS-1)g[y][x]=1;
 const paint=(x,y,w,h,t)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(g[yy]&&g[yy][xx]!==undefined)g[yy][xx]=t;};
 const path=(x1,y1,x2,y2)=>{let x=x1,y=y1;while(x!==x2){if(g[y]?.[x]!==undefined)g[y][x]=2;x+=Math.sign(x2-x);}while(y!==y2){if(g[y]?.[x]!==undefined)g[y][x]=2;y+=Math.sign(y2-y);}if(g[y]?.[x]!==undefined)g[y][x]=2;};
 if(area==="village"){
   for(let x=13;x<=16;x++)for(let y=1;y<17;y++)g[y][x]=2;
   for(let y=8;y<=10;y++)for(let x=1;x<29;x++)g[y][x]=2;
   paint(3,3,6,4,4);paint(21,3,6,4,4);paint(11,3,2,3,3);paint(17,3,2,3,3);
   paint(4,13,3,2,1);paint(23,13,3,2,1);
 }else if(area==="forest"){
   path(15,17,15,12);path(15,12,9,9);path(9,9,12,5);path(12,5,15,1);path(9,9,4,7);path(9,9,23,8);
   for(let y=2;y<16;y++)for(let x=2;x<28;x++)if(g[y][x]===0&&((x*13+y*7)%11<3))g[y][x]=1;
   paint(5,4,2,2,5);paint(23,12,2,2,5);
 }else if(area==="cave"){
   for(let y=1;y<17;y++)for(let x=1;x<29;x++)if((x*7+y*11)%19<3)g[y][x]=1;
   path(15,17,15,12);path(15,12,7,9);path(7,9,12,5);path(12,5,15,1);path(7,9,24,8);
   paint(4,4,2,2,5);paint(22,12,2,2,5);paint(18,4,2,2,3);
 }else if(area==="fire"){
   path(15,17,15,12);path(15,12,8,9);path(8,9,12,5);path(12,5,15,1);path(8,9,24,8);
   for(let y=2;y<16;y++)for(let x=2;x<28;x++)if((x*5+y*9)%23===0)g[y][x]=3;
   paint(4,4,2,2,1);paint(23,12,2,2,1);paint(18,5,2,2,3);
 }else if(area==="castle"){
   path(15,17,15,12);path(15,12,8,9);path(8,9,8,5);path(8,5,15,1);path(8,9,23,9);
   paint(3,2,2,13,1);paint(25,2,2,13,1);paint(5,3,3,2,1);paint(22,3,3,2,1);
   for(let y=4;y<15;y+=4){paint(11,y,1,2,1);paint(18,y,1,2,1);}
 }else{
   path(15,17,15,12);path(15,12,7,9);path(7,9,12,5);path(12,5,15,1);path(7,9,24,8);
   for(let y=2;y<16;y++)for(let x=2;x<28;x++)if((x*17+y*13)%17<3&&g[y][x]===0)g[y][x]=6;
   paint(4,4,2,2,5);paint(23,12,2,2,5);paint(18,4,2,2,6);
 }
 for(let x=13;x<=17;x++){g[0][x]=2;g[17][x]=2;}
 for(const point of [...(ENEMY_POINTS[area]||[]),...(BOSS_POINTS[area]?[BOSS_POINTS[area]]:[]),...(area==="village"?NPC_POINTS:[])]) {
   const tx=Math.floor(point.x/32),ty=Math.floor(point.y/32);
   for(let yy=ty-1;yy<=ty+1;yy++)for(let xx=tx-1;xx<=tx+1;xx++)if(g[yy]?.[xx]!==undefined&&g[yy][xx]!==2)g[yy][xx]=0;
 }
 return g;
}
function colorSet(area){
 return ({
 village:{ground:"#56834a",light:"#6f9b55",dark:"#3c663e",path:"#b69a68",path2:"#d0b57b",water:"#397b91",wall:"#76523d",roof:"#a84e42",leaf:"#315d3d",rock:"#777e85",lava:"#e27b32",glow:"#f7c75d"},
 forest:{ground:"#315f3e",light:"#497b47",dark:"#234b37",path:"#8a7950",path2:"#b09a64",water:"#326b70",wall:"#514a3d",roof:"#4b7041",leaf:"#1d422e",rock:"#68715e",lava:"#a24e35",glow:"#b5cf76"},
 cave:{ground:"#3c4652",light:"#56616c",dark:"#27313e",path:"#66717a",path2:"#8b9293",water:"#294b63",wall:"#242c39",roof:"#4d5361",leaf:"#374c54",rock:"#737f91",lava:"#a4514c",glow:"#83d6d4"},
 fire:{ground:"#6c493c",light:"#95604a",dark:"#442d31",path:"#9b7152",path2:"#c08c5b",water:"#5c4542",wall:"#35272d",roof:"#7c3833",leaf:"#4a3830",rock:"#6c5550",lava:"#ef6c2f",glow:"#ffc35b"},
 castle:{ground:"#565566",light:"#777487",dark:"#37394b",path:"#8c8790",path2:"#b0a6a0",water:"#3e4a5c",wall:"#2b2d40",roof:"#6d4351",leaf:"#44404e",rock:"#858594",lava:"#a34c54",glow:"#d8bb79"},
 shadow:{ground:"#332b4c",light:"#4c3b68",dark:"#201b37",path:"#655176",path2:"#88739b",water:"#211d43",wall:"#17172c",roof:"#51335f",leaf:"#29213e",rock:"#625477",lava:"#8c3c77",glow:"#c27de0"}
 })[area]||{ground:"#56834a",light:"#6f9b55",dark:"#3c663e",path:"#b69a68",path2:"#d0b57b",water:"#397b91",wall:"#76523d",roof:"#a84e42",leaf:"#315d3d",rock:"#777e85",lava:"#e27b32",glow:"#f7c75d"};
}
function rect(ctx,x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function drawMapBase(area){
 const canvas=document.createElement("canvas");canvas.width=960;canvas.height=576;
 const ctx=canvas.getContext("2d"),tiles=makeTileMap(area),c=colorSet(area);
 for(let y=0;y<MAP_ROWS;y++)for(let x=0;x<MAP_COLS;x++){
   const t=tiles[y][x],px=x*TILE_SIZE,py=y*TILE_SIZE,seed=(x*31+y*17)%7;
   rect(ctx,px,py,32,32,t===2?c.path:t===3?c.water:t===4?c.wall:t===5?c.rock:t===6?c.dark:c.ground);
   if(t===0){rect(ctx,px+seed*3%25,py+5,3,3,c.light);rect(ctx,px+(seed*7)%26,py+23,2,2,c.dark);}
   if(t===2){rect(ctx,px+4,py+6,5,3,c.path2);rect(ctx,px+21,py+22,6,3,c.dark);}
   if(t===3){rect(ctx,px+4,py+5,12,3,c.glow);rect(ctx,px+18,py+20,9,3,c.dark);}
   if(t===4){rect(ctx,px,py,32,32,c.wall);rect(ctx,px+2,py+2,28,8,c.roof);rect(ctx,px+5,py+12,22,18,c.wall);rect(ctx,px+13,py+20,7,10,"#302b32");}
   if(t===5){rect(ctx,px+10,py+5,12,22,c.glow);rect(ctx,px+13,py+2,6,28,c.rock);rect(ctx,px+15,py+7,3,17,"#d5e8d4");}
   if(t===6){rect(ctx,px+4,py+4,24,24,c.wall);rect(ctx,px+9,py+9,14,14,c.dark);rect(ctx,px+13,py+13,6,6,c.glow);}
   if(t===1){
     if(area==="village"||area==="forest"){rect(ctx,px+8,py+13,16,18,"#67472f");rect(ctx,px+2,py+3,28,18,c.leaf);rect(ctx,px+7,py,18,16,c.light);rect(ctx,px+12,py+7,8,8,c.dark);}
     else if(area==="castle"||area==="shadow"){rect(ctx,px+5,py+1,22,30,c.wall);rect(ctx,px+2,py+2,28,6,c.rock);rect(ctx,px+10,py+10,12,16,c.dark);rect(ctx,px+14,py+13,4,5,c.glow);}
     else{rect(ctx,px+3,py+5,26,23,c.wall);rect(ctx,px+7,py+1,18,8,c.rock);rect(ctx,px+10,py+13,12,12,c.dark);}
   }
 }
 // Cenários exclusivos: construções, cristais, árvores e estruturas de cada capítulo.
 if(area==="village"){
   for(const x of [3,21]){const px=x*32;rect(ctx,px-4,82,200,8,"#46352f");rect(ctx,px+4,86,184,76,c.wall);rect(ctx,px-5,76,202,24,c.roof);rect(ctx,px+24,110,24,26,"#2a2630");rect(ctx,px+128,110,24,26,"#2a2630");rect(ctx,px+84,120,25,42,"#3a2a2b");}
   rect(ctx,448,110,64,40,"#397b91");rect(ctx,454,116,52,28,"#75b4b0");rect(ctx,470,100,20,12,"#b4c7ad");
 }else if(area==="forest"){
   for(let i=0;i<9;i++){const x=70+i*100,y=80+(i%3)*135;rect(ctx,x+10,y+18,12,30,"#68452e");rect(ctx,x,y,34,30,"#1d492f");rect(ctx,x+6,y-8,22,25,"#477b43");}
   rect(ctx,410,300,130,9,"#725b3c");rect(ctx,420,290,110,7,"#a5b66c");
 }else if(area==="cave"){
   for(let i=0;i<7;i++){const x=65+i*125,y=80+(i%3)*130;rect(ctx,x,y,14,42,"#4c5367");rect(ctx,x+4,y-15,6,55,c.glow);rect(ctx,x+6,y-7,3,36,"#d0e7e5");}
   rect(ctx,400,250,160,8,"#66717a");
 }else if(area==="fire"){
   for(let i=0;i<5;i++){const x=80+i*180;rect(ctx,x,60,26,110,"#4b3434");rect(ctx,x+5,70,16,80,"#8d4940");rect(ctx,x+9,85,8,50,c.glow);}
   for(let i=0;i<6;i++){const x=80+i*145;rect(ctx,x,300+(i%2)*80,36,7,c.lava);rect(ctx,x+8,307+(i%2)*80,18,5,"#ffbb53");}
 }else if(area==="castle"){
   for(let x of [90,260,650,820]){rect(ctx,x,55,42,220,"#3a3b50");rect(ctx,x-7,45,56,22,"#8d8793");rect(ctx,x+12,95,18,90,"#262a3b");rect(ctx,x+16,112,10,24,c.glow);}
   rect(ctx,385,70,190,14,"#8a5260");rect(ctx,405,84,150,110,"#343346");rect(ctx,460,115,40,80,"#211f30");
 }else{
   for(let i=0;i<8;i++){const x=55+i*120,y=80+(i%3)*120;rect(ctx,x,y,28,90,"#29213f");rect(ctx,x+6,y-14,16,22,"#68447f");rect(ctx,x+11,y+14,6,48,c.glow);}
   rect(ctx,400,110,160,70,"#21182f");rect(ctx,440,90,80,100,"#4b2a64");rect(ctx,464,75,32,120,c.glow);
 }
 return {canvas,tiles};
}
function pixelMonster(ctx,name,x,y,scale=3,boss=false,time=0){
 const n=(name||"").toLowerCase();
 let body="#8caa67",dark="#3d5945",light="#c4d78b",eye="#ffdf7b";
 if(n.includes("lobo")){body="#8995a4";dark="#394553";light="#c3d0dc";}
 else if(n.includes("goblin")){body="#79a64e";dark="#355c37";light="#b7d36d";}
 else if(n.includes("aranha")){body="#6d4b83";dark="#322441";light="#b78bd0";}
 else if(n.includes("orc")||n.includes("troll")){body="#7a9252";dark="#38472e";light="#c2c878";}
 else if(n.includes("esqueleto")||n.includes("cavaleiro")){body="#c5c2a5";dark="#555568";light="#f2e7c4";}
 else if(n.includes("salamandra")||n.includes("draco")){body="#c45c37";dark="#6f302c";light="#f3a24e";eye="#fff3a0";}
 else if(n.includes("golem")){body="#9a6a48";dark="#493b43";light="#d49b60";}
 else if(n.includes("necromante")||n.includes("cultista")){body="#67518e";dark="#29233e";light="#b69be0";}
 else if(n.includes("malakar")||n.includes("vazio")||n.includes("espectro")||n.includes("abominação")){body="#704c91";dark="#251d3d";light="#c68be4";eye="#f6d6ff";}
 const bob=Math.sin(time/230+(x/80))*2*scale;
 const w=(boss?18:13)*scale,h=(boss?19:15)*scale,px=Math.round(x-w/2),py=Math.round(y-h/2+bob);
 rect(ctx,px+3*scale,py+13*scale,w-6*scale,4*scale,dark);
 rect(ctx,px+2*scale,py+5*scale,w-4*scale,9*scale,body);
 rect(ctx,px+4*scale,py+2*scale,w-8*scale,7*scale,light);
 rect(ctx,px+3*scale,py+10*scale,3*scale,5*scale,dark);rect(ctx,px+w-6*scale,py+10*scale,3*scale,5*scale,dark);
 rect(ctx,px+4*scale,py+14*scale,3*scale,4*scale,dark);rect(ctx,px+w-7*scale,py+14*scale,3*scale,4*scale,dark);
 rect(ctx,px+4*scale,py+7*scale,3*scale,3*scale,eye);rect(ctx,px+w-7*scale,py+7*scale,3*scale,3*scale,eye);
 if(n.includes("aranha")){for(let k=0;k<4;k++){const yy=py+(5+k*2)*scale;rect(ctx,px-5*scale,yy,7*scale,2*scale,dark);rect(ctx,px+w-2*scale,yy,7*scale,2*scale,dark);}rect(ctx,px+5*scale,py+12*scale,w-10*scale,4*scale,light);}
 if(n.includes("lobo")){rect(ctx,px+w-2*scale,py+8*scale,7*scale,5*scale,light);rect(ctx,px-2*scale,py-3*scale,5*scale,6*scale,dark);rect(ctx,px+w-5*scale,py-3*scale,5*scale,6*scale,dark);rect(ctx,px-7*scale,py+8*scale,8*scale,3*scale,body);}
 if(n.includes("draco")||n.includes("drag")){rect(ctx,px-7*scale,py+4*scale,9*scale,3*scale,light);rect(ctx,px-11*scale,py+1*scale,8*scale,4*scale,dark);rect(ctx,px+w-2*scale,py+4*scale,9*scale,3*scale,light);rect(ctx,px+w+3*scale,py+1*scale,8*scale,4*scale,dark);rect(ctx,px+w-2*scale,py+10*scale,10*scale,3*scale,dark);}
 if(n.includes("esqueleto")){for(let k=0;k<3;k++)rect(ctx,px+4*scale,py+(10+k*2)*scale,w-8*scale,scale,light);rect(ctx,px+6*scale,py+3*scale,w-12*scale,3*scale,"#eee8d2");}
 if(n.includes("goblin")){rect(ctx,px-5*scale,py+5*scale,7*scale,4*scale,light);rect(ctx,px+w-2*scale,py+5*scale,7*scale,4*scale,light);}
 if(boss){rect(ctx,px+2*scale,py-2*scale,4*scale,5*scale,light);rect(ctx,px+w-6*scale,py-2*scale,4*scale,5*scale,light);rect(ctx,px+5*scale,py-5*scale,w-10*scale,4*scale,dark);}
 else{rect(ctx,px+3*scale,py-2*scale,3*scale,5*scale,dark);rect(ctx,px+w-6*scale,py-2*scale,3*scale,5*scale,dark);}
}
function pixelHero(ctx,p,time=0){
 const x=p.x,y=p.y,scale=3,walking=!!p.moving,bob=walking?Math.abs(Math.sin(time/65))*3:0;
 const colors=HEROES[p.classKey]||HEROES.warrior;
 const left=Math.round(x-24),top=Math.round(y-31-bob);
 rect(ctx,x-15,y+17,30,7,"#1b1d24");
 rect(ctx,left+12,top+38,12,13,"#554033");rect(ctx,left+30,top+38,12,13,"#554033");
 rect(ctx,left+9,top+48,15,5,"#242b35");rect(ctx,left+30,top+48,15,5,"#242b35");
 rect(ctx,left+9,top+18,39,24,colors.outfit);rect(ctx,left+18,top+18,18,6,colors.trim);rect(ctx,left+24,top+24,9,15,colors.accent);
 rect(ctx,left+4,top+21,9,18,colors.outfit);rect(ctx,left+44,top+21,9,18,colors.outfit);
 rect(ctx,left+7,top+36,8,6,colors.skin);rect(ctx,left+44,top+36,8,6,colors.skin);
 rect(ctx,left+15,top+3,30,21,colors.skin);rect(ctx,left+15,top+18,30,5,colors.hair);
 rect(ctx,left+18,top+10,5,4,"#20232a");rect(ctx,left+36,top+10,5,4,"#20232a");
 if(p.equipment?.armor){const tone=p.equipment.armor==="shadowCloak"?"#382b4f":p.equipment.armor==="chainArmor"?"#9da9b2":"#9a6844";rect(ctx,left+9,top+19,39,23,tone);rect(ctx,left+24,top+23,9,14,colors.accent);}
 const gear=colors.gear;
 if(gear==="bow"){rect(ctx,left+49,top+13,3,34,"#9b6a3e");rect(ctx,left+47,top+13,7,3,"#e8d9bd");rect(ctx,left+47,top+44,7,3,"#e8d9bd");rect(ctx,left+52,top+15,1,28,"#eee5c9");}
 else if(gear==="staff"){rect(ctx,left+50,top+9,4,40,"#805333");rect(ctx,left+47,top+5,10,8,colors.accent);rect(ctx,left+50,top+2,4,4,"#fff0a8");}
 else {rect(ctx,left+51,top+13,4,31,"#d8e4e8");rect(ctx,left+47,top+21,12,4,colors.accent);rect(ctx,left+52,top+43,3,7,"#805333");}
 if(p.equipment?.weapon){rect(ctx,left+49,top+10,5,34,"#f0d77d");rect(ctx,left+46,top+20,11,4,"#fff0a8");}
 if((p.level||1)>=5){rect(ctx,left+8,top+19,41,24,"#b4a06b");rect(ctx,left+23,top+22,12,16,colors.accent);}
 if((p.level||1)>=10){rect(ctx,left+12,top+1,36,4,"#f4cf72");rect(ctx,left+7,top+5,4,8,"#f4cf72");rect(ctx,left+49,top+5,4,8,"#f4cf72");}
 if(p.facing==="left") { /* corpo mantém a silhueta legível; rosto e arma indicam direção */ rect(ctx,left+15,top+10,4,4,"#20232a"); }
 if(p.facing==="up"){rect(ctx,left+15,top+3,30,8,colors.hair);rect(ctx,left+18,top+13,24,6,colors.hair);}
}
function drawBattleScene(state){
 const canvas=$("battleSceneCanvas");if(!canvas||!state?.battle)return;
 const ctx=canvas.getContext("2d");ctx.clearRect(0,0,960,280);
 const grad=ctx.createLinearGradient(0,0,0,280);grad.addColorStop(0,"#283b49");grad.addColorStop(1,"#111b29");ctx.fillStyle=grad;ctx.fillRect(0,0,960,280);
 for(let n=0;n<12;n++){rect(ctx,n*90,190+(n%3)*8,64,5,"#53606a");rect(ctx,n*90+24,205+(n%2)*9,42,4,"#344653");}
 ctx.fillStyle="#f4cf72";ctx.font="bold 18px monospace";ctx.textAlign="center";ctx.fillText("EQUIPE DE ELDORIA",210,28);
 ctx.fillStyle="#f3a08e";ctx.fillText(state.battle.enemy.toUpperCase(),755,28);
 const party=state.players.filter(p=>p.hp>0);
 party.forEach((p,index)=>{const x=110+(index%4)*125,y=130+Math.floor(index/4)*76;pixelHero(ctx,{...p,x,y,facing:"right",moving:true},Date.now());ctx.fillStyle="#fff0c2";ctx.font="13px monospace";ctx.fillText(p.name.slice(0,13),x,y+43);if(p.id===state.battle.activePlayerId){ctx.strokeStyle="#f4cf72";ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y-5,34,0,Math.PI*2);ctx.stroke();}});
 pixelMonster(ctx,state.battle.enemy,755,145,5.5,!!state.battle.boss,Date.now());
 const fx=window.battleFx;if(fx&&Date.now()-fx.at<520){const t=(Date.now()-fx.at)/520;ctx.save();ctx.globalAlpha=1-t;ctx.strokeStyle=fx.type==="enemy"?"#e77d70":"#fff0a8";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(665-t*25,88+t*62);ctx.lineTo(835-t*12,188-t*38);ctx.stroke();ctx.fillStyle=fx.type==="enemy"?"#e77d70":"#f4cf72";ctx.beginPath();ctx.arc(755,145,15+t*45,0,Math.PI*2);ctx.fill();ctx.restore();requestAnimationFrame(()=>drawBattleScene(state));}else if(fx)window.battleFx=null;
 ctx.fillStyle="#f4cf72";ctx.font="bold 13px monospace";ctx.fillText("INIMIGO",755,238);
}
function drawGate(ctx,x,y,label,locked=false){
 rect(ctx,x-25,y-20,50,40,locked?"#51424a":"#72523a");rect(ctx,x-19,y-16,38,34,locked?"#2b2534":"#263e45");
 rect(ctx,x-13,y-12,26,27,locked?"#473047":"#73a6a0");rect(ctx,x-7,y-7,14,20,locked?"#332239":"#b6d28c");
 ctx.fillStyle=locked?"#c16d63":"#f4cf72";ctx.font="bold 12px monospace";ctx.textAlign="center";ctx.fillText(label,x,y-25);
}
function nearest(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function currentPlayer(){return latestState?.players.find(p=>p.id===socket.id);}
function worldInteractionPrompt(){
 const me=currentPlayer();if(!me||latestState?.battle)return "ESPAÇO ATACA • WASD / SETAS MOVIMENTAM";
 const area=latestState.activeRegion||"village";
 if(area==="village"&&me.y>510)return "E — VIAJAR PARA A FLORESTA";
 if(area!=="village"&&me.y<65){
   const idx=["forest","cave","fire","castle","shadow"].indexOf(area),next=["forest","cave","fire","castle","shadow"][idx+1];
   if(next)return latestState.world?.[area]?"E — AVANÇAR PARA A PRÓXIMA REGIÃO":"O PORTÃO ESTÁ SELADO — DERROTE O GUARDIÃO";
   if(!next&&latestState.world?.[area])return "A JORNADA FOI CONCLUÍDA. ELDORIA ESTÁ LIVRE.";
 }
 if(area!=="village"&&me.y>510){const idx=["forest","cave","fire","castle","shadow"].indexOf(area);return idx===0?"E — VOLTAR À VILA":"E — REGRESSAR À REGIÃO ANTERIOR";}
 if(area==="village"){const npc=NPC_POINTS.find(n=>nearest(me,n)<48);if(npc)return "E — CONVERSAR";}
 const points=ENEMY_POINTS[area]||[],region=window.gameRegions?.find(r=>r.id===area);
 if(points.some((p,i)=>!latestState.defeatedEnemies?.[area]?.includes(i)&&nearest(me,p)<50))return "A CRIATURA PERCEBEU SUA PRESENÇA!";
 if(region?.boss&& !latestState.world?.[area]&&nearest(me,BOSS_POINTS[area])<62)return "O GUARDIÃO ESTÁ DIANTE DE VOCÊ!";
 return "WASD / SETAS PARA ANDAR • E PARA INTERAGIR";
}
function interactWorld(){
 const me=currentPlayer();if(!me||latestState?.battle)return;
 const area=latestState.activeRegion||"village";
 if(area==="village"&&me.y>500){socket.emit("travelRegion",{area:"forest"});return;}
 const ids=["forest","cave","fire","castle","shadow"],idx=ids.indexOf(area);
 if(area!=="village"&&me.y<75&&idx>=0){
   if(!latestState.world?.[area])return toast("O guardião ainda protege esta passagem. Derrote-o primeiro.");
   if(ids[idx+1])socket.emit("travelRegion",{area:ids[idx+1]});
   else toast("Você concluiu a campanha e libertou Eldoria!");
   return;
 }
 if(area!=="village"&&me.y>500){socket.emit("travelRegion",{area:idx===0?"village":ids[idx-1]});return;}
 if(area==="village"){
   const npc=NPC_POINTS.find(n=>nearest(me,n)<48);
   if(npc){if(npc.npc==="blacksmith")$("merchant").classList.remove("hidden");socket.emit("talkNpc",{npc:npc.npc});return;}
 }
}
function checkEncounters(){
 if(window.platformerMode)return;
 const me=currentPlayer();if(!me||latestState?.battle)return;
 if((latestState.activeRegion||"village")==="village"){
   const nearby=NPC_POINTS.find(n=>nearest(me,n)<62);
   if(nearby&&window.autoNpcTalk!==nearby.npc){window.autoNpcTalk=nearby.npc;socket.emit("talkNpc",{npc:nearby.npc});}
   if(!nearby)window.autoNpcTalk=null;
 }
 if(Date.now()<(window.encounterCooldown||0))return;
 const area=latestState.activeRegion||"village",region=window.gameRegions?.find(r=>r.id===area);if(!region)return;
 const points=ENEMY_POINTS[area]||[],defeated=latestState.defeatedEnemies?.[area]||[];
 for(let i=0;i<points.length;i++){if(!defeated.includes(i)&&nearest(me,points[i])<35){window.encounterCooldown=Date.now()+1800;socket.emit("explore",{area,action:"enter",enemyIndex:i});return;}}
 if(region.boss&&!latestState.world?.[area]&&nearest(me,BOSS_POINTS[area])<45){window.encounterCooldown=Date.now()+1800;socket.emit("explore",{area,action:"enter",boss:true});}
}
function drawWorld(){
 const canvas=$("worldCanvas");if(!canvas||!latestState)return;
 const area=latestState.activeRegion||"village";
 if(!worldCache.has(area))worldCache.set(area,drawMapBase(area));
 const ctx=canvas.getContext("2d"),base=worldCache.get(area);ctx.clearRect(0,0,960,576);ctx.drawImage(base.canvas,0,0);
 if(area==="village"){drawGate(ctx,480,550,"FLORESTA");NPC_POINTS.forEach((n,i)=>{const npcLook=[{classKey:"mage",level:8},{classKey:"cleric",level:6},{classKey:"warrior",level:9}][i];pixelHero(ctx,{...npcLook,x:n.x,y:n.y,facing:"down"},Date.now());ctx.fillStyle="#fff0c2";ctx.font="12px monospace";ctx.textAlign="center";ctx.fillText(["ADERIC","MIRA","ELDRIN"][i],n.x,n.y+35);});}
 else{
   const idx=["forest","cave","fire","castle","shadow"].indexOf(area),previous=idx===0?"VILA":(["forest","cave","fire","castle","shadow"][idx-1]||"VILA");
   drawGate(ctx,480,550,previous,false);
   const next=["forest","cave","fire","castle","shadow"][idx+1];
   drawGate(ctx,480,25,next?(latestState.world?.[area]?"PRÓXIMA":"SELADO"):"FIM",!latestState.world?.[area]);
   const enemies=window.gameRegions?.find(r=>r.id===area)?.enemies||[],defeated=latestState.defeatedEnemies?.[area]||[];
   enemies.forEach((enemy,i)=>{if(!defeated.includes(i)){pixelMonster(ctx,enemy.name,ENEMY_POINTS[area][i].x,ENEMY_POINTS[area][i].y,2.2,false,Date.now());ctx.fillStyle="#fff0c2";ctx.font="12px monospace";ctx.textAlign="center";ctx.fillText(enemy.name,ENEMY_POINTS[area][i].x,ENEMY_POINTS[area][i].y+31);}});
   const region=window.gameRegions?.find(r=>r.id===area);
   if(region?.boss&&!latestState.world?.[area]){pixelMonster(ctx,region.boss.name,BOSS_POINTS[area].x,BOSS_POINTS[area].y,3.5,true,Date.now());ctx.fillStyle="#f4cf72";ctx.font="bold 13px monospace";ctx.textAlign="center";ctx.fillText("GUARDIÃO",480,135);}
 }
 const me=currentPlayer();
 if(me){latestState.players.filter(p=>p.id!==socket.id).forEach(p=>pixelHero(ctx,p,Date.now()));pixelHero(ctx,{...me,...(localPosition||{})},Date.now());}
 $("nearbyPrompt").textContent=worldInteractionPrompt();
}
function renderMap(){if(!latestState)return;try{const canvas=$("worldCanvas");if(canvas){if(canvas.width!==960)canvas.width=960;if(canvas.height!==576)canvas.height=576;}drawWorld();checkEncounters();}catch(error){console.error("Falha ao renderizar o mapa:",error);const canvas=$("worldCanvas");if(canvas){const ctx=canvas.getContext("2d");ctx.fillStyle="#263e32";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#fff0c2";ctx.font="bold 24px monospace";ctx.textAlign="center";ctx.fillText("ELDORIA",canvas.width/2,canvas.height/2);}}}
function moveBlocked(x,y){
 const area=latestState?.activeRegion||"village";if(!worldCache.has(area))worldCache.set(area,drawMapBase(area));
 const tiles=worldCache.get(area).tiles;
 for(const [ox,oy] of [[-10,-8],[10,-8],[-10,8],[10,8]]){
   const tx=Math.floor((x+ox)/TILE_SIZE),ty=Math.floor((y+oy)/TILE_SIZE),tile=tiles[ty]?.[tx];
   if(tile===undefined||[1,3,4,5,6].includes(tile))return true;
 }
 return false;
}
function beginMovement(key){if(!KEY_DIRECTIONS[key])return;heldKeys.add(KEY_DIRECTIONS[key]);if(!moveFrame){lastFrameTime=0;moveFrame=requestAnimationFrame(movementLoop);}}
function endMovement(key){const d=KEY_DIRECTIONS[key];if(d)heldKeys.delete(d);}
let lastFrameTime=0;
function movementLoop(timestamp){
 moveFrame=null;const me=currentPlayer();if(!me||latestState?.battle){localPosition=null;return;}
 if(heldKeys.size===0){if(me.moving){me.moving=false;renderMap();}return;}
 const dt=lastFrameTime?Math.min(.04,(timestamp-lastFrameTime)/1000):.016;lastFrameTime=timestamp;
 let dx=0,dy=0;if(heldKeys.has("left"))dx--;if(heldKeys.has("right"))dx++;if(heldKeys.has("up"))dy--;if(heldKeys.has("down"))dy++;
 const len=Math.hypot(dx,dy)||1,speed=190,base=localPosition||{x:me.x,y:me.y};
 const nx=base.x+dx/len*speed*dt,ny=base.y+dy/len*speed*dt;
 let x=base.x,y=base.y;if(!moveBlocked(nx,base.y))x=nx;if(!moveBlocked(x,ny))y=ny;
 let facing=me.facing||"down";if(Math.abs(dx)>Math.abs(dy))facing=dx<0?"left":"right";else if(dy)facing=dy<0?"up":"down";
 localPosition={x,y};me.x=x;me.y=y;me.facing=facing;me.moving=true;
 if(timestamp-lastMoveSent>55){socket.emit("movePlayer",{x,y,facing});lastMoveSent=timestamp;}
 renderMap();moveFrame=requestAnimationFrame(movementLoop);
}
window.addEventListener("keydown",event=>{
 if(["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName))return;
 if(event.code==="KeyE"){event.preventDefault();interactWorld();return;}
 if(KEY_DIRECTIONS[event.code]){event.preventDefault();beginMovement(event.code);}
});
window.addEventListener("keyup",event=>endMovement(event.code));
window.addEventListener("blur",()=>{heldKeys.clear();const me=currentPlayer();if(me){me.moving=false;renderMap();}});
// Analógico virtual: converte a posição do dedo em direções contínuas.
const joystick=$("virtualJoystick"),joystickKnob=$("joystickKnob");
let joystickPointer=null;
function setJoystickFromPointer(event){
 if(!joystick)return;
 const rect=joystick.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
 let dx=event.clientX-cx,dy=event.clientY-cy;const max=Math.min(rect.width,rect.height)*0.31;
 const length=Math.hypot(dx,dy);if(length>max){dx=dx/length*max;dy=dy/length*max;}
 if(joystickKnob)joystickKnob.style.transform=`translate(${dx}px,${dy}px)`;
 heldKeys.clear();
 if(Math.hypot(dx,dy)>max*0.18){
   if(dx < -max*.2)heldKeys.add("left");if(dx > max*.2)heldKeys.add("right");
   if(dy < -max*.2)heldKeys.add("up");if(dy > max*.2)heldKeys.add("down");
   if(!moveFrame){lastFrameTime=0;moveFrame=requestAnimationFrame(movementLoop);}
 }
}
function resetJoystick(){
 joystickPointer=null;heldKeys.clear();if(joystickKnob)joystickKnob.style.transform="translate(0,0)";
 const me=currentPlayer();if(me){me.moving=false;renderMap();}
}
if(joystick){
 joystick.addEventListener("pointerdown",event=>{event.preventDefault();joystickPointer=event.pointerId;joystick.setPointerCapture(event.pointerId);setJoystickFromPointer(event);});
 joystick.addEventListener("pointermove",event=>{if(event.pointerId===joystickPointer){event.preventDefault();setJoystickFromPointer(event);}});
 ["pointerup","pointercancel","lostpointercapture"].forEach(name=>joystick.addEventListener(name,resetJoystick));
}
$("mobileActionBtn")?.addEventListener("click",()=>interactWorld());
$("mobileAttackBtn")?.addEventListener("click",()=>{if(latestState?.battle)$("attackBtn")?.click();else toast("Aproxime-se de um inimigo para iniciar o combate.");});
document.querySelectorAll("[data-move]").forEach(button=>{
 const keys={up:"ArrowUp",down:"ArrowDown",left:"ArrowLeft",right:"ArrowRight"},key=keys[button.dataset.move];
 button.addEventListener("pointerdown",event=>{event.preventDefault();button.setPointerCapture?.(event.pointerId);beginMovement(key);});
 ["pointerup","pointercancel","lostpointercapture","pointerleave"].forEach(name=>button.addEventListener(name,()=>endMovement(key)));
});
let worldLoopActive=false;
function worldAnimation(){if(!worldLoopActive)return;if(latestState&&!latestState.battle)renderMap();requestAnimationFrame(worldAnimation);}
// Trilha 8-bit original sintetizada no navegador (sem arquivos ou músicas protegidas).
let audioContext = null, masterGain = null, musicTimer = null, musicEnabled = false, musicStep = 0;
const melody = [659,784,988,784,587,659,784,523,587,698,880,698,523,587,698,494,523,659,784,659,440,523,659,587,392,494,587,494,440,523,659,523];
const bassline = [131,147,165,147,110,131,147,131];
function playTone(freq, duration, type, level, when) {
  if (!audioContext || !masterGain) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain); gain.connect(masterGain);
  osc.start(when); osc.stop(when + duration + 0.02);
}
function musicTick() {
  if (!musicEnabled || !audioContext) return;
  const now = audioContext.currentTime + 0.025;
  playTone(melody[musicStep % melody.length], 0.17, 'square', 0.42, now);
  if (musicStep % 4 === 0) playTone(bassline[Math.floor(musicStep/4) % bassline.length], 0.42, 'triangle', 0.3, now);
  if (musicStep % 8 === 4) playTone(melody[(musicStep+5) % melody.length] * 2, 0.08, 'square', 0.13, now+0.09);
  musicStep++;
  musicTimer = setTimeout(musicTick, 220);
}
async function toggleMusic() {
  try {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return toast('Seu navegador não oferece áudio Web Audio.');
      audioContext = new AudioContextClass();
      masterGain = audioContext.createGain();
      masterGain.gain.value = Number($("musicVolume").value)/100 * 0.16;
      masterGain.connect(audioContext.destination);
    }
    await audioContext.resume();
    musicEnabled = !musicEnabled;
    $("musicToggle").textContent = musicEnabled ? '♫ Música: ligada' : '♫ Música: desligada';
    $("musicToggle").classList.toggle('music-on', musicEnabled);
    if (musicEnabled) musicTick(); else { clearTimeout(musicTimer); musicTimer = null; }
  } catch (error) { toast('Não foi possível iniciar a música neste navegador.'); }
}
$("musicToggle").addEventListener('click', toggleMusic);
$("musicVolume").addEventListener('input', () => {
  if (masterGain) masterGain.gain.setTargetAtTime(Number($("musicVolume").value)/100*0.16, audioContext.currentTime, 0.04);
});

fetch("/game-data").then(response=>response.json()).then(data=>{window.gameClasses=data.classes;window.gameQuests=data.quests;window.gameRegions=data.regions;const select=$("heroClass");select.innerHTML="";Object.entries(data.classes).forEach(([key,hero])=>{const option=document.createElement("option");option.value=key;option.textContent=`${hero.name} — ${hero.role} | ${hero.skill.name}`;select.append(option);});if(latestState){renderCampaign(latestState);renderMap();}}).catch(()=>{});
fetch('/campaign-data').then(r=>r.json()).then(data=>{window.regionScenes=data.scenes;window.dungeonData=data.dungeons;window.sideQuestData=data.sideQuests;if(latestState){renderCampaign(latestState);renderMap();}}).catch(()=>{});
socket.on("joined",data=>{currentCode=data.code;localPosition=null;enterGame();if(!window.platformerMode){worldLoopActive=true;requestAnimationFrame(worldAnimation);}toast(data.restored?"Progresso recuperado!":"Você entrou na aventura! Explore Eldoria.");});
socket.on("dialogue",data=>{if(!data)return;$("dialogueTitle").textContent=data.title||"Morador de Eldoria";$("dialogueText").textContent=(data.lines||[]).join(" ");$("dialoguePanel").classList.remove("hidden");if(data.npc==="blacksmith")$("merchant").classList.remove("hidden");});
socket.on("errorMessage",toast);
socket.on("notice",msg=>{toast(msg);log(msg)});
const remoteMoveTimers = new Map();
socket.on('playerMoved', data => {
  if (!latestState) return;
  const p = latestState.players.find(player => player.id === data.id);
  if (p) {
    p.x=data.x; p.y=data.y; p.facing=data.facing; p.moving=true;
    clearTimeout(remoteMoveTimers.get(data.id));
    remoteMoveTimers.set(data.id, setTimeout(() => {
      const current = latestState?.players.find(player => player.id === data.id);
      if (current) { current.moving=false; renderMap(); }
      remoteMoveTimers.delete(data.id);
    }, 220));
    renderMap();
  }
});
socket.on("state",state=>{
 const previousBattle=latestState?.battle,nextBattle=state.battle;
 if(previousBattle&&nextBattle&&nextBattle.hp<previousBattle.hp)window.battleFx={type:"attack",at:Date.now()};
 if(previousBattle&&nextBattle&&nextBattle.turn>previousBattle.turn)window.battleFx={type:"enemy",at:Date.now()};
 latestState=state;
 try{renderCampaign(state);}catch(error){console.error("Falha ao atualizar painel da campanha:",error);toast("Painel da campanha com erro; mapa será mantido.");}
 const meNow = state.players.find(p => p.id === socket.id);
 if (meNow) localPosition = {x:meNow.x,y:meNow.y};
 if (state.battle) { heldKeys.clear();localPosition=null;cancelAnimationFrame(moveFrame);moveFrame=null; }
 $("players").innerHTML="";
 state.players.forEach(p=>{
   const el=document.createElement("div");el.className="player";
   const icon=document.createElement('span'); icon.className='player-class-icon'; icon.textContent=({warrior:'⚔',mage:'✦',sorceress:'☄',cleric:'✚',rogue:'🗡',bard:'♫',paladin:'🛡',ranger:'🏹',monk:'☯'})[p.classKey]||'⚔';
   const info=document.createElement('div');
   const name=document.createElement("strong");name.textContent=p.name+(p.id===state.hostId?" 👑":"");
   const classLine=document.createElement('span'); classLine.className='class-label'; classLine.textContent=p.className;
   const stats=document.createElement("span");stats.className="hp";stats.textContent=`Nível ${p.level} • Vida ${p.hp}/${p.maxHp} • ATQ ${p.attack} • DEF ${p.defense} • MP ${p.mana}/${p.maxMana} • ${p.gold} ouros • ${p.potions} poções${p.ready?" • Pronto":""}`;
   info.append(name,classLine,stats);el.append(icon,info);$("players").append(el);
 });
 if (meNow) { $("character").textContent=`HERÓI: ${meNow.name} • ${meNow.className} | NÍVEL ${meNow.level} • XP: ${meNow.xp}/100 | HP ${meNow.hp}/${meNow.maxHp} • MP ${meNow.mana}/${meNow.maxMana} | ARMA: ${meNow.weapon} | ARMADURA: ${meNow.armor}`; const skill=window.gameClasses?.[meNow.classKey]?.skill; if(skill) $("skillBtn").textContent=`${skill.name} (${skill.cost} MP)`; }
 $("readyBtn").textContent=state.players.find(p=>p.id===socket.id)?.ready?"Cancelar prontidão":"Estou pronto";
 $("world").innerHTML="";
 [["Floresta Amaldiçoada",state.world.forest],["Caverna dos Ecos",state.world.cave],["Terras do Fogo",state.world.fire],["Castelo dos Condenados",state.world.castle],["Reino Sombrio",state.world.shadow]].forEach(([name,done])=>{
   const tag=document.createElement("span");tag.textContent=(done?"✓ ":"◇ ")+name;if(done)tag.className="done";$("world").append(tag);
 });
 $("treasureCaveBtn").disabled=!state.world.forest||!!state.battle;
 $("treasureForestBtn").disabled=!!state.battle;
 $("merchantBtn").disabled=!!state.battle;
 if(meNow) { $("inventoryPanel").textContent=`Poções: ${meNow.inventory?.potions ?? meNow.potions} • Arma: ${meNow.weapon} • Armadura: ${meNow.armor} • Pontos de habilidade: ${meNow.skillPoints} • Habilidade nível ${meNow.skillLevel}`; $("skillUpgradeBtn").disabled=!meNow.skillPoints; }
 if(state.quests&&window.gameQuests){$("questList").innerHTML="";window.gameQuests.forEach(quest=>{const progress=state.quests[quest.id];const item=document.createElement("div");item.className="quest-item"+(progress?.completed?" completed":"");const title=document.createElement("strong");title.textContent=(progress?.completed?"✓ ":"◇ ")+quest.title;const desc=document.createElement("p");desc.textContent=quest.description;const reward=document.createElement("small");reward.textContent=progress?.completed?"Concluída":`Recompensa: ${quest.reward.xp} XP • ${quest.reward.gold} ouros`;item.append(title,desc,reward);$("questList").append(item);});}

 document.querySelectorAll("[data-area]").forEach(button=>{const area=button.dataset.area;const unlock={forest:null,cave:"forest",fire:"cave",castle:"fire",shadow:"castle"}[area];button.disabled=!!state.battle||!!state.world[area]||(!!unlock&&!state.world[unlock]);});
 const bossUnlock={forest:true,cave:state.world.forest,fire:state.world.cave,castle:state.world.fire,shadow:state.world.castle};document.querySelectorAll("[data-boss-area]").forEach(button=>{const area=button.dataset.bossArea;button.disabled=!!state.battle||!bossUnlock[area]||!!state.world[area];});
 $("townActions").classList.add("hidden");
 if(state.battle) $("merchant").classList.add("hidden");
 const b=state.battle;
 $("battle").classList.toggle("hidden",!b);$("overworld").classList.toggle("hidden",!!b);document.querySelector(".mobile-pad")?.classList.toggle("hidden",!!b);
 const campaignOrder=['forest','cave','fire','castle','shadow'];
 const current=state.activeRegion||'village';
 const nextIndex=campaignOrder.indexOf(current)+1;
 const nextArea=campaignOrder[nextIndex];
 const actionButton=$("actions").querySelector('[data-area]');
 const regionCleared=!!state.world?.[current];
 $("actions").classList.toggle("hidden",!!b || (current!=='village'&&!regionCleared) || !nextArea && current!=='village');
 if(actionButton){actionButton.dataset.area=current==='village'?'forest':(regionCleared?nextArea:'forest');actionButton.textContent=current==='village'?'Seguir para a Floresta':(regionCleared&&nextArea?'Avançar para '+(window.regionScenes?.[nextArea]?.title||nextArea):'');}
 if(b){
   $("areaTitle").textContent="Combate cooperativo";
   $("storyText").textContent="A equipe precisa agir em conjunto. Cada jogador tem uma ação por rodada.";
   $("enemyName").textContent=b.enemy;drawBattleScene(state);const portrait=$("enemyPortrait").getContext("2d");portrait.clearRect(0,0,160,140);pixelMonster(portrait,b.enemy,80,76,5.2,!!b.boss,Date.now());$("enemyHp").textContent=`${b.hp} / ${b.maxHp} de vida`;
   $("enemyBar").style.width=(100*b.hp/b.maxHp)+"%";
   const me=state.players.find(p=>p.id===socket.id);
   const isMyTurn=!!me&&b.activePlayerId===socket.id&&me.hp>0;
   const activePlayer=state.players.find(p=>p.id===b.activePlayerId);
   $("attackBtn").disabled=!isMyTurn;$("potionBtn").disabled=!isMyTurn;$("fleeBtn").disabled=!isMyTurn||b.boss;$("defendBtn").disabled=!isMyTurn;$("skillBtn").disabled=!isMyTurn||!me||me.mana<((window.gameClasses?.[me.classKey]?.skill?.cost)||999);
   $("battleHint").textContent=isMyTurn
     ? `Sua vez! Rodada ${b.turn}. Escolha sua ação.`
     : activePlayer
       ? `Rodada ${b.turn}: vez de ${activePlayer.name}. Aguarde sua vez.`
       : "Aguardando o próximo turno.";
 } else {
   $("areaTitle").textContent=window.regionScenes?.[state.activeRegion]?.title || "Vila de Eldoria";
   $("mapTitle").textContent=(window.regionScenes?.[state.activeRegion]?.title || "ELDORIA").toUpperCase();
   $("storyText").textContent=state.world.shadow?"O reino está livre da escuridão! Malakar foi derrotado. A vitória pertence à equipe.":(REGION_STORY[state.activeRegion||"village"]||"Explore o mundo e descubra seus segredos.");
 }
 renderMap();
});
