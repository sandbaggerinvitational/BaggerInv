import 'server-only';
import { readLeaderboardsCoreView } from './leaderboards-core-supabase.js';
import { readGuideProjection } from './guide-supabase.js';
import { spectatorTournamentProjection, spectatorHistoryProjection } from './spectator-projection.js';
import { requireTournamentReadSource } from './tournament-read-source.js';
import { readPublishedOddsView } from './published-odds-supabase.js';
import { mobileProductionOddsView, mobileOddsWithCanonicalTeams, mobileOddsDataFromView } from './mobile-v1-odds.js';

function data(read) {
  if (read?.payload?.ok !== true || !read.payload.data) throw new Error('SPECTATOR_UNAVAILABLE');
  return read.payload.data;
}
// Per-process coalescing. No user-dependent cache, stale-on-error, or unbounded keys.
const cache = new Map();
const pending = new Map();
async function boundedRead(key, ttl, loader) {
  const cached = cache.get(key);
  if (cached?.expires > Date.now()) return cached.value;
  if (pending.has(key)) return pending.get(key);
  const task = loader().then(value => {
    cache.set(key,{value,expires:Date.now()+ttl});
    if (cache.size>6) cache.delete(cache.keys().next().value);
    return value;
  }).finally(()=>pending.delete(key));
  pending.set(key,task);
  return task;
}
export async function readFollowingResource(resource, { env=process.env }={}) {
  if (env.SPECTATOR_PWA_ENABLED !== 'true' || env.VERCEL_ENV !== 'production' ||
      !['tournament','odds','history','records'].includes(resource)) throw new Error('SPECTATOR_UNAVAILABLE');
  const source=requireTournamentReadSource(env);
  if(source.resolved!=='supabase'||source.productionCutover?.handled!==true) throw new Error('SPECTATOR_UNAVAILABLE');
  const deployment=String(env.VERCEL_DEPLOYMENT_ID||env.VERCEL_GIT_COMMIT_SHA||'current');
  const coreRead=()=>readLeaderboardsCoreView('2026',{env}).then(data);
  if(resource==='records')return boundedRead(deployment+':records',60000,async()=>{
    const {loadSecondaryHistoryModel}=await import('./secondary-history-service.js');
    const {buildCanonicalRecordHolderAuthority}=await import('./record-holder-authority.js');
    const {getLeaderboardSlugs,getLeaderboardFromRecords}=await import('./leaderboards.js');
    const {mobileRecordsData}=await import('./mobile-v1-records.js');
    const model=await loadSecondaryHistoryModel({env});
    const records=model.calculations.getRecords();
    const playerNames=Object.fromEntries(records.points.map(({player})=>[player['Player ID'],player['Display Name']]));
    return {contract:'bagger-spectator-records-v1',...mobileRecordsData(buildCanonicalRecordHolderAuthority({
      officialLeaderboards:getLeaderboardSlugs().map(slug=>getLeaderboardFromRecords(slug,records)),
      scorecards:model.scorecardAnalytics.scorecards,playerNames,ghostMatchExclusions:model.scorecardAnalytics.ghostMatchExclusions,
    }))};
  });
  if(resource==='history') {
    return boundedRead(deployment+':history',60000,async()=>{
      const {loadCompletedHistoryYears}=await import('./completed-history-service.js');
      const {loadHistory2026View}=await import('./history-2026-service.js');
      const [completed,current]=await Promise.all([loadCompletedHistoryYears({env}),loadHistory2026View({env})]);
      return spectatorHistoryProjection({views:[current,...completed.views]});
    });
  }
  const core=await boundedRead(deployment+':core',15000,coreRead);
  if(resource==='odds') {
    // Read the publication pointer on every request: withdrawal must override cached snapshots.
    const view=data(await readPublishedOddsView({tournamentId:'2026'},{env}));
    const published=mobileProductionOddsView(view,{tournamentId:'2026'});
    return {contract:'bagger-spectator-odds-v1',...mobileOddsDataFromView(
      published.publication.state==='PUBLISHED'?mobileOddsWithCanonicalTeams(published,core,{tournamentId:'2026'}):published)};
  }
  const guide=await boundedRead(deployment+':guide',15000,()=>readGuideProjection({tournamentId:'2026',env}).then(data));
  // Policy always re-read; a 15-second core cache must never preserve a suppressed portrait.
  const {createProductionParticipantAuthAdminClient}=await import('./production-participant-auth-enrollment.js');
  const {data:portraits,error}=await createProductionParticipantAuthAdminClient(env).rpc('read_player_portrait_policy_v1');
  if(error) throw new Error('SPECTATOR_UNAVAILABLE');
  return spectatorTournamentProjection({core,guide,portraits});
}
