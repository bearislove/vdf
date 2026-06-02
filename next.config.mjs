/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow serving storage files
  experimental: {
    serverComponentsExternalPackages: ["fluent-ffmpeg", "ws"],
  },
  // Disable image optimization for local files
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
