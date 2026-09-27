// Site filing-system check: every BEGIN marker has a matching END, ids are unique and in
// order, nothing nests, and the directory in AGENTS.md lists exactly the sections on disk.
//   node ops/check-filing.mjs          → check (exit 1 on any problem)
//   node ops/check-filing.mjs --print  → print the directory table for AGENTS.md
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['index.html', 'assets/site/site.css', 'assets/site/site.js', 'assets/site/agent.js', 'assets/site/store.js'];
const MARK = /(BEGIN|END) (§\d{2}|\[[A-Z]\d{2}\]) (.+?) ═+/;

const problems = [], sections = [];
for (const f of FILES) {
  const lines = readFileSync(resolve(ROOT, f), 'utf8').split('\n');
  let open = null, last = 0;
  lines.forEach((l, i) => {
    const m = l.match(MARK); if (!m) return;
    const [, kind, raw, title] = m, id = raw.replace(/[[\]]/g, ''), at = f + ':' + (i + 1);
    if (kind === 'BEGIN') {
      if (open) problems.push(`${at} BEGIN ${id} while ${open.id} is still open`);
      const n = +id.slice(1);
      if (n !== last + 1) problems.push(`${at} ${id} out of sequence (expected ${id[0]}${String(last + 1).padStart(2, '0')})`);
      last = n; open = { id, title, line: i + 1 };
    } else {
      if (!open || open.id !== id) problems.push(`${at} END ${id} without matching BEGIN`);
      else if (open.title !== title) problems.push(`${at} END ${id} title differs from BEGIN`);
      else sections.push({ file: f, id, title });
      open = null;
    }
  });
  if (open) problems.push(`${f}: ${open.id} never closed`);
}

if (process.argv.includes('--print')) {
  console.log('| Id | File | Section |\n|---|---|---|');
  for (const s of sections) console.log(`| \`${s.id}\` | \`${s.file}\` | ${s.title} |`);
  process.exit(0);
}

const agents = readFileSync(resolve(ROOT, 'AGENTS.md'), 'utf8');
const listed = new Set([...agents.matchAll(/^\| `([§A-Z]\d{2})` \| `([^`]+)` \| (.+?) \|/gm)].map(m => m[1] + '|' + m[2] + '|' + m[3]));
const onDisk = new Set(sections.map(s => s.id + '|' + s.file + '|' + s.title));
for (const k of onDisk) if (!listed.has(k)) problems.push('AGENTS.md directory missing: ' + k.replace(/\|/g, ' · '));
for (const k of listed) if (!onDisk.has(k)) problems.push('AGENTS.md directory lists a section that does not exist: ' + k.replace(/\|/g, ' · '));

if (problems.length) { console.error('Filing problems:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`filing ok — ${sections.length} sections across ${FILES.length} files, directory in sync`);
