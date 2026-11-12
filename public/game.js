const socket = io();
const $ = id => document.getElementById(id);
let currentCode = null, latestState = null, toastTimer;
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("toast").classList.remove("show"),3000)}
function log(msg){const el=document.createElement("div");el.className="logline";el.textContent=msg;$("log").prepend(el)}
function enterGame(){ $("entry").classList.add("hidden"); $("game").classList.remove("hidden"); $("roomLabel").textContent=currentCode; }
$("createBtn").onclick=()=>socket.emit("createRoom",{name:$("playerName").value});
$("joinBtn").onclick=()=>socket.emit("joinRoom",{name:$("playerName").value,roomCode:$("roomCode").value});
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
$("potionBtn").onclick=()=>socket.emit("battleAction",{action:"potion"});
$("fleeBtn").onclick=()=>socket.emit("flee");
socket.on("joined",data=>{currentCode=data.code;enterGame();toast("Você entrou na aventura! Compartilhe o código.")});
socket.on("errorMessage",toast);socket.on("notice",msg=>{toast(msg);log(msg)});
socket.on("state",state=>{
 latestState=state;
 $("players").innerHTML="";
 state.players.forEach(p=>{
   const el=document.createElement("div");el.className="player";
   const name=document.createElement("strong");name.textContent=p.name+(p.id===state.hostId?" 👑":"");
   const stats=document.createElement("span");stats.className="hp";stats.textContent=`Nível ${p.level} • Vida ${p.hp}/${p.maxHp} • ATQ ${p.attack} • DEF ${p.defense} • ${p.gold} ouros • ${p.potions} poções${p.ready?" • Pronto":""}`;
   el.append(name,stats);$("players").append(el);
   if(p.id===socket.id){$("character").textContent=`HERÓI: ${p.name} | XP: ${p.xp}/100 | ARMA: ${p.weapon}`;}
 });
 $("readyBtn").textContent=state.players.find(p=>p.id===socket.id)?.ready?"Cancelar prontidão":"Estou pronto";
 $("world").innerHTML="";
 [["Floresta Sombria",state.world.forest],["Caverna dos Ecos",state.world.cave],["Castelo Sombrio",state.world.castle]].forEach(([name,done])=>{
   const tag=document.createElement("span");tag.textContent=(done?"✓ ":"◇ ")+name;if(done)tag.className="done";$("world").append(tag);
 });
 $("treasureCaveBtn").disabled=!state.world.forest||!!state.battle;
 $("treasureForestBtn").disabled=!!state.battle;
 $("merchantBtn").disabled=!!state.battle;
 document.querySelector('[data-area="cave"]').disabled=!state.world.forest||!!state.battle;
 document.querySelector('[data-area="castle"]').disabled=!state.world.cave||state.world.castle||!!state.battle;
 document.querySelector('[data-area="forest"]').disabled=!!state.battle;
 $("townActions").classList.toggle("hidden",!!state.battle);
 if(state.battle) $("merchant").classList.add("hidden");
 const b=state.battle;
 $("battle").classList.toggle("hidden",!b);$("actions").classList.toggle("hidden",!!b);
 if(b){
   $("areaTitle").textContent="Combate cooperativo";
   $("storyText").textContent="A equipe precisa agir em conjunto. Cada jogador tem uma ação por rodada.";
   $("enemyName").textContent=b.enemy;$("enemyHp").textContent=`${b.hp} / ${b.maxHp} de vida`;
   $("enemyBar").style.width=(100*b.hp/b.maxHp)+"%";
   const me=state.players.find(p=>p.id===socket.id);
   const acted=b.acted.includes(socket.id);
   $("attackBtn").disabled=acted||!me||me.hp<=0;$("potionBtn").disabled=acted||!me||me.hp<=0;$("fleeBtn").disabled=acted||!me||me.hp<=0||b.boss;
   $("battleHint").textContent=acted?"Sua ação foi realizada. Aguarde os demais.":"Escolha sua ação nesta rodada.";
 } else {
   $("areaTitle").textContent="Vila de Eldoria";
   $("storyText").textContent=state.world.castle?"O reino está livre da escuridão! A vitória pertence à equipe.":"Reúnam seus aliados e preparem-se para enfrentar as sombras.";
 }
});
