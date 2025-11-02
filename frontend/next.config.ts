import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Remove the parent directory lockfile issue by being explicit about our project root
  // This is the simplest solution - no experimental features needed
};

export default nextConfig;
