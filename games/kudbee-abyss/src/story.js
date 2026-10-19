/* =====================================================================
 * Kudbee Abyss - story.js (THE STORY, as data)
 * Pure data + two pure functions, so the evaluator can walk every path in node
 * (eval/graph.mjs) with no browser. Three hidden stats shape the ending:
 *   heart   - what she remembers          resolve - what she will risk          trust - who she lets in
 * A choice can add to a stat (`add`) and raise a flag (`set`). A node with `song`
 * hands the player the flute (the rhythm game) instead of choices; the result goes
 * in flags.song ('win' | 'fail'). `ending: 'auto'` is decided by endingFor().
 * `focus` says who the camera looks at (queen | guardian | vey | crystal | gate) and
 * `mood` the world around her (void | spire | dusk | gate | dawn | dark).
 * ===================================================================== */
var ABY = (typeof window !== 'undefined') ? (window.ABY = window.ABY || {}) : {};   // (node loads this file too, for eval/graph.mjs)

ABY.CHAPTERS = [
  { n: 1, label: 'The Awakening' },
  { n: 2, label: 'The Companion' },
  { n: 3, label: "The Guardian's Gate" },
];

ABY.SPEAKERS = {
  NARRATOR: { color: '#cfe9ff', focus: 'queen' },
  QUEEN: { color: '#39e6ff', focus: 'queen' },
  GUARDIAN: { color: '#ff8a5c', focus: 'guardian' },
  VEY: { color: '#7cffb2', focus: 'vey' },
};

ABY.START = 'awakening';
ABY.STATS = ['heart', 'resolve', 'trust'];
ABY.MAX_SONG_TRIES = 3;

ABY.NODES = {
  // ---- chapter 1: the awakening ----
  awakening: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen',
    text: 'Consciousness returns in fragments. The void whispers a name she cannot remember. All that remains is the weight of the flute at her back, and the echo of its song in her blood.',
    choices: [
      { label: 'Follow the flute', next: 'flute_path', add: { resolve: 1 } },
      { label: 'Listen to the stones', next: 'stones_path', add: { heart: 1 } },
    ],
  },
  flute_path: {
    ch: 1, speaker: 'QUEEN', mood: 'void', focus: 'queen',
    text: 'The flute hums louder. It wants to take me somewhere. I can feel a path in the violet haze: not a road, but a resonance only I can hear.',
    choices: [
      { label: 'Climb the broken spire', next: 'spire', add: { resolve: 1 } },
      { label: 'Call to the small creature', next: 'vey_come', add: { trust: 1 } },
    ],
  },
  stones_path: {
    ch: 1, speaker: 'QUEEN', mood: 'void', focus: 'queen',
    text: 'The stones beneath me speak in cold frequencies. Something tall stands beyond the pillar. It is not a threat. It is a question.',
    choices: [
      { label: 'Approach the guardian', next: 'g_meet', add: { resolve: 1 } },
      { label: 'Ask Vey to guide me', next: 'vey_guide', add: { trust: 1 } },
    ],
  },

  // ---- chapter 2: the companion ----
  spire: {
    ch: 2, speaker: 'NARRATOR', mood: 'spire', focus: 'crystal',
    text: 'The spire crumbles under each step. At the top, a crystal pulses like a heartbeat. The song in her flute answers it.',
    choices: [
      { label: 'Take the crystal', next: 'crystal', add: { resolve: 1 }, set: 'crystal' },
      { label: 'Offer the flute instead', next: 'offering', add: { heart: 1, trust: 1 } },
    ],
  },
  vey_come: {
    ch: 2, speaker: 'VEY', mood: 'dusk', focus: 'vey',
    text: 'I follow, low and quick. The Guardian stirs, but it does not attack. It is waiting, with the same patience it had before the corruption.',
    choices: [
      { label: 'Confront the guardian', next: 'g_meet', add: { resolve: 1 } },
      { label: 'Hide and watch', next: 'hide', add: { heart: 1 } },
    ],
  },
  vey_guide: {
    ch: 2, speaker: 'VEY', mood: 'dusk', focus: 'vey',
    text: 'I tell the Guardian everything. It listens with a face that used to smile. The corruption burns, but memory is stronger.',
    choices: [
      { label: 'Reach out your hand', next: 'reconcile', add: { trust: 1 } },
      { label: 'Play the Song of Recall', next: 'song_intro', add: { heart: 1 } },
    ],
  },

  // ---- chapter 3: the guardian's gate ----
  g_meet: {
    ch: 3, speaker: 'GUARDIAN', mood: 'dark', focus: 'guardian',
    text: '...you... carry the echo... my lady... the corruption... it burns... but the song remembers what I have forgotten.',
    choices: [
      { label: 'Embrace the Guardian', next: 'reconcile', add: { trust: 1 } },
      { label: 'Play the flute', next: 'song_intro', add: { heart: 1 } },
      { label: 'Stand your ground', next: 'standoff', add: { resolve: 1 } },
    ],
  },
  crystal: {
    ch: 3, speaker: 'QUEEN', mood: 'spire', focus: 'crystal',
    text: 'The crystal hums against my flute. The song grows stronger. I can feel the Guardian\'s awareness turning toward me. Not to fight. To be remembered. And in the crystal, a crown of shadows waits to be worn.',
    choices: [
      { label: 'Reach out', next: 'reconcile', add: { trust: 1 } },
      { label: 'Play the Song of Recall', next: 'song_intro', add: { heart: 1 } },
      { label: 'Take the crown for myself', next: 'crown_taken', set: 'crown' },
    ],
  },
  offering: {
    ch: 3, speaker: 'NARRATOR', mood: 'dawn', focus: 'crystal',
    text: 'She offers the flute to the spire. The crystal accepts, and the melody becomes a bridge of light between them.',
    choices: [
      { label: 'Walk through the light', next: 'reconcile', add: { heart: 1, trust: 1 } },
    ],
  },
  hide: {
    ch: 3, speaker: 'VEY', mood: 'dark', focus: 'guardian',
    text: 'We watch. The Guardian kneels. The crown of shadows falls away like dust. It was never waiting to fight, only to be seen.',
    choices: [
      { label: 'Step forward', next: 'reconcile', add: { trust: 1 } },
    ],
  },
  standoff: {
    ch: 3, speaker: 'GUARDIAN', mood: 'dark', focus: 'guardian',
    text: 'You do not flinch. No one has stood before me and not flinched... Then perhaps there is still someone in here to save.',
    choices: [
      { label: 'Embrace the Guardian', next: 'reconcile', add: { resolve: 1, trust: 1 } },
      { label: 'Play the flute', next: 'song_intro', add: { resolve: 1 } },
    ],
  },
  reconcile: {
    ch: 3, speaker: 'QUEEN', mood: 'dawn', focus: 'guardian',
    text: 'I remember now. You were my captain, my shield, my brother. The crown of shadows deceived you. Let me free you.',
    choices: [
      { label: 'Open the gate', next: 'gate_opens' },
    ],
  },
  crown_taken: {
    ch: 3, speaker: 'GUARDIAN', mood: 'dark', focus: 'guardian',
    text: 'No... not you too... The crown does not give power, my lady. It only borrows it. And it always comes to collect.',
    choices: [
      { label: 'Wear it anyway', next: 'gate_opens' },
    ],
  },

  // ---- the song (a rhythm game) ----
  song_intro: {
    ch: 3, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', song: true,
    text: 'She lifts the flute. The Song of Recall is not played. It is remembered, one note at a time. Catch each note as it reaches the light.',
  },
  song_win: {
    ch: 3, speaker: 'GUARDIAN', mood: 'dawn', focus: 'guardian',
    text: 'The song... it remembers everything... The shadow cracks like glass. I can see your face again, my lady.',
    choices: [
      { label: 'Walk into the dawn', next: 'gate_opens', add: { heart: 1 } },
    ],
  },
  song_fail: {
    ch: 3, speaker: 'GUARDIAN', mood: 'dark', focus: 'guardian',
    text: 'The melody falters, and the corruption surges. It is not too late. But the song must be whole.',
    choices: [
      { label: 'Try the song again', next: 'song_intro', retry: true },
      { label: 'Hold him instead', next: 'reconcile', add: { trust: 1 } },
    ],
  },

  // ---- the end ----
  gate_opens: {
    ch: 3, speaker: 'NARRATOR', mood: 'gate', focus: 'gate', ending: 'auto',
    text: 'The gate opens.',
    choices: [],
  },
};

// ---- the endings (decided by endingFor) ----
ABY.ENDINGS = {
  dawn: { name: 'The Gate Opens', hint: 'Free the Guardian with trust.', mood: 'dawn',
    text: 'The gate opens. The corruption dissipates. At last, peace. And in the distance, another gate shimmered, and another echo called her name.' },
  song: { name: 'The Song Remembered', hint: 'Play the whole Song of Recall.', mood: 'dawn',
    text: 'Every note found its place. The song poured through the gate and the shadows sang back. The Guardian remembered his name, and she remembered hers.' },
  echo: { name: 'Another Gate', hint: 'Walk the path with heart, courage and trust.', mood: 'gate',
    text: 'Heart, courage and trust: the gate does not open. It unfolds. Beyond it stretch a thousand more gates, and every one of them is humming her song.' },
  silence: { name: 'The Quiet Gate', hint: 'Open the gate without trust.', mood: 'gate',
    text: 'The gate opens, and nothing follows. The Guardian is free, but the hum is gone from the air. She walks on alone, the flute silent at her back.' },
  crown: { name: 'The Crown of Shadows', hint: 'Take the crown for yourself.', mood: 'dark',
    text: 'The crown settles on her brow and the whole void bows. It is a very quiet kind of power. Somewhere far away, a flute falls to the floor.' },
};
ABY.ENDING_IDS = Object.keys(ABY.ENDINGS);

ABY.newState = function () {
  return { node: ABY.START, heart: 0, resolve: 0, trust: 0, flags: {}, tries: 0, choices: 0 };
};

// what the gate does, given everything she did
ABY.endingFor = function (s) {
  const f = s.flags || {};
  if (f.crown) return 'crown';
  if (f.song === 'win') return 'song';
  if (s.heart >= 2 && s.resolve >= 2 && s.trust >= 2) return 'echo';
  if (s.trust >= 2) return 'dawn';
  return 'silence';
};

// a choice taken: returns the new state (never mutates), or null if it is not a choice of this node
ABY.choose = function (s, i) {
  const n = ABY.NODES[s.node], c = n && n.choices && n.choices[i];
  if (!c || !ABY.NODES[c.next]) return null;
  const o = { node: c.next, heart: s.heart, resolve: s.resolve, trust: s.trust, flags: Object.assign({}, s.flags), tries: s.tries, choices: s.choices + 1 };
  if (c.add) for (const k of ABY.STATS) if (c.add[k]) o[k] = Math.min(5, o[k] + c.add[k]);
  if (c.set) o.flags[c.set] = 1;
  if (c.retry) o.tries++;
  return o;
};

// the song ended: 'win' or 'fail' decides what the Guardian says next
ABY.songDone = function (s, won) {
  const o = Object.assign({}, s, { flags: Object.assign({}, s.flags) });
  o.flags.song = won ? 'win' : 'fail';
  o.node = won ? 'song_win' : (s.tries >= ABY.MAX_SONG_TRIES ? 'reconcile' : 'song_fail');
  return o;
};

// a saved state of unknown shape -> a safe one (a hand-edited save can't jump to a node that isn't there)
ABY.cleanState = function (raw) {
  const s = ABY.newState();
  if (!raw || typeof raw !== 'object') return s;
  if (typeof raw.node === 'string' && Object.prototype.hasOwnProperty.call(ABY.NODES, raw.node) && !ABY.NODES[raw.node].ending) s.node = raw.node;
  for (const k of ABY.STATS) if (Number.isInteger(raw[k])) s[k] = Math.max(0, Math.min(5, raw[k]));
  if (Number.isInteger(raw.tries)) s.tries = Math.max(0, Math.min(ABY.MAX_SONG_TRIES, raw.tries));
  if (Number.isInteger(raw.choices)) s.choices = Math.max(0, Math.min(999, raw.choices));
  if (raw.flags && typeof raw.flags === 'object') {
    if (raw.flags.crown === 1) s.flags.crown = 1;
    if (raw.flags.crystal === 1) s.flags.crystal = 1;
    if (raw.flags.song === 'win' || raw.flags.song === 'fail') s.flags.song = raw.flags.song;
  }
  return s;
};

if (typeof module !== 'undefined') module.exports = ABY;
