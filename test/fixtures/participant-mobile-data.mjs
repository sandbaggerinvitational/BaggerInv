import { readFile } from "node:fs/promises";

// Read previously captured public responses, never credentials or Production APIs.
export function flightObjects(html) {
  let flight = "";
  for (const match of html.matchAll(/self\.__next_f\.push\((\[.*?\])\)<\/script>/g)) {
    const chunk = JSON.parse(match[1]);
    if (typeof chunk[1] === "string") flight += chunk[1];
  }
  return flight.split("\n").flatMap(line => {
    try { return [JSON.parse(line.slice(line.indexOf(":") + 1))]; } catch { return []; }
  });
}
export function walk(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}
export async function publicMobileFixture(prefix) {
  const oddsHtml = await readFile(`${prefix}-odds.html`, "utf8");
  let snapshots;
  for (const value of flightObjects(oddsHtml)) walk(value, node => { if (Array.isArray(node.snapshots)) snapshots = node.snapshots; });
  if (!snapshots?.length) throw new Error("A published public snapshot is required");
  const portraits = {};
  for (const value of flightObjects(await readFile(`${prefix}-players.html`, "utf8"))) walk(value, node => {
    const player = node.player;
    if (player?.["Player ID"] && player["Photo Filename"]) portraits[player["Player ID"]] = player["Photo Filename"];
    // Public HTML has already resolved portraits; this fixture-only association
    // supplies the same image to the local preview, never a runtime identity map.
    if (node.src?.startsWith("/images/players/") && node.alt) {
      const matches = snapshots[0].players.filter(row => row.name === node.alt);
      if (matches.length === 1) portraits[matches[0].id] = node.src.split("/").at(-1);
    }
  });
  const guide = JSON.parse(await readFile(`${prefix}-guide.json`, "utf8"));
  const live = JSON.parse(await readFile(`${prefix}-live.json`, "utf8")).data;
  return { snapshots, portraits, content: { ...guide.content, liveTournament: live.tournament, liveRounds: live.rounds, timelineNow: "2026-09-10T12:00:00Z" }, guideFingerprint: guide.contentFingerprint };
}

export const syntheticMobileFixture = {
  snapshots: [{year:2026,phase:"Pre-Tournament",phaseOrder:1,publishedAt:"2026-09-10T12:00:00Z",iterations:25000,
    teams:[{side:1,name:"The Pickles",probability:54.1,americanOdds:"-118",expectedPoints:36.58},{side:2,name:"Lipp it and Rip it",probability:45.9,americanOdds:"+118",expectedPoints:35.42}],
    players:Array.from({length:24},(_,index)=>({id:`P${index}`,name:`Example Player ${index + 1}`,rank:index+1,probability:5.3-index/10,americanOdds:"+1784",expectedPoints:3.15,expectedRecord:"1.4-1.2-0.3",averageFinish:6}))}],
  portraits:{},
  content:{tournamentIdentity:{id:"2026",year:2026,name:"Invitational",location:"Kiawah",dates:"September 25–26"},overview:[],courses:[{"Course ID":"TPGC01"}],rounds:[],tournamentRules:[],
    schedule:[{"Event ID":"one","Event Date":"2026-09-25","Start Time":"07:30",Title:"Meet at clubhouse",Location:"Clubhouse",Details:"Bring your clubs.","Event Type":"Social",Status:"Published"}],
    ruleBook:[{"Rule ID":"one",Category:"Scoring",Title:"Scoring instructions",Body:"Record all scores in Golf Genius.",Important:"TRUE"}],dining:[],localGuide:[],importantContacts:[]},
};
