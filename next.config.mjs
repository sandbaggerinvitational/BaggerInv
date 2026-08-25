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
