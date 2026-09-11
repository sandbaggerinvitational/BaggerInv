import {createRequire} from "node:module";
import {createServer} from "node:http";
import {mkdtemp,readFile} from "node:fs/promises";
import path from "node:path";
import {publicMobileFixture,syntheticMobileFixture} from "./participant-mobile-data.mjs";
const fixture=process.env.BAGGER_PUBLIC_FIXTURE_PREFIX?await publicMobileFixture(process.env.BAGGER_PUBLIC_FIXTURE_PREFIX):syntheticMobileFixture;
const root=process.cwd(),require=createRequire(import.meta.url),directory=await mkdtemp("/tmp/bagger-mobile-preview-");
const webpack=require("next/dist/compiled/webpack/webpack");webpack.init();
await new Promise((resolve,reject)=>webpack.webpack({mode:"development",context:root,entry:"./test/fixtures/participant-mobile-browser.js",output:{path:directory,filename:"bundle.js"},plugins:[new webpack.webpack.DefinePlugin({"process.env":JSON.stringify({NODE_ENV:"development"})})],module:{rules:[{test:/\.m?js$/,resolve:{fullySpecified:false}},{test:/\.(js|css)$/,exclude:/node_modules/,use:[path.join(root,"test/fixtures/website-polish-loader.cjs")]}]},devtool:false},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
createServer(async(req,res)=>{
  try {
    if(req.method!=="GET"){res.writeHead(405);return res.end("Read only");}
    const url=new URL(req.url,"http://127.0.0.1");
    if(url.pathname==="/bundle.js"){res.setHeader("Content-Type","text/javascript");return res.end(await readFile(path.join(directory,"bundle.js")));}
    const imagePath=url.pathname==="/_next/image"?url.searchParams.get("url"):url.pathname;
    if(imagePath?.startsWith("/images/")){
      const file=path.resolve(root,"public","."+imagePath);
      if(!file.startsWith(path.join(root,"public")+path.sep))throw Error("Invalid path");
      res.setHeader("Content-Type",file.endsWith(".webp")?"image/webp":"image/png");return res.end(await readFile(file));
    }
    if(url.pathname!=="/"){res.writeHead(404);return res.end("Local presentation preview only");}
    res.setHeader("Content-Type","text/html");res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script>window.__fixture='+JSON.stringify(fixture).replaceAll("<","\\u003c")+'</script><script src="/bundle.js"></script>');
  } catch {res.writeHead(404);res.end("Unavailable");}
}).listen(Number(process.env.BAGGER_PREVIEW_PORT)||0,"127.0.0.1",function(){console.log(`Local preview: http://127.0.0.1:${this.address().port}/`);});
