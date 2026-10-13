import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Spotify redirect URI uses 127.0.0.1 while the dev server binds to localhost;
  // without this, Next's dev server rejects HMR and asset requests from that host.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // Headless Chrome for the PDF route. @sparticuz/chromium locates its binary
  // relative to its own file, so it must not be bundled/relocated, and the
  // compressed binary in bin/ must be traced into the function.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/songbook": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
