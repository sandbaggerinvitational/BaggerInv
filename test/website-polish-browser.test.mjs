import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bestBallView} from './fixtures/best-ball-decimal-handicaps.mjs';
import {tournamentLiveDataFromSupabaseView} from '../lib/tournament-live-supabase.js';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('real roster images and friendly match headers at five widths; stable image-load layout and fallback',{timeout:120000},async t=>{
 const directory=await mkdtemp('/tmp/bagger-website-polish-');
 if(process.env.BAGGER_KEEP_BROWSER_ARTIFACTS)t.diagnostic(`Browser artifacts: ${directory}`);else t.after(()=>rm(directory,{recursive:true,force:true}));
 const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
 await new Promise((resolve,reject)=>webpack.webpack({mode:'development',context:root,entry:'./test/fixtures/website-polish-browser.js',output:{path:directory,filename:'bundle.js'},
  plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],
  module:{rules:[{test:/\.m?js$/,resolve:{fullySpecified:false}},{test:/\.(js|css)$/,exclude:/node_modules/,use:[path.join(root,'test/fixtures/website-polish-loader.cjs')]}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||new Error(s.toString({all:false,errors:true}))):resolve()));
 const data=tournamentLiveDataFromSupabaseView(bestBallView(),{matchCenterHandicapPresentation:true});
 const times=['07:40:00','00:00:00','14:00:00','2:00 PM','12:00:00','09:05:00'];
 const labels=['7:40 AM','12:00 AM','2:00 PM','2:00 PM','12:00 PM','9:05 AM'];
 data.rounds[0].matches.forEach((m,i)=>{m.teeTime=times[i];m.format=i<2?'BB':i<4?'SC':'SI';if(i===5){m.team1Players=[];m.team2Players=[];}});
 const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*{box-sizing:border-box}article{margin:20px 16px}#fallback,#missing{display:inline-block}</style><div id="root"></div><script>window.__fixture='+JSON.stringify(data).replaceAll('<','\\u003c')+'</script><script src="/bundle.js"></script>';
 const server=createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(await readFile(path.join(directory,'bundle.js')));}
  if(req.url.startsWith('/images/')){if(!['/images/teams/logos/brysons-logo.webp','/images/teams/logos/philscb-logo.webp'].includes(req.url)){res.statusCode=404;return res.end();}res.setHeader('Content-Type','image/webp');return res.end(await readFile(path.join(root,'public',req.url)));}
  res.setHeader('Content-Type','text/html');res.end(html);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const {chromium}=await import(process.env.BAGGER_PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 for(const width of [390,430,820,1280,1440]){
  const page=await browser.newPage({viewport:{width,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let releaseImages;const imageGate=new Promise(r=>releaseImages=r);
  await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='127.0.0.1')return route.abort();if(/(brysons|philscb)-logo/.test(u.pathname))await imageGate;return route.continue();});
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'domcontentloaded'});await page.locator('#team-0').waitFor();
  const rects=()=>page.locator('[id^="team-"]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}}));
  const before=await rects();releaseImages();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[id^="team-"] img')).length===2&&Array.from(document.querySelectorAll('[id^="team-"] img')).every(i=>i.complete&&i.naturalWidth>0));
  assert.deepEqual(await rects(),before,`no image-load shift ${width}`);
  for(let i=0;i<2;i++){const image=page.locator('#team-'+i+' img');assert.equal(await image.count(),1);assert.equal(await image.evaluate(e=>getComputedStyle(e).objectFit),'contain');}
  assert.equal(await page.locator('#fallback').getByRole('img',{name:'Unknown Team logo image unavailable'}).innerText(),'UT');
  assert.equal(await page.locator('#missing').getByRole('img',{name:'Pending Team logo image unavailable'}).innerText(),'PT');
  for(let i=0;i<6;i++){const card=page.locator('#match-2026-R1-'+(i+1));assert.equal(await card.locator('[class$="_matchTop"] span').last().innerText(),labels[i]);assert.match(await card.getAttribute('aria-label'),new RegExp(labels[i]));assert.doesNotMatch(await card.innerText(),/\b\d{2}:\d{2}:\d{2}\b/);}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`document overflow ${width}`);
  const clipped=await page.locator('[id^="team-"]').evaluateAll(es=>es.flatMap(e=>{const card=e.getBoundingClientRect();return Array.from(e.querySelectorAll('h3,p,strong,em,img')).filter(c=>{const range=document.createRange();range.selectNodeContents(c);const text=c.tagName==='IMG'?c.getBoundingClientRect():range.getBoundingClientRect();return text.width>0&&(text.left<card.left||text.right>card.right||text.top<card.top||text.bottom>card.bottom);}).map(c=>c.textContent||c.alt)}));
  assert.deepEqual(clipped,[],`team text containment ${width}`);
  await page.locator('#team-0').screenshot({path:path.join(directory,`brysons-${width}.png`)});await page.locator('#team-1').screenshot({path:path.join(directory,`phils-${width}.png`)});await page.locator('#match-2026-R1-1').screenshot({path:path.join(directory,`time-${width}.png`)});
  assert.deepEqual(errors,[]);await page.close();
 }
});
