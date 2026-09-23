import 'server-only';
import {createPublicGolfReader} from './spectator-golf-service.js';
import {requireTournamentReadSource} from './tournament-read-source.js';
import {readLeaderboardsCoreView,leaderboardsCoreDataFromSupabaseView} from './leaderboards-core-supabase.js';
import {readTournamentLiveView} from './tournament-live-supabase.js';
import {readGuideProjection} from './guide-supabase.js';
import {readGameCenterView} from './game-center-supabase.js';
import {loadSecondaryHistoryModel} from './secondary-history-service.js';
import {getPlayerDrafts} from './draft.js';
import {getLeaderboardSlugs,getLeaderboardFromRecords} from './leaderboards.js';
import {loadCompletedHistoryView,loadCompletedHistoryYears} from './completed-history-service.js';
import {loadHistory2026View} from './history-2026-service.js';
import {createProductionParticipantAuthAdminClient} from './production-participant-auth-enrollment.js';

const payload=read=>{if(read?.payload?.ok!==true||!read.payload.data)throw Error('SPECTATOR_UNAVAILABLE');return read.payload.data;};
// One deployment-scoped, fixed server instance; no user-controlled credentials,
// auth creation or participant route bypass. No anonymous database grant added.
let instance,scope;
export async function readPublicGolf(parts,{env=process.env}={}) {
  function guard(){
    if(env.SPECTATOR_PWA_ENABLED!=='true'||env.VERCEL_ENV!=='production')throw Error('SPECTATOR_UNAVAILABLE');
    const source=requireTournamentReadSource(env);
    if(source.resolved!=='supabase'||source.productionCutover?.handled!==true)throw Error('SPECTATOR_UNAVAILABLE');
  }
  guard();
  const key=String(env.VERCEL_DEPLOYMENT_ID||env.VERCEL_GIT_COMMIT_SHA||'current');
  if(!instance||scope!==key){
    scope=key;
    // Only final allowlisted DTOs enter the public reader's cache. Upstream
    // authority objects live for this request, never in a spectator cache.
    const core=()=>readLeaderboardsCoreView('2026',{env}).then(payload);
    instance=createPublicGolfReader({guard,core,
      archive:async()=>{const [past,current]=await Promise.all([loadCompletedHistoryYears({env}),loadHistory2026View({env,tournamentId:'2026'})]);return [current,...past.views];},
      guide:()=>readGuideProjection({tournamentId:'2026',env}),
      matches:async()=>{const [raw,guide]=await Promise.all([readTournamentLiveView('2026',{env}).then(payload),readGuideProjection({tournamentId:'2026',surface:'course',env})]);return {raw,guide};},
      match:async id=>{
        const raw=payload(await readGameCenterView(id,{env,tournamentId:'2026'}));
        return {...raw,ok:true,navigation:{round_match_index:raw.navigation?.position?.index,
          round_match_count:raw.navigation?.position?.total,previous_match_id:raw.navigation?.previous?.id??null,next_match_id:raw.navigation?.next?.id??null}};
      },
      history:year=>year===2026?loadHistory2026View({env,tournamentId:'2026'}):loadCompletedHistoryView({env,year}),
      player:async (id,raw)=>{
        const secondaryHistory=await loadSecondaryHistoryModel({env});
        const records=secondaryHistory.calculations.getRecords();
        return {identity:{playerId:id,tournamentId:'2026'},secondaryHistory,
          leaders:leaderboardsCoreDataFromSupabaseView(raw,{includeCurrentMatchLifecycle:true}),
          drafts:await getPlayerDrafts(id,{env,history:secondaryHistory.calculations}),
          officialLeaderboards:getLeaderboardSlugs().map(slug=>getLeaderboardFromRecords(slug,records))};
      },
      portraits:async()=>{const {data,error}=await createProductionParticipantAuthAdminClient(env).rpc('read_player_portrait_policy_v1');if(error)throw Error('SPECTATOR_UNAVAILABLE');return data;},
    });
  }
  return instance(parts);
}
