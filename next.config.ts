import type { NextConfig } from 'next';

// Inter-service requests use the runtime /planning-api route handler.
// Vercel service bindings are unavailable during this build-time configuration.
const config: NextConfig = {};
export default config;
