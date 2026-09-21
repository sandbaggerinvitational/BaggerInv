import {createParticipantPhoneLoginHandler} from "../../../../../../../lib/participant-phone-login-handler.js";
import { NextResponse } from "next/server.js";
import { mobileApiErrorResult } from "../../../../../../../lib/mobile-api-v1.js";
import { requireMobileNativeConfiguration } from "../../../../../../../lib/mobile-native-admission.js";
import { readMobileNativeAuthJson, requestMobileNativeOtp } from "../../../../../../../lib/mobile-native-auth.js";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let result;
  try {
    requireMobileNativeConfiguration("auth", { request });
    const input = await readMobileNativeAuthJson(request);
    if (input?.method === 'phone') {
      if (Object.keys(input).some(k=>!['method','identifier','captchaToken'].includes(k))) throw Object.assign(Error('INVALID_AUTH_REQUEST'),{code:'INVALID_AUTH_REQUEST'});
      return await createParticipantPhoneLoginHandler({native:true}).POST(request,{action:'request',phone:input.identifier,captchaToken:input.captchaToken});
    }
    result = await requestMobileNativeOtp({ request, input });
  } catch (error) {
    result = mobileApiErrorResult(error);
  }
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
