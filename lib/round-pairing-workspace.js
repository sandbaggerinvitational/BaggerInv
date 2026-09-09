import { buildTournamentSetupParticipantSlots, canonicalTournamentSetupParticipants } from './production-tournament-setup-contract.js';

export const pairingKey = (participants) => JSON.stringify((participants || []).map(p => ({
  playerId: p.playerId, teamSide: p.teamSide, playerSlot: p.playerSlot,
})).sort((a,b) => a.teamSide-b.teamSide || a.playerSlot-b.playerSlot));
export const matchMetadata = m => ({ courseId:m.courseId, tee:m.tee, teeTime:(m.teeTime || '').slice(0,5) });
const metadataKey = m => JSON.stringify(m);
export function createPairingDraft(match) {
  const participants = buildTournamentSetupParticipantSlots(match.participants,match.format);
  return { participants, baseline:pairingKey(participants), context:match.contextFingerprint,
    metadata:matchMetadata(match), savedMetadata:matchMetadata(match), conflict:false, needsReview:false };
}
export const pairingDirty = d => pairingKey(d.participants)!==d.baseline;
export const detailsDirty = d => metadataKey(d.metadata)!==metadataKey(d.savedMetadata);

// Authority is merged underneath local drafts, never copied over dirty inputs.
export function mergePairingDrafts(drafts,matches,{ownDetailsId}={}) {
  const next={...drafts};
  for (const match of matches) {
    const incoming=createPairingDraft(match), old=drafts[match.matchId];
    if (!old) { next[match.matchId]=incoming; continue; }
    const pending=pairingDirty(old), metadataPending=detailsDirty(old);
    const alreadySaved=pairingKey(old.participants)===incoming.baseline;
    const pendingDetails=metadataPending && metadataKey(old.metadata)!==metadataKey(incoming.metadata);
    const contextChanged=old.context!==incoming.context;
    const ownCompatible=ownDetailsId===match.matchId && old.savedMetadata.courseId===incoming.savedMetadata.courseId && old.savedMetadata.tee===incoming.savedMetadata.tee;
    next[match.matchId]={...incoming,
      participants:pending&&!alreadySaved ? old.participants : incoming.participants,
      metadata:pendingDetails ? old.metadata : incoming.metadata,
      conflict:((pending&&!alreadySaved)||pendingDetails) && (old.conflict || old.baseline!==incoming.baseline || (contextChanged&&!ownCompatible)),
      needsReview:pending&&!alreadySaved,
    };
  }
  return next;
}

export function validatePairingWorkspace(data,drafts,roundNumber,{fullRound=true,matchId}={}) {
  const roundMatches=data.matches.filter(m=>m.roundNumber===roundNumber);
  const matches=matchId ? roundMatches.filter(m=>m.matchId===matchId) : roundMatches;
  const roster=data.roster.filter(p=>p.membershipStatus==='ACTIVE');
  const byId=new Map(roster.map(p=>[p.playerId,p]));
  const errors=[], assignments=[], seen=new Map();
  let changed=0, changedAssignments=0;
  for(const match of matches) {
    const d=drafts[match.matchId] || createPairingDraft(match);
    if(pairingDirty(d)) { changed++; changedAssignments+=d.participants.filter((p,i)=>p.playerId!==buildTournamentSetupParticipantSlots(match.participants,match.format)[i]?.playerId).length; }
    if(d.conflict) errors.push(`${match.matchId}: Saved context changed concurrently. Resolve this draft before saving.`);
    if(detailsDirty(d)||!match.detailsManaged) errors.push(`${match.matchId}: Save Match Details before committing pairings. Your Player selections will be preserved.`);
    if(match.locked||match.accessActive||match.scoringLocked||match.scoredHoles||match.status!=='UPCOMING') errors.push(`${match.matchId}: Match is started, locked, or has active scoring access.`);
    try { canonicalTournamentSetupParticipants(d.participants,match.format); }
    catch(error) { errors.push(`${match.matchId}: ${error.message}`); }
    for(const p of d.participants) {
      if(!p.playerId) { errors.push(`${match.matchId}: Team ${p.teamSide}, slot ${p.playerSlot} is empty.`); continue; }
      const player=byId.get(p.playerId);
      if(!player||player.teamSide!==p.teamSide) errors.push(`${match.matchId}: ${p.playerId} is not an active member of the selected team.`);
      if(!player?.handicapRevisionId || player.handicapRevisionId!==data.approvedHandicapRevisionId || player.tournamentHandicap==='') errors.push(`${match.matchId}: ${p.playerId} needs current approved handicap coverage.`);
      if(seen.has(p.playerId)) errors.push(`${match.matchId}: ${p.playerId} is duplicated with ${seen.get(p.playerId)}.`);
      seen.set(p.playerId,match.matchId);
    }
    assignments.push({matchId:match.matchId,format:match.format,participants:d.participants});
  }
  if(!fullRound) {
    for(const other of roundMatches.filter(m=>m.matchId!==matchId)) for(const p of other.participants) {
      if(seen.has(p.playerId)) errors.push(`${matchId}: ${p.playerId} is already saved in ${other.matchId}. Use a complete round review for exchanges.`);
    }
  }
  const missing=roster.filter(p=>!seen.has(p.playerId));
  if(fullRound && missing.length) errors.push(`Missing Players: ${missing.map(p=>p.playerId).join(', ')}.`);
  return {errors:[...new Set(errors)],assignments,changed,changedAssignments,coverage:seen.size,total:roster.length,
    missing:missing.length,duplicates:assignments.flatMap(m=>m.participants).filter(p=>p.playerId).length-seen.size};
}
