import type { NextConfig } from 'next';

const backend = (process.env.PLANNING_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const config: NextConfig = {
  async rewrites() {
    // Vercel routes /planning-api directly to the backend service.
    if (process.env.VERCEL) return [];
    return [{ source: '/planning-api/:path*', destination: `${backend}/:path*` }];
  },
};
export default config;
