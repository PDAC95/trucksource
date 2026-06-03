import { initBotId } from "botid/client/core";

// Vercel BotID — invisible, zero-friction bot protection in front of the OTP send
// path. The /verify wizard (Plan 04) is the route that invokes the sendOtp Server
// Action; registering its POST here lets checkBotId() in lib/actions/verify.ts
// score the request before any paid Twilio call. (Enforcement is production-only;
// isBot is always false in local dev unless developmentOptions is set.)
initBotId({
  protect: [{ path: "/verify", method: "POST" }],
});
