import path from "node:path";

const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack(config) {
    const customerApiRepository = path.resolve(
      process.cwd(),
      "lib/customers/api-repository.ts",
    );
    const customerMockRepository = path.resolve(
      process.cwd(),
      "lib/customers/mock-repository.ts",
    );
    const orderApiRepository = path.resolve(
      process.cwd(),
      "lib/orders/api-repository.ts",
    );
    const orderMockRepository = path.resolve(
      process.cwd(),
      "lib/orders/mock-repository.ts",
    );

    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      [customerMockRepository]: customerApiRepository,
      "@/lib/customers/mock-repository": customerApiRepository,
      [orderMockRepository]: orderApiRepository,
      "@/lib/orders/mock-repository": orderApiRepository,
    };
    return config;
  },
};

export default nextConfig;
