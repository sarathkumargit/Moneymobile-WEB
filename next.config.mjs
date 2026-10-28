/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Smaller responses and no version fingerprint in headers.
  poweredByHeader: false,
  compress: true,
  // Strip console.log from production bundles (keeps error/warn for server-side migration notices).
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // Tree-shake icon imports so only the icons actually used ship to the browser
    // (lucide-react is imported in ~47 files — this noticeably shrinks the client JS).
    optimizePackageImports: ["lucide-react"],
    // Bundle the phone setup kit (APK + scripts) with the download routes, so "Install App"
    // works on a serverless host like Vercel where only referenced files are deployed.
    outputFileTracingIncludes: {
      "/api/setup-kit/**": ["./setup-kit/**/*"],
    },
  },
};
export default nextConfig;
