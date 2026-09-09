import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('real Director client preserves drafts across saves/tabs and is responsive at all five widths',{timeout:120000},async t=>{
  const directory=await mkdtemp('/tmp/bagger-round-browser-');
  if(process.env.BAGGER_KEEP_BROWSER_ARTIFACTS) t.diagnostic(`Browser artifacts: ${directory}`);
  else t.after(()=>rm(directory,{recursive:true,force:true}));
  const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
  await new Promise((resolve,reject)=>webpack.webpack({mode:'development',context:root,entry:'./test/fixtures/round-workspace-browser.js',output:{path:directory,filename:'bundle.js'},module:{rules:[{test:/\.(js|css)$/,exclude:/node_modules/,use:[path.join(root,'test/fixtures/round-workspace-loader.cjs')]}]},devtool:false},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
  const server=createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/bundle.js'?await readFile(path.join(directory,'bundle.js')):'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px Arial}*{box-sizing:border-box}#root{max-width:1200px;margin:auto;padding:12px}</style><div id="root"></div><script src="/bundle.js"></script>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
  const runtime=process.env.BAGGER_PLAYWRIGHT_MODULE || 'playwright';
  const {chromium}=await import(runtime);const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);t.diagnostic(e.message);});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button',{name:'Matches & Pairings',exact:true}).click();
  const ids=['JP01','MH01','DT01','AM01','BA01','CL01','CB01','HM01','JK02','MS02','MB01','BC01','MS01','JS01','CP01','JK01','CM01','CS01','MM01','NJ01','PN01','RM01','TL01','WO01'];
  const card=n=>page.getByRole('article',{name:`Match ${n} pairing card`,exact:true});
  for(let n=1;n<=6;n++)for(let slot=0;slot<4;slot++)await card(n).locator('.pairingBoard select').nth(slot).selectOption(ids[(slot<2?0:12)+(n-1)*2+slot%2]);
  await page.getByRole('tab',{name:'Round 2 · SC'}).click();assert.equal(await page.getByRole('article').count(),6);
  await page.getByRole('tab',{name:'Round 3 · SI'}).click();assert.equal(await page.getByRole('article').count(),12);
  await page.getByRole('tab',{name:'Round 1 · BB'}).click();
  const confirm=async()=>{assert.equal(await page.evaluate(()=>document.activeElement.id),'tournament-setup-review-title');await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Save This Match’s Pairings',exact:true}).click();};
  for(let n=1;n<=2;n++){await card(n).getByRole('button',{name:`Review Match ${n} Pairings`,exact:true}).click();await confirm();await page.getByText(`Setup revision ${10+n}`,{exact:true}).first().waitFor();for(let k=n+1;k<=6;k++)assert.notEqual(await card(k).locator('.pairingBoard select').first().inputValue(),'');}
  await card(3).getByLabel('Tee time',{exact:true}).fill('08:00');
  await card(3).getByRole('button',{name:'Review Match Details',exact:true}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm Production Change',exact:true}).click();
  await page.getByText('Setup revision 13',{exact:true}).first().waitFor();assert.equal(await card(3).locator('.pairingBoard select').first().inputValue(),'BA01');
  await page.evaluate(()=>{window.__failNext=true;});await card(3).getByRole('button',{name:'Review Match 3 Pairings',exact:true}).click();await confirm();await page.getByRole('alert').filter({hasText:'Fixture stale'}).waitFor();
  assert.equal(await card(6).locator('.pairingBoard select').first().inputValue(),'MB01');
  await page.getByRole('button',{name:'Return to Editing'}).click();
  for(const width of [390,430,820,1280,1440]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no document overflow at ${width}`);
    const sizes=await page.locator('.roundTabs button,.roundActions button,.buttonRow button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height));
    assert.ok(sizes.every(h=>h>=44),`44px actions at ${width}`);
    await page.screenshot({path:path.join(directory,`round-${width}.png`),fullPage:true});
  }
  await page.getByRole('tab',{name:'Round 1 · BB'}).focus();await page.keyboard.press('ArrowRight');await page.getByRole('tab',{name:'Round 2 · SC',selected:true}).waitFor();await page.keyboard.press('Home');
  await page.getByRole('button',{name:'Review All Round 1 Pairings',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'tournament-setup-review-title');
  await page.getByText('This will update 4 matches and 16 Player assignments.',{exact:false}).waitFor();
  for(const width of [390,430,820,1280,1440]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`round review has no overflow at ${width}`);
    await page.locator('.review').screenshot({path:path.join(directory,`review-${width}.png`)});
  }
  await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Confirm Round Pairings',exact:true}).click();await page.getByText('Setup revision 14',{exact:true}).first().waitFor();
  const requests=await page.evaluate(()=>window.__requests);assert.equal(requests.filter(r=>r.action==='replace-round-pairings').length,1);assert.equal(requests.at(-1).matches.length,6);
  assert.deepEqual(errors,[]);
});
