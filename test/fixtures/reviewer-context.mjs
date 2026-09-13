import {canonicalReviewerContext} from '../../lib/mobile-reviewer-identity.js';
export function reviewerIdentity() {
 const authUserId='60000000-0000-4000-8000-000000000001',tournamentId='2026';
 const context=canonicalReviewerContext({kind:'observer',authUserId,tournament:{id:tournamentId,name:'Fixture',year:2026},active:true,contextRevision:1,expiresAt:new Date(Date.now()+3600000).toISOString(),admin:false,scoring:false},{authUserId,tournamentId});
 return {kind:'observer',authUserId,tournamentId,context};
}
