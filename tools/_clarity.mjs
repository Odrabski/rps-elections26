import { spawn } from 'node:child_process';
import WebSocket from 'ws';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome=spawn(CHROME,['--headless=new','--remote-debugging-port=9309','--disable-gpu','--hide-scrollbars','--no-first-run','--user-data-dir=/tmp/rps-cl','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ws,id=1;const pend=new Map();const net=[];
const send=(m,p={})=>{const i=id++;ws.send(JSON.stringify({id:i,method:m,params:p}));return new Promise((res,rej)=>pend.set(i,{res,rej}));};
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description);return r.result.value;};
const waitFor=async(e,t=30000)=>{const d=Date.now()+t;while(Date.now()<d){if(await ev(`!!(${e})`))return true;await sleep(80);}return false;};
let u;for(let i=0;i<50&&!u;i++){await sleep(200);try{const t=await(await fetch('http://127.0.0.1:9309/json/list')).json();u=t.find(x=>x.type==='page')?.webSocketDebuggerUrl;}catch{}}
ws=new WebSocket(u);ws.on('message',r=>{const m=JSON.parse(r);
  if(m.method==='Network.requestWillBeSent'){const url=m.params.request.url; if(/clarity/i.test(url)) net.push(['REQ',url.slice(0,90)]);}
  if(m.method==='Network.responseReceived'){const {url,status}=m.params.response; if(/clarity/i.test(url)) net.push(['RES '+status,url.slice(0,90)]);}
  if(m.id&&pend.has(m.id)){const{res,rej}=pend.get(m.id);pend.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}});
await new Promise(r=>ws.on('open',r));
await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:3,mobile:true});
await send('Page.navigate',{url:'https://rps-politika.fly.dev/'});
await waitFor(`document.querySelector('.splash-play')`,40000);
await ev(`document.querySelector('.splash-play').click()`);
await waitFor(`!document.querySelector('.splash-screen')`);
await sleep(4000);
console.log('window.clarity present:', await ev(`typeof window.clarity`));
// Drive one real event: pick a team, which fires team_picked + a tag.
await ev(`[...document.querySelectorAll('button')].find(e=>/משחק מול בוט/.test(e.textContent)).click()`);await sleep(900);
await ev(`[...document.querySelectorAll('button')].find(e=>/קואליציה|אופוזיציה/.test(e.textContent)).click()`);
await sleep(4000);
console.log('clarity network activity:');
for (const [k,v] of net.slice(0,10)) console.log('  ', k, v);
console.log('total clarity requests:', net.filter(n=>n[0]==='REQ').length);
ws.close();chrome.kill();
