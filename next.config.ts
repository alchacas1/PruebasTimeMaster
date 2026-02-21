import type { NextConfig } from "next";
import fs from 'fs';
import path from 'path';

const useStaticExport = process.env.NEXT_ENABLE_STATIC_EXPORT === 'true';

// NOTE: `turbopack.root` helps Next.js/Turbopack detect the correct project root
// when there are multiple lockfiles (e.g. monorepo-style layout). This avoids
// the warning about inferring the workspace root and ensures builds/logging
// work from the intended project directory.
const nextConfig: NextConfig & { turbopack?: { root?: string } } = {
  turbopack: {
    // Use absolute path to this project's directory (next.config.ts resides here).
    root: path.resolve(__dirname),
  },
  /* config options here */
  ...(useStaticExport ? { output: 'export', trailingSlash: true, distDir: 'out' } : {}),
  // Optimize CSS in production
  experimental: {
    optimizeCss: true,
  },
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
  // Ensure environment variables are available at build time
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_DATABASE_URL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  },
  images: {
    unoptimized: false,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/v0/b/**',
      },
    ],
  },
  // Dynamically generate Cache-Control headers for files in `public/`
  async headers() {
    try {
      const publicDir = path.join(process.cwd(), 'public');
      const entries: Array<{ source: string; headers: { key: string; value: string }[] }> = [];

      function walk(dir: string, base = '') {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const it of items) {
          const rel = path.posix.join(base, it.name);
          const abs = path.join(dir, it.name);
          if (it.isDirectory()) {
            walk(abs, rel);
            continue;
          }

          const name = it.name.toLowerCase();
          let cache = 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800';

          // Specific long-term cache for the Delikor footer logo.
          // If the image ever changes, rename the file to bust caches.
          if (name === 'delikor.png') {
            cache = 'public, max-age=31536000, immutable, s-maxage=31536000';
          }

          if (/favicon|android-chrome|apple-touch|mask-icon|mstile|logo/.test(name)) {
            cache = 'public, max-age=31536000, immutable, s-maxage=31536000';
          } else if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.avif') || name.endsWith('.svg')) {
            cache = 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800';
          } else if (name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.ogg')) {
            cache = 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800';
          } else if (name.endsWith('.webmanifest') || name.endsWith('.json')) {
            cache = 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800';
          } else if (name.endsWith('.ico')) {
            cache = 'public, max-age=31536000, immutable, s-maxage=31536000';
          }

          entries.push({
            source: `/${rel}`,
            headers: [{ key: 'Cache-Control', value: cache }]
          });
        }
      }

      if (fs.existsSync(publicDir)) walk(publicDir);

      if (entries.length === 0) {
        return [
          { source: '/favicon-32x32.png', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable, s-maxage=31536000' }] },
          { source: '/site.webmanifest', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800' }] }
        ];
      }

      return entries;
    } catch (err) {
      console.error('Error generating headers for public files:', err);
      return [
        { source: '/favicon-32x32.png', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable, s-maxage=31536000' }] },
        { source: '/site.webmanifest', headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800' }] }
      ];
    }
  }
};

export default nextConfig;
