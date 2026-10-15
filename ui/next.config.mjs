const nextConfig = {
  // npm run build runs the complete ESLint + Oxlint gate before compilation.
  // Next15's ESLint-only integration cannot run the native half of that gate.
  eslint: { ignoreDuringBuilds: true },
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    const immutable = [
      { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      { key: "Access-Control-Allow-Origin", value: "*" },
      { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
    ];
    return [
      {
        source: "/sdk/tkid/1.0.0/tracekit-journey.min.js",
        headers: [...immutable, { key: "Content-Type", value: "application/javascript; charset=utf-8" }],
      },
      {
        source: "/sdk/tkid/1.0.0/manifest.json",
        headers: [...immutable, { key: "Content-Type", value: "application/json; charset=utf-8" }],
      },
      {
        source: "/sdk/tkid/1.1.0/tracekit.js",
        headers: [...immutable, { key: "Content-Type", value: "application/javascript; charset=utf-8" }],
      },
      {
        source: "/sdk/tkid/1.1.0/manifest.json",
        headers: [...immutable, { key: "Content-Type", value: "application/json; charset=utf-8" }],
      },
    ];
  },
};

export default nextConfig;
