import test from "node:test";
import assert from "node:assert/strict";

import nextConfig from "../next.config.mjs";

test("the direct Production Vercel hostname redirects to the canonical apex", async () => {
  const redirects = await nextConfig.redirects();
  assert.deepEqual(redirects, [{
    source: "/:path*",
    has: [{ type: "host", value: "bagger-inv.vercel.app" }],
    destination: "https://baggerinv.com/:path*",
    permanent: true,
  }]);
  assert.doesNotMatch(JSON.stringify(redirects), /bagger-inv-git-|\.vercel\.app\*|www\.baggerinv\.com/);
});
