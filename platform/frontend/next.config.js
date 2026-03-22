/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.NODE_ENV === 'development' ? 'http://localhost:5001' : ''),
  },
  // Security: Hide detailed error messages in production
  productionBrowserSourceMaps: false,
  compress: true,
  poweredByHeader: false,
}

module.exports = nextConfig
