import { certificationRequested, requireCertificationResourceEnvironment } from "./lib/canonical-resource-registration.js";

// Validate the registered public/server pair before public Auth configuration
// is emitted into a browser bundle. This performs no remote request.
if (certificationRequested(process.env)) requireCertificationResourceEnvironment(process.env);

/** @type {import('next').NextConfig} */
const nextConfig={
  reactStrictMode:true,
  poweredByHeader:false,
  compress:true,
  async redirects(){
    return [{
      source:"/:path*",
      has:[{type:"host",value:"bagger-inv.vercel.app"}],
      destination:"https://baggerinv.com/:path*",
      permanent:true,
    }];
  },
};
export default nextConfig;
