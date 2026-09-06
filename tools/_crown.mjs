import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import WebSocket from 'ws';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT='/private/tmp/claude-501/-Users-omridrabski-claude-work-games-rps-politika/8b2cd9cd-6462-4fd6-91a2-6e0caaed2256/scratchpad';
const chrome=spawn(CHROME,['--headless=new','--remote-debugging-port=9298','--disable-gpu','--hide-scrollbars','--no-first-run','--user-data-dir=/tmp/rps-cr','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=1;const pend=new Map();
const send=(m,p={})=>{const i=id++;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise((res,rej)=>pend.set(i,{res,rej}));};
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description);return r.result.value;};
const waitFor=async(e,t=25000)=>{const d=Date.now()+t;while(Date.now()<d){if(await ev(`!!(${e})`))return true;await sleep(80);}return false;};
let u;for(let i=0;i<50&&!u;i++){await sleep(200);try{const t=await(await fetch('http://127.0.0.1:9298/json/list')).json();u=t.find(x=>x.type==='page')?.webSocketDebuggerUrl;}catch{}}
ws=new WebSocket(u);ws.on('message',r=>{const m=JSON.parse(r);if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}});
await new Promise(r=>ws.on('open',r));
await send('Page.enable');await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument',{source:`try{localStorage.clear();sessionStorage.clear()}catch{};window.confirm=function(){return true};`});
await send('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:3,mobile:true});
await send('Page.navigate',{url:'http://localhost:5199/'});
await waitFor(`document.querySelector('.splash-play')`,30000);
await ev(`document.querySelector('.splash-play').click()`);
await waitFor(`!document.querySelector('.splash-screen')`);
await ev(`[...document.querySelectorAll('button')].find(e=>/משחק מול בוט/.test(e.textContent)).click()`);await sleep(800);
await ev(`[...document.querySelectorAll('button')].find(e=>/קואליציה|אופוזיציה/.test(e.textContent)).click()`);
await waitFor(`document.querySelector('.setup-onboard-banner')`,25000);
for(let i=0;i<2;i++){await ev(`(()=>{const t=[...document.querySelectorAll('.board-tile-legal')];if(t.length)t[0].click();})()`);await sleep(700);}
await ev(`[...document.querySelectorAll('.setup-btn-onboard')].find(e=>/להתחיל/.test(e.textContent)).click()`);
console.log('board:', await waitFor(`document.querySelector('.board-wrap')`,30000));
const deadline=Date.now()+540000;
let caught=false;
while(Date.now()<deadline){
  if (await ev(`!!document.querySelector('.board-piece-anim-captured-king')`)) {
    const info = await ev(`(()=>{const w=document.querySelector('.board-piece-anim-captured-king');
      const crown=w.querySelector('.piece-crown'); const mask=w.querySelector('.piece-mask');
      const cs=crown?getComputedStyle(crown):null;
      return {crownPresent:!!crown, crownSrc:(crown&&crown.currentSrc||'').split('/assets/pieces/')[1],
        faceShown:(mask&&mask.currentSrc||'').split('/').pop(), crownTransform:cs?cs.transform:null,
        traps:[...document.querySelectorAll('.board-wrap img')].filter(i=>(i.currentSrc||'').includes('trap_back')).length};})()`);
    console.log('CAPTURE BEAT:', JSON.stringify(info));
    const shot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(OUT+'/crown-capture.png',Buffer.from(shot.data,'base64'));
    caught=true; break;
  }
  if (await ev(`!!document.querySelector('.gameover-screen')`)) { console.log('game over — beat missed'); break; }
  await ev(`(()=>{const cells=[...document.querySelectorAll('.board-cell')]
     .filter(c=>c.querySelector('.piece-view.piece-mine') && !c.querySelector('.board-tile').disabled);
     const c=cells[Math.floor(Math.random()*cells.length)]; if(c) c.querySelector('.board-tile').click();})()`);
  await sleep(120);
  await ev(`(()=>{const t=document.querySelectorAll('.board-tile-legal'); if(t.length) t[Math.floor(Math.random()*t.length)].click();})()`);
  await sleep(280);
}
if(!caught) console.log('no capture within the window');
ws.close();chrome.kill();
