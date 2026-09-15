// Local synthetic browser acceptance. No Production requests or data.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.BAGGER_TEST_PLAYWRIGHT_PATH || "playwright");
const compiled = require("next/dist/compiled/webpack/webpack"); compiled.init();
const out = await mkdtemp(join(tmpdir(), "bagger-skins-readiness-ui-"));
await new Promise((yes,no) => compiled.webpack({ mode:"development", context:process.cwd(),
  entry:"./test/fixtures/net-skins-readiness-browser.jsx", output:{path:out,filename:"fixture.js"},
  module:{rules:[{test:/\.(jsx?|css)$/,exclude:/node_modules/,use:[resolve("test/fixtures/director-browser-loader.cjs")]}]},
}).run((error,stats)=>error||stats.hasErrors()?no(error||new Error(stats.toString())):yes()));
const bundle = await readFile(join(out,"fixture.js"));
const server=createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/fixture.js"?"text/javascript; charset=utf-8":"text/html; charset=utf-8");
  res.end(req.url==="/fixture.js"?bundle:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px Arial}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const browser=await chromium.launch({headless:true});
try {
  for(const width of [390,430,820,1280,1440]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
    await page.route("**/*",route=>route.request().url().startsWith(`http://127.0.0.1:${server.address().port}`)?route.continue():route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const unavailable=page.getByRole("button",{name:"Saved Entries Unavailable",exact:true}); await unavailable.waitFor();
    assert.equal(await unavailable.isDisabled(),true);
    assert.equal(await page.evaluate(()=>window.fixtureCalls.some(c=>c.method==="POST")),false);
    await page.evaluate(()=>window.fixtureMode="stale");await page.getByRole("button",{name:"Reload Saved Entries",exact:true}).click();
    const stale=page.getByRole("button",{name:"Review Saved Entries First",exact:true});await stale.waitFor();assert.equal(await stale.isDisabled(),true);
    await page.evaluate(()=>window.fixtureMode="ready");await page.getByRole("button",{name:"Reload Saved Entries",exact:true}).click();
    const ready=page.getByRole("button",{name:"Configure from Saved Entries",exact:true});await ready.waitFor();assert.equal(await ready.isEnabled(),true);
    await ready.focus();await page.keyboard.press("Enter");await page.getByText("Net Skins configuration was accepted.",{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(c=>c.method==="POST").length),1);
    assert.equal(await page.evaluate(()=>window.fixtureRefreshes),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.ok((await ready.boundingBox()).height>=44);
    assert.deepEqual(errors,[]);await page.screenshot({path:join(out,`skins-${width}.png`),fullPage:true});
    console.log(`PASS ${width}px: unavailable/stale blocked; saved entries enabled; keyboard; one synthetic save; no overflow`);await page.close();
  }
  console.log(`Evidence: ${out}`);
} finally {await browser.close();server.close();}
