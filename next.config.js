const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      '/api/invoices/**/*': ['./assets/fonts/*', './public/nfdr-logo.png'],
      '/api/invoices': ['./assets/fonts/*', './public/nfdr-logo.png'],
      '/api/tracking/*/invoice': ['./assets/fonts/*', './public/nfdr-logo.png'],
      '/api/email/send': ['./assets/fonts/*', './public/nfdr-logo.png'],
      '/api/jobs/send-collection-sms': ['./assets/fonts/*', './public/nfdr-logo.png'],
      '/api/tracking/*/diagnostic-reports': ['./assets/fonts/*'],
      '/api/repair/*/diagnostic-reports': ['./assets/fonts/*'],
    },
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
