import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('actual Director UI: confirmations, receipts, 13 visual states, timeout recovery and narrow layout',{timeout:120000},async t=>{
 const directory=await mkdtemp('/tmp/bagger-round-ui-');t.after(()=>rm(directory,{recursive:true,force:true}));const output=process.env.BAGGER_ROUND_SCREENSHOTS||directory;await mkdir(output,{recursive:true});
 const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
 await new Promise((resolve,reject)=>webpack.webpack({mode:'development',context:root,entry:'./test/fixtures/round-scoring-browser.js',output:{path:directory,filename:'bundle.js'},module:{rules:[{test:/\.(js|css)$/,exclude:/node_modules/,use:[path.join(root,'test/fixtures/round-scoring-browser-loader.cjs')]}]},devtool:false},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
 const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font:15px system-ui;background:#f2f3ed;color:#183b30}#root{max-width:1100px;margin:auto;padding:24px}</style><div id="root"></div><script src="/bundle.js"></script>';
 const server=createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?await readFile(path.join(directory,'bundle.js')):html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const {chromium}=await import(process.env.BAGGER_PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({headless:true,...(process.env.BAGGER_CHROME_PATH?{executablePath:process.env.BAGGER_CHROME_PATH}:{})});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1280,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(`http://127.0.0.1:${server.address().port}`);
 const card=()=>page.getByRole('region',{name:/Round \d scoring controls/});
 const shot=async(name,dialog=false)=>{await (dialog?page.getByRole('dialog'):card()).screenshot({path:path.join(output,name+'.png')});};
 const click=async(name)=>{await page.getByRole('button',{name,exact:true}).click();};
 await page.getByRole('button',{name:'Open Round for Scoring',exact:true}).waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Open Round for Scoring')?.disabled);
 await shot('01-r1-ready');assert.equal(await page.getByRole('button',{name:'Mark Live',exact:true}).count(),6);
 await click('Open Round for Scoring');await shot('02-open-confirmation',true);assert.equal(await page.getByRole('dialog').getByText('6 matches will open together.',{exact:true}).count(),1);await click('Cancel');assert.equal(await page.evaluate(()=>window.__roundRequests.length),0);
 await click('Open Round for Scoring');await click('Open Round 1');await page.getByText('Round 1 open for scoring. 6 matches confirmed. 0 failures.',{exact:true}).waitFor();await shot('03-open-success');await shot('04-live-lock-available');
 assert.equal(await page.evaluate(()=>window.__roundRequests.length),1,'one round HTTP request, never six browser calls');
 await click('Lock Round Scoring');await shot('05-lock-confirmation',true);await click('Lock Round 1');await page.getByText('Round 1 scoring locked. 6 matches confirmed. 0 failures.',{exact:true}).waitFor();await shot('06-locked');
 await click('Resume Round Scoring');await shot('07-resume-confirmation',true);await click('Resume Round 1');await page.getByText('Round 1 scoring resumed. 6 matches confirmed. 0 failures.',{exact:true}).waitFor();await shot('08-resumed');
 await click('Fixture: mixed');await page.getByText(/Mixed state: Lock targets 4/).waitFor();assert.equal(await page.getByRole('button',{name:'Open Round for Scoring',exact:true}).isDisabled(),true);await shot('09-mixed');
 await click('Fixture: failed');await page.getByText('Why this round cannot open').click();await page.getByText('2026-R1-4',{exact:true}).first().waitFor();await shot('10-open-blocked');assert.equal(await page.getByRole('button',{name:'Open Round for Scoring',exact:true}).isDisabled(),true);
 await click('Fixture: r3');await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Open Round for Scoring')?.disabled);await shot('11-r3-ready');await click('Open Round for Scoring');await shot('12-r3-confirmation',true);await page.getByText('12 matches will open together.',{exact:true}).waitFor();await click('Cancel');
 await click('Fixture: pristine');await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Open Round for Scoring')?.disabled);
 for(const width of [390,430,820,1280]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no overflow ${width}`);const heights=await card().locator('button').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height));assert.ok(heights.every(h=>h>=44));if(width===390)await shot('13-mobile-round-controls');await click('Open Round for Scoring');await page.getByRole('dialog').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width===390)await shot('14-mobile-confirmation',true);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});}
 // Exact local postcommit result is found from the persisted id, without another POST.
 await page.evaluate(()=>window.__dropNext=true);await click('Open Round for Scoring');await click('Open Round 1');await page.getByText(/saved operation completed; no repeat is needed/).waitFor();assert.equal(await page.evaluate(()=>window.__roundRequests.length),1);assert.equal(await page.getByRole('button',{name:'Retry Same Operation',exact:true}).count(),0);
 // Stale response cannot present success or re-use a changed target set silently.
 await click('Fixture: pristine');await click('Open Round for Scoring');await page.evaluate(()=>window.__denyNext=true);await click('Open Round 1');await page.getByText(/Round action denied: ROUND_STATE_CHANGED/).waitFor();assert.equal(await page.evaluate(()=>window.__roundRequests.length),1);
 assert.deepEqual(errors,[]);
});
