import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {scrambleView} from './fixtures/match-center-handicaps.mjs';
import {tournamentLiveDataFromSupabaseView} from '../lib/tournament-live-supabase.js';
import {publicMobileFixture,syntheticMobileFixture} from './fixtures/participant-mobile-data.mjs';
const require=createRequire(import.meta.url),root=process.cwd();
test('prelaunch SSR hydration, six Scrambles, optional portraits and Guide at five widths',{timeout:180000},async t=>{
 const dir=await mkdtemp('/tmp/bagger-prelaunch-browser-');
 if(process.env.BAGGER_KEEP_BROWSER_ARTIFACTS)t.diagnostic('Browser artifacts: '+dir);else t.after(()=>rm(dir,{recursive:true,force:true}));
 const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
 for(const target of ['node','web'])await new Promise((resolve,reject)=>webpack.webpack({mode:'development',target,context:root,
  entry:target==='node'?'./test/fixtures/prelaunch-server.js':'./test/fixtures/prelaunch-client.js',
  output:{path:dir,filename:target==='node'?'server.cjs':'client.js',...(target==='node'?{library:{type:'commonjs2'}}:{})},
  plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],
  module:{rules:[{test:/\.m?js$/,resolve:{fullySpecified:false}},{test:/\.(js|css)$/,exclude:/node_modules/,use:[path.join(root,'test/fixtures/prelaunch-loader.cjs')]}]},devtool:false},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const history=JSON.parse(await readFile(path.join(root,'lib/historical-data.json'),'utf8'));
 const names=new Map(history.players.map(p=>[p['Player ID'],p]));
 const view=scrambleView();[view.matches[0].participants,view.matches[3].participants]=[view.matches[3].participants,view.matches[0].participants];
 view.matches[0].holes=[];view.matches[3].holes=[];
 view.matches.forEach(e=>e.participants.forEach(p=>p.display_name=names.get(p.player_id)['Display Name']));
 const before=JSON.stringify(view);
 const fixture={...(process.env.BAGGER_PUBLIC_FIXTURE_PREFIX?await publicMobileFixture(process.env.BAGGER_PUBLIC_FIXTURE_PREFIX):syntheticMobileFixture),
  matches:tournamentLiveDataFromSupabaseView(view,{matchCenterHandicapPresentation:true}),
  players:['HM01','CM01','JK02','PN01','BJ01','CO02','CF01','JS02','JG01','KW01','MO01','PC01','SL01','TG01','WD01'].map(id=>({id,name:names.get(id)['Display Name'],file:names.get(id)['Photo Filename']}))};
 assert.equal(JSON.stringify(view),before);
 const beforeFixture=JSON.stringify(fixture);
 const markup=require(path.join(dir,'server.cjs')).render(fixture);
 assert.equal(JSON.stringify(fixture),beforeFixture);
 const missing=[],writes=[];
 const server=createServer(async(req,res)=>{try{
  if(req.method!=='GET'){writes.push(req.url);res.writeHead(405);return res.end();}
  if(req.url==='/client.js'){res.setHeader('Content-Type','text/javascript');return res.end(await readFile(path.join(dir,'client.js')));}
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname.startsWith('/images/')){const file=path.resolve(root,'public','.'+pathname);if(!file.startsWith(path.join(root,'public')+path.sep))throw Error('path');res.setHeader('Content-Type',file.endsWith('.webp')?'image/webp':'image/png');return res.end(await readFile(file));}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root">'+markup+'</div><script>window.__fixture='+beforeFixture.replaceAll('<','\\u003c')+'</script><script src="/client.js"></script>');
 }catch{missing.push(req.url);res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const {chromium}=await import(process.env.BAGGER_PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
 for(const width of [390,430,820,1280,1440]){
  const page=await browser.newPage({viewport:{width,height:1000},timezoneId:'America/Chicago'});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>document.querySelector('#portrait-HM01 img')?.naturalWidth>0);
  assert.deepEqual(errors,[],'initial hydration/runtime errors '+width);
  for(const p of fixture.players.slice(0,4))await page.waitForFunction(id=>document.querySelector('#portrait-'+id+' img')?.naturalWidth>0,p.id);
  for(const p of fixture.players.slice(4)){assert.equal(await page.locator('#portrait-'+p.id+' img').count(),0);assert.equal(await page.locator('#portrait-'+p.id+' [role="img"]').count(),1);}
  const expected=[[3,2,1,0],[2,4,0,2],[3,3,0,0],[6,3,3,0],[1,3,0,2],[6,6,0,0]];
  for(let i=0;i<6;i++){const card=page.locator('#match-2026-R2-'+(i+1));assert.deepEqual(await card.locator('[class$="_teamHandicap"] b').allTextContents(),expected[i].slice(0,2).map(x=>x.toFixed(1)));assert.equal(await card.getByText('0 strokes received',{exact:false}).count(),0);for(const n of expected[i].slice(2).filter(Boolean))assert.ok(await card.getByText(n+' stroke',{exact:false}).count());}
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)){
    t.diagnostic(JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right})))));
    await page.screenshot({path:path.join(dir,'overflow-'+width+'.png')});
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+width);
  for(const id of ['match-2026-R2-1','match-2026-R2-2','match-2026-R2-4','portraits','odds','guide'])await page.locator('#'+id).screenshot({path:path.join(dir,id+'-'+width+'.png')});
  assert.deepEqual(errors,[],'hydration/runtime errors '+width);await page.close();
 }
 assert.deepEqual(missing,[],'no asset 404 requests');assert.deepEqual(writes,[],'no mutation transports');
});
