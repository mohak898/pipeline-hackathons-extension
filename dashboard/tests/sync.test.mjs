import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SHARED_FILES, SRC_DIR, DEST_DIR } from '../scripts/sync-shared.mjs';

test('extension copies of shared modules are identical (run `npm run sync-shared`)', () => {
  for (const f of SHARED_FILES) {
    const a = readFileSync(path.join(SRC_DIR, f), 'utf8');
    const b = readFileSync(path.join(DEST_DIR, f), 'utf8');
    assert.equal(b, a, `utils/shared/${f} is out of date`);
  }
});
