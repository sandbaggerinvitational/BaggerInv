export const snapshot = {
  year:2026, phase:'Pre-Tournament', iterations:25000, phaseOrder:0,
  publishedAt:'2026-09-10T23:53:17.742Z', totalPointsAvailable:72,
  engineVersion:'tournament-odds.js:odds-v3-nassau-full-precision-rank',
  publicationContractVersion:'odds-publication-v3-full-precision-rank',
  deterministicSeed:'2026|Pre-Tournament|odds-v2-nassau',
  teams:[{side:1,name:'Alpha',probability:54.1,rawProbability:54.052,expectedPoints:36.58,americanOdds:'-118'}, {side:2,name:'Bravo',probability:45.9,rawProbability:45.948,expectedPoints:35.42,americanOdds:'+118'}],
  players:Array.from({length:24},(_,i)=>({id:`P${i+1}`,name:`Player ${i+1}`,rank:i+1,teamSide:i%2+1,probability:4.2,rawProbability:100/24,expectedPoints:3,expectedRecord:'1.3-1.3-0.4',averageFinish:6,americanOdds:'+2300'})),
};
export function verifiedFixture(result = snapshot, audit = {}) {
  return {snapshot:result,isolation:{publicationEligible:true},alreadyPublished:false,job:{
    job_id:audit.jobId || 'a'.repeat(64),phase:result.phase,total_iterations:25000,status:'SUCCEEDED',publication_status:'READY',
    input_fingerprint:audit.inputFingerprint || 'b'.repeat(64), result_fingerprint:audit.resultFingerprint || 'c'.repeat(64),
    production_deployment_commit:audit.deploymentCommit || 'd'.repeat(40),completed_at:audit.completedAt || '2026-09-10T23:54:17.938218Z',
    source_revision:{configuration_revision:2,effective_settings_fingerprint:'e'.repeat(64)},
    input_snapshot:{metadata:{pairingFingerprint:'f'.repeat(64),productionPairingEvidence:{sequence:[1,2,3].flatMap(round=>Array.from({length:round===3?12:6},(_,i)=>({round_number:round,match_id:`2026-R${round}-${i+1}`,participants:round===3?[]:[{},{},{},{}]})))}}},
  }};
}
