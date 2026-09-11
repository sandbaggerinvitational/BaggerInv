import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {playerPhoto} from '../lib/asset-paths.js';
import {playerPortraitAssets} from '../lib/player-portrait-assets.js';
import {oddsPublicationDate} from '../lib/odds-publication-date.js';

export const noPortraitIds=['CM01','JK02','PN01','BJ01','CO02','CF01','JS02','JG01','KW01','MO01','PC01','SL01','TG01','WD01'];
test('all 14 audited missing portraits and future missing players resolve without an image request',async()=>{
  const history=JSON.parse(await readFile(new URL('../lib/historical-data.json',import.meta.url),'utf8'));
  for(const id of noPortraitIds){const p=history.players.find(p=>p['Player ID']===id);assert.ok(p,id);assert.equal(playerPhoto(p['Photo Filename']),null,id);}
  for(const file of ['',null,'future-new-player-pic','../private','javascript:alert(1)'])assert.equal(playerPhoto(file),null);
});
test('bundled inventory exactly matches assets, and existing canonical/remote portraits remain usable',async()=>{
  const files=(await readdir(new URL('../public/images/players/',import.meta.url))).filter(f=>f.endsWith('.webp')).sort();
  assert.deepEqual(playerPortraitAssets.map(k=>k+'.webp').sort(),files);
  for(const file of files)assert.equal(playerPhoto(file),'/images/players/'+file);
  assert.equal(playerPhoto('/images/players/holman-moores-pic.webp'),'/images/players/holman-moores-pic.webp');
  assert.equal(playerPhoto("connor-o’reilly-pic"),'/images/players/connor-oreilly-pic.webp');
  assert.equal(playerPhoto('https://example.com/portrait.jpg'),'https://example.com/portrait.jpg');
  assert.equal(playerPhoto('https://user:secret@example.com/a.jpg'),null);
});
test('publication date uses Eastern time identically across server/device zones and preserves its instant',()=>{
  const stamp='2026-09-11T01:53:28.308+00:00';
  assert.equal(oddsPublicationDate(stamp),'9/10/2026');
  assert.equal(oddsPublicationDate(stamp,true),'9/10/2026, 9:53:28 PM');
  assert.equal(oddsPublicationDate('invalid'),'Unavailable');
  for(const tz of ['UTC','America/Chicago','America/New_York','Asia/Tokyo']){
    const output=execFileSync(process.execPath,['--input-type=module','-e',`import {oddsPublicationDate} from './lib/odds-publication-date.js'; console.log(oddsPublicationDate('${stamp}'));`],{cwd:new URL('../',import.meta.url),env:{...process.env,TZ:tz},encoding:'utf8'});
    assert.equal(output.trim(),'9/10/2026',tz);
  }
});
test('all public Odds publication date labels use the deterministic formatter',async()=>{
  const source=await readFile(new URL('../app/odds-center/OddsCenter.js',import.meta.url),'utf8');
  assert.equal((source.match(/oddsPublicationDate\(/g)||[]).length,3);
  assert.doesNotMatch(source,/new Date\([^)]*publishedAt/);
});
