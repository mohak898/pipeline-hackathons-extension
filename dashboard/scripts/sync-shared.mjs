/**
 * Copies the shared pure modules into the Chrome extension so both sides run
 * byte-identical dedup/extraction logic. Run after editing lib/shared/*.
 *   npm run sync-shared
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SHARED_FILES = ['canonical.js', 'extract.js'];
export const SRC_DIR = path.join(here, '..', 'lib', 'shared');
export const DEST_DIR = path.join(here, '..', '..', 'utils', 'shared');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(DEST_DIR, { recursive: true });
  for (const f of SHARED_FILES) {
    copyFileSync(path.join(SRC_DIR, f), path.join(DEST_DIR, f));
    console.log(`synced ${f} → utils/shared/${f}`);
  }
}
