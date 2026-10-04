/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  output: process.env.STATIC_EXPORT === "true" ? "export" : undefined,
  images: {
    unoptimized: true,
  },
}

export default nextConfig
