import type { NextConfig } from 'next';
import { planningBackendOrigin } from './lib/deployment.ts';
import demoBackend from './deployment/demo-backend.json';

const backend = planningBackendOrigin(process.env.PLANNING_API_URL,process.env.VERCEL==='1',demoBackend.origin);
const config: NextConfig = {
  async rewrites() {
    return [{ source: '/planning-api/:path*', destination: `${backend}/:path*` }];
  },
};
export default config;
