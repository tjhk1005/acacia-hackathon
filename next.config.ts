import type { NextConfig } from 'next';

const backend = (process.env.PLANNING_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const config: NextConfig = {
  async rewrites() {
    return [{ source: '/planning-api/:path*', destination: `${backend}/:path*` }];
  },
};
export default config;
