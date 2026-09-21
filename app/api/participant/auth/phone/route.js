import {createParticipantPhoneLoginHandler} from "../../../../../lib/participant-phone-login-handler.js";
export const dynamic="force-dynamic";
export async function GET(request){return createParticipantPhoneLoginHandler().GET(request);}
export async function POST(request){return createParticipantPhoneLoginHandler().POST(request);}
