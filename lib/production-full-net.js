// Service-side consumer adapters only. SQL owns the Full-Net projection.
// No Matchup/Playing-HCP fallback and no duplicated handicap formula here.
import { calculateNetSkins } from './net-skins.js';
import { calculateCalcuttaFromCanonicalRoundResults } from './calcutta-supabase.js';
import { leaderboardsCoreDataFromSupabaseView } from './leaderboards-core-supabase.js';

export const FULL_NET_POLICY = 'production-full-course-handicap-v1';
export const FULL_NET_SKINS_ENGINE = 'net-skins-full-net-v2';
export const FULL_NET_CALCUTTA_ENGINE = 'calcutta-full-net-v3';
const clean = v => String(v ?? '').trim();
const fail = message => { throw Object.assign(new Error(message), { code: 'PRODUCTION_FULL_NET_AUTHORITY_REQUIRED' }); };
const samePlayers = (a,b) => Array.isArray(a) && Array.isArray(b) && a.length===b.length && [...a].sort().join('|')===[...b].sort().join('|');

export function fullNetAuthority(view) {
  const p = view?.full_net_authority;
  if (p?.policy!==FULL_NET_POLICY || p.tournamentId!==view?.tournament?.tournament_id || !Array.isArray(p.matches)) fail('Bound Full-Net authority is unavailable.');
  const ids=new Set();
  for(const match of p.matches) {
    if(match.policy!==FULL_NET_POLICY || match.tournamentId!==p.tournamentId || ids.has(match.matchId)
      || !['BB','SC','SI'].includes(match.format) || !Number.isInteger(match.roundNumber) || !Array.isArray(match.entries)) fail('Full-Net Match binding is invalid.');
    ids.add(match.matchId);
    const players=new Set();
    for(const entry of match.entries) {
      const team=match.format==='SC';
      if(entry.scope!==(team?'TEAM':'PLAYER') || !Array.isArray(entry.playerIds) || entry.playerIds.length!==(team?2:1)
        || entry.playerIds.some(id=>!clean(id)||players.has(id)) || !Array.isArray(entry.holes)) fail('Full-Net entrant binding is invalid.');
      entry.playerIds.forEach(id=>players.add(id));
      if(match.authorityAvailable) {
        if(!clean(match.snapshotId)||!clean(match.snapshotHash)||!clean(match.handicapRevisionId)||!clean(match.handicapRevisionFingerprint)
          || entry.holes.length!==18 || new Set(entry.holes.map(h=>h.hole)).size!==18
          || !Number.isInteger(entry.fullCourseHandicapStrokes)) fail('Full-Net frozen context is incomplete.');
        for(const h of entry.holes) if(!Number.isInteger(h.hole)||h.hole<1||h.hole>18||!Number.isInteger(h.par)
          || !Number.isInteger(h.strokeIndex)||h.strokeIndex<1||h.strokeIndex>18||!Number.isInteger(h.fullCourseHandicapStrokes)
          || (h.gross!==null&&!Number.isFinite(h.gross)) || (h.fullNet!==null&&!Number.isFinite(h.fullNet))) fail('Full-Net hole authority is invalid.');
      }
    }
  }
  return p;
}

export function calculateProductionFullNetSkins(view) {
  const projection=fullNetAuthority(view), year=Number(view.tournament.tournament_year);
  const registry=view.net_skins_entry_authority;
  if(registry?.contract!=='production-net-skins-entries-v1' || registry.tournamentId!==projection.tournamentId
    || !Array.isArray(registry.rounds)) fail('Persisted explicit entry authority is unavailable.');
  const entries=[],scoreRows=[],detailByRound=new Map(),seen=new Set();
  for(const config of view.configurations||[]) for(const entrant of config.entries||[]) {
    // Filter FIRST. An ineligible duplicate can never override an allocation.
    if(entrant.eligible!==true) continue;
    const round=Number(entrant.round_number), format=clean(entrant.format).toUpperCase();
    const playerIds=[entrant.player_id_1,...(format==='SC'?[entrant.player_id_2]:[])];
    const saved=registry.rounds.find(r=>r.roundNumber===round);
    const consent=saved?.entrants?.find(e=>e.key===entrant.source_payload?.['Entry Key']);
    if(!saved?.configured || saved.state!=='ENTRIES_SAVED'
      || saved.revision!==entrant.source_payload?.['Entry Revision'] || !consent?.entered
      || consent.bindingFingerprint!==entrant.source_payload?.['Entry Binding Fingerprint']
      || consent.matchId!==entrant.source_payload?.['Canonical Match ID'] || !samePlayers(consent.playerIds,playerIds))
      fail('Explicit entry revision or pairing consent is stale.');
    for(const id of playerIds) {const key=`${round}:${id}`;if(seen.has(key)) fail('Duplicate opted-in entrant.');seen.add(key);}
    const candidates=projection.matches.filter(m=>m.roundNumber===round && m.format===format
      && m.entries.some(e=>samePlayers(e.playerIds,playerIds)));
    if(candidates.length!==1) fail('Opt-in must bind exactly one canonical Match.');
    const match=candidates[0], source=(view.matches||[]).find(e=>e.match?.match_id===match.matchId);
    if(entrant.source_payload?.['Canonical Match ID']!==match.matchId) fail('Explicit opt-in Match provenance is unavailable.');
    if(entrant.source_payload?.['Net Handicap Basis']!==FULL_NET_POLICY) fail('Legacy implicit eligibility requires explicit opt-in reconfiguration.');
    const display=clean(source?.presentation?.display_match_number||match.matchId);
    if(clean(entrant.match_number)!==display) fail('Opt-in Match binding changed; explicit reconfiguration is required.');
    const full=match.entries.find(e=>samePlayers(e.playerIds,playerIds));
    const name=full.playerIds.map(id=>clean(source?.participants?.find(p=>p.player_id===id)?.display_name)||id).join(' / ');
    // Team Handicap deliberately absent: unchanged award engine consumes the
    // explicit server Full Net rather than its legacy handicap override.
    entries.push({'Net Skins ID':entrant.entry_id,Year:year,Round:round,Match:display,Format:format,
      'Player ID 1':playerIds[0],'Player ID 2':playerIds[1]||'','Team Handicap':null,'Buy-In':entrant.buy_in,Eligible:true});
    scoreRows.push({id:format==='SC'?full.entityId:playerIds[0],round,match:display,
      entityType:format==='SC'?'PAIRING':'PLAYER',playerIds,name,
      scorecard:match.authorityAvailable?full.holes.map(h=>({hole:h.hole,par:h.par,strokeIndex:h.strokeIndex,
        gross:h.gross,strokes:h.fullCourseHandicapStrokes,net:h.fullNet,match:display})):[]});
    if(!detailByRound.has(round)) detailByRound.set(round,[]);
    detailByRound.get(round).push({entryId:entrant.entry_id,matchId:match.matchId,playerIds,scope:full.scope,
      authorityAvailable:match.authorityAvailable,official:match.official,holes:full.holes,
      handicapRevisionId:match.handicapRevisionId,snapshotId:match.snapshotId,policy:FULL_NET_POLICY});
  }
  const calculated=calculateNetSkins({entries,scoreRows,activeYear:year});
  calculated.rounds=calculated.rounds.map(round=>{
    const detail=detailByRound.get(round.round)||[];
    const finalized=round.complete && detail.length>0 && detail.every(e=>e.authorityAvailable&&e.official);
    return {...round,finalized,resultState:finalized?'OFFICIAL':'PROVISIONAL',fullNetDetail:detail,calculationPolicy:FULL_NET_POLICY};
  });
  return {netSkins:calculated,scoreRows,canonicalInputVerification:{policy:FULL_NET_POLICY,explicitOptInOnly:true,matchupNetUsed:false}};
}

export function calculateProductionFullNetCalcutta(configurationView,coreView) {
  const projection=fullNetAuthority(coreView),core=coreView.tournament?.id?coreView:leaderboardsCoreDataFromSupabaseView(coreView);
  const completed=new Set((core.rounds||[]).filter(r=>clean(r.status).toUpperCase()==='FINAL'
    || (r.matches?.length>0&&r.matches.every(m=>['final','finalized','complete','completed'].includes(clean(m.status).toLowerCase()))))
    .map(r=>Number(r.number??r.round??r.round_number)));
  const rows=[],seen=new Set();
  for(const match of projection.matches) {
    if(!completed.has(match.roundNumber)) continue;
    if(!match.authorityAvailable || !match.official || match.entries.length!==(match.format==='BB'?4:2)) fail('Completed Calcutta Round lacks frozen Full-Net authority.');
    for(const entry of match.entries) {
      if(!entry.complete || !Number.isFinite(entry.totalGross)||!Number.isFinite(entry.totalFullNet)) fail('Completed Calcutta scorecard is unavailable.');
      for(const id of entry.playerIds) {const key=`${match.roundNumber}:${id}`;if(seen.has(key)) fail('Duplicate Calcutta Round player.');seen.add(key);}
      rows.push({Year:Number(coreView.tournament.tournament_year),Round:match.roundNumber,Format:match.format,
        'Player IDs':entry.playerIds.join(','),'Gross Score':entry.totalGross,'Net Score':entry.totalFullNet,
        'Full Course Handicap':entry.fullCourseHandicapStrokes,'Calcutta Handicap Policy':FULL_NET_POLICY});
    }
  }
  for(const r of completed) if(!projection.matches.some(m=>m.roundNumber===r)) fail('Completed Round is missing from Full-Net projection.');
  const result=calculateCalcuttaFromCanonicalRoundResults(configurationView,coreView,rows,
    {engineVersion:FULL_NET_CALCUTTA_ENGINE,policy:FULL_NET_POLICY});
  result.canonicalInputVerification={...result.canonicalInputVerification,scoreSource:'shared frozen PLAYER/TEAM Full Net',handicapPolicy:FULL_NET_POLICY,matchupNetUsed:false};
  return result;
}
