import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image.
  output: 'standalone',
  // Trace files from this folder only (a lockfile higher up must not change the bundle layout).
  outputFileTracingRoot: path.resolve(__dirname),
  poweredByHeader: false,
};

export default nextConfig;
