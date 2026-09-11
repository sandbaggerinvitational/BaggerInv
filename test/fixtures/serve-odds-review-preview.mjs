// Explicit local-only certification harness. Never imports server credentials,
// exposes a production route, publishes, or calls a Production service.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {snapshot as synthetic,verifiedFixture} from './odds-review.mjs';
import {oddsSnapshotReview} from '../../lib/odds-snapshot-review.js';
import {logicalOddsResult} from '../../lib/championship-odds-supabase.js';
import {scoringShadowPayloadHash} from '../../lib/scoring-shadow.js';
const root=process.cwd(),require=createRequire(import.meta.url),directory=await mkdtemp('/tmp/bagger-odds-preview-');
const imported=process.env.BAGGER_ODDS_AUDIT_FIXTURE?await import(pathToFileURL(process.env.BAGGER_ODDS_AUDIT_FIXTURE)):null;
const snapshot=imported?.snapshot||synthetic;
if(imported&&scoringShadowPayloadHash(logicalOddsResult(snapshot))!==imported.audit.resultFingerprint)throw new Error('Retained result fingerprint mismatch');
const verified=verifiedFixture(snapshot,imported?.audit),review=oddsSnapshotReview(verified,{revision:25,approvedHandicapRevisionNumber:7});
const fixture={snapshot,job:{...verified.job,input_snapshot:undefined},data:{tournament:{year:2026},leaderboard:snapshot.players.map(p=>({id:p.id,name:p.name,team:snapshot.teams.find(t=>t.side===p.teamSide)?.name,photo:imported?p.name.toLowerCase().replaceAll(' ','-')+'-pic':null}))}};
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
await new Promise((resolve,reject)=>webpack.webpack({mode:'development',context:root,entry:'./test/fixtures/odds-review-browser.js',output:{path:directory,filename:'bundle.js'},plugins:[new webpack.webpack.DefinePlugin({'process.env':JSON.stringify({NODE_ENV:'development'})})],module:{rules:[{test:/\.m?js$/,resolve:{fullySpecified:false}},{test:/\.(js|css)$/,exclude:/node_modules/,use:[path.join(root,'test/fixtures/odds-review-browser-loader.cjs')]}]},devtool:false},(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'){res.writeHead(405);return res.end('Read-only preview');}
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/bundle.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');return res.end(await readFile(path.join(directory,'bundle.js')));}
  if(url.pathname==='/api/admin/production-odds-calculations'){res.setHeader('Content-Type','application/json');const stale=url.searchParams.get('job')==='0'.repeat(64);res.statusCode=stale?409:200;return res.end(JSON.stringify(stale?{ok:false,error:'This calculation is stale. Publication is blocked.'}:{ok:true,review,publicationCreated:false}));}
  if(url.pathname==='/api/leaderboards/insights'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({snapshots:[snapshot]}));}
  if(url.pathname.startsWith('/images/')){const file=path.resolve(root,'public','.'+url.pathname);if(!file.startsWith(path.join(root,'public')+path.sep))throw new Error('Invalid asset path');res.setHeader('Content-Type',file.endsWith('.webp')?'image/webp':'image/png');return res.end(await readFile(file));}
  if(url.pathname!=='/'){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}*{box-sizing:border-box}</style><div id="root"></div><script>window.__fixture='+JSON.stringify(url.searchParams.has('stale')?{...fixture,job:{...fixture.job,job_id:'0'.repeat(64)}}:fixture).replaceAll('<','\\u003c')+'</script><script src="/bundle.js"></script>');
 }catch{res.writeHead(404);res.end('Unavailable');}
});
server.listen(0,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:'+server.address().port+'/?mode=insights'));
