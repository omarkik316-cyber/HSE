import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const middleware = path.join(root, "middleware.ts");
const disabled = path.join(root, ".middleware.android-offline.ts");

function move(a, b) {
  if (fs.existsSync(a)) fs.renameSync(a, b);
}

try {
  // Next.js static export cannot include a Next middleware function. The
  // browser Supabase client is still used for auth/data; this only removes
  // the server-side session refresh layer from the packaged APK build.
  move(middleware, disabled);

  const env = { ...process.env, ANDROID_OFFLINE_BUILD: "1" };
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "build"], {
    stdio: "inherit",
    env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);

  const out = path.join(root, "out");
  if (!fs.existsSync(out)) throw new Error("Next did not create the out folder.");
  console.log(`\nAndroid offline web build ready: ${out}`);
} finally {
  if (fs.existsSync(disabled)) move(disabled, middleware);
}
