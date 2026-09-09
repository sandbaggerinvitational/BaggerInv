import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {scrambleView} from './fixtures/match-center-handicaps.mjs';
import {bestBallView} from './fixtures/best-ball-decimal-handicaps.mjs';
import {tournamentLiveDataFromSupabaseView} from '../lib/tournament-live-supabase.js';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('real Match Center cards preserve one-decimal semantics and layout at all five widths',{timeout:120000},async t=>{
  const directory=await mkdtemp('/tmp/bagger-match-handicap-browser-');
  if(process.env.BAGGER_KEEP_BROWSER_ARTIFACTS)t.diagnostic(`Browser artifacts: ${directory}`);
  else t.after(()=>rm(directory,{recursive:true,force:true}));
  const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
  await new Promise((resolve,reject)=>webpack.webpack({mode:'development',context:root,
    entry:'./test/fixtures/match-center-handicap-browser.js',output:{path:directory,filename:'bundle.js'},
    plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],
    module:{rules:[{test:/\.m?js$/,resolve:{fullySpecified:false}},
      {test:/\.(js|css)$/,exclude:/node_modules/,use:[path.join(root,'test/fixtures/round-workspace-loader.cjs')]}]},
    devtool:false},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
  const view=scrambleView();
  for(const entry of view.matches)entry.participants.forEach((p,i)=>{p.display_name=['Brenan Cavanaugh','Michael Hunnicutt','Taylor Lippincott','Chase Patterson'][i];});
  const current=tournamentLiveDataFromSupabaseView(view,{matchCenterHandicapPresentation:true});
  const previous=tournamentLiveDataFromSupabaseView(view);
  for(const data of [current,previous]) {
    const bb=structuredClone(data.rounds[0].matches[0]);bb.id='certification-BB';bb.format='BB';bb.formatName='Best Ball';
    bb.team1Players[0].playingHcp=7;bb.team1Players[0].stroke=3;bb.team1Players[1].playingHcp=-.8;
    bb.team2Players[0].playingHcp=0;bb.team2Players[1].playingHcp=7.8;
    const si=structuredClone(bb);si.id='certification-SI';si.format='SI';si.formatName='Singles';si.team1Players=si.team1Players.slice(0,1);si.team2Players=si.team2Players.slice(0,1);
    data.rounds[0].matches.push(bb,si);
  }
  const bbView=bestBallView();
  current.rounds.push(...tournamentLiveDataFromSupabaseView(bbView,{matchCenterHandicapPresentation:true}).rounds);
  previous.rounds.push(...tournamentLiveDataFromSupabaseView(bbView).rounds);
  const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px Arial}*{box-sizing:border-box}#root{max-width:1400px;margin:auto;padding:12px}#previous{margin-top:40px}</style><div id="root"></div><script>window.__fixture='+JSON.stringify({current,previous}).replaceAll('<','\\u003c')+'</script><script src="/bundle.js"></script>';
  const server=createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?await readFile(path.join(directory,'bundle.js')):html);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
  const {chromium}=await import(process.env.BAGGER_PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);t.diagnostic(e.message);});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#current .teamHandicap').first().waitFor();
  assert.equal(await page.locator('#current .teamHandicap').count(),12);
  assert.deepEqual(await page.locator('#current .teamHandicap b').allTextContents(),['6.0','3.0','2.0','4.0','3.0','3.0','3.0','2.0','1.0','3.0','6.0','6.0']);
  const bb=page.locator('#current #match-certification-BB');
  for(const text of ['HCP 7.0','HCP (0.8)','HCP 0.0','HCP 7.8'])assert.equal(await bb.getByText(text,{exact:true}).count(),1);
  assert.equal(await bb.getByText('3 strokes received',{exact:false}).count(),1);
  assert.equal(await page.locator('#current').getByText('0 strokes received',{exact:false}).count(),0);
  const clay=page.locator('#current #match-2026-R1-4');
  assert.equal(await clay.getByText('HCP 14.6',{exact:true}).count(),1);
  assert.equal(await clay.getByText('HCP 15.0',{exact:true}).count(),0);
  assert.equal(await clay.getByText('14 strokes received',{exact:false}).count(),1);
  assert.equal(await page.locator('#previous #match-2026-R1-4').getByText('HCP 15.0',{exact:true}).count(),1);
  for(const width of [390,430,820,1280,1440]) {
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`document overflow ${width}`);
    const layouts=await page.evaluate(()=>{
      const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height};};
      return [...document.querySelectorAll('#current .matchCard')].map((card,i)=>({current:rect(card),previous:rect(document.querySelectorAll('#previous .matchCard')[i]),
        labels:[...card.querySelectorAll('.teamHandicap,.strokeBadge,.playerHandicapSlot')].filter(n=>n.getClientRects().length).map(rect)}));
    });
    for(const layout of layouts){
      assert.ok(Math.abs(layout.current.height-layout.previous.height)<1,`card height unchanged ${width}`);
      assert.ok(layout.labels.every(r=>r.x>=layout.current.x&&r.right<=layout.current.right&&r.bottom<=layout.current.bottom),`contained labels ${width}`);
    }
    await page.locator('#current').screenshot({path:path.join(directory,`match-handicaps-${width}.png`)});
    await clay.screenshot({path:path.join(directory,`best-ball-decimal-${width}.png`)});
  }
  assert.deepEqual(errors,[]);
});
