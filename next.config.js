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
      // The browser requests these directly (the <link rel="manifest">
      // tag, the PWA install icon) outside of any page navigation, so
      // without an explicit entry here they were never guaranteed to be
      // in the precache — which is exactly what showed up as a raw
      // ERR_INTERNET_DISCONNECTED for /manifest.json in the console the
      // moment the app was opened offline.
      { url: "/manifest.json", revision: null },
      { url: "/icons/icon.svg", revision: null },
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
      {
        // THE missing piece that made "Download for offline" in Settings a
        // no-op: without a runtime-caching route matching the tile
        // servers, the service worker never intercepted (or stored) a
        // single tile request — so the download button's fetch() calls
        // just hit the network and threw the response away, and the map
        // still needed a live connection every time, no matter how many
        // times someone hit "Download". This is what actually makes tiles
        // land in (and get served back out of) the "map-tiles" cache,
        // whether they arrive via normal panning or the offline-download
        // button in Settings. Cross-origin tile responses come back opaque
        // (status 0), so status 0 has to be explicitly cacheable here.
        urlPattern: ({ url }) =>
          url.hostname === "server.arcgisonline.com" || url.hostname.endsWith("tile.openstreetmap.org"),
        handler: "CacheFirst",
        options: {
          cacheName: "map-tiles",
          expiration: { maxEntries: 20000, maxAgeSeconds: 180 * 24 * 60 * 60 },
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
