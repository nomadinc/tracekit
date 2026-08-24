import path from "node:path";

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack(config) {
    const apiRepository = path.resolve(
      process.cwd(),
      "lib/customers/api-repository.ts",
    );
    const mockRepository = path.resolve(
      process.cwd(),
      "lib/customers/mock-repository.ts",
    );

    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      [mockRepository]: apiRepository,
      "@/lib/customers/mock-repository": apiRepository,
    };
    return config;
  },
};

export default nextConfig;
