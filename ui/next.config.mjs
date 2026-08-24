import path from "node:path";

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@/lib/customers/mock-repository$": path.resolve(
        process.cwd(),
        "lib/customers/api-repository.ts",
      ),
    };
    return config;
  },
};

export default nextConfig;
