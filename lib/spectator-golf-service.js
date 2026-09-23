import {publicMatchesGolf,publicMatchGolf,publicLeadersGolf,publicPlayerGolf,publicHistoryGolf} from './spectator-golf-projection.js';

export function publicGolfRequest(parts) {
  if(!Array.isArray(parts))return null;
  const [resource,id,...rest]=parts;
  if(rest.length)return null;
  if(['leaders','matches'].includes(resource)&&parts.length===1)return {resource};
  if(['match','player'].includes(resource)&&parts.length===2&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id))return {resource,id};
  if(resource==='history'&&parts.length===2&&/^(201[7-9]|202[0-6])$/.test(id))return {resource,id};
  return null;
}
export class PublicGolfNotFound extends Error {}
// Fixed read dependencies, not caller-selected RPCs. All caches are isolated
// public namespaces, bounded by count and bytes; no cookies/session partition.
export function createPublicGolfReader(reads,{now=Date.now}={}) {
  const cache=new Map(),pending=new Map();let bytes=0;
  async function cached(key,ttl,loader) {
    const old=cache.get(key);if(old&&old.until>now())return old.value;
    if(pending.has(key))return pending.get(key);
    if(pending.size>=32)throw Error('SPECTATOR_BUSY');
    const task=Promise.resolve().then(loader).then(value=>{
      const size=Buffer.byteLength(JSON.stringify(value));
      if(size>1048576)throw Error('SPECTATOR_UNAVAILABLE');
      const replaced=cache.get(key);if(replaced)bytes-=replaced.size;
      cache.delete(key);cache.set(key,{value,until:now()+ttl,size});bytes+=size;
      while(cache.size>48||bytes>8388608){const first=cache.keys().next().value;bytes-=cache.get(first).size;cache.delete(first);}
      return value;
    }).finally(()=>pending.delete(key));pending.set(key,task);return task;
  }
  return async parts=>{
    const request=publicGolfRequest(parts);if(!request)throw new PublicGolfNotFound();
    const {resource,id}=request;
    // Fresh fixed server capability/source validation precedes every public read.
    await reads.guard();
    if(resource==='matches') {
      const value=await cached('public-golf-v1:matches',15000,async()=>{const {raw,guide}=await reads.matches();return publicMatchesGolf(raw,guide);});
      return {contract:'bagger-public-golf-v1',resource,data:value};
    }
    if(resource==='history') {
      const value=await cached('public-golf-v1:history:'+id,id==='2026'?15000:60000,async()=>{
        const view=await reads.history(Number(id));
        if(Number(view?.year)!==Number(id))throw Error('SPECTATOR_UNAVAILABLE');
        return publicHistoryGolf(view);
      });
      return {contract:'bagger-public-golf-v1',resource,data:value};
    }
    if(resource==='leaders')return {contract:'bagger-public-golf-v1',resource,data:await cached('public-golf-v1:leaders',15000,async()=>{
      const core=await reads.core();
      if(String(core?.tournament?.tournament_id)!=='2026')throw Error('SPECTATOR_UNAVAILABLE');
      return publicLeadersGolf(core);
    })};
    const scope=await cached('public-golf-v1:scope',15000,async()=>{
      const raw=await reads.core();
      if(String(raw?.tournament?.tournament_id)!=='2026'||raw.players?.length>64||raw.matches?.length>48)throw Error('SPECTATOR_UNAVAILABLE');
      // Stable public golfer/match IDs only, never cache the upstream envelope.
      return {players:(raw.players||[]).map(p=>p.player_id),matches:(raw.matches||[]).map(r=>r.match?.match_id)};
    });
    if(resource==='match') {
      if(!scope.matches.includes(id))throw new PublicGolfNotFound();
      const value=await cached('public-golf-v1:match:'+id,15000,async()=>{
        const raw=await reads.match(id);
        if(raw?.tournament?.tournament_id!=='2026'||raw?.match?.match_id!==id)throw Error('SPECTATOR_UNAVAILABLE');
        return publicMatchGolf(raw);
      });
      return {contract:'bagger-public-golf-v1',resource,data:value};
    }
    if(!scope.players.includes(id))throw new PublicGolfNotFound();
    // Passport golf statistics may cache for a minute, but portrait policy must
    // revalidate on EVERY response (including cached career reads).
    const core=await reads.core();
    if(core?.tournament?.tournament_id!=='2026'||!core.players?.some(p=>p.player_id===id))throw new PublicGolfNotFound();
    const input=await reads.player(id,core);
    const portraits=await reads.portraits();
    const value=publicPlayerGolf(input,portraits);
    if(value.player.playerId!==id||value.currentTournament.tournamentId!=='2026')throw Error('SPECTATOR_UNAVAILABLE');
    return {contract:'bagger-public-golf-v1',resource,data:value};
  };
}
