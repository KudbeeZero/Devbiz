/* =====================================================================
 * Kudbee Abyss - story.js (THE STORY, as data)
 * Pure data + pure functions, so the evaluator can walk every path in node
 * (eval/graph.mjs) with no browser. The player is the voice in the phone, texting
 * the Queen, Vey and the Guardian; the phone itself is cursed, and it is the source
 * of most of the horror.
 *
 * Four stats and two resources shape the ending:
 *   heart   what she remembers      resolve what she will risk      trust who she lets in
 *   dread   what has seen her (0-6; at 6 she starts to come apart)
 *   bat     the phone's battery (it drains with every choice, and fast with the flashlight on;
 *           at 0 the phone dies in the dark)        light  the flashlight (dark scenes need it)
 * A choice can add to a stat (`add`), set a flag (`set`), switch the flashlight (`light`), cost
 * or give battery (`bat`: positive drains, negative charges), and can be hidden until a rule
 * holds (`req`: { flag, noflag, min:{trust:2}, maxDread, minDread, light, noLight }).
 * A node can scare (`scare`: glitch | jump | whisper | eye | blackout), be dark (`dark`: the
 * flashlight is needed or dread climbs), ring (`call`), show a picture (`img`), file a clue
 * (`note`), or end (`ending`: an id, or 'auto' = endingFor()). `@back` returns to where a
 * forced scene (the blackout, the hollowing) interrupted.
 * ===================================================================== */
var ABY = (typeof window !== 'undefined') ? (window.ABY = window.ABY || {}) : {};   // (node loads this file too, for eval/graph.mjs)

ABY.CHAPTERS = [
  { n: 1, label: 'The Awakening' },
  { n: 2, label: 'The Companion' },
  { n: 3, label: "The Guardian's Gate" },
  { n: 4, label: 'The Descent' },
  { n: 5, label: 'The Eye' },
  { n: 6, label: 'Day Two' },
  { n: 7, label: 'The Door' },
  { n: 8, label: 'Day Three' },
];

ABY.SPEAKERS = {
  NARRATOR: { color: '#cfe9ff', focus: 'queen' },
  QUEEN: { color: '#39e6ff', focus: 'queen' },
  GUARDIAN: { color: '#ff8a5c', focus: 'guardian' },
  VEY: { color: '#7cffb2', focus: 'vey' },
  EYE: { color: '#ff4d5e', focus: 'queen' },
};

ABY.START = 'awakening';
ABY.STATS = ['heart', 'resolve', 'trust'];
ABY.MAX_SONG_TRIES = 3;

// the rites: Guitar-Hero-style rhythm levels (a node with `song: '<id>'` plays one; `song: true` is the Song of Recall). A chart is a melody
// [index into the flute scale, steps after the last note], the length of a step in seconds, and the haunting: `fx` = [steps from the start, what happens]
// (door | crack | flash | blood | knock | scream | drip | dark). `tint` colours the page; `lanes` the three lanes.
ABY.RITES = {
  doors: { name: 'THE HALL OF DOORS', step: 0.46, tint: '#ffb86b', lanes: ['#ffb86b', '#ff6ec7', '#9fb0ff'],
    mel: [[2, 0], [2, 2], [3, 1], [2, 2], [0, 2], [2, 1], [3, 1], [5, 2], [3, 1], [2, 1], [3, 2], [5, 1], [6, 1], [5, 2], [3, 2], [2, 1], [0, 1], [2, 2], [3, 1], [5, 1], [7, 2], [5, 1], [3, 1], [2, 2], [3, 1], [2, 1], [0, 3]],
    fx: [[2, 'drip'], [5, 'door'], [11, 'knock'], [14, 'door'], [20, 'crack'], [24, 'door'], [30, 'flash']] },
  blood: { name: 'THE RED CORRIDOR', step: 0.38, tint: '#ff2a4a', lanes: ['#ff2a4a', '#ff8a5c', '#ffd1d1'],
    mel: [[0, 0], [2, 1], [0, 1], [3, 1], [2, 1], [5, 2], [3, 1], [2, 1], [0, 1], [2, 2], [5, 1], [6, 1], [5, 1], [3, 1], [2, 2], [0, 1], [2, 1], [3, 1], [5, 1], [7, 1], [6, 1], [5, 2], [3, 1], [5, 1], [2, 1], [3, 1], [0, 3]],
    fx: [[1, 'drip'], [4, 'blood'], [9, 'crack'], [12, 'blood'], [16, 'scream'], [19, 'blood'], [24, 'flash'], [27, 'blood']] },
  lull: { name: 'THE EYE\'S LULLABY', step: 0.34, tint: '#c46bff', lanes: ['#c46bff', '#39e6ff', '#ff4d5e'],
    mel: [[5, 0], [3, 1], [5, 1], [7, 1], [5, 2], [3, 1], [2, 1], [3, 2], [5, 1], [7, 1], [9, 1], [7, 1], [5, 2], [3, 1], [5, 1], [3, 1], [2, 1], [0, 2], [2, 1], [3, 1], [5, 1], [7, 1], [8, 1], [9, 2], [7, 1], [5, 1], [3, 1], [2, 1], [0, 3]],
    fx: [[3, 'whisper'], [7, 'flash'], [10, 'knock'], [15, 'blood'], [19, 'door'], [23, 'scream'], [28, 'flash'], [31, 'blood']] },
};
ABY.RITE_IDS = Object.keys(ABY.RITES);
ABY.MAX_DREAD = 6;
ABY.BAT0 = 62;            // the battery she starts with
ABY.TORCH = 7;            // extra battery a choice costs while the flashlight is on
ABY.TORCH_TOGGLE = 2;     // and switching it on or off

// the clues she can find (they show in the Notes app, and some unlock choices)
ABY.NOTES = {
  recording: { title: 'Recording: the stones', text: 'Under the choir, very faint, a voice you know: hers. "DON\'T OPEN THE GATE. I LOCKED HIM IN SO YOU\'D NEVER—" The file ends there.' },
  ledger: { title: 'The captain\'s ledger', text: '"She asked me to wear the crown of shadows. \'Only for a night,\' she said. \'Only to hold the door.\' I said yes. I always said yes."' },
  vey_photo: { title: 'Photo: Vey', text: 'The Queen, the pillar, and behind her, close enough to touch her hair: Vey, standing on two legs, with far too many hands.' },
  future_call: { title: 'Call from your own number', text: '"Don\'t let her open the gate. She doesn\'t know what she locked behind it. It isn\'t him. It was never him."' },
  voicemail: { title: 'Voicemail (0:30)', text: 'You did not play it. It played itself. "...she locked him in so he\'d never remember what he held. Count the steps. Do not count the steps."' },
  photo_you: { title: 'Photo: you', text: 'You, from behind, holding this phone. 3:07. A hand on your shoulder that is not in the room. The photo keeps updating.' },
  captain_name: { title: 'The signature', text: '"Corvin Ash, captain, who held the door." The Guardian\'s name, on the last page, in his own neat hand.' },
  eye_stairs: { title: 'Photo: the stairs', text: 'A staircase that goes down into a ceiling-high red Eye. Every step is lit from below, one by one, like a welcome. The photo was taken from where you are standing.' },
  eye: { title: 'What the Eye wants', text: '"I don\'t want your name. I want to be remembered too. Nobody ever sings to me."' },
};

ABY.NODES = {
  // ======================= chapter 1: the awakening =======================
  awakening: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen',
    text: 'Consciousness returns in fragments. The void whispers a name she cannot remember. All that remains is the weight of the flute at her back, and the echo of its song in her blood.',
    choices: [
      { label: 'Follow the flute', next: 'flute_path', add: { resolve: 1 } },
      { label: 'Listen to the stones', next: 'stones_path', add: { heart: 1 } },
      { label: 'Check your phone', next: 'unknown_sms', add: { dread: 1 } },
    ],
  },
  unknown_sms: {
    ch: 1, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'glitch',
    text: 'i can see you holding it. it is 3:07. it is always 3:07 here. you should not have woken up.',
    choices: [
      { label: 'Who is this?', next: 'unknown_who' },
      { label: 'Switch on the flashlight', next: 'torch_first', light: 1 },
      { label: 'Ignore it and follow the flute', next: 'flute_path', add: { resolve: 1 } },
    ],
  },
  unknown_who: {
    ch: 1, speaker: 'EYE', mood: 'dark', focus: 'queen',
    text: 'i keep the door. she locked it and forgot. ask her what she did with her captain. ask her why the stones sing.',
    choices: [
      { label: 'Ask the Queen what she did', next: 'queen_denies' },
      { label: 'Block the number', next: 'block_it' },
    ],
  },
  queen_denies: {
    ch: 1, speaker: 'QUEEN', mood: 'void', focus: 'queen',
    text: 'I... don\'t remember. Please. Don\'t listen to it. It only lies. It only ever lies.',
    choices: [
      { label: 'Trust the Queen', next: 'flute_path', add: { trust: 1 } },
      { label: 'Keep it in mind', next: 'flute_path', add: { resolve: 1, dread: 1 }, set: 'doubt' },
    ],
  },
  block_it: {
    ch: 1, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'jump',
    text: 'blocked. you cannot block the thing that is looking at you. (1 new message from a number you blocked.) hello again.',
    choices: [
      { label: 'Stop answering it', next: 'flute_path', add: { dread: 1 } },
    ],
  },
  torch_first: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'The flashlight cuts a thin white road through the haze. At the edge of it, something very tall and very thin steps back into the dark. It was standing there before you looked.',
    choices: [
      { label: 'Keep the light on', next: 'flute_path', add: { dread: 1 } },
      { label: 'Switch it off', next: 'flute_path', add: { dread: 1 }, light: 0 },
    ],
  },
  flute_path: {
    ch: 1, speaker: 'QUEEN', mood: 'void', focus: 'queen',
    text: 'The flute hums louder. It wants to take me somewhere. I can feel a path in the violet haze: not a road, but a resonance only I can hear.',
    choices: [
      { label: 'Climb the broken spire', next: 'spire', add: { resolve: 1 } },
      { label: 'Call to the small creature', next: 'vey_come', add: { trust: 1 } },
      { label: 'Play the flute at the dark', next: 'choir_1', add: { dread: 1 } },
    ],
  },
  stones_path: {
    ch: 1, speaker: 'QUEEN', mood: 'void', focus: 'queen',
    text: 'The stones beneath me speak in cold frequencies. Something tall stands beyond the pillar. It is not a threat. It is a question.',
    choices: [
      { label: 'Approach the guardian', next: 'g_meet', add: { resolve: 1 } },
      { label: 'Ask Vey to guide me', next: 'vey_guide', add: { trust: 1 } },
      { label: 'Search the broken pillar', next: 'pillar_door' },
      { label: 'Press your ear to the stones', next: 'choir_1', add: { dread: 1 } },
    ],
  },
  pillar_door: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', dark: true,
    text: 'Behind the pillar there is a hollow in the stone, and in the hollow a leather ledger, wet with something. The pages are in a soldier\'s neat hand. You cannot read it in this dark.',
    choices: [
      { label: 'Read the ledger', next: 'ledger_read', light: 1, req: { light: 1 }, add: { dread: 1 }, set: 'ledger' },
      { label: 'Switch on the flashlight', next: 'pillar_door', light: 1, req: { noLight: 1 } },
      { label: 'Leave it', next: 'stones_path' },
    ],
  },
  ledger_read: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', note: 'ledger',
    text: '"She asked me to wear the crown of shadows. \'Only for a night,\' she said. \'Only to hold the door.\' I said yes. I always said yes." The last page has been torn out. The torn edge is still warm.',
    choices: [
      { label: 'Close the ledger', next: 'stones_path', add: { resolve: 1 } },
    ],
  },
  choir_1: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'The stones are singing. Hundreds of thin voices pressed together, saying her name backwards. The flute in her blood answers before she can stop it.',
    choices: [
      { label: 'Sing along', next: 'choir_join', add: { heart: 1, dread: 2 }, set: 'choir' },
      { label: 'Record it on the phone', next: 'record', add: { dread: 1 } },
      { label: 'Cover your ears and run', next: 'vey_come', add: { resolve: 1 } },
    ],
  },
  choir_join: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'glitch',
    text: 'The song is beautiful. That is the worst part. For three minutes she remembers everything: a throne, a door, a man in iron kneeling. Then the memory is wrenched out of her like a tooth.',
    choices: [
      { label: 'Chase the memory', next: 'spire', add: { heart: 1 } },
      { label: 'Let it go', next: 'vey_come', add: { trust: 1 } },
    ],
  },
  record: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', note: 'recording', scare: 'whisper',
    text: 'You play it back. Under the choir, very faint, is a voice you know. Hers. Screaming: "DON\'T OPEN THE GATE. I LOCKED HIM IN SO YOU\'D NEVER—" and then the file ends.',
    choices: [
      { label: 'Play it for the Queen', next: 'spire', add: { dread: 1 }, set: 'heard' },
      { label: 'Delete it', next: 'vey_come', add: { trust: 1 } },
    ],
  },

  // ======================= chapter 2: the companion =======================
  spire: {
    ch: 2, speaker: 'NARRATOR', mood: 'spire', focus: 'crystal',
    text: 'The spire crumbles under each step. At the top, a crystal pulses like a heartbeat. The song in her flute answers it.',
    choices: [
      { label: 'Take the crystal', next: 'crystal', add: { resolve: 1 }, set: 'crystal', bat: -20 },
      { label: 'Offer the flute instead', next: 'offering', add: { heart: 1, trust: 1 }, bat: -12 },
    ],
  },
  vey_come: {
    ch: 2, speaker: 'VEY', mood: 'dusk', focus: 'vey',
    text: 'I follow, low and quick. The Guardian stirs, but it does not attack. It is waiting, with the same patience it had before the corruption.',
    choices: [
      { label: 'Confront the guardian', next: 'g_meet', add: { resolve: 1 } },
      { label: 'Hide and watch', next: 'hide', add: { heart: 1 } },
      { label: 'Take a photo of Vey', next: 'vey_photo', add: { dread: 1 } },
      { label: 'Answer your buzzing phone', next: 'call_1', add: { dread: 1 } },
    ],
  },
  vey_guide: {
    ch: 2, speaker: 'VEY', mood: 'dusk', focus: 'vey',
    text: 'I tell the Guardian everything. It listens with a face that used to smile. The corruption burns, but memory is stronger.',
    choices: [
      { label: 'Reach out your hand', next: 'reconcile', add: { trust: 1 } },
      { label: 'Play the Song of Recall', next: 'song_intro', add: { heart: 1 } },
      { label: 'Ask Vey what it really is', next: 'vey_secret', add: { dread: 1 } },
    ],
  },
  vey_secret: {
    ch: 2, speaker: 'VEY', mood: 'dusk', focus: 'vey', scare: 'whisper',
    text: 'I was a hollow once. We all were. I woke up when she woke up, and she was kind to me. I would like to stay awake.',
    choices: [
      { label: 'Trust Vey', next: 'hollow_pass', add: { trust: 1 }, set: 'vey_trusted' },
      { label: 'Take a photo of Vey', next: 'vey_photo', add: { dread: 1 } },
    ],
  },
  vey_photo: {
    ch: 2, speaker: 'NARRATOR', mood: 'dark', focus: 'vey', scare: 'jump', img: 'corrupt', note: 'vey_photo',
    text: 'The photo develops on the screen. The Queen. The pillar. And behind her, close enough to touch her hair, Vey, except it is standing on two legs, and it has far too many hands.',
    choices: [
      { label: 'Show Vey the photo', next: 'vey_react', add: { dread: 1 } },
      { label: 'Say nothing. Keep it.', next: 'hollow_pass', add: { dread: 1 }, set: 'vey_doubt' },
    ],
  },
  vey_react: {
    ch: 2, speaker: 'VEY', mood: 'dusk', focus: 'vey', scare: 'whisper',
    text: 'Oh. You can see that. Please don\'t be afraid of me. I am afraid of it too. It is the thing that wears me when I sleep.',
    choices: [
      { label: 'Stay with Vey', next: 'hollow_pass', add: { trust: 1, dread: 1 }, set: 'vey_trusted' },
      { label: 'Back away', next: 'hollow_pass', add: { dread: 1 }, set: 'vey_doubt' },
    ],
  },
  hide: {
    ch: 3, speaker: 'VEY', mood: 'dark', focus: 'guardian',
    text: 'We watch. The Guardian kneels. The crown of shadows falls away like dust. It was never waiting to fight, only to be seen.',
    choices: [
      { label: 'Step forward', next: 'reconcile', add: { trust: 1 } },
    ],
  },
  hollow_pass: {
    ch: 2, speaker: 'NARRATOR', mood: 'dark', focus: 'vey', scare: 'whisper', dark: true,
    text: 'Wings. Dozens, overhead, in the stairwell of the sky: the Hollows, hanging like leaves. They have not noticed you yet. Everything about them is waiting.',
    choices: [
      { label: 'Switch on the flashlight', next: 'hollow_light', light: 1, req: { noLight: 1 } },
      { label: 'Hold your breath and walk', next: 'hollow_walk', add: { resolve: 1 } },
      { label: 'Play the flute softly', next: 'hollow_song', add: { heart: 1 } },
      { label: 'Stand your ground', next: 'g_meet', add: { resolve: 1, dread: 1 } },
    ],
  },
  hollow_light: {
    ch: 2, speaker: 'NARRATOR', mood: 'dark', focus: 'vey', scare: 'jump',
    text: 'The light hits them and they screech, not in pain but in recognition. All of them turn at once. Every skull has Vey\'s eyes.',
    choices: [
      { label: 'Run', next: 'g_meet', add: { dread: 2 } },
      { label: 'Hold the light steady', next: 'g_meet', add: { resolve: 1, dread: 1 } },
    ],
  },
  hollow_walk: {
    ch: 2, speaker: 'NARRATOR', mood: 'dark', focus: 'vey', scare: 'glitch',
    text: 'Step. Step. Don\'t breathe. One of them leans down and sniffs her hair. It says, very softly, in the Queen\'s own voice: "Mine."',
    choices: [
      { label: 'Keep walking', next: 'g_meet', add: { dread: 1, resolve: 1 } },
    ],
  },
  hollow_song: {
    ch: 2, speaker: 'NARRATOR', mood: 'dark', focus: 'queen',
    text: 'She plays one low note. The wings shiver. They begin to hum it back, and the hum is the choir\'s, and they are not afraid of her at all.',
    choices: [
      { label: 'Keep playing', next: 'song_intro', add: { heart: 1, dread: 1 } },
      { label: 'Stop. Back away.', next: 'g_meet', add: { dread: 2 } },
    ],
  },
  call_1: {
    ch: 2, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump', call: { from: 'Unknown (you)', sub: 'incoming call' },
    text: 'The phone rings. The caller ID is your own number.',
    choices: [
      { label: 'Answer', next: 'call_self', bat: 6, add: { dread: 1 } },
      { label: 'Decline', next: 'call_missed' },
    ],
  },
  call_self: {
    ch: 2, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', note: 'future_call', scare: 'glitch',
    text: 'It is your voice. Out of breath. Wet. "Listen: don\'t let her open the gate. She doesn\'t know what she locked behind it. It isn\'t him. It was never him." The line fills with static, then breathing, then a click.',
    choices: [
      { label: 'Hang up', next: 'g_meet', add: { dread: 1 }, set: 'warned' },
      { label: 'Call it back', next: 'call_back' },
    ],
  },
  call_back: {
    ch: 2, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump',
    text: 'It connects on the first ring. Nobody says anything. Then, very close to the microphone: "the number you have dialed is you."',
    choices: [
      { label: 'Throw the phone down', next: 'g_meet', add: { dread: 2 }, set: 'warned' },
    ],
  },
  call_missed: {
    ch: 2, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper', note: 'voicemail',
    text: 'The call ends. A voicemail arrives anyway, thirty seconds long. You don\'t press play. It plays itself.',
    choices: [
      { label: 'Listen to all of it', next: 'g_meet', add: { dread: 1, heart: 1 } },
      { label: 'Delete it', next: 'g_meet' },
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

  // ======================= chapter 3: the guardian's gate =======================
  g_meet: {
    ch: 3, speaker: 'GUARDIAN', mood: 'dark', focus: 'guardian',
    text: '...you... carry the echo... my lady... the corruption... it burns... but the song remembers what I have forgotten.',
    choices: [
      { label: 'Embrace the Guardian', next: 'reconcile', add: { trust: 1 } },
      { label: 'Play the flute', next: 'song_intro', add: { heart: 1 } },
      { label: 'Stand your ground', next: 'standoff', add: { resolve: 1 } },
      { label: 'Read him the ledger', next: 'g_ledger', req: { flag: 'ledger' } },
      { label: 'Look him in the eye', next: 'eye_gaze', req: { minDread: 2 }, add: { dread: 1 } },
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
  g_ledger: {
    ch: 3, speaker: 'GUARDIAN', mood: 'dark', focus: 'guardian',
    text: '...that is my hand. That is... I wrote that. She asked, and I said yes. I wore it. For a thousand years I held the door shut, and I never once asked what was behind it.',
    choices: [
      { label: 'Tell him it is over', next: 'reconcile', add: { heart: 2 }, set: 'truth' },
      { label: 'Ask what was behind the door', next: 'descent_door', add: { dread: 1 }, set: 'truth' },
    ],
  },
  eye_gaze: {
    ch: 3, speaker: 'EYE', mood: 'throne', focus: 'guardian', scare: 'eye',
    text: 'there you are. i have been looking at you since the first note. the sky splits. a great red eye opens over his shoulder, and every Hollow turns to look at you too.',
    choices: [
      { label: 'Look away', next: 'standoff', add: { dread: 1 } },
      { label: 'Stare back', next: 'descent_door', add: { resolve: 1, dread: 2 }, set: 'marked' },
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
    ch: 3, speaker: 'GUARDIAN', mood: 'throne', focus: 'guardian',
    text: 'No... not you too... The crown does not give power, my lady. It only borrows it. And it always comes to collect.',
    choices: [
      { label: 'Wear it anyway', next: 'gate_opens' },
    ],
  },

  // ======================= chapter 4: the descent =======================
  descent_door: {
    ch: 4, speaker: 'NARRATOR', mood: 'dark', focus: 'guardian', scare: 'whisper',
    text: 'The ground opens like a mouth. Stone steps lead down. And, impossibly, behind them, a second stair, black and slick with tendon, spirals up toward the eye.',
    choices: [
      { label: 'Go down into the vault', next: 'vault_1' },
      { label: 'Climb the stairs', next: 'stairs_1' },
    ],
  },
  vault_1: {
    ch: 4, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', dark: true,
    text: 'Down. The air smells like old blood and incense. A door of black iron, padlocked from the outside, the way you lock a thing in rather than out. The Queen\'s handprint is burned into the lock.',
    choices: [
      { label: 'Switch on the flashlight', next: 'vault_1', light: 1, req: { noLight: 1 } },
      { label: 'Open the door', next: 'vault_memory', add: { dread: 1 } },
      { label: 'Listen at the door', next: 'vault_listen', add: { dread: 1 } },
    ],
  },
  vault_listen: {
    ch: 4, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'Behind the door someone is breathing in time with you. When you hold your breath, it holds its breath. It knocks twice and says, politely: "Thank you for coming back."',
    choices: [
      { label: 'Open the door', next: 'vault_memory', add: { dread: 2 } },
      { label: 'Run back up', next: 'g_meet', add: { dread: 1 } },
    ],
  },
  vault_memory: {
    ch: 4, speaker: 'QUEEN', mood: 'dusk', focus: 'queen', scare: 'glitch',
    text: 'I remember. It was me. The Eye came asking for a door, and I gave it a man. I said it would only be for a night. I put the crown on his head myself. He thanked me. He thanked me.',
    choices: [
      { label: 'Tell her you believe her', next: 'vault_choice', add: { heart: 2, dread: 1 }, set: 'truth' },
      { label: 'Tell her it is a lie', next: 'vault_choice', add: { resolve: 1, dread: 2 } },
    ],
  },
  vault_choice: {
    ch: 4, speaker: 'NARRATOR', mood: 'dark', focus: 'guardian',
    text: 'The door is open now. In the dark inside, a captain in iron kneels with the crown of shadows grown into his skull. He lifts his head. He is smiling the way a man smiles who has finally been allowed to stop.',
    choices: [
      { label: 'Free him', next: 'gate_opens', add: { heart: 1, trust: 1 } },
      { label: 'Lock the door again', next: 'gate_opens', add: { dread: 2 }, set: 'sealed' },
      { label: 'Take his place', next: 'end_mirror', req: { flag: 'truth' } },
    ],
  },

  // ======================= chapter 5: the eye =======================
  stairs_1: {
    ch: 5, speaker: 'NARRATOR', mood: 'throne', focus: 'queen',
    text: 'Each step is a vertebra. They flex a little under her weight, politely. In the walls, skulls with lit red eyes watch her climb and count under their breath.',
    choices: [
      { label: 'Count with them', next: 'stairs_2', add: { dread: 1 } },
      { label: 'Don\'t look at the walls', next: 'stairs_2', add: { resolve: 1 } },
      { label: 'Switch on the flashlight', next: 'stairs_light', light: 1, req: { noLight: 1 } },
    ],
  },
  stairs_light: {
    ch: 5, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'jump',
    text: 'The light shows what the walls are made of. It would have been kinder not to know. The skulls scream together, very high and very thin, and the stairs lurch.',
    choices: [
      { label: 'Keep climbing', next: 'stairs_2', add: { dread: 2 } },
    ],
  },
  stairs_2: {
    ch: 5, speaker: 'EYE', mood: 'throne', focus: 'queen', scare: 'whisper',
    text: 'you are doing so well. only ninety steps left. you can stop and sit if you are tired. sit.',
    choices: [
      { label: 'Sit down', next: 'stairs_sit', add: { dread: 2 } },
      { label: 'Keep climbing', next: 'stairs_3', add: { resolve: 1 } },
      { label: 'Text back: who are you really?', next: 'stairs_3', add: { dread: 1 }, set: 'asked_eye' },
    ],
  },
  stairs_sit: {
    ch: 5, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'glitch',
    text: 'She sits. The stair does not mind. It wraps one tendon gently around her ankle, and the climb continues without her.',
    choices: [
      { label: 'Cut the tendon with the flute', next: 'stairs_3', add: { resolve: 1, dread: 1 } },
      { label: 'Let it carry you', next: 'eye_top', add: { dread: 2 }, set: 'carried' },
    ],
  },
  stairs_3: {
    ch: 5, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'glitch',
    text: 'The top. A throne of folded wings and a crown that hums her song. And above it all, close enough to breathe on, the Eye. It blinks. The whole sky blinks.',
    choices: [
      { label: 'Go to the throne', next: 'eye_top' },
    ],
  },
  eye_top: {
    ch: 5, speaker: 'EYE', mood: 'throne', focus: 'queen', scare: 'eye', note: 'eye',
    text: 'i don\'t want your name. i want to be remembered too. nobody ever sings to me.',
    choices: [
      { label: 'Play it a lullaby', next: 'eye_song', add: { heart: 1 } },
      { label: 'Smash the crown with the flute', next: 'crown_smashed', req: { min: { resolve: 3 } } },
      { label: 'Wear the crown', next: 'gate_opens', set: 'crown' },
      { label: 'Answer: remember me', next: 'end_eye', add: { dread: 1 } },
    ],
  },
  eye_song: {
    ch: 5, speaker: 'NARRATOR', mood: 'dawn', focus: 'queen',
    text: 'She plays. For a long minute the Eye listens, then it closes, wet-lashed, like a child falling asleep. The stairs go soft and fold away beneath her feet.',
    choices: [
      { label: 'Wake up', next: 'gate_opens', add: { heart: 2 }, set: 'lullaby' },
    ],
  },
  crown_smashed: {
    ch: 5, speaker: 'NARRATOR', mood: 'dawn', focus: 'queen', scare: 'jump',
    text: 'The crown shatters. White light pours out, loud, the first honest light this place has ever seen. The Hollows fall like leaves. The Eye weeps. And far below, a man in iron stands up.',
    choices: [
      { label: 'Walk down into the light', next: 'gate_opens', add: { heart: 1, trust: 1 }, set: 'broken' },
    ],
  },

  // ======================= the song (a rhythm game) =======================
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
    ch: 3, speaker: 'GUARDIAN', mood: 'dark', focus: 'guardian', scare: 'glitch',
    text: 'The melody falters, and the corruption surges. It is not too late. But the song must be whole.',
    choices: [
      { label: 'Try the song again', next: 'song_intro', retry: true },
      { label: 'Hold him instead', next: 'reconcile', add: { trust: 1 } },
    ],
  },

  // ======================= act two: day two (after the gate opens) =======================
  d2_wake: {
    ch: 6, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen',
    text: 'Day Two. The gate is open and nothing came through it, and the phone is still warm in your hand. The clock says 3:07. It said 3:07 yesterday. A new name sits at the top of your messages: YOU.',
    choices: [
      { label: 'Open the thread from YOU', next: 'd2_you', add: { dread: 1 } },
      { label: 'Message the Queen', next: 'd2_queen' },
      { label: 'Look at the new photo in your gallery', next: 'd2_photo' },
    ],
  },
  d2_queen: {
    ch: 6, speaker: 'QUEEN', mood: 'dusk', focus: 'queen',
    text: 'Is that you? I woke and the gate was open and I couldn\'t remember closing it. Vey says there is a way out. Vey says it a lot. How long have I been asleep?',
    choices: [
      { label: 'Believe her', next: 'd2_vey', add: { trust: 1 } },
      { label: 'Ask what she did with the time', next: 'd2_time', add: { dread: 1 } },
      { label: 'Tell her what the ledger said', next: 'd2_ledger_back', req: { flag: 'ledger' } },
    ],
  },
  d2_ledger_back: {
    ch: 6, speaker: 'NARRATOR', mood: 'dusk', focus: 'guardian', note: 'captain_name',
    text: 'The torn last page is on your screen now, as if the phone had been holding it for you. Under the warm edge, a signature: "Corvin Ash, captain, who held the door." You say the name out loud, and somewhere below, the dark leans in to listen.',
    choices: [
      { label: 'Call down to the Guardian', next: 'd2_captain', set: 'knew_name', add: { resolve: 1 } },
    ],
  },
  d2_time: {
    ch: 6, speaker: 'QUEEN', mood: 'dark', focus: 'queen', scare: 'glitch', call: { from: 'The Queen', sub: 'she is calling from 3:07' },
    text: 'I stopped the clocks. I think I stopped them. I asked the captain to hold the door for one night. It has been one night for such a very long time. Please, say something kind. I can feel the minutes standing behind me.',
    choices: [
      { label: 'Answer: tell her the truth', next: 'd2_captain', add: { heart: 1, dread: 1 } },
      { label: 'Decline the call', next: 'd2_stairs2', add: { dread: 1 } },
    ],
  },
  d2_photo: {
    ch: 6, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', dark: true, scare: 'eye', img: 'corrupt', note: 'photo_you',
    text: 'A photo you never took: you, from behind, holding this phone, in this room. The timestamp reads 3:07. The timestamp keeps reading 3:07. In the corner of the frame, someone has put a hand on your shoulder.',
    choices: [
      { label: 'Switch on the flashlight', next: 'd2_photo', light: 1, req: { noLight: 1 } },
      { label: 'Turn around', next: 'd2_turn' },
      { label: 'Put the phone down and open YOU', next: 'd2_you', add: { dread: 1 } },
    ],
  },
  d2_turn: {
    ch: 6, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump',
    text: 'Nothing is there. The phone buzzes in your hand. The photo has updated: now you are facing the camera, and you are smiling, and you are not.',
    choices: [
      { label: 'Open the thread from YOU', next: 'd2_you', add: { dread: 1 } },
    ],
  },
  d2_you: {
    ch: 6, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'glitch',
    text: 'this is your number. i am what you left on the other side of the gate. you opened it with trust or with a song or with nothing at all and it does not matter which. i only needed it open.',
    choices: [
      { label: 'What do you want?', next: 'd2_want' },
      { label: 'Play it a lullaby', next: 'd2_lull', req: { flag: 'lullaby' } },
      { label: 'Turn the phone off', next: 'end_loop' },
    ],
  },
  d2_want: {
    ch: 6, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'morning. i have never seen one. she locked time behind the gate so she would never have to feel it pass. i am what time looks like when nobody lets it end. take me to the bottom of the stairs. i will show you the door.',
    choices: [
      { label: 'Walk down the stairs', next: 'd2_stairs2' },
      { label: 'That is a lie', next: 'd2_vey', set: 'doubt2', add: { resolve: 1 } },
    ],
  },
  d2_lull: {
    ch: 6, speaker: 'EYE', mood: 'dawn', focus: 'queen',
    text: 'you sang to me. nobody ever sings to me. i will not be a door for you tonight. i will be a light. carry me down and i will keep the dark from stepping on your heels.',
    choices: [
      { label: 'Carry it down', next: 'd2_stairs2', set: 'ally', add: { heart: 1, dread: -1 } },
    ],
  },
  d2_vey: {
    ch: 6, speaker: 'VEY', mood: 'dark', focus: 'vey', scare: 'whisper',
    text: 'I have the Queen\'s voice, you know. She won\'t need it where she is going. Give me the phone and I will keep it warm. I keep everything warm. You can trust me. You always did.',
    choices: [
      { label: 'Give Vey the phone', next: 'end_loop' },
      { label: 'Refuse', next: 'd2_stairs2', set: 'refused_vey', add: { resolve: 1, dread: 1 } },
      { label: 'Say: I remember what you did', next: 'd2_vey_called', req: { min: { mem: 3 } } },
    ],
  },
  d2_vey_called: {
    ch: 6, speaker: 'VEY', mood: 'dark', focus: 'vey', scare: 'jump',
    text: 'You... remember? Nobody remembers. That is the whole kindness of the place. (It steps back, and for one second it is standing on two legs, with far too many hands, and all of them are covering its face.)',
    choices: [
      { label: 'Walk past it', next: 'd2_stairs2', set: 'vey_known', add: { resolve: 2, dread: 1 } },
    ],
  },
  d2_captain: {
    ch: 6, speaker: 'GUARDIAN', mood: 'dusk', focus: 'guardian',
    text: 'My lady asked me to hold the door. I held it. I held it so long I forgot my own name. If you know it, say it now, and I can put the door down. If you guess, I will believe you. That is the danger of me.',
    choices: [
      { label: 'Say: Corvin Ash', next: 'd2_name', req: { flag: 'knew_name' } },
      { label: 'Say: Aldric', next: 'd2_wrongname' },
      { label: 'Say: I don\'t know it', next: 'd2_vey', add: { dread: 1 } },
    ],
  },
  d2_wrongname: {
    ch: 6, speaker: 'GUARDIAN', mood: 'dark', focus: 'guardian', scare: 'glitch',
    text: 'Aldric. Yes. Yes, that is who I am. (The shadow on him tightens like a hand. It is a very good lie. It is not his.)',
    choices: [
      { label: 'Back away slowly', next: 'd2_vey', add: { dread: 2 } },
    ],
  },
  d2_name: {
    ch: 6, speaker: 'GUARDIAN', mood: 'dawn', focus: 'guardian',
    text: 'Corvin. Corvin Ash. (A long breath, like a man putting down something he forgot he was carrying.) Thank you. I can feel the door in my hands, and for the first time it is only a door.',
    choices: [
      { label: 'Walk down together', next: 'd2_stairs2', set: 'freed_name', add: { trust: 1, heart: 1 } },
    ],
  },
  d2_stairs2: {
    ch: 7, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', dark: true,
    text: 'The stairs are back, and this time they go down. Each step is a minute. For the first time since you woke, the clock in your status bar is counting up. It is 3:08. It is 3:09. Every step the dark is a little warmer, like the inside of a mouth.',
    choices: [
      { label: 'Switch on the flashlight', next: 'd2_stairs2', light: 1, req: { noLight: 1 } },
      { label: 'Count the steps', next: 'd2_clock', add: { dread: 1 } },
      { label: 'Do not count the steps', next: 'd2_clock', add: { resolve: 1 } },
    ],
  },
  d2_clock: {
    ch: 7, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'whisper',
    text: 'Halfway down, every skull in the wall begins, very quietly, to tell you the time. 3:12. 3:13. They have been waiting so long to be wrong about something. At the bottom, a door. It is not locked. It is held.',
    choices: [
      { label: 'Go to the door', next: 'd2_door' },
    ],
  },
  d2_door: {
    ch: 7, speaker: 'NARRATOR', mood: 'gate', focus: 'gate',
    text: 'The door the Queen locked: iron, warm, with a keyhole the shape of a phone. Behind it, you can hear a morning breathing. Someone has to hold it open, or someone has to remember what it is called.',
    choices: [
      { label: 'Hold the door yourself, so she can sleep', next: 'end_keeper', req: { min: { resolve: 3 } } },
      { label: 'Say their names together, and open it', next: 'end_daybreak', req: { flag: 'knew_name', min: { trust: 3, mem: 4 }, maxDread: 3 } },
      { label: 'Put the phone in the lock and turn it off', next: 'end_loop' },
    ],
  },
  end_daybreak: {
    ch: 7, speaker: 'NARRATOR', mood: 'dawn', focus: 'gate', ending: 'daybreak',
    text: 'The door opens on morning.', choices: [],
  },
  end_keeper: {
    ch: 7, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', ending: 'keeper',
    text: 'You hold the door.', choices: [],
  },
  end_loop: {
    ch: 7, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', ending: 'loop',
    text: 'It is 3:07.', choices: [],
  },

  // ======================= act three: day three (the Eye, and three rites) =======================
  d3_wake: {
    ch: 8, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'glitch',
    text: 'day three. i have been practising your face. come down: i have set a table, and lit the doors. there are three rooms between us, and every one of them wants a song.',
    choices: [
      { label: 'Open the photo it sent', next: 'd3_photo', add: { dread: 1 } },
      { label: 'Switch on the flashlight', next: 'd3_wake', light: 1, req: { noLight: 1 } },
      { label: 'Go down to the first door', next: 'd3_hall' },
    ],
  },
  d3_photo: {
    ch: 8, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', dark: true, scare: 'eye', img: 'eye', note: 'eye_stairs',
    text: 'A staircase going down into a ceiling-high red Eye. Every step is lit from below, one by one, like a welcome. The photo was taken from exactly where you are standing, a half second from now.',
    choices: [
      { label: 'Switch on the flashlight', next: 'd3_photo', light: 1, req: { noLight: 1 } },
      { label: 'Count the doors on the stairs', next: 'd3_hall', add: { dread: 1 } },
      { label: 'Go down anyway', next: 'd3_hall', add: { resolve: 1 } },
    ],
  },
  d3_hall: {
    ch: 8, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', song: 'doors', scare: 'whisper',
    text: 'The Hall of Doors. A hundred of them, shut, and every one is listening. Raise the flute: each note you catch makes one of them open. Each note you drop, something on the other side leans on it.',
    songNext: { win: 'd3_doors_win', fail: 'd3_doors_fail', give: 'd3_doors_give' },
  },
  d3_doors_win: {
    ch: 8, speaker: 'QUEEN', mood: 'dusk', focus: 'queen',
    text: 'Every door you played open stayed open, and not one of them had anything behind it but the next room. I have not heard my own song in so long. It sounds like someone I used to be.',
    choices: [
      { label: 'Step through', next: 'd3_fork', add: { heart: 1 } },
    ],
  },
  d3_doors_fail: {
    ch: 8, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', scare: 'jump',
    text: 'A door slams on the song. The wood bows inward, like a held breath. Something on the other side has put its whole weight on it, patiently, and is waiting for you to be quiet.',
    choices: [
      { label: 'Play it again', next: 'd3_hall', retry: true },
      { label: 'Leave the doors shut and find another way', next: 'd3_doors_give', add: { dread: 1 } },
    ],
  },
  d3_doors_give: {
    ch: 8, speaker: 'VEY', mood: 'dark', focus: 'vey', scare: 'whisper',
    text: 'Oh, don\'t play for them. Doors are rude. There is a servants\' stair behind the third one, and only Vey knows which third. (A small warm hand slides into yours before you have said yes.)',
    choices: [
      { label: 'Follow Vey', next: 'd3_fork', set: 'skipped_doors', add: { dread: 1 } },
    ],
  },
  d3_fork: {
    ch: 8, speaker: 'NARRATOR', mood: 'dark', focus: 'gate',
    text: 'The hall splits three ways. A red corridor, where the walls are wet and the floor is warm. A servants\' stair that smells like Vey\'s hands. And a plain door with a name scratched into it in a soldier\'s neat handwriting.',
    choices: [
      { label: 'Take the red corridor', next: 'd3_blood', add: { resolve: 1 } },
      { label: 'Follow Vey down the servants\' stair', next: 'd3_vey3', add: { dread: 1 } },
      { label: 'Knock on the plain door', next: 'd3_corvin', req: { flag: 'knew_name' } },
    ],
  },
  d3_blood: {
    ch: 8, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', song: 'blood', scare: 'eye',
    text: 'The Red Corridor. The walls weep as you walk, and the weeping keeps time. Keep the song whole and the walls stay walls. Drop it, and they remember they were something else.',
    songNext: { win: 'd3_blood_win', fail: 'd3_blood_fail', give: 'd3_blood_give' },
  },
  d3_blood_win: {
    ch: 8, speaker: 'QUEEN', mood: 'dawn', focus: 'queen',
    text: 'It dried. Look, it dried, and it was only paint. Someone painted the whole corridor to look like something was hurt here. Nobody was. Somebody just wanted very badly to be believed.',
    choices: [
      { label: 'Follow the dry floor', next: 'd3_table', add: { heart: 1 } },
    ],
  },
  d3_blood_fail: {
    ch: 8, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', scare: 'jump',
    text: 'A crack runs the length of the corridor, and the wall splits down its middle like a mouth. What comes out is warm and red, and it is not the worst thing here. The worst thing is that it knows your name.',
    choices: [
      { label: 'Raise the flute again', next: 'd3_blood', retry: true },
      { label: 'Cover your eyes and run', next: 'd3_blood_give', add: { dread: 1 } },
    ],
  },
  d3_blood_give: {
    ch: 8, speaker: 'NARRATOR', mood: 'dark', focus: 'gate',
    text: 'You run with your eyes shut and a hand over the screen. The floor goes slick, then dry, then gone. When you open your eyes the corridor is behind you and your sleeve is the wrong colour.',
    choices: [
      { label: 'Do not look at your sleeve', next: 'd3_table', add: { dread: 1 } },
    ],
  },
  d3_vey3: {
    ch: 8, speaker: 'VEY', mood: 'dark', focus: 'vey', scare: 'whisper',
    text: 'The stair is not shorter, only quieter. I can carry you. I can carry the phone. I can carry what is on the phone, which is more than you know. Come. I have never once let anything fall.',
    choices: [
      { label: 'Take its hand', next: 'd3_table', set: 'vey3_hand', add: { dread: 1 } },
      { label: 'Say: I know what you are', next: 'd3_vey3_names', req: { min: { mem: 2 } } },
      { label: 'Go back to the fork', next: 'd3_fork' },
    ],
  },
  d3_vey3_names: {
    ch: 8, speaker: 'VEY', mood: 'dark', focus: 'vey', scare: 'glitch',
    text: 'It lets go. For one second there are far too many hands, and every one of them is trying to cover a different part of its face. "Fine," it says in someone else\'s voice. "Go down. I will be at the bottom. I am always at the bottom."',
    choices: [
      { label: 'Walk down on your own', next: 'd3_table', set: 'vey3_cowed', add: { resolve: 1 } },
    ],
  },
  d3_corvin: {
    ch: 8, speaker: 'GUARDIAN', mood: 'dusk', focus: 'guardian',
    text: 'You knew it. You said it, and I kept it. (The door opens an inch, and a lantern comes out on the end of an iron arm.) I can not leave this door. I can give you what I have. A lamp. A promise to hold the door behind you.',
    choices: [
      { label: 'Take the lantern', next: 'd3_table', set: 'corvin_lamp', bat: -20, add: { dread: -1 } },
      { label: 'Ask him to hold the door behind you', next: 'd3_table', set: 'corvin_door', add: { resolve: 1 } },
    ],
  },
  d3_table: {
    ch: 8, speaker: 'EYE', mood: 'throne', focus: 'queen', dark: true, scare: 'eye', img: 'eye',
    text: 'A long table with one chair, laid for one, and above it, the Eye, close enough to feel its breath on the glass of the phone. "Sit," it says. "I have been practising. I know how to say please. Will you sing me one thing? Just one. Nobody ever has."',
    choices: [
      { label: 'Switch on the flashlight', next: 'd3_table', light: 1, req: { noLight: 1 } },
      { label: 'Sing to it', next: 'd3_lull', add: { heart: 1 } },
      { label: 'Look it in the eye and say nothing', next: 'd3_stare', req: { maxDread: 4 } },
      { label: 'Turn the phone face down', next: 'end_watched' },
    ],
  },
  d3_stare: {
    ch: 8, speaker: 'EYE', mood: 'throne', focus: 'queen', scare: 'whisper',
    text: 'It blinks first. Nobody has ever made it blink. It looks, for one second, very afraid, and very glad. "You did not look away," it says. "Why does that feel like being sung to?"',
    choices: [
      { label: 'Say: sit down, I will teach you one', next: 'd3_lull', add: { resolve: 1, dread: 1 } },
    ],
  },
  d3_lull: {
    ch: 8, speaker: 'EYE', mood: 'throne', focus: 'queen', song: 'lull', scare: 'whisper',
    text: 'The Eye\'s Lullaby. It does not know any songs, so it will learn this one from you, off your fingers, a note at a time. It will try to scare you out of it. It is only afraid you will stop.',
    songNext: { win: 'd3_lull_win', fail: 'd3_lull_fail', give: 'd3_lull_give' },
  },
  d3_lull_win: {
    ch: 8, speaker: 'EYE', mood: 'dawn', focus: 'queen',
    text: 'again. play it again. no, do not play it again, i would only want it again. (Something very large lowers its head to the table, and the red light goes out of the room by degrees, like a child finally falling asleep.)',
    choices: [
      { label: 'Sit with it', next: 'd3_finale', add: { heart: 1, dread: -1 } },
    ],
  },
  d3_lull_fail: {
    ch: 8, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'jump',
    text: 'that was wrong. (The table splits. The light turns the colour of the inside of an eyelid.) that was wrong, and i learned it anyway, and now i can not stop hearing it.',
    choices: [
      { label: 'Try it again, gently', next: 'd3_lull', retry: true },
      { label: 'Stop singing', next: 'd3_lull_give', add: { dread: 1 } },
    ],
  },
  d3_lull_give: {
    ch: 8, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'you stopped. everyone stops. (It is not angry. That is the worst of it.) it is all right. it is very late. i will keep the table set.',
    choices: [
      { label: 'Stand up', next: 'd3_finale', add: { dread: 1 } },
    ],
  },
  d3_finale: {
    ch: 8, speaker: 'EYE', mood: 'throne', focus: 'gate', scare: 'eye',
    text: 'The room waits. The doors are open behind you, or shut, or gone. The Eye is not hungry. It is only very, very large, and it has been listening to you carry this phone for three days. The next thing you do is the last thing it will remember about you.',
    choices: [
      { label: 'Sing all three songs as one', next: 'end_chorus', req: { all: ['rite_doors', 'rite_blood', 'rite_lull'] } },
      { label: 'Hold the Eye\'s door so it can sleep', next: 'end_keeper', req: { min: { resolve: 3 } } },
      { label: 'Look away', next: 'end_watched' },
    ],
  },
  end_chorus: {
    ch: 8, speaker: 'NARRATOR', mood: 'dawn', focus: 'gate', ending: 'chorus',
    text: 'The Eye sings back.', choices: [],
  },
  end_watched: {
    ch: 8, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', ending: 'watched',
    text: 'You look away.', choices: [],
  },

  // ======================= forced scenes (they interrupt wherever she is) =======================
  blackout: {
    ch: 3, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'blackout', safe: true,
    text: 'The screen dims. Dims. The last bar of battery blinks once and goes out. The dark is not empty.',
    choices: [
      { label: 'Hold the phone to the crystal', next: '@back', bat: -35, req: { flag: 'crystal' } },
      { label: 'Strike the flute on the stone for a spark', next: '@back', bat: -12, req: { min: { resolve: 3 } }, add: { dread: 1 } },
      { label: 'Wait for the light', next: 'end_blackout' },
      { label: 'Scream for help', next: 'end_blackout' },
    ],
  },
  hollowing: {
    ch: 3, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'glitch', safe: true,
    text: 'Her edges are coming undone. Names fall out of her like loose teeth. Somewhere a small warm hand (Vey\'s, or something wearing it) closes over hers.',
    choices: [
      { label: 'Take the hand', next: '@back', req: { min: { trust: 3 } }, add: { dread: -3 } },
      { label: 'Let go', next: 'end_hollow' },
    ],
  },

  // ======================= the endings =======================
  gate_opens: {
    ch: 3, speaker: 'NARRATOR', mood: 'gate', focus: 'gate', ending: 'auto',
    text: 'The gate opens.',
    choices: [],
  },
  end_mirror: {
    ch: 4, speaker: 'NARRATOR', mood: 'gate', focus: 'gate', ending: 'mirror',
    text: 'She takes his place in the dark.', choices: [],
  },
  end_eye: {
    ch: 5, speaker: 'NARRATOR', mood: 'throne', focus: 'gate', ending: 'eye',
    text: 'The Eye opens all the way.', choices: [],
  },
  end_hollow: {
    ch: 3, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', ending: 'hollow',
    text: 'She lets go.', choices: [],
  },
  end_blackout: {
    ch: 3, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', ending: 'blackout',
    text: 'Zero percent.', choices: [],
  },
};

// ---- the endings (decided by endingFor, or fixed by the node that reaches them) ----
ABY.ENDINGS = {
  dawn: { tag: 'FREE THE GUARDIAN WITH TRUST', name: 'The Gate Opens', hint: 'Free the Guardian with trust.', mood: 'dawn', cont: 'd2_wake',
    text: 'The gate opens. The corruption dissipates. At last, peace. And in the distance, another gate shimmered, and another echo called her name.' },
  song: { tag: 'PLAY THE WHOLE SONG OF RECALL', name: 'The Song Remembered', hint: 'Play the whole Song of Recall.', mood: 'dawn', cont: 'd2_wake',
    text: 'Every note found its place. The song poured through the gate and the shadows sang back. The Guardian remembered his name, and she remembered hers.' },
  echo: { tag: 'HEART, COURAGE AND TRUST', name: 'Another Gate', hint: 'Walk the path with heart, courage and trust, and keep your nerve.', mood: 'gate', cont: 'd2_wake',
    text: 'Heart, courage and trust: the gate does not open. It unfolds. Beyond it stretch a thousand more gates, and every one of them is humming her song.' },
  silence: { tag: 'THE GATE OPENS. NOTHING FOLLOWS.', name: 'The Quiet Gate', hint: 'Open the gate without trust.', mood: 'gate', cont: 'd2_wake',
    text: 'The gate opens, and nothing follows. The Guardian is free, but the hum is gone from the air. She walks on alone, the flute silent at her back.' },
  crown: { tag: 'TAKE THE CROWN FOR YOURSELF', name: 'The Crown of Shadows', hint: 'Take the crown for yourself.', mood: 'throne',
    text: 'The crown settles on her brow and the whole void bows. It is a very quiet kind of power. Somewhere far away, a flute falls to the floor.' },
  hollow: { tag: 'LOCK THE DOOR AGAIN', name: 'The Hollow Queen', hint: 'Let the dread take her, or lock the door again.', mood: 'dark',
    text: 'The door locks. The key is warm. By morning she can no longer remember which side of it she is standing on, and the Hollows kneel to what they take for a queen.' },
  eye: { tag: 'ANSWER THE EYE', name: 'The Eye Opens', hint: 'Climb the stairs and answer the Eye.', mood: 'throne',
    text: 'She answers, and the Eye opens all the way. It is not hungry. It is lonely, and now it is looking at everything that ever looked away. The phone goes warm in your hand. Your reflection in the black glass blinks half a second late.' },
  mirror: { tag: 'TAKE HIS PLACE IN THE DARK', name: 'The Other Queen', hint: 'Learn the truth in the vault, and pay for it.', mood: 'dark',
    text: 'She takes his place in the dark, and the door swings shut on the right side. The Guardian climbs into the light, free, weeping. Her thin voice reaches you one last time through the phone: "Hold the line. Someone has to be on this side."' },
  betrayal: { tag: 'TRUST VEY WHEN YOU SHOULD NOT', name: 'Vey’s Smile', hint: 'Trust Vey after you have seen what Vey is.', mood: 'dark',
    text: 'The gate opens and Vey is the first thing through it. It turns, takes one polite step back toward her, and smiles with a mouth much too wide. "Thank you for trusting me," it says in the Queen\'s voice. "It is so hard to wear someone who is paying attention."' },
  daybreak: { tag: 'DAY TWO: SAY THEIR NAMES, OPEN THE DOOR', name: 'Real Morning', hint: 'On Day Two, know the Guardian\'s name and open the door. The door only opens for someone it has seen before.', mood: 'dawn',
    text: 'You say both names together, and the door is only a door. Behind it there is a window, and in the window there is a thin grey line that gets brighter. 3:07 becomes 3:08. Then 6:00. The phone chimes once, like a bell in a village a long way off, and for the first time in a very long time nobody is awake who should not be.' },
  keeper: { tag: 'DAY TWO: HOLD THE DOOR YOURSELF', name: 'The Night Keeper', hint: 'On Day Two, hold the door so she can sleep.', mood: 'throne', cont: 'd3_wake',
    text: 'You hold the door so she can sleep. It is not so heavy, at first. The Guardian lies down in the warm grass and the Queen finally dreams something that is not a flute. On the phone it will always be 3:07, and your name will be the only message on it, and it will say: someone has to be on this side.' },
  loop: { tag: 'DAY TWO: TURN THE PHONE OFF', name: '3:07 Again', hint: 'On Day Two, turn the phone off, or give it away.', mood: 'dark', cont: 'd3_wake',
    text: 'The phone goes black and then, politely, it turns itself back on. 3:07. A new message from a number you do not know: you should not have woken up. The Queen opens her eyes on the floor of a very familiar room and has no idea who you are, and you cannot be certain, any more, that you do.' },
  chorus: { tag: 'DAY THREE: SING ALL THREE RITES AS ONE', name: 'The Eye Remembered', hint: 'On Day Three, win all three rites, then sing them as one.', mood: 'dawn',
    text: 'You sing the doors and the red corridor and the lullaby as one song, and the Eye, which has never been sung to, sings the last line back, a little wrong, perfectly. Every door in the Abyss opens at once, and for the first time anything that was ever watched there is allowed to look away.' },
  watched: { tag: 'DAY THREE: LOOK AWAY', name: 'The Watched', hint: 'On Day Three, look away from the Eye.', mood: 'dark',
    text: 'You look away. It is such a small thing. The Eye does not mind, not exactly. It only learns, very slowly, what it is to be looked away from, and starts to practise on you: every screen, every window, every dark glass you ever pass. It is always, quietly, watching.' },
  blackout: { tag: 'LET THE BATTERY DIE', name: 'Zero Percent', hint: 'Let the battery die in the dark.', mood: 'dark',
    text: 'The screen goes black and stays black. In the glass you can see your own face, lit from beneath by nothing. Somewhere very close, very gently, something starts to knock on the other side of the screen.' },
};
ABY.ENDING_IDS = Object.keys(ABY.ENDINGS);

// ---- state ----
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
ABY.newState = function (mem) {
  return { node: ABY.START, mem: Number.isInteger(mem) ? clamp(mem, 0, 99) : 0, heart: 0, resolve: 0, trust: 0, dread: 0, bat: ABY.BAT0, light: 0, flags: {}, notes: [], tries: 0, choices: 0, back: '' };
};

// what the gate does, given everything she did (the five hidden stats + the flags)
ABY.endingFor = function (s) {
  const f = s.flags || {};
  if (f.crown) return 'crown';
  if (f.vey_trusted && !f.vey_doubt && s.dread >= 3) return 'betrayal';
  if (f.sealed) return 'hollow';
  if (f.song === 'win') return 'song';
  if (f.lullaby) return 'echo';
  if (f.broken) return 'dawn';
  if (s.heart >= 2 && s.resolve >= 2 && s.trust >= 2 && s.dread <= 2) return 'echo';
  if (s.trust >= 2 || f.truth) return 'dawn';
  return 'silence';
};
// the ending a node shows (the gate decides; the other final nodes fix theirs)
ABY.endingOf = function (s) { const n = ABY.NODES[s.node]; return n && n.ending ? (n.ending === 'auto' ? ABY.endingFor(s) : n.ending) : null; };

// does a choice's rule hold?
ABY.okReq = function (s, r) {
  if (!r) return true;
  if (r.flag && !s.flags[r.flag]) return false;
  if (r.noflag && s.flags[r.noflag]) return false;
  if (r.all) for (const f of r.all) if (!s.flags[f]) return false;
  if (r.min) for (const k in r.min) if ((s[k] || 0) < r.min[k]) return false;
  if (r.maxDread !== undefined && s.dread > r.maxDread) return false;
  if (r.minDread !== undefined && s.dread < r.minDread) return false;
  if (r.light && !s.light) return false;
  if (r.noLight && s.light) return false;
  return true;
};
// the choices she can see right now: [{ i: its index in the node, c: the choice }]
ABY.options = function (s) {
  const n = ABY.NODES[s.node], out = [];
  if (n && n.choices) n.choices.forEach((c, i) => { if (ABY.okReq(s, c.req)) out.push({ i, c }); });
  return out;
};


// a choice taken (i = its index in the node): returns the new state (never mutates), or null if it is not an available choice
ABY.choose = function (s, i) {
  const n = ABY.NODES[s.node], c = n && n.choices && n.choices[i];
  if (!c || !ABY.okReq(s, c.req)) return null;
  const o = { node: c.next, mem: s.mem || 0, heart: s.heart, resolve: s.resolve, trust: s.trust, dread: s.dread, bat: s.bat, light: s.light, flags: Object.assign({}, s.flags), notes: s.notes.slice(), tries: s.tries, choices: s.choices + 1, back: s.back };
  if (c.next === '@back') { o.node = s.back || ABY.START; o.back = ''; }
  if (!ABY.NODES[o.node]) return null;
  if (c.add) { for (const k of ABY.STATS) if (c.add[k]) o[k] = clamp(o[k] + c.add[k], 0, 5); if (c.add.dread) o.dread = clamp(o.dread + c.add.dread, 0, ABY.MAX_DREAD); }
  if (c.set) o.flags[c.set] = 1;
  if (c.retry) o.tries++;
  if (c.light !== undefined) o.light = c.light ? 1 : 0;
  o.bat -= (c.bat !== undefined ? c.bat : 1) + (s.light ? ABY.TORCH : 0);
  return ABY._land(o);
};

// she arrives at o.node: a dark room without the light frightens her, a clue is filed, and the phone or her mind can break first
ABY._land = function (o) {
  const n = ABY.NODES[o.node];
  if (n.note && o.notes.indexOf(n.note) < 0) o.notes.push(n.note);
  if (n.dark && !o.light) o.dread = clamp(o.dread + 1, 0, ABY.MAX_DREAD);
  o.bat = clamp(o.bat, 0, 100);
  const forced = !n.safe && !n.ending;                           // endings and the forced scenes themselves are never interrupted
  if (forced && o.bat <= 0) { o.back = o.node; o.node = 'blackout'; o.light = 0; }
  else if (forced && o.dread >= ABY.MAX_DREAD) { o.back = o.node; o.node = 'hollowing'; }
  return o;
};

// the flashlight, switched by hand (not a story choice): costs a little battery; returns the new state
ABY.toggleLight = function (s) {
  const n = ABY.NODES[s.node]; if ((n && n.ending) || s.bat <= 0) return s;                  // a dead phone has no light to switch
  const o = Object.assign({}, s, { flags: Object.assign({}, s.flags), notes: s.notes.slice(), light: s.light ? 0 : 1, bat: s.bat - ABY.TORCH_TOGGLE });
  if (o.bat <= 0 && !(n && n.safe)) { o.bat = 0; return ABY._land(Object.assign(o, { node: s.node })); }
  o.bat = Math.max(0, o.bat);
  return o;
};

// Day Two: an ending that has a way on (`cont`) can be carried into the next act. She keeps her stats, flags and clues; the dread eases, the phone is
// recharged to at least 48 and the flashlight is off. Returns null when the ending is final.
ABY.carry = function (s) {
  const id = ABY.endingOf(s), E = id && ABY.ENDINGS[id]; if (!E || !E.cont) return null;
  return Object.assign({}, s, { node: E.cont, flags: Object.assign({}, s.flags), notes: s.notes.slice(), dread: Math.max(0, s.dread - 2), bat: Math.max(s.bat, 48), light: 0, tries: 0, back: '' });
};

// ---- badges and factions (a player's own, kept on their phone) ----
// A badge is earned at an ending, from what she found so far (`found`: { endingId: 1 }) and the state she ended in. Pure, so the graph test can check it.
ABY.BADGES = [
  { id: 'first_light', name: 'First Light', hint: 'Find your first ending.' },
  { id: 'night_owl', name: 'Night Owl', hint: 'Let the battery die in the dark.' },
  { id: 'hollowed', name: 'Hollowed Out', hint: 'Let the dread take her.' },
  { id: 'crowned', name: 'Crowned', hint: 'Wear the crown of shadows.' },
  { id: 'truth_teller', name: 'Truth-Teller', hint: 'Take his place in the dark.' },
  { id: 'fearless', name: 'Fearless', hint: 'Reach an ending with dread at 1 or less.' },
  { id: 'lamplighter', name: 'Lamplighter', hint: 'Reach an ending with the battery above 30%.' },
  { id: 'name_keeper', name: 'Name-Keeper', hint: 'Learn the Guardian\'s name.' },
  { id: 'day_two', name: 'Day Two', hint: 'Reach an ending on Day Two.' },
  { id: 'collector', name: 'Collector', hint: 'Find 5 endings.' },
  { id: 'real_morning', name: 'Real Morning', hint: 'Open the door on Day Two.' },
  { id: 'completionist', name: 'Completionist', hint: 'Find every ending.' },
];
ABY.BADGE_IDS = ABY.BADGES.map(b => b.id);
ABY.badgesFor = function (found, s) {
  const id = ABY.endingOf(s), n = ABY.ENDING_IDS.filter(e => found[e]).length, f = s.flags || {}, out = [];
  if (n >= 1) out.push('first_light');
  if (id === 'blackout') out.push('night_owl');
  if (id === 'hollow') out.push('hollowed');
  if (id === 'crown') out.push('crowned');
  if (id === 'mirror') out.push('truth_teller');
  if (id && s.dread <= 1) out.push('fearless');
  if (id && s.bat >= 30) out.push('lamplighter');
  if (id && f.knew_name) out.push('name_keeper');
  if (id === 'daybreak' || id === 'keeper' || id === 'loop') out.push('day_two');
  if (n >= 5) out.push('collector');
  if (id === 'daybreak') out.push('real_morning');
  if (n >= ABY.ENDING_IDS.length) out.push('completionist');
  return out;
};
// the three factions: where her choices lean. A player pledges to one (their own choice); it ranks up with badges.
ABY.FACTIONS = {
  choir: { name: 'The Choir of Recall', color: '#39e6ff', blurb: 'Those who sing the lost back. They trust the song.' },
  order: { name: 'The Order of the Door', color: '#ffd34d', blurb: 'Those who hold the door so others can sleep. They trust resolve.' },
  court: { name: 'The Hollow Court', color: '#c46bff', blurb: 'Those the dark has kept. They trust what is watching.' },
};
ABY.FACTION_IDS = Object.keys(ABY.FACTIONS);
ABY.leaning = function (s) {
  const f = s.flags || {}, sc = {
    choir: s.heart + (f.lullaby ? 1 : 0) + (f.song === 'win' ? 1 : 0),
    order: s.resolve + (f.knew_name ? 1 : 0) + (f.ledger ? 1 : 0),
    court: s.dread + (f.crown ? 2 : 0) + (f.vey_trusted ? 1 : 0),
  };
  return ABY.FACTION_IDS.reduce((a, k) => sc[k] > sc[a] ? k : a, 'choir');
};
ABY.rank = function (badges) { const n = badges; return n >= 7 ? 'Elder' : n >= 3 ? 'Adept' : 'Initiate'; };

// the song ended: 'win' or 'fail' decides what comes next. The Song of Recall goes to the Guardian; a rite (a node with `song: '<id>'`) sets its own flag
// (`rite_<id>` on a win, `fail_<id>` on a loss) and goes to the node's `songNext`. A rite can only be retried ABY.MAX_SONG_TRIES times.
ABY.songDone = function (s, won) {
  const o = Object.assign({}, s, { flags: Object.assign({}, s.flags), notes: s.notes.slice() }), n = ABY.NODES[s.node], id = n && typeof n.song === 'string' ? n.song : '';
  if (id && n.songNext) {
    if (won) { o.flags['rite_' + id] = 1; o.tries = 0; } else o.flags['fail_' + id] = 1;
    o.node = won ? n.songNext.win : (s.tries >= ABY.MAX_SONG_TRIES ? n.songNext.give : n.songNext.fail);
    return o;
  }
  o.flags.song = won ? 'win' : 'fail';
  o.node = won ? 'song_win' : (s.tries >= ABY.MAX_SONG_TRIES ? 'reconcile' : 'song_fail');
  return o;
};

// a saved state of unknown shape -> a safe one (a hand-edited save can't jump to a node that isn't there)
ABY.cleanState = function (raw) {
  const s = ABY.newState();
  if (!raw || typeof raw !== 'object') return s;
  const ok = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(ABY.NODES, id);
  if (ok(raw.node) && !ABY.NODES[raw.node].ending) s.node = raw.node;
  if (Number.isInteger(raw.mem)) s.mem = clamp(raw.mem, 0, 99);
  for (const k of ABY.STATS) if (Number.isInteger(raw[k])) s[k] = clamp(raw[k], 0, 5);
  if (Number.isInteger(raw.dread)) s.dread = clamp(raw.dread, 0, ABY.MAX_DREAD);
  if (Number.isInteger(raw.bat)) s.bat = clamp(raw.bat, 1, 100);
  if (raw.light === 1) s.light = 1;
  if (Number.isInteger(raw.tries)) s.tries = clamp(raw.tries, 0, ABY.MAX_SONG_TRIES);
  if (Number.isInteger(raw.choices)) s.choices = clamp(raw.choices, 0, 999);
  if (ok(raw.back) && !ABY.NODES[raw.back].ending && !ABY.NODES[raw.back].safe) s.back = raw.back;
  if (!ABY.NODES[s.node].safe) s.back = '';
  if (raw.flags && typeof raw.flags === 'object') {
    for (const k of ABY.FLAGS) if (raw.flags[k] === 1) s.flags[k] = 1;
    if (raw.flags.song === 'win' || raw.flags.song === 'fail') s.flags.song = raw.flags.song;
    for (const r of ABY.RITE_IDS) for (const k of ['rite_' + r, 'fail_' + r]) if (raw.flags[k] === 1) s.flags[k] = 1;
  }
  if (Array.isArray(raw.notes)) for (const k of raw.notes) if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(ABY.NOTES, k) && s.notes.indexOf(k) < 0) s.notes.push(k);
  return s;
};
// every flag the story can set (a save may only carry these); the rite flags are set by songDone, not by a choice
ABY.FLAGS = (function () { const f = {}; for (const id in ABY.NODES) for (const c of (ABY.NODES[id].choices || [])) if (c.set) f[c.set] = 1; return Object.keys(f); })();

if (typeof module !== 'undefined') module.exports = ABY;
