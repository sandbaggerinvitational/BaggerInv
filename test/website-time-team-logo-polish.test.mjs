import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {formatHomeTime} from '../lib/home-dashboard.js';
import {teamLogo} from '../lib/asset-paths.js';

test('Match Center uses the existing time formatter without changing clock semantics',async()=>{
  for(const [raw,label] of [['07:40:00','7:40 AM'],['00:00:00','12:00 AM'],['12:00:00','12:00 PM'],['09:05:00','9:05 AM'],['14:00:00','2:00 PM'],['2:00 PM','2:00 PM'],['7:30 AM','7:30 AM'],['',''],['TBA','TBA']])assert.equal(formatHomeTime(raw),label);
  const card=await readFile(new URL('../app/PublicMatchCard.js',import.meta.url),'utf8');
  assert.match(card,/const displayTeeTime = formatHomeTime\(match\.teeTime\)/);
  assert.doesNotMatch(card,/\$\{match\.teeTime\}|match\.teeTime \|\| match\.status/);
  const pwa=await readFile(new URL('../app/live/TournamentDashboard.js',import.meta.url),'utf8');
  assert.match(pwa,/\[tee, formatHomeTime\(match\.teeTime\)\]/);
});

test('canonical historical team keys resolve to the exact user-uploaded GitHub assets',async()=>{
  const history=JSON.parse(await readFile(new URL('../lib/historical-data.json',import.meta.url),'utf8'));
  const rows=Object.values(history).flat().filter(r=>r&&typeof r==='object');
  for(const [id,key,blob] of [['BRYSON','brysons-logo','85e5bcc504af5860d59c09b13966d8a645d2139b'],['PHBOMBS','philscb-logo','c7974f252b8c4bdd4beb3e9d86e2d29b433ee81a']]){
    assert.equal(rows.find(r=>r['Team ID']===id)?.['Team Logo'],key);
    const url=teamLogo(key);assert.equal(url,`/images/teams/logos/${key}.webp`);
    const bytes=await readFile(new URL('../public'+url,import.meta.url));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),blob);
  }
  assert.equal(teamLogo(null),null);
  const plate=await readFile(new URL('../app/TeamLogoPlate.js',import.meta.url),'utf8');
  assert.match(plate,/fallback=\{teamInitials\(teamName\)\}/);assert.match(plate,/inferFallback=\{false\}/);
});
