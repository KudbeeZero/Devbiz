// Loads the browser game's DOM-free scripts into a bare vm context for headless tests.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');

export function loadKAR(files = ['util.js', 'sim.js'], localStorage = null) {
  const ctx = vm.createContext({ console, Math, window: { localStorage } });
  for (const f of files) vm.runInContext(readFileSync(resolve(SRC, f), 'utf8'), ctx, { filename: f });
  return vm.runInContext('KAR', ctx);
}
