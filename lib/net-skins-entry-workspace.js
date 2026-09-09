// Presentation/request assembly only. Field membership and entered state are server facts.
/** @typedef {{key:string,bindingFingerprint:string,entered:boolean,playerIds:string[],players:{id:string,name:string}[],scope:'PLAYER'|'PAIR'}} Entry */
export function normalizeNetSkinsEntries(value) {
  const invalid=()=>{const error=new Error("Net Skins entry authority is unavailable.");error.code="TOURNAMENT_SETUP_RESPONSE_INVALID";error.status=503;throw error;};
  if(value?.contract!=="production-net-skins-entries-v1"||value.tournamentId!=="2026"||!Array.isArray(value.rounds))invalid();
  const seen=new Set();const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
  const rounds=value.rounds.map(r=>{
    if(!Number.isSafeInteger(r.roundNumber)||r.roundNumber<1||seen.has(r.roundNumber)||!['BB','SC','SI'].includes(r.format)
      ||r.scope!==(r.format==='SC'?'PAIR':'PLAYER')||!Number.isSafeInteger(r.revision)||r.revision<0||!hash(r.fieldFingerprint)
      ||typeof r.configured!=='boolean'||!Number.isSafeInteger(r.enteredCount)||r.enteredCount<0
      ||!Array.isArray(r.entrants)||!Array.isArray(r.staleEntries)||!['NOT_CONFIGURED','REVIEW_REQUIRED','WAITING_FOR_PAIRINGS','ENTRIES_SAVED'].includes(r.state))invalid();
    seen.add(r.roundNumber);
    const entries=list=>{const keys=new Set();return list.map(e=>{
      if(typeof e.key!=='string'||keys.has(e.key)||!hash(e.bindingFingerprint)||typeof e.entered!=='boolean'
        ||e.roundNumber!==r.roundNumber||e.format!==r.format||e.scope!==r.scope||typeof e.matchId!=='string'
        ||!Array.isArray(e.playerIds)||e.playerIds.length!==(r.scope==='PAIR'?2:1)||new Set(e.playerIds).size!==e.playerIds.length
        ||!Array.isArray(e.players)||e.players.length!==e.playerIds.length||e.players.some((p,i)=>p.id!==e.playerIds[i]||typeof p.name!=='string')
        ||typeof e.teamId!=='string'||typeof e.teamName!=='string')invalid();
      keys.add(e.key);return {key:e.key,bindingFingerprint:e.bindingFingerprint,entered:e.entered,roundNumber:e.roundNumber,
        format:e.format,scope:e.scope,matchId:e.matchId,matchNumber:e.matchNumber,playerIds:e.playerIds,
        players:e.players.map(p=>({id:p.id,name:p.name})),teamId:e.teamId,teamName:e.teamName};
    });};
    return {roundNumber:r.roundNumber,format:r.format,scope:r.scope,revision:r.revision,configured:r.configured,
      fieldFingerprint:r.fieldFingerprint,enteredCount:r.enteredCount,state:r.state,savedAt:r.savedAt,
      source:"DIRECTOR_EXPLICIT_ROUND_ENTRY_V1",entrants:entries(r.entrants),staleEntries:entries(r.staleEntries)};
  });
  return {contract:value.contract,tournamentId:value.tournamentId,rounds};
}
export function entryDraft(round) {
  return {configured:round.configured, entries:round.entrants.map(e=>({key:e.key,bindingFingerprint:e.bindingFingerprint,entered:e.entered}))};
}
export function entrySaveRequest(round,draft,operationRequestId) {
  return {roundNumber:round.roundNumber,expectedRevision:round.revision,fieldFingerprint:round.fieldFingerprint,
    operationRequestId,configured:draft.configured,entries:draft.entries.map(e=>({...e,entered:draft.configured&&e.entered}))};
}
export function entriesChanged(round,draft){return JSON.stringify(entryDraft(round))!==JSON.stringify(draft);}
