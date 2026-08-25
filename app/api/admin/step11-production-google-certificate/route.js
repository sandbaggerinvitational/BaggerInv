// Some browser privacy filters block paths containing the literal "metadata"
// before a request reaches the application. Keep one equivalent certificate
// route so the Director-authenticated Step 11 read can be exercised in-browser.
export {
  dynamic,
  maxDuration,
  GET,
} from "../step11-production-google-metadata/route.js";
