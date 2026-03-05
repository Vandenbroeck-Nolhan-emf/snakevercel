'use strict';
/* ═══════════════════════════════════════════════════════
   SNAKE NEXUS MULTI v2.0
   Réseau : BroadcastChannel API (multi-onglets, zéro CDN)
   Architecture : host-authoritative
   Map : 150×100 cases  |  Vue : 700×600 px  |  Cell : 10px
═══════════════════════════════════════════════════════ */

/* ── CONSTANTES ───────────────────────────────────────── */
const MAP_W   = 150, MAP_H = 100, CELL = 10;
const VIEW_W  = 700, VIEW_H = 600;
const VCOLS   = VIEW_W / CELL;   // 70
const VROWS   = VIEW_H / CELL;   // 60
const SPEED0  = 140;             // ms par tick initial
const SPEEDMIN= 65;              // ms min
const MAX_PLAYERS = 6;
const MAX_FOOD    = 22;
const MAX_PU      = 6;

/* ── SKINS ─────────────────────────────────────────────── */
const SKINS = [
  { id:'classic', name:'Classique', head:'#ffffff', b0:'#39ff14', b1:'#00aa08', glow:'#39ff14' },
  { id:'neon',    name:'Néon',      head:'#ffe0f0', b0:'#ff2d6b', b1:'#cc0044', glow:'#ff2d6b' },
  { id:'cyber',   name:'Cyber',     head:'#e0f8ff', b0:'#00d4ff', b1:'#0055cc', glow:'#00d4ff' },
  { id:'gold',    name:'Or Pur',    head:'#fff8cc', b0:'#ffcc00', b1:'#ff9f00', glow:'#ffcc00' },
  { id:'shadow',  name:'Ombre',     head:'#e8d0ff', b0:'#bf00ff', b1:'#6600cc', glow:'#bf00ff' },
  { id:'fire',    name:'Flamme',    head:'#fff0e0', b0:'#ff4500', b1:'#ff8c00', glow:'#ff4500' },
  { id:'ice',     name:'Glace',     head:'#e0f8ff', b0:'#88ddff', b1:'#22aadd', glow:'#88ddff' },
  { id:'toxic',   name:'Toxique',   head:'#f0ffaa', b0:'#aaff00', b1:'#66cc00', glow:'#aaff00' },
  { id:'galaxy',  name:'Galaxie',   head:'#f0e8ff', b0:'#9955ff', b1:'#ff44bb', glow:'#9955ff' },
  { id:'cherry',  name:'Cerise',    head:'#ffe8e8', b0:'#cc0022', b1:'#880011', glow:'#cc0022' },
  { id:'ocean',   name:'Océan',     head:'#e0fff8', b0:'#00ccaa', b1:'#008877', glow:'#00ccaa' },
  { id:'ghost',   name:'Fantôme',   head:'#f5f5ff', b0:'#ccccee', b1:'#9999cc', glow:'#bbbbdd' },
];
function skin(id){ return SKINS.find(s=>s.id===id)||SKINS[0]; }

/* ── POWER-UPS ─────────────────────────────────────────── */
const PU_TYPES = [
  { id:'speed',   icon:'⚡', name:'Turbo',        color:'#ff9f00', dur:5000 },
  { id:'shield',  icon:'🛡️', name:'Bouclier',    color:'#00d4ff', dur:8000 },
  { id:'score2x', icon:'💰', name:'Double Score', color:'#ffcc00', dur:6000 },
  { id:'ghost',   icon:'👻', name:'Fantôme',      color:'#bf00ff', dur:5000 },
  { id:'magnet',  icon:'🧲', name:'Aimant',       color:'#39ff14', dur:6000 },
];

/* ── START POSITIONS ────────────────────────────────────── */
const STARTS = [
  {x:15,  y:50, dx:1,  dy:0},
  {x:135, y:50, dx:-1, dy:0},
  {x:75,  y:15, dx:0,  dy:1},
  {x:75,  y:85, dx:0,  dy:-1},
  {x:20,  y:20, dx:1,  dy:0},
  {x:130, y:80, dx:-1, dy:0},
];

/* ── AUDIO ──────────────────────────────────────────────── */
let aC=null;
function ga(){ if(!aC) aC=new(window.AudioContext||window.webkitAudioContext)(); return aC; }
function beep(f,t,d,v){ try{ const a=ga(),o=a.createOscillator(),g=a.createGain(); o.connect(g);g.connect(a.destination);o.type=t;o.frequency.value=f;g.gain.setValueAtTime(v,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+d);o.start();o.stop(a.currentTime+d); }catch(e){} }
const sfx={
  eat:  ()=>{ beep(880,'square',.06,.08); setTimeout(()=>beep(1100,'square',.05,.06),45); },
  die:  ()=>{ [220,185,150].forEach((f,i)=>setTimeout(()=>beep(f,'sawtooth',.15,.12),i*70)); },
  pu:   ()=>{ beep(660,'sine',.15,.1); setTimeout(()=>beep(880,'sine',.12,.08),80); },
  kill: ()=>{ beep(300,'sawtooth',.1,.12); setTimeout(()=>beep(200,'sawtooth',.08,.1),60); },
  join: ()=>{ beep(440,'sine',.1,.08); setTimeout(()=>beep(550,'sine',.1,.08),100); },
  win:  ()=>{ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,'triangle',.15,.1),i*100)); },
};

/* ── ÉTAT GLOBAL ────────────────────────────────────────── */
// Réseau
let channel = null;          // BroadcastChannel
let isHost  = false;
let localId = '';            // mon identifiant unique dans la room
let roomCode= '';

// Jeu
let players  = {};           // { [id]: PlayerObj }
let foods    = [];
let powerups = [];
let gameRunning  = false;
let gameInterval = null;
let globalTick   = 0;
let globalSpeed  = SPEED0;

// Rendu
let canvas, ctx, minimap, mCtx;
let camX=0, camY=0;
let rafId = null;

// Local
let localName  = 'Player';
let localSkinId= 'classic';

/* ── JOUEUR FACTORY ─────────────────────────────────────── */
function makePlayer(id, name, skinId, idx){
  const s = STARTS[idx % STARTS.length];
  const body = [];
  for(let i=0;i<4;i++) body.push({x:s.x-s.dx*i, y:s.y-s.dy*i});
  return { id, name, skin:skinId, body, dir:{x:s.dx,y:s.dy}, nextDir:{x:s.dx,y:s.dy},
           score:0, kills:0, alive:true, pu:null, shieldUsed:false, posIdx:idx };
}

/* ══════════════════════════════════════════════════════════
   RÉSEAU — BroadcastChannel
   Protocole :
   host→all : roomState | gameStart | gameState | feed | gameOver
   client→host : join | input | ping
══════════════════════════════════════════════════════════ */

function openChannel(code){
  if(channel) channel.close();
  channel = new BroadcastChannel('snx-'+code.toLowerCase());
  channel.onmessage = (e) => handleMsg(e.data);
  channel.onmessageerror = () => console.warn('channel error');
}

function send(msg){
  if(channel) channel.postMessage(msg);
}

// Hôte : envoie à tous sauf soi (BroadcastChannel ne se reçoit pas)
// Clients : envoie à l'hôte (il reçoit via le même canal)
function handleMsg(msg){
  if(isHost) handleAsHost(msg);
  else       handleAsClient(msg);
}

/* ── HÔTE : REÇOIT DES CLIENTS ──────────────────────────── */
function handleAsHost(msg){
  switch(msg.type){

    case 'join': {
      // Refuse si partie déjà lancée
      if(gameRunning){ send({type:'joinDenied', to:msg.id, reason:'Partie déjà en cours'}); return; }
      if(Object.keys(players).length >= MAX_PLAYERS){ send({type:'joinDenied', to:msg.id, reason:'Room pleine'}); return; }

      const idx = Object.keys(players).length;
      const p   = makePlayer(msg.id, msg.name, msg.skin, idx);
      players[msg.id] = p;

      // Envoie l'état de la room à TOUS (dont le nouvel arrivant)
      send({ type:'roomState', players: snapPlayers(), roomCode, hostId: localId });
      feed(`✅ ${msg.name} a rejoint la room !`, 'kf-joined');
      sfx.join();
      updateRoomUI();
      break;
    }

    case 'input': {
      const p = players[msg.id];
      if(p && p.alive){
        const d = msg.dir, c = p.dir;
        if(!(d.x===-c.x && d.y===-c.y)) p.nextDir = d;
      }
      break;
    }

    case 'ping': {
      send({ type:'pong', to:msg.id, t:msg.t });
      break;
    }

    case 'leave': {
      const p = players[msg.id];
      if(p){ delete players[msg.id]; feed(`👋 ${p.name} a quitté`, 'kf-died'); updateRoomUI(); }
      break;
    }
  }
}

/* ── CLIENT : REÇOIT DE L'HÔTE ─────────────────────────── */
function handleAsClient(msg){
  // Ignore messages intended for a specific other client
  if(msg.to && msg.to !== localId) return;

  switch(msg.type){

    case 'roomState': {
      players = {};
      msg.players.forEach(p => players[p.id] = p);
      roomCode = msg.roomCode;
      el('room-code-display').textContent = roomCode;
      updateRoomUI();
      break;
    }

    case 'joinDenied': {
      toast(msg.reason || 'Impossible de rejoindre', 'd');
      onBackToLobby();
      break;
    }

    case 'gameStart': {
      foods    = msg.foods;
      powerups = msg.powerups;
      globalSpeed = msg.speed;
      // Sync all player states
      msg.players.forEach(p => players[p.id] = p);
      showScreen('screen-game');
      startRender();
      toast('🎮 Partie lancée !', 'g');
      break;
    }

    case 'gameState': {
      msg.players.forEach(sp => {
        if(players[sp.id]) Object.assign(players[sp.id], sp);
        else players[sp.id] = sp;
      });
      foods    = msg.foods;
      powerups = msg.powerups;
      globalTick  = msg.tick;
      globalSpeed = msg.speed;
      updateHUD();
      break;
    }

    case 'feed': {
      addFeedItem(msg.text, msg.cls);
      if(msg.sfx==='kill') sfx.kill();
      if(msg.sfx==='pu')   sfx.pu();
      if(msg.sfx==='eat')  sfx.eat();
      break;
    }

    case 'gameOver': {
      sfx.win();
      feed(`🏆 ${msg.winner} a gagné avec ${msg.score} pts !`, 'kf-joined');
      break;
    }
  }
}

/* ══════════════════════════════════════════════════════════
   LOGIQUE DU JEU  (host only)
══════════════════════════════════════════════════════════ */

function hostStartGame(){
  gameRunning = true;
  globalTick  = 0;
  globalSpeed = SPEED0;

  // Reset players
  let idx = 0;
  Object.values(players).forEach(p => {
    const fresh = makePlayer(p.id, p.name, p.skin, idx++);
    Object.assign(p, fresh);
  });

  // Spawn food & power-ups
  foods=[]; powerups=[];
  for(let i=0;i<MAX_FOOD;i++) spawnFood();
  for(let i=0;i<3;i++) spawnPU();

  // Tell everyone to start
  send({ type:'gameStart', players:snapPlayers(), foods, powerups, speed:globalSpeed });

  showScreen('screen-game');
  startRender();
  gameInterval = setInterval(tick, globalSpeed);
}

function tick(){
  if(!gameRunning) return;
  globalTick++;

  Object.values(players).forEach(p => {
    if(!p.alive) return;
    p.dir = {...p.nextDir};

    const ghost = p.pu?.id==='ghost';
    let nx = p.body[0].x + p.dir.x;
    let ny = p.body[0].y + p.dir.y;

    // Wall collision
    if(ghost){
      nx = ((nx%MAP_W)+MAP_W)%MAP_W;
      ny = ((ny%MAP_H)+MAP_H)%MAP_H;
    } else if(nx<0||nx>=MAP_W||ny<0||ny>=MAP_H){
      kill(p.id, null, 'wall'); return;
    }

    // Self collision
    if(p.body.some(s=>s.x===nx&&s.y===ny)){
      if(p.pu?.id==='shield' && !p.shieldUsed){ p.shieldUsed=true; p.pu=null; broadcastFeed(`🛡️ ${p.name}: bouclier brisé !`,'kf-died'); }
      else { kill(p.id, null, 'self'); return; }
    }

    // Other snake collision
    let killedBy=null;
    Object.values(players).forEach(o=>{
      if(o.id===p.id||!o.alive) return;
      if(o.body.some(s=>s.x===nx&&s.y===ny)){
        if(o.body[0].x===nx&&o.body[0].y===ny){ kill(o.id,p.id,'headon'); killedBy=p.id; }
        else killedBy=o.id;
      }
    });
    if(killedBy){
      if(p.pu?.id==='shield'&&!p.shieldUsed){ p.shieldUsed=true; p.pu=null; broadcastFeed(`🛡️ ${p.name}: bouclier brisé !`,'kf-died'); }
      else { kill(p.id, killedBy, 'other'); return; }
    }

    p.body.unshift({x:nx,y:ny});

    // Food
    const fi = foods.findIndex(f=>f.x===nx&&f.y===ny);
    if(fi>=0){
      const f = foods.splice(fi,1)[0];
      const mult = p.pu?.id==='score2x' ? 2 : 1;
      p.score += (f.type==='special'?50:10) * mult;
      // Magnet
      if(p.pu?.id==='magnet') foods.forEach(food=>{
        const dx=nx-food.x,dy=ny-food.y;
        if(Math.abs(dx)+Math.abs(dy)<6){ food.x+=Math.sign(dx);food.y+=Math.sign(dy); }
      });
      spawnFood();
      // grow (don't pop)
    } else {
      p.body.pop();
    }

    // Power-up pickup
    const pui = powerups.findIndex(pu=>pu.x===nx&&pu.y===ny);
    if(pui>=0){
      const pu = powerups.splice(pui,1)[0];
      p.pu = {...pu, endTime: Date.now()+pu.dur};
      p.shieldUsed = false;
      broadcastFeed(`${pu.icon} ${p.name} a ramassé ${pu.name} !`, 'kf-ate', 'pu');
      spawnPU();
    }

    // PU expiry
    if(p.pu && Date.now()>p.pu.endTime){
      broadcastFeed(`⏱️ ${p.name}: ${p.pu.name} expiré`, 'kf-died');
      p.pu=null;
    }
  });

  // Speed ramp
  if(globalTick%35===0){
    globalSpeed = Math.max(SPEEDMIN, globalSpeed-3);
    clearInterval(gameInterval);
    gameInterval = setInterval(tick, globalSpeed);
  }

  // Win condition (multi only)
  const alive = Object.values(players).filter(p=>p.alive);
  const total = Object.keys(players).length;
  if(total>1 && alive.length<=1){
    const w = alive[0];
    if(w){ broadcastFeed(`🏆 ${w.name} a gagné avec ${w.score} pts !`,'kf-joined'); send({type:'gameOver',winner:w.name,score:w.score}); }
    gameRunning=false; clearInterval(gameInterval);
  }

  // Solo: never end
  broadcastState();
}

function kill(id, byId, reason){
  const p = players[id];
  if(!p||!p.alive) return;
  p.alive=false;
  if(byId && players[byId]){
    players[byId].kills++;
    players[byId].score+=100;
    broadcastFeed(`💀 ${players[byId].name} a éliminé ${p.name} !`, 'kf-kill', 'kill');
  } else {
    const msg = reason==='wall' ? `💥 ${p.name} a foncé dans un mur` : `💥 ${p.name} s'est mangé lui-même`;
    broadcastFeed(msg, 'kf-died');
  }
  sfx.die();
}

function broadcastState(){
  const state = { type:'gameState', tick:globalTick, speed:globalSpeed, players:snapPlayers(), foods, powerups };
  send(state);
  // Host also applies to himself
  updateHUD();
}

function broadcastFeed(text, cls, sfxName=''){
  send({type:'feed', text, cls, sfx:sfxName});
  addFeedItem(text, cls);
}

function feed(text, cls){ addFeedItem(text, cls); }

/* ── FOOD / PU ──────────────────────────────────────────── */
function freeCell(){
  let p; let t=0;
  do {
    p={x:Math.floor(Math.random()*MAP_W), y:Math.floor(Math.random()*MAP_H)};
    t++;
  } while(t<500 && (foods.some(f=>f.x===p.x&&f.y===p.y)||powerups.some(u=>u.x===p.x&&u.y===p.y)||Object.values(players).some(pl=>pl.body&&pl.body.some(s=>s.x===p.x&&s.y===p.y))));
  return p;
}
function spawnFood(){ if(foods.length>=MAX_FOOD) return; const p=freeCell(); foods.push({...p, type:Math.random()<0.12?'special':'normal'}); }
function spawnPU()  { if(powerups.length>=MAX_PU) return; const p=freeCell(); const t=PU_TYPES[Math.floor(Math.random()*PU_TYPES.length)]; powerups.push({...p,...t}); }

/* ── SERIALISATION ──────────────────────────────────────── */
function snapPlayer(p){ return {id:p.id,name:p.name,skin:p.skin,body:p.body.slice(0,80),dir:p.dir,score:p.score,kills:p.kills,alive:p.alive,pu:p.pu?{id:p.pu.id,icon:p.pu.icon,name:p.pu.name,endTime:p.pu.endTime}:null}; }
function snapPlayers(){ return Object.values(players).map(snapPlayer); }

/* ══════════════════════════════════════════════════════════
   RENDU
══════════════════════════════════════════════════════════ */
function startRender(){ rafId=requestAnimationFrame(renderLoop); }
function stopRender() { if(rafId) cancelAnimationFrame(rafId); rafId=null; }

function renderLoop(){ draw(); rafId=requestAnimationFrame(renderLoop); }

function updateCam(){
  const me = players[localId];
  let target = null;
  if(me?.alive && me.body?.length) target = me.body[0];
  else {
    const a=Object.values(players).find(p=>p.alive&&p.body?.length);
    if(a) target=a.body[0];
  }
  if(target){
    camX = Math.round(target.x - VCOLS/2);
    camY = Math.round(target.y - VROWS/2);
    camX = Math.max(0, Math.min(MAP_W-VCOLS, camX));
    camY = Math.max(0, Math.min(MAP_H-VROWS, camY));
  }
}

function inV(wx,wy){ return wx>=camX&&wx<camX+VCOLS&&wy>=camY&&wy<camY+VROWS; }
function ws(wx,wy) { return [(wx-camX)*CELL, (wy-camY)*CELL]; }

function draw(){
  if(!canvas||!ctx) return;
  updateCam();

  ctx.clearRect(0,0,VIEW_W,VIEW_H);
  ctx.fillStyle='#030810'; ctx.fillRect(0,0,VIEW_W,VIEW_H);

  // Grid
  ctx.strokeStyle='rgba(0,212,255,0.022)'; ctx.lineWidth=0.5;
  for(let x=0;x<=VCOLS;x++){ ctx.beginPath();ctx.moveTo(x*CELL,0);ctx.lineTo(x*CELL,VIEW_H);ctx.stroke(); }
  for(let y=0;y<=VROWS;y++){ ctx.beginPath();ctx.moveTo(0,y*CELL);ctx.lineTo(VIEW_W,y*CELL);ctx.stroke(); }

  // Map border walls
  ctx.strokeStyle='rgba(255,45,107,0.5)'; ctx.lineWidth=2;
  if(camX<=0)           { const sx=(0-camX)*CELL;         ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx,VIEW_H);ctx.stroke(); }
  if(camX+VCOLS>=MAP_W) { const sx=(MAP_W-camX)*CELL;     ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx,VIEW_H);ctx.stroke(); }
  if(camY<=0)           { const sy=(0-camY)*CELL;         ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(VIEW_W,sy);ctx.stroke(); }
  if(camY+VROWS>=MAP_H) { const sy=(MAP_H-camY)*CELL;     ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(VIEW_W,sy);ctx.stroke(); }

  // Power-ups
  powerups.forEach(pu=>{
    if(!inV(pu.x,pu.y)) return;
    const [sx,sy]=ws(pu.x,pu.y);
    const p=1+Math.sin(Date.now()/700+pu.x)*0.13;
    const grd=ctx.createRadialGradient(sx+CELL/2,sy+CELL/2,0,sx+CELL/2,sy+CELL/2,CELL*2);
    grd.addColorStop(0,pu.color+'44'); grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd; ctx.fillRect(sx-CELL,sy-CELL,CELL*3,CELL*3);
    ctx.fillStyle=pu.color; ctx.shadowColor=pu.color; ctx.shadowBlur=14;
    const sz=(CELL-2)*p;
    ctx.fillRect(sx+1+(CELL-2-sz)/2,sy+1+(CELL-2-sz)/2,sz,sz); ctx.shadowBlur=0;
    ctx.fillStyle='#fff'; ctx.font=`${CELL*0.75}px serif`; ctx.textAlign='center';
    ctx.fillText(pu.icon,sx+CELL/2,sy+CELL*0.85); ctx.textAlign='left';
  });

  // Foods
  foods.forEach(f=>{
    if(!inV(f.x,f.y)) return;
    const [sx,sy]=ws(f.x,f.y); const fx=sx+CELL/2,fy=sy+CELL/2;
    const col=f.type==='special'?'#ff9f00':'#ff2d6b';
    const p=1+Math.sin(Date.now()/320+f.x*0.4)*0.11;
    const grd=ctx.createRadialGradient(fx,fy,0,fx,fy,CELL*1.8);
    grd.addColorStop(0,col+'55'); grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd; ctx.fillRect(sx-CELL,sy-CELL,CELL*3,CELL*3);
    ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=10;
    const m=1.5, sz=(CELL-m*2)*p;
    ctx.fillRect(sx+m+(CELL-m*2-sz)/2,sy+m+(CELL-m*2-sz)/2,sz,sz); ctx.shadowBlur=0;
    if(f.type==='special'){
      ctx.fillStyle='#fff'; ctx.font=`${CELL*0.6}px monospace`; ctx.textAlign='center';
      ctx.fillText('★',sx+CELL/2,sy+CELL*0.82); ctx.textAlign='left';
    }
  });

  // Snakes (dead first so alive on top)
  const plist = Object.values(players).sort((a,b)=>(a.alive?1:0)-(b.alive?1:0));
  plist.forEach(p=>{
    if(!p.body?.length) return;
    const sk=skin(p.skin), isMe=p.id===localId;

    p.body.forEach((s,i)=>{
      if(!inV(s.x,s.y)) return;
      const [sx,sy]=ws(s.x,s.y);
      const t=i/p.body.length;
      if(!p.alive) ctx.globalAlpha=0.28;
      if(i===0){
        ctx.fillStyle=sk.head; ctx.shadowColor=sk.glow; ctx.shadowBlur=isMe?20:12;
      } else {
        const r1=parseInt(sk.b0.slice(1,3),16),g1=parseInt(sk.b0.slice(3,5),16),b1=parseInt(sk.b0.slice(5,7),16);
        const r2=parseInt(sk.b1.slice(1,3),16),g2=parseInt(sk.b1.slice(3,5),16),b2=parseInt(sk.b1.slice(5,7),16);
        ctx.fillStyle=`rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
        ctx.shadowColor=sk.glow; ctx.shadowBlur=isMe?6*(1-t):2*(1-t);
      }
      const m=i===0?0.5:1.5;
      ctx.fillRect(sx+m,sy+m,CELL-m*2,CELL-m*2);
      ctx.globalAlpha=1; ctx.shadowBlur=0;
    });

    // Eyes
    if(p.alive && inV(p.body[0].x,p.body[0].y)){
      const [sx,sy]=ws(p.body[0].x,p.body[0].y);
      ctx.fillStyle='rgba(0,0,0,0.85)';
      const ew=2, off=Math.round(CELL*.62);
      if(p.dir.x!==0){ const ex=sx+(p.dir.x>0?off:1); ctx.fillRect(ex,sy+2,ew,ew); ctx.fillRect(ex,sy+CELL-ew-2,ew,ew); }
      else            { const ey=sy+(p.dir.y>0?off:1); ctx.fillRect(sx+2,ey,ew,ew); ctx.fillRect(sx+CELL-ew-2,ey,ew,ew); }
    }

    // Name tag
    if(p.alive && inV(p.body[0].x,p.body[0].y)){
      const [sx,sy]=ws(p.body[0].x,p.body[0].y);
      ctx.font=`bold ${isMe?12:10}px Rajdhani,sans-serif`;
      ctx.textAlign='center';
      ctx.shadowColor=sk.glow; ctx.shadowBlur=8;
      ctx.fillStyle=isMe?'#ffffff':sk.glow;
      ctx.fillText(p.name+(p.pu?` ${p.pu.icon}`:''),sx+CELL/2,sy-5);
      ctx.textAlign='left'; ctx.shadowBlur=0;
    }
  });

  drawMinimap();
  drawDeathOverlay();
}

/* ── MINIMAP ────────────────────────────────────────────── */
function drawMinimap(){
  if(!minimap||!mCtx) return;
  const mw=minimap.width,mh=minimap.height,sx=mw/MAP_W,sy=mh/MAP_H;
  mCtx.fillStyle='rgba(2,8,20,0.95)'; mCtx.fillRect(0,0,mw,mh);
  // grid
  mCtx.strokeStyle='rgba(0,212,255,0.07)'; mCtx.lineWidth=.5;
  for(let x=0;x<=MAP_W;x+=10){mCtx.beginPath();mCtx.moveTo(x*sx,0);mCtx.lineTo(x*sx,mh);mCtx.stroke();}
  for(let y=0;y<=MAP_H;y+=10){mCtx.beginPath();mCtx.moveTo(0,y*sy);mCtx.lineTo(mw,y*sy);mCtx.stroke();}
  // radar sweep
  const ang=(Date.now()/1800)%(Math.PI*2);
  mCtx.save();mCtx.translate(mw/2,mh/2);mCtx.rotate(ang);
  mCtx.fillStyle='rgba(57,255,20,0.07)';
  mCtx.beginPath();mCtx.moveTo(0,0);mCtx.arc(0,0,Math.max(mw,mh),0,Math.PI/3);mCtx.closePath();mCtx.fill();
  mCtx.restore();
  // foods
  foods.forEach(f=>{ mCtx.fillStyle=f.type==='special'?'#ff9f00':'#ff2d6b'; mCtx.fillRect(f.x*sx,f.y*sy,Math.max(1.5,sx),Math.max(1.5,sy)); });
  // power-ups
  powerups.forEach(pu=>{ mCtx.fillStyle=pu.color; mCtx.fillRect(pu.x*sx,pu.y*sy,Math.max(2,sx),Math.max(2,sy)); });
  // players
  Object.values(players).forEach(p=>{
    if(!p.body?.length) return;
    const sk=skin(p.skin);
    mCtx.fillStyle=p.alive?sk.glow:'rgba(255,255,255,0.18)';
    p.body.forEach((s,i)=>mCtx.fillRect(s.x*sx,s.y*sy,Math.max(i===0?2.5:1.5,sx),Math.max(i===0?2.5:1.5,sy)));
  });
  // viewport
  mCtx.strokeStyle='rgba(255,255,255,0.35)'; mCtx.lineWidth=1;
  mCtx.strokeRect(camX*sx,camY*sy,VCOLS*sx,VROWS*sy);
  // border
  mCtx.strokeStyle='rgba(0,212,255,0.3)'; mCtx.lineWidth=1; mCtx.strokeRect(0,0,mw,mh);
}

function drawDeathOverlay(){
  const me=players[localId], ov=el('death-overlay');
  if(!ov) return;
  if(me&&!me.alive&&gameRunning){ ov.classList.remove('hidden'); el('do-score').textContent=me.score+' pts'; }
  else ov.classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════
   UI
══════════════════════════════════════════════════════════ */
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>{s.classList.add('hidden');s.classList.remove('visible');});
  const s=el(id); if(s){s.classList.remove('hidden');s.classList.add('visible');}
}

function updateRoomUI(){
  const list=el('player-list'); if(!list) return;
  const ps=Object.values(players);
  list.innerHTML='';
  ps.forEach(p=>{
    const sk=skin(p.skin);
    const div=document.createElement('div');
    div.className='player-slot filled'+(p.id===localId?' you':'');
    div.innerHTML=`<div class="ps-skin" style="background:${sk.b0};box-shadow:0 0 8px ${sk.glow}"></div>
      <span class="ps-name">${p.name}</span>
      ${p.id===localId?'<span class="ps-you">VOUS</span>':''}
      ${isHost&&p.id===localId?'<span class="ps-badge">HÔTE</span>':''}`;
    list.appendChild(div);
  });
  for(let i=ps.length;i<MAX_PLAYERS;i++){
    const div=document.createElement('div'); div.className='player-slot';
    div.innerHTML='<span class="ps-empty">— En attente...</span>';
    list.appendChild(div);
  }

  const btn=el('btn-start-game');
  if(btn) btn.disabled=(!isHost||ps.length<1);

  const hc=el('host-controls'), bl=el('btn-leave'), hint=el('room-hint');
  if(hc) hc.style.display=isHost?'flex':'none';
  if(bl) bl.style.display=isHost?'none':'block';
  if(hint) hint.textContent=isHost?`${ps.length} joueur(s) — Lance la partie !`:'En attente que l\'hôte lance...';
  setStatus(isHost?`🟢 Hôte · Room ${roomCode} · ${ps.length} joueur(s)`:`🟢 Connecté · Room ${roomCode}`);
}

function updateLeaderboard(){
  const c=el('lb-list'); if(!c) return;
  const sorted=Object.values(players).sort((a,b)=>b.score-a.score);
  c.innerHTML='';
  sorted.forEach((p,i)=>{
    const sk=skin(p.skin);
    const div=document.createElement('div');
    div.className='lb-item'+(p.id===localId?' me':'')+(p.alive?'':' dead');
    const rc=['gold','silver','bronze'][i]||'';
    div.innerHTML=`<div class="lb-rank ${rc}">${i+1}</div>
      <div class="lb-skin-badge" style="background:${sk.b0};box-shadow:0 0 5px ${sk.glow}40"></div>
      <div class="lb-name">${p.name}${p.id===localId?' ★':''}</div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:1px">
        <div class="lb-score">${p.score}</div>
        ${p.kills>0?`<div class="lb-kills">💀${p.kills}</div>`:''}
        ${!p.alive?'<div class="lb-dead-tag">MORT</div>':''}
        ${p.pu?`<div style="font-size:.65rem">${p.pu.icon}</div>`:''}
      </div>`;
    c.appendChild(div);
  });
}

function addFeedItem(text, cls='kf-died'){
  const c=el('kf-list'); if(!c) return;
  const d=document.createElement('div'); d.className='kf-item';
  d.innerHTML=`<span class="${cls}">${text}</span>`;
  c.insertBefore(d,c.firstChild);
  while(c.children.length>25) c.removeChild(c.lastChild);
}

function updateHUD(){
  const me=players[localId];
  const alive=Object.values(players).filter(p=>p.alive).length;
  el('mi-players').textContent=alive+'/'+Object.keys(players).length;
  el('mi-food').textContent=foods.length;
  el('mi-speed').textContent=globalSpeed+'ms';
  if(me) el('mi-score').textContent=me.score;
  updateLeaderboard();
}

/* ── SKIN PICKER ────────────────────────────────────────── */
function buildSkinPicker(){
  const grid=el('skin-grid'); if(!grid) return;
  SKINS.forEach(s=>{
    const div=document.createElement('div');
    div.className='skin-opt'+(s.id===localSkinId?' selected':'');
    div.dataset.id=s.id;
    div.innerHTML=`<div class="sk-preview" style="background:linear-gradient(135deg,${s.b0},${s.b1});box-shadow:0 0 6px ${s.glow}40"></div><div class="sk-name">${s.name}</div>`;
    div.onclick=()=>{
      localSkinId=s.id;
      document.querySelectorAll('.skin-opt').forEach(o=>o.classList.remove('selected'));
      div.classList.add('selected');
    };
    grid.appendChild(div);
  });
}

/* ── INPUT ──────────────────────────────────────────────── */
document.addEventListener('keydown', e=>{
  if(!gameRunning) return;
  let d=null;
  switch(e.key){
    case 'ArrowLeft': case 'a': d={x:-1,y:0}; break;
    case 'ArrowRight':case 'd': d={x:1,y:0};  break;
    case 'ArrowUp':   case 'w': d={x:0,y:-1}; break;
    case 'ArrowDown': case 's': d={x:0,y:1};  break;
  }
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
  if(!d) return;

  if(isHost){
    const p=players[localId];
    if(p&&!(d.x===-p.dir.x&&d.y===-p.dir.y)) p.nextDir=d;
  } else {
    send({type:'input', id:localId, dir:d});
  }
});

/* ── TOAST / STATUS ─────────────────────────────────────── */
function toast(msg,cls='i'){
  const t=document.createElement('div'); t.className=`toast ${cls}`; t.textContent=msg;
  el('toasts').appendChild(t); setTimeout(()=>t.remove(),3200);
}
function setStatus(msg){ const e=el('conn-status'); if(e) e.textContent=msg; }

/* ── HELPERS ────────────────────────────────────────────── */
function el(id){ return document.getElementById(id); }
function uid(){ return Math.random().toString(36).slice(2,10); }

/* ══════════════════════════════════════════════════════════
   BOUTONS LOBBY
══════════════════════════════════════════════════════════ */
window.onCreateRoom = function(){
  const name = el('name-input').value.trim().slice(0,16);
  if(!name){ toast('Entre un pseudo !','w'); return; }
  localName   = name;
  localSkinId = document.querySelector('.skin-opt.selected')?.dataset?.id || 'classic';
  localId     = uid();
  isHost      = true;
  roomCode    = Math.random().toString(36).slice(2,8).toUpperCase();

  openChannel(roomCode);
  players = {};
  // Host adds himself
  players[localId] = makePlayer(localId, localName, localSkinId, 0);

  el('room-code-display').textContent = roomCode;
  showScreen('screen-room');
  updateRoomUI();
  setStatus(`🟢 Hôte · Room ${roomCode}`);
  toast(`Room créée ! Code : ${roomCode}`, 'g');
};

window.onShowJoin = function(){
  el('join-section').style.display='flex';
};

window.onJoinRoom = function(){
  const name = el('name-input').value.trim().slice(0,16);
  if(!name){ toast('Entre un pseudo !','w'); return; }
  const code = el('join-code-input').value.trim().toUpperCase();
  if(code.length<4){ toast('Code invalide','w'); return; }

  localName   = name;
  localSkinId = document.querySelector('.skin-opt.selected')?.dataset?.id || 'classic';
  localId     = uid();
  isHost      = false;
  roomCode    = code;

  openChannel(code);

  // Send join request to host (broadcast — host will pick it up)
  setTimeout(()=>{
    send({ type:'join', id:localId, name:localName, skin:localSkinId });
    showScreen('screen-room');
    el('room-code-display').textContent = code;
    el('host-controls').style.display='none';
    el('btn-leave').style.display='block';
    setStatus(`🟡 Connexion à la room ${code}...`);
    toast(`Connexion à la room ${code}...`, 'i');
    // Timeout if no answer
    setTimeout(()=>{
      if(!Object.keys(players).length){
        toast('Aucune réponse — vérifie le code et que la room est ouverte dans un autre onglet.','d');
        setStatus('⚠️ Pas de réponse de l\'hôte');
      }
    }, 4000);
  }, 200);
};

window.onStartGame = function(){
  if(!isHost) return;
  hostStartGame();
};

window.onBackToLobby = function(){
  if(channel){ send({type:'leave', id:localId}); channel.close(); channel=null; }
  stopRender(); gameRunning=false;
  clearInterval(gameInterval);
  players={}; foods=[]; powerups=[];
  showScreen('screen-lobby');
  setStatus('🔌 Déconnecté');
};

/* ── INIT ───────────────────────────────────────────────── */
function init(){
  canvas  = el('gameCanvas');
  ctx     = canvas?.getContext('2d');
  minimap = el('minimap');
  mCtx    = minimap?.getContext('2d');
  buildSkinPicker();
  showScreen('screen-lobby');
  setStatus('🔌 Déconnecté');
}
init();