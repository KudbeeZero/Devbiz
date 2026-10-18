// Builds the recorded sound effects from CC0 sources into one small sprite the game loads once:
//   assets/sfx.mp3 (mono, all clips end to end with silence between) + src/sfx.js (where each clip sits).
//   node games/kudbee-archery/tools/sfx-build.mjs   (needs curl, unzip and ffmpeg; downloads to the OS temp dir)
// After a rebuild bump V below and the cache name in sw.js, so phones that play offline pick up the new sprite.
// Every source is CC0 (public domain) - see assets/SFX_CREDITS.md. Each clip is cut, faded, made mono and
// peak-levelled to -1 dB so the game's mix (src/audio.js) sets the loudness, not the recording.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), GAME = resolve(HERE, '..'), SRC = join(tmpdir(), 'kar-sfx-src');
const RATE = 44100, GAP = 0.25, V = 1;

const PACKS = {
  impact: 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
  rpg: 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip',
  battle: 'https://opengameart.org/sites/default/files/battle_sound_effects_0.zip',
  swishes: 'https://opengameart.org/sites/default/files/swishes.zip',
};
const FILES = {
  applause: 'https://opengameart.org/sites/default/files/applause-clapping-church-crowd-immersive.wav',
  ooh: 'https://opengameart.org/sites/default/files/oooooooooo.ogg',
};
// name: [source, start s, length s (0 = to the end), fade-in s, fade-out s, lead-in trim threshold dB (default -50)]
const CLIPS = {
  bow1: ['battle/battle_sound_effects/Bow.wav', 0, 0, 0, 0.12],
  swish1: ['swishes/swishes/swish-7.wav', 0, 0, 0, 0.03],
  swish2: ['swishes/swishes/swish-8.wav', 0, 0, 0, 0.03],
  swish3: ['swishes/swishes/swish-9.wav', 0, 0, 0, 0.03],
  hit1: ['impact/Audio/impactPunch_medium_000.ogg', 0, 0, 0, 0.08],
  hit2: ['impact/Audio/impactPunch_medium_001.ogg', 0, 0, 0, 0.08],
  hit3: ['impact/Audio/impactPunch_medium_002.ogg', 0, 0, 0, 0.08],
  hit4: ['impact/Audio/impactPunch_medium_003.ogg', 0, 0, 0, 0.08],
  body1: ['impact/Audio/impactSoft_heavy_000.ogg', 0, 0, 0, 0.1],
  body2: ['impact/Audio/impactSoft_heavy_001.ogg', 0, 0, 0, 0.1],
  body3: ['impact/Audio/impactSoft_heavy_002.ogg', 0, 0, 0, 0.1],
  creak1: ['rpg/Audio/creak1.ogg', 0, 0, 0, 0.1, -32],     // (it fades up: trim to where the creak is heard)
  creak2: ['rpg/Audio/creak3.ogg', 0, 0, 0, 0.08],
  ooh1: ['ooh', 0, 1.7, 0.02, 0.6],
  clap1: ['applause', 0.15, 3.2, 0.05, 1.4],       // the swell as the crowd starts
  clap2: ['applause', 12, 1.8, 0.08, 1.0],         // a short patter in the middle
};

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
mkdirSync(SRC, { recursive: true });
for (const [k, u] of Object.entries(PACKS)) {
  const d = join(SRC, k); if (existsSync(d)) continue;
  sh('curl', ['-sSfL', '-m', '120', '-o', d + '.zip', u]); mkdirSync(d); sh('unzip', ['-oq', d + '.zip', '-d', d]);
}
for (const [k, u] of Object.entries(FILES)) { const f = join(SRC, k + u.slice(u.lastIndexOf('.'))); if (!existsSync(f)) sh('curl', ['-sSfL', '-m', '120', '-o', f, u]); }
const path = s => { if (FILES[s]) return join(SRC, s + FILES[s].slice(FILES[s].lastIndexOf('.'))); const [p, ...r] = s.split('/'); const d = join(SRC, p); const sub = readdirSync(d).find(n => existsSync(join(d, n, ...r))); return sub ? join(d, sub, ...r) : join(d, ...r); };

const work = join(SRC, 'out'); mkdirSync(work, { recursive: true });
const map = {}, parts = []; let at = GAP;
for (const [name, [src, ss, len, fi, fo, thr]] of Object.entries(CLIPS)) {
  const inp = path(src), raw = join(work, name + '.raw.wav'), out = join(work, name + '.wav');
  // cut, mono, trim leading silence (so the clip starts on its transient), fades
  const cut = ['-ss', String(ss)].concat(len ? ['-t', String(len)] : []);
  sh('ffmpeg', ['-v', 'error', '-y', ...cut, '-i', inp, '-ac', '1', '-ar', String(RATE), '-af', `silenceremove=start_periods=1:start_threshold=${thr || -50}dB`, raw]);
  const dur = +sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw]).trim();
  const peak = +(/max_volume: (-?[\d.]+) dB/.exec(execFileSync('ffmpeg', ['-v', 'info', '-i', raw, '-af', 'volumedetect', '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString() || '') || [0, 0])[1];
  const af = [`volume=${(-1 - peak).toFixed(2)}dB`];
  if (fi) af.push(`afade=t=in:d=${fi}`);
  if (fo) af.push(`afade=t=out:st=${Math.max(0, dur - fo).toFixed(3)}:d=${fo}`);
  sh('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', af.join(','), out]);
  map[name] = [+at.toFixed(3), +dur.toFixed(3)]; parts.push(out); at += dur + GAP;
}
// one sprite: silence, clip, silence, clip, ... (the gaps keep the encoder's frames from bleeding clips together)
const list = join(work, 'list.txt'), gap = join(work, 'gap.wav');
sh('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=${RATE}:cl=mono`, '-t', String(GAP), gap]);
writeFileSync(list, [gap, ...parts.flatMap(p => [p, gap])].map(p => `file '${p}'`).join('\n'));
const mp3 = join(GAME, 'assets', 'sfx.mp3');
sh('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:a', 'libmp3lame', '-b:a', '96k', '-ac', '1', mp3]);
writeFileSync(join(GAME, 'src', 'sfx.js'), `/* Generated by tools/sfx-build.mjs - do not edit. Recorded CC0 sound effects (assets/SFX_CREDITS.md):\n * where each clip sits in assets/sfx.mp3, as [start, length] in seconds. KAR.Audio picks a numbered variant at random. */\nKAR.SFX = { url: 'assets/sfx.mp3?v=${V}', clips: ${JSON.stringify(map)} };\n`);
console.log(`assets/sfx.mp3 ${(execFileSync('stat', ['-c', '%s', mp3]).toString().trim() / 1024).toFixed(0)} KB, ${Object.keys(map).length} clips, ${at.toFixed(1)} s`);
