(() => {
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (s) => document.querySelector(s);
  const ui = { start: $('#startOverlay'), pause: $('#pauseOverlay'), end: $('#endOverlay'), goal: $('#goalFlash'), goalTeam: $('#goalTeam'), play: $('#playBtn'), resume: $('#resumeBtn'), again: $('#againBtn'), clock: $('#clock'), period: $('#period'), homeScore: $('#homeScore'), awayScore: $('#awayScore'), homeName: $('#homeName'), awayName: $('#awayName'), homeCrest: $('#homeCrest'), awayCrest: $('#awayCrest'), hint: $('#hudHint'), teamSelect: $('#teamSelect') };
  const W = 1000, H = 600;
  const pitch = { x: 65, y: 48, w: 870, h: 504, goalTop: 220, goalBottom: 380 };
  const club = {
    boca: {name:'BOCA JUNIORS',short:'BO',shirt:'#0784c7',trim:'#f5d238',shorts:'#123b83'},
    river: {name:'RIVER PLATE',short:'RP',shirt:'#f2eee7',trim:'#df3341',shorts:'#d82d3d'},
    racing: {name:'RACING CLUB',short:'RC',shirt:'#8dd5ec',trim:'#f4f4ed',shorts:'#e9ece5'},
    independiente: {name:'INDEPENDIENTE',short:'CAI',shirt:'#d52a35',trim:'#f4eee3',shorts:'#e9ece5'},
    sanlorenzo: {name:'SAN LORENZO',short:'CAS',shirt:'#263e8c',trim:'#d92f43',shorts:'#d92f43'}
  };
  const awayClub = {name:'RIVER PLATE',short:'RP',shirt:'#f2eee7',trim:'#df3341',shorts:'#d82d3d'};
  const keys = new Set(), touch = new Set();
  let homeClub = club.boca, home = [], away = [], ball, gameState = 'menu', last = 0, matchTime = 0, kickoff = 0, homeGoals = 0, awayGoals = 0, controlled = 0, shotCooldown = 0, passCooldown = 0, soundOn = false, audioCtx = null, tapTarget = null, secondHalf = false;

  function makeTeam(side, kit) {
    const sign = side === 'home' ? -1 : 1;
    return [
      {x: side==='home'?360:640, y:300, role:'FW', name:side==='home'?'10 · VOS':'9 · TORO', speed:190},
      {x: side==='home'?230:770, y:190, role:'MF', name:'8 · MOTOR', speed:155},
      {x: side==='home'?230:770, y:410, role:'MF', name:'5 · PULMÓN', speed:155},
      {x: side==='home'?120:880, y:300, role:'GK', name:'1 · ARQUERO', speed:125},
      {x: side==='home'?380:620, y:500, role:'MF', name:'7 · WING', speed:155}
    ].map((p,i)=>{const player={...p,side,kit,id:i,vx:0,vy:0,dir:side==='home'?1:-1,stamina:1,aiOffset:(i*1.7)%4,homeX:p.x,homeY:p.y};if(secondHalf){player.x=W-player.x;player.homeX=W-player.homeX;player.dir*=-1}return player});
  }
  function resetBall() { ball={x:500,y:300,vx:0,vy:0,r:9,spin:0,lastTouch:'home',owner:null}; home=makeTeam('home',homeClub); away=makeTeam('away',awayClub); controlled=0; kickoff=1.6; }
  resetBall();
  function setClub(key) { homeClub=club[key]||club.boca; ui.homeName.textContent=homeClub.name;ui.homeCrest.textContent=homeClub.short;ui.homeCrest.style.background=`linear-gradient(135deg,${homeClub.shirt},${homeClub.trim})`;ui.homeCrest.style.color=homeClub.shirt==='#f2eee7'?'#d82d3d':'#fff'; resetBall(); }
  ui.teamSelect.addEventListener('change',e=>setClub(e.target.value));

  function startMatch() { homeGoals=awayGoals=0;matchTime=0;secondHalf=false;ui.homeScore.textContent='0';ui.awayScore.textContent='0';resetBall();gameState='playing';ui.start.classList.add('hidden');ui.pause.classList.add('hidden');ui.end.classList.add('hidden');ui.hint.innerHTML='WASD <b>MOVER</b> &nbsp;·&nbsp; ESPACIO <b>PATEAR</b>'; }
  ui.play.addEventListener('click',()=>{startMatch();beep(540,.08)});
  ui.again.addEventListener('click',()=>{startMatch();beep(540,.08)});
  ui.resume.addEventListener('click',()=>{gameState='playing';ui.pause.classList.add('hidden');last=performance.now()});
  document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();keys.add(k);if(k==='escape'){if(gameState==='playing'){gameState='paused';ui.pause.classList.remove('hidden')}else if(gameState==='paused'){gameState='playing';ui.pause.classList.add('hidden')}}if((k===' '||k==='enter')&&gameState==='playing')shoot();if(k==='e'&&gameState==='playing')passBall();});
  document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  function bindHold(el,token){el.addEventListener('pointerdown',e=>{e.preventDefault();touch.add(token);el.classList.add('active');try{el.setPointerCapture(e.pointerId)}catch(_){}});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>el.addEventListener(ev,()=>{touch.delete(token);el.classList.remove('active')}));}
  document.querySelectorAll('.dpad button').forEach(b=>bindHold(b,b.dataset.dir));
  bindHold($('#mobileShoot'),'shoot');bindHold($('#mobilePass'),'pass');
  canvas.addEventListener('pointerdown',e=>{if(gameState!=='playing'||e.pointerType==='mouse')return;const r=canvas.getBoundingClientRect();tapTarget={x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};setTimeout(()=>tapTarget=null,700)});
  $('#soundBtn').addEventListener('click',e=>{soundOn=!soundOn;e.currentTarget.innerHTML=(soundOn?'♫':'♩')+' <span>SONIDO</span>';if(soundOn)beep(660,.1)});
  function beep(freq,duration){if(!soundOn)return;try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.055,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+duration);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+duration)}catch{}}

  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function moveToward(p,x,y,speed,dt){let dx=x-p.x,dy=y-p.y,d=Math.hypot(dx,dy)||1;dx/=d;dy/=d;p.vx=dx*speed;p.vy=dy*speed;p.x+=p.vx*dt;p.y+=p.vy*dt;if(Math.abs(dx)>.1)p.dir=dx>0?1:-1}
  function clampPlayer(p){p.x=Math.max(pitch.x+12,Math.min(pitch.x+pitch.w-12,p.x));p.y=Math.max(pitch.y+13,Math.min(pitch.y+pitch.h-13,p.y))}
  function nearestPlayer(team){return team.reduce((best,p)=>distance(p,ball)<distance(best,ball)?p:best,team[0])}
  function updatePlayer(p,dt){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=Math.pow(.08,dt);p.vy*=Math.pow(.08,dt);clampPlayer(p)}
  function shoot(){if(gameState!=='playing'||shotCooldown>0)return;const p=home[controlled];if(distance(p,ball)<46||ball.owner===p){let dx=secondHalf?-1:1,dy=(300-ball.y)*.002;const len=Math.hypot(dx,dy)||1;ball.owner=null;ball.vx=dx/len*500;ball.vy=dy/len*500;ball.lastTouch='home';ball.spin=0;shotCooldown=.34;beep(210,.12)}}
  function passBall(){if(gameState!=='playing'||passCooldown>0)return;const p=home[controlled];if(distance(p,ball)<50||ball.owner===p){const mates=home.filter(a=>a!==p);const target=mates.reduce((best,a)=>distance(a,ball)<distance(best,ball)?a:best,mates[0]);const dx=target.x-ball.x,dy=target.y-ball.y,len=Math.hypot(dx,dy)||1;ball.owner=null;ball.vx=dx/len*360;ball.vy=dy/len*360;ball.lastTouch='home';passCooldown=.4;beep(360,.07)}}
  function inputUpdate(dt){const p=home[controlled];let x=(keys.has('d')||keys.has('arrowright')||touch.has('right')?1:0)-(keys.has('a')||keys.has('arrowleft')||touch.has('left')?1:0),y=(keys.has('s')||keys.has('arrowdown')||touch.has('down')?1:0)-(keys.has('w')||keys.has('arrowup')||touch.has('up')?1:0);if(tapTarget){x=tapTarget.x-p.x;y=tapTarget.y-p.y;const d=Math.hypot(x,y);if(d<20)tapTarget=null;else{x/=d;y/=d}}const n=Math.hypot(x,y)||1;const sprint=keys.has('shift')||touch.has('sprint');const speed=p.speed*(sprint?1.38:1);p.vx=x/n*speed;p.vy=y/n*speed;if(!x&&!y){p.vx*=.68;p.vy*=.68}if(Math.abs(x)>.05)p.dir=x>0?1:-1;if(keys.has(' ')||touch.has('shoot'))shoot();if(keys.has('e')||touch.has('pass'))passBall();updatePlayer(p,dt)}
  function updateAI(team,side,dt){
    const attacking=side==='home', sign=attacking?(secondHalf?-1:1):(secondHalf?1:-1);const chase=nearestPlayer(team);
    for(const p of team){if(side==='home'&&p===home[controlled])continue;let tx=p.homeX,ty=p.homeY;const d=distance(p,ball);
      if(p===chase){tx=ball.x+(attacking?-17:17);ty=ball.y;}
      else if(ball.x>180&&ball.x<820&&Math.abs(ball.y-p.homeY)<145){tx=p.homeX+(ball.x-500)*.23;ty=p.homeY+(ball.y-300)*.18}
      if(ball.owner===p){tx=attacking?(secondHalf?pitch.x+15:pitch.x+pitch.w-15):(secondHalf?pitch.x+pitch.w-15:pitch.x+15);ty=300+(p.y-300)*.18;if(d<35&&Math.random()<dt*.22){ball.owner=null;ball.vx=sign*340;ball.vy=(300-ball.y)*.45;ball.lastTouch=side}}
      const speed=p.speed*(p===chase?1.12:1);moveToward(p,tx,ty,speed,dt);clampPlayer(p);
    }
  }
  function updateBall(dt){
    let nearest=null,dist=1000;for(const p of [...home,...away]){const d=distance(p,ball);if(d<dist){dist=d;nearest=p}}
    if(ball.owner){const p=ball.owner;ball.x=p.x+p.dir*17;ball.y=p.y+2;ball.vx=p.vx*.6;ball.vy=p.vy*.6}
    else{
      if(dist<17&&nearest){ball.owner=nearest;ball.lastTouch=nearest.side;ball.x=nearest.x+nearest.dir*15;ball.y=nearest.y;ball.vx=nearest.vx*.5;ball.vy=nearest.vy*.5}
      else{ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.vx*=Math.pow(.68,dt);ball.vy*=Math.pow(.68,dt)}
    }
    ball.spin+=dt*9;
    if(ball.y<pitch.y+ball.r){ball.y=pitch.y+ball.r;ball.vy=Math.abs(ball.vy)*.72;ball.owner=null}
    if(ball.y>pitch.y+pitch.h-ball.r){ball.y=pitch.y+pitch.h-ball.r;ball.vy=-Math.abs(ball.vy)*.72;ball.owner=null}
    const goal=ball.y>pitch.goalTop&&ball.y<pitch.goalBottom;
    if(ball.x<pitch.x+ball.r){if(goal){scoreGoal('left')}else{ball.x=pitch.x+ball.r;ball.vx=Math.abs(ball.vx)*.74;ball.owner=null}}
    if(ball.x>pitch.x+pitch.w-ball.r){if(goal){scoreGoal('right')}else{ball.x=pitch.x+pitch.w-ball.r;ball.vx=-Math.abs(ball.vx)*.74;ball.owner=null}}
  }
  function scoreGoal(goalSide){if(kickoff>0)return;const homeScored=goalSide===(secondHalf?'left':'right');if(homeScored){homeGoals++;ui.homeScore.textContent=homeGoals;ui.goalTeam.textContent=homeClub.name+' · GOLAZO'}else{awayGoals++;ui.awayScore.textContent=awayGoals;ui.goalTeam.textContent='RIVER PLATE · GOL';}ui.goal.classList.remove('hidden');beep(720,.28);setTimeout(()=>ui.goal.classList.add('hidden'),1500);resetBall();kickoff=2.3}
  function update(dt){if(gameState!=='playing')return;matchTime+=dt;const minute=Math.min(90,Math.floor(matchTime));ui.clock.textContent=`${String(minute).padStart(2,'0')}:00`;ui.period.textContent=minute>=45?'2T':'1T';if(matchTime>=90){matchTime=90;gameState='finished';ui.end.classList.remove('hidden');ui.finalTitle.textContent=homeGoals===awayGoals?'¡QUÉ PARTIDO!':homeGoals>awayGoals?'¡GANASTE, CRACK!':'FINAL DEL PARTIDO';ui.finalText.textContent=`${homeClub.name} ${homeGoals} — ${awayGoals} RIVER PLATE`;ui.hint.innerHTML='FINAL DEL PARTIDO';beep(180,.4);return}if(!secondHalf&&matchTime>=45){secondHalf=true;for(const p of [...home,...away]){p.x=W-p.x;p.homeX=W-p.homeX;p.dir*=-1;p.vx=p.vy=0}ball.x=500;ball.y=300;ball.vx=ball.vy=0;ball.owner=null;kickoff=2}if(kickoff>0){kickoff=Math.max(0,kickoff-dt);return}shotCooldown=Math.max(0,shotCooldown-dt);passCooldown=Math.max(0,passCooldown-dt);inputUpdate(dt);updateAI(home,'home',dt);updateAI(away,'away',dt);updateBall(dt)}

  function roundedRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);c.fill()}
  function drawStadium(){
    ctx.fillStyle='#12291c';ctx.fillRect(0,0,W,H);
    for(let i=0;i<42;i++){const x=i*25+8;ctx.fillStyle=i%2?'#253c2c':'#33452f';ctx.fillRect(x,8,18,26);ctx.fillRect(x,566,18,26);ctx.fillStyle='#f0da8a';ctx.fillRect(x+5,16,2,2);ctx.fillRect(x+11,21,2,2)}
    for(let i=0;i<22;i++){let y=37+i*24;ctx.fillStyle=i%2?'#1a3022':'#243b29';ctx.fillRect(12,y,32,20);ctx.fillRect(956,y,32,20);for(let n=0;n<3;n++){ctx.fillStyle=['#d55245','#e1d8b8','#6688b3','#e8c953'][((i+n*3)%4)];ctx.beginPath();ctx.arc(20+n*8,y+7+(i%3)*2,2.1,0,Math.PI*2);ctx.fill()}}
    ctx.fillStyle='#527b40';ctx.fillRect(pitch.x,pitch.y,pitch.w,pitch.h);
    const stripeW=pitch.w/10;for(let i=0;i<10;i++){ctx.fillStyle=i%2?'#578346':'#628e4d';ctx.fillRect(pitch.x+i*stripeW,pitch.y,stripeW,pitch.h)}
    ctx.fillStyle='#f3eee1';ctx.fillRect(pitch.x-14,pitch.goalTop,14,pitch.goalBottom-pitch.goalTop);ctx.fillRect(pitch.x+pitch.w,pitch.goalTop,14,pitch.goalBottom-pitch.goalTop);
    ctx.strokeStyle='#e7edda';ctx.lineWidth=2;ctx.strokeRect(pitch.x,pitch.y,pitch.w,pitch.h);ctx.beginPath();ctx.moveTo(500,pitch.y);ctx.lineTo(500,pitch.y+pitch.h);ctx.stroke();ctx.beginPath();ctx.arc(500,300,76,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#e7edda';ctx.beginPath();ctx.arc(500,300,3,0,Math.PI*2);ctx.fill();
    ctx.strokeRect(pitch.x,pitch.y+112,130,280);ctx.strokeRect(pitch.x+pitch.w-130,pitch.y+112,130,280);ctx.strokeRect(pitch.x,pitch.y+174,55,156);ctx.strokeRect(pitch.x+pitch.w-55,pitch.y+174,55,156);ctx.beginPath();ctx.arc(pitch.x+109,300,2.5,0,Math.PI*2);ctx.arc(pitch.x+pitch.w-109,300,2.5,0,Math.PI*2);ctx.fill();
    ctx.strokeRect(pitch.x-22,pitch.goalTop,22,pitch.goalBottom-pitch.goalTop);ctx.strokeRect(pitch.x+pitch.w,pitch.goalTop,22,pitch.goalBottom-pitch.goalTop);ctx.lineWidth=1;ctx.strokeStyle='#ffffff33';for(let y=pitch.goalTop+8;y<pitch.goalBottom;y+=13){ctx.beginPath();ctx.moveTo(pitch.x-20,y);ctx.lineTo(pitch.x,y);ctx.moveTo(pitch.x+pitch.w,y);ctx.lineTo(pitch.x+pitch.w+20,y);ctx.stroke()}
  }
  function drawPlayer(p){
    ctx.save();ctx.translate(p.x,p.y);ctx.fillStyle='#13221955';ctx.beginPath();ctx.ellipse(1,8,13,6,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.kit.shorts;roundedRect(ctx,-8,2,7,9,2);roundedRect(ctx,1,2,7,9,2);
    ctx.fillStyle=p.kit.shirt;ctx.beginPath();ctx.arc(0,-3,10,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=p.kit.trim;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(-1,-11);ctx.lineTo(-1,5);ctx.stroke();ctx.fillStyle='#f2d5b5';ctx.beginPath();ctx.arc(0,-14,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#2c241d';ctx.beginPath();ctx.arc(0,-16,6,Math.PI,Math.PI*2);ctx.fill();
    if(p===home[controlled]&&gameState==='playing'){ctx.strokeStyle='#e5ff83';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-2,15,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#e5ff83';ctx.beginPath();ctx.moveTo(0,-26);ctx.lineTo(-4,-32);ctx.lineTo(4,-32);ctx.fill()}
    if(p===ball.owner){ctx.strokeStyle='#ffffff99';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,-3,17,0,Math.PI*2);ctx.stroke()}
    ctx.restore();
  }
  function drawBall(){ctx.save();ctx.translate(ball.x,ball.y);ctx.fillStyle='#10191066';ctx.beginPath();ctx.ellipse(2,5,8,4,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fbf8e9';ctx.beginPath();ctx.arc(0,0,ball.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#263128';for(let i=0;i<5;i++){const a=ball.spin+i*Math.PI*2/5;ctx.beginPath();ctx.arc(Math.cos(a)*4,Math.sin(a)*4,2,0,Math.PI*2);ctx.fill()}ctx.restore()}
  function render(){ctx.clearRect(0,0,W,H);drawStadium();[...home,...away].sort((a,b)=>a.y-b.y).forEach(drawPlayer);drawBall();if(kickoff>0&&gameState==='playing'){ctx.fillStyle='#e8f3d9';ctx.font='700 18px DM Mono,monospace';ctx.textAlign='center';ctx.fillText('¡A JUGAR!',500,270)}}
  function frame(t){const dt=Math.min(.04,(t-last)/1000||0);last=t;update(dt);render();requestAnimationFrame(frame)}requestAnimationFrame(frame);
})();
