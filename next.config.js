const isAndroidOffline = process.env.ANDROID_OFFLINE_BUILD === "1";

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: !isAndroidOffline,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development" || isAndroidOffline,
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  workboxOptions: {
    disableDevLogs: true,
    additionalManifestEntries: [
      { url: "/", revision: null },
      { url: "/login/", revision: null },
      { url: "/settings/", revision: null },
      { url: "/stats/", revision: null },
      { url: "/admin/users/", revision: null },
    ],
    runtimeCaching: [
      {
        urlPattern: ({ request }) => request.mode === "navigate",
        handler: "NetworkFirst",
        options: {
          cacheName: "pages",
          networkTimeoutSeconds: 4,
          expiration: { maxEntries: 32, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        urlPattern: ({ request }) =>
          ["script", "style", "font", "worker"].includes(request.destination),
        handler: "CacheFirst",
        options: {
          cacheName: "static-assets",
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        urlPattern: ({ request }) => request.destination === "image",
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "images",
          expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        urlPattern: /\/data\/.*\.geojson$/,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "app-data",
          cacheableResponse: { statuses: [0, 200] },
        },
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The Android build is a completely self-contained static export.  The
  // normal Vercel build keeps its existing server/middleware behaviour.
...(isAndroidOffline ? { output: "export", trailingSlash: true } : {}),
  images: {
    unoptimized: isAndroidOffline,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

module.exports = withPWA(nextConfig);
