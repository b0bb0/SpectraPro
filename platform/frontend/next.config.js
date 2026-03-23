/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Use 'standalone' for Docker; omit for Vercel (auto-detected)
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  // Security: Hide detailed error messages in production
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
}

module.exports = nextConfig
