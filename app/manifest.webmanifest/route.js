import webAppManifest from "../../lib/web-app-manifest.js";

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(webAppManifest()), {
    headers: {
      "cache-control": "public, max-age=0, s-maxage=3600",
      "content-type": "application/manifest+json; charset=utf-8",
    },
  });
}
