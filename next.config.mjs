import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // next-pwa injects a webpack config; tell Next.js 16+ that this is
  // intentional so Turbopack does not error out on the webpack key.
  turbopack: {},
};

export default withPWA(nextConfig);
