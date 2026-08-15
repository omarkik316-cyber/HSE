#!/usr/bin/env node
// Produces a fully static export of the site (in `out/`) for bundling
// straight into the Android app's assets, so the app shell can open with
// zero network on first launch — this is the *guaranteed* offline path,
// independent of whatever the site's own Service Worker manages to do
// inside WebView (Android WebView has real, documented reliability gaps
// with Service Workers surviving app restarts, so it's used here only as
// a bonus for browser/desktop PWA installs, not relied on for the APK).
//
// Next.js refuses to build at all if `middleware.ts` exists alongside
// `output: "export"` ("Middleware cannot be used with output: export").
// This app's middleware only refreshes the Supabase auth cookie for
// server-rendered requests — irrelevant for a locally-bundled static
// shell, since every page here is a "use client" component that manages
// its own Supabase session in the browser. So for this build only, the
// file is moved out of the way and always restored afterward (even if the
// build fails) — `npm run build` (the real Vercel deployment) never goes
// through this script and keeps using middleware exactly as before.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const middlewarePath = path.join(root, "middleware.ts");
const backupPath = path.join(root, "middleware.ts.apk-build-bak");

let moved = false;

try {
  if (fs.existsSync(middlewarePath)) {
    fs.renameSync(middlewarePath, backupPath);
    moved = true;
  }

  execSync("next build", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, BUILD_TARGET: "apk" },
  });

  console.log("\nStatic export ready in ./out — copy its contents into");
  console.log("HSEApp_final/app/src/main/assets/www/ and rebuild the APK.\n");
} finally {
  if (moved) {
    fs.renameSync(backupPath, middlewarePath);
  }
}
