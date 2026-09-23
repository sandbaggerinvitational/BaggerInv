import fields from '../contracts/spectator/public-golf-fields-v1.json' with {type:'json'};
import {mobilePublicMatchGolfData} from './mobile-v1-match-detail.js';
import {mobileLeadersGolfData,mobilePublicMatchesGolfData} from './mobile-v1-tournament-reads.js';
import {mobilePassportDataFromCanonical} from './mobile-v1-passport.js';
import {mobileHistoryDetailData} from './mobile-v1-history.js';
import {validatePortraitPolicy} from './mobile-portrait-policy.js';

// Frozen field trees, independently reviewed; participant schema growth cannot
// automatically enlarge the public surface. Primitive leaves never pass objects.
export function publicGolfAllowlist(resource, value) {
  if(!Object.hasOwn(fields,resource)) throw Error('SPECTATOR_UNAVAILABLE');
  function pick(rule, source, depth=0) {
    if(depth>32) throw Error('SPECTATOR_UNAVAILABLE');
    if(source===null)return null;
    if(rule===true){
      if(!['string','number','boolean'].includes(typeof source) ||
        (typeof source==='number'&&!Number.isFinite(source)) ||
        (typeof source==='string'&&source.length>2000)) throw Error('SPECTATOR_UNAVAILABLE');
      return source;
    }
    if(Array.isArray(rule)) {
      if(!Array.isArray(source)||source.length>4096) throw Error('SPECTATOR_UNAVAILABLE');
      return source.map(v=>pick(rule[0],v,depth+1));
    }
    if(!source||typeof source!=='object'||Array.isArray(source))throw Error('SPECTATOR_UNAVAILABLE');
    return Object.fromEntries(Object.entries(rule).filter(([key])=>Object.hasOwn(source,key))
      .map(([key,r])=>[key,pick(r,source[key],depth+1)]));
  }
  const result=pick(fields[resource],value);
  if(Buffer.byteLength(JSON.stringify(result))>1048576)throw Error('SPECTATOR_UNAVAILABLE');
  return result;
}
export function publicMatchGolf(raw) {
  return publicGolfAllowlist('match',mobilePublicMatchGolfData(raw));
}
export function publicLeadersGolf(core) {
  return publicGolfAllowlist('leaders',mobileLeadersGolfData(core));
}
export function publicPlayerGolf(input, portraits) {
  const policy=validatePortraitPolicy(portraits);
  const result=publicGolfAllowlist('player',mobilePassportDataFromCanonical(input));
  // Missing policy, as well as suppression, overrides any bundled image key.
  if(policy.players.find(p=>p.playerId===result.player.playerId)?.policy!=='ACTIVE')result.player.portraitAssetKey=null;
  return result;
}
export function publicHistoryGolf(view) {
  if(view?.source!=='supabase'||Number(view.year)<2017||Number(view.year)>2026)throw Error('SPECTATOR_UNAVAILABLE');
  const result=publicGolfAllowlist('history',mobileHistoryDetailData(view));
  // Awards are editorial content, so only existing named golf-performance honors
  // enter this surface. Arbitrary award text is not an implicit public grant.
  result.awards=result.awards.filter(a=>/^(sandbagger of (?:the )?year|points? champion|champion|mvp)$/i.test(a.title));
  return result;
}

export function publicMatchesGolf(raw, guide) {
  if(raw?.tournament?.tournament_id!=='2026')throw Error('SPECTATOR_UNAVAILABLE');
  return publicGolfAllowlist('matches',mobilePublicMatchesGolfData(raw,guide));
}
