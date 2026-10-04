// Loads the browser game scripts into a bare vm context (no DOM) so the physics,
// level data and world rules can be tested and solved headlessly.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');

export function loadKAB(files = ['util.js', 'physics.js', 'levels.js', 'world.js']) {
  const ctx = vm.createContext({ console, Math, window: { localStorage: null } });
  for (const f of files) vm.runInContext(readFileSync(resolve(SRC, f), 'utf8'), ctx, { filename: f });
  return vm.runInContext('KAB', ctx);
}
