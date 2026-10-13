import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Spotify redirect URI uses 127.0.0.1 while the dev server binds to localhost;
  // without this, Next's dev server rejects HMR and asset requests from that host.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
