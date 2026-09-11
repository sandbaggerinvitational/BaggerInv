import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import test from "node:test";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {transform} from "next/dist/build/swc/index.js";
import {syntheticMobileFixture,publicMobileFixture} from "./fixtures/participant-mobile-data.mjs";
import {projectionPresentationLabel} from "../lib/projection-phases.js";

const styles=new Proxy({}, {get:(_,key)=>String(key)});
async function component(file,name,extra={},sourceOverride) {
  const url=new URL(`../${file}`,import.meta.url);
  let source=sourceOverride??await readFile(url,"utf8");
  const bindings={React,...React,styles,useRouter:()=>({refresh(){}}),Header:()=>null,Footer:()=>null,
    Link:({href,children})=>React.createElement("a",{href},children),...extra};
  for(const match of source.matchAll(/^import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];/gm)) {
    const [,names,location]=match;
    if(names.startsWith("{")&&location.includes("/lib/")){
      const module=await import(new URL(location.endsWith(".js")?location:`${location}.js`,url));
      for(const key of names.replace(/[{}]/g,"").split(",").map(s=>s.trim()).filter(Boolean)) bindings[key]=module[key];
    }
  }
  source=source.replace(/^import\s+[\s\S]*?\s+from\s+["'][^"']+["'];/gm,"").replace(/export default /g,"").replace(/export (?:function|const) /g,m=>m.replace("export ",""));
  const compiled=await transform(source,{jsc:{parser:{syntax:"ecmascript",jsx:true},transform:{react:{runtime:"classic"}}}});
  return new Function(...Object.keys(bindings),`${compiled.code};return ${name};`)(...Object.values(bindings));
}
const AssetImage=await component("app/AssetImage.js","AssetImage");
const PlayerAvatar=await component("app/PlayerAvatar.js","PlayerAvatar",{AssetImage});
const ResponsiveDisclosure=await component("app/ResponsiveDisclosure.js","ResponsiveDisclosure");
const MobilePlayerProjection=await component("app/odds-center/MobilePlayerProjection.js","MobilePlayerProjection",{PlayerAvatar});
const OddsCenter=await component("app/odds-center/OddsCenter.js","OddsCenter",{MobilePlayerProjection,ResponsiveDisclosure});
const Guide=await component("app/tournament-guide/PublicTournamentGuide.js","PublicTournamentGuide",{AssetImage,ResponsiveDisclosure});
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
const fixture=process.env.BAGGER_PUBLIC_FIXTURE_PREFIX?await publicMobileFixture(process.env.BAGGER_PUBLIC_FIXTURE_PREFIX):syntheticMobileFixture;

test("mobile groups all 24 retained players once, preserving values and secondary metrics",()=>{
  const snapshot=fixture.snapshots[0],before=JSON.stringify(snapshot);
  const html=render(MobilePlayerProjection,{players:snapshot.players,portraits:fixture.portraits});
  assert.equal((html.match(/data-projection-player=/g)||[]).length,24);
  for(const player of snapshot.players){
    assert.equal((html.match(new RegExp(`data-projection-player="${player.id}"`,"g"))||[]).length,1);
    assert.ok(html.includes(`${player.probability.toFixed(1)}%`));
    assert.ok(html.includes(player.expectedPoints.toFixed(2)));
    assert.ok(html.includes(player.expectedRecord));
    assert.ok(html.includes(player.averageFinish.toFixed(1)));
  }
  assert.match(html,/Tournament Favorite/);assert.match(html,/Top Contenders/);assert.match(html,/Remaining Field/);
  assert.equal((html.match(/<article/g)||[]).length,10);
  assert.equal((html.match(/class="remainingPlayer"/g)||[]).length,14);
  assert.equal(JSON.stringify(snapshot),before);
});
test("future projection preserves previous odds/probabilities, movement and multi-entry timeline",()=>{
  const first=fixture.snapshots[0],second={...first,phase:"After Round 1",phaseOrder:2,players:first.players.map(p=>({...p,probability:p.probability+0.2}))};
  const html=render(OddsCenter,{snapshots:[first,second],portraits:fixture.portraits});
  assert.match(html,/\+0\.2 percentage points/);assert.match(html,/Previously/);assert.match(html,/Biggest Movers/);
  assert.match(html,/View Projection History/);assert.match(html,/Player Projection Timeline/);
  assert.ok(html.includes(projectionPresentationLabel(second.phase)));assert.doesNotMatch(html,/<details[^>]*class="playerHistory"[^>]*open/);
});
test("canonical portrait and genuine missing-image fallback are retained",()=>{
  const player=fixture.snapshots[0].players[0];
  assert.match(render(MobilePlayerProjection,{players:[player],portraits:{[player.id]:"holman-moores-pic"}}),/src="\/images\/players\/holman-moores-pic.webp"/);
  assert.match(render(MobilePlayerProjection,{players:[player]}),/image unavailable/);
});
test("known missing portrait filenames and explicit bundled paths render initials without img requests",()=>{
  for(const [name,key] of [['Chris Micheal','chris-micheal-pic'],['Jack Keffler','jack-keffler-pic'],['Patrick Noonan','patrick-noonan-pic']]){
    for(const props of [{filename:key},{src:`/images/players/${key}.webp`}]){
      const html=render(PlayerAvatar,{...props,name,alt:name});
      assert.doesNotMatch(html,/<img\b/);assert.match(html,/role="img"/);
      assert.ok(html.includes(name.split(' ').map(x=>x[0]).join('')));
    }
  }
});
test("Guide rendered copy, Golf Genius references, event sequence and participant links are unchanged",()=>{
  const oldSource=execFileSync("git",["show","4096f972:app/tournament-guide/PublicTournamentGuide.js"],{encoding:"utf8"});
  return component("app/tournament-guide/PublicTournamentGuide.js","PublicTournamentGuide",{AssetImage},oldSource).then(OldGuide=>{
    const before=JSON.stringify(fixture.content),oldHtml=render(OldGuide,{content:fixture.content}),html=render(Guide,{content:fixture.content});
    const text=value=>value.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
    // Only new navigation wording is permitted; all published content stays exact.
    assert.equal(text(html.replace(/<a href="\/courses">Courses →<\/a>/,"")),text(oldHtml));
    const links=value=>[...value.matchAll(/href="([^"]+)"/g)].map(m=>m[1]).filter(href=>href!=="/courses");
    assert.deepEqual(links(html),links(oldHtml));
    assert.equal((html.match(/Golf Genius/g)||[]).length,(oldHtml.match(/Golf Genius/g)||[]).length);
    assert.doesNotMatch(html,/<details[^>]*open/);assert.equal(JSON.stringify(fixture.content),before);
  });
});
test("responsive behavior contains layouts, retains desktop table, and uses keyboard-native disclosure",async()=>{
  const odds=await readFile(new URL("../app/odds-center/odds.module.css",import.meta.url),"utf8");
  const guide=await readFile(new URL("../app/tournament-guide/public-tournament-guide.module.css",import.meta.url),"utf8");
  const disclosure=await readFile(new URL("../app/ResponsiveDisclosure.js",import.meta.url),"utf8");
  assert.match(odds,/\.mobilePlayers\{display:none\}/);assert.match(odds,/\.board\{display:none\}/);
  assert.match(odds,/minmax\(0,1fr\)/);assert.match(guide,/min-height:44px/);
  assert.match(disclosure,/media\.addEventListener\("change", applyDefault\)/);
  assert.match(disclosure,/!media.matches && desktopOpen/);
  assert.match(disclosure,/<details/);assert.doesNotMatch(disclosure,/fetch\(|localStorage/);
});
test("photo enrichment is separate, stable-ID and read-only; no Director or publication path changes",async()=>{
  const source=await readFile(new URL("../app/odds-center/OddsCenterPresentation.js",import.meta.url),"utf8");
  assert.match(source,/loadCanonicalPlayerPresentation/);assert.match(source,/ids.has\(player.id\)/);
  assert.match(source,/catch\(\(\) => null\)/);assert.doesNotMatch(source,/\bpublish\w*\(|\.probability\s*=|fetch\(/i);
});
