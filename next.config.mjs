/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ["fluent-ffmpeg", "ws"],
  },
  // Disable image optimization for local files
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
