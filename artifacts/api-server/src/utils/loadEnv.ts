import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Auto-load environment variables from the workspace-root `.env` file.
 * Must be imported (and side-effect executed) BEFORE any module that reads
 * `process.env.*` at import time — DATABASE_URL, SESSION_SECRET, Cashfree
 * keys, etc.
 *
 * Resolution: this file ends up at one of two paths depending on whether the
 * api-server was bundled or run via tsx:
 *   - Bundled  → artifacts/api-server/dist/index.mjs       (3 levels deep)
 *   - tsx seed → artifacts/api-server/scripts/seed.ts      (3 levels deep)
 *   - tsx src  → artifacts/api-server/src/utils/loadEnv.ts (4 levels deep)
 * We try a few candidate paths and pick the first that exists.
 */
const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, "../../../.env"), // dist/, scripts/
  resolve(here, "../../../../.env"), // src/utils/
];

for (const path of candidates) {
  const result = loadDotenv({ path, quiet: true });
  if (!result.error) break;
}
