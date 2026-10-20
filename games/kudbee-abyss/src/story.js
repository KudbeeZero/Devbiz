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
  { n: 9, label: 'Day Four' },
  { n: 10, label: 'Day Five' },
  { n: 11, label: 'Day Six' },
  { n: 12, label: 'Day Seven' },
];

ABY.SPEAKERS = {
  NARRATOR: { color: '#cfe9ff', focus: 'queen' },
  QUEEN: { color: '#39e6ff', focus: 'queen' },
  GUARDIAN: { color: '#ff8a5c', focus: 'guardian' },
  VEY: { color: '#7cffb2', focus: 'vey' },
  EYE: { color: '#ff4d5e', focus: 'queen' },
  CHOIR: { color: '#7fe0d0', focus: 'queen' },
  WREN: { color: '#ffc27a', focus: 'queen' },
  SORREL: { color: '#ff9ab8', focus: 'queen' },
};

ABY.START = 'awakening';
// the ten beginnings. A player's first journey always opens on ABY.START; every journey after that is scrambled into one of these
// (never the one they just had), so the same haze is found from a lift, a bath, a night bus... (each node carries a `teaser` for the lock screen)
ABY.OPENINGS = ['awakening', 'op_lift', 'op_bath', 'op_bus', 'op_ward', 'op_shore', 'op_party', 'op_lost', 'op_voicemail', 'op_snow'];
// rnd: a number in [0, 1); found: endings found so far; last: the opening of the journey before. Pure, so the graph test can check it.
ABY.pickOpening = function (rnd, found, last) {
  if (!found) return ABY.START;
  const pool = ABY.OPENINGS.filter(o => o !== last);
  return pool[Math.min(pool.length - 1, Math.floor((Number(rnd) || 0) * pool.length))];
};
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
  choir: { name: 'THE DROWNED CHOIR', step: 0.40, tint: '#3fd6c0', lanes: ['#3fd6c0', '#8fb8ff', '#e8f6ff'],
    mel: [[0, 0], [2, 2], [3, 1], [5, 1], [3, 2], [2, 1], [0, 1], [2, 2], [5, 1], [7, 1], [5, 1], [3, 2], [2, 1], [3, 1], [5, 2], [7, 1], [9, 1], [7, 2], [5, 1], [3, 1], [2, 1], [0, 2], [3, 1], [5, 1], [7, 1], [5, 1], [3, 1], [2, 1], [0, 3]],
    fx: [[1, 'drip'], [4, 'whisper'], [8, 'drip'], [11, 'knock'], [15, 'dark'], [18, 'scream'], [22, 'drip'], [26, 'flash'], [30, 'whisper']] },
  wake: { name: 'THE 3:07 WAKE-UP', step: 0.36, tint: '#ffc27a', lanes: ['#ffc27a', '#ff7aa8', '#9be7ff'],
    mel: [[5, 0], [5, 1], [3, 1], [5, 2], [7, 1], [5, 1], [3, 2], [2, 1], [3, 1], [5, 1], [7, 2], [9, 1], [7, 1], [5, 2], [3, 1], [2, 1], [0, 2], [2, 1], [3, 1], [5, 1], [3, 1], [5, 1], [7, 1], [8, 1], [9, 2], [7, 1], [5, 1], [3, 1], [5, 3]],
    fx: [[2, 'knock'], [6, 'flash'], [10, 'drip'], [13, 'door'], [17, 'whisper'], [21, 'crack'], [25, 'flash'], [29, 'scream']] },
};
// the two hard rites (optional, late): faster, longer, and with CHORDS: a third number [note, steps, note2] drops two notes in two lanes at once, and
// both have to be struck together for a SLAM (the Kudbee Riff idea). `win` is how much of the song has to be whole; the plain rites ask for 60%.
ABY.RITES.bells = { name: 'THE DROWNED BELLS', step: 0.27, win: 0.66, fall: 1.1, tint: '#7fe0ff', lanes: ['#7fe0ff', '#c9a8ff', '#fff1b0'],
  mel: [
    [3, 0], [5, 1], [7, 1], [5, 1], [3, 1, 0], [2, 2], [3, 1], [5, 1], [7, 1], [9, 1], [7, 1], [5, 1, 2], [6, 2], [5, 1], [3, 1], [5, 1], [6, 1], [7, 1], [9, 1, 3], [8, 2], [7, 1], [5, 1], [3, 1], [2, 1], [0, 1], [2, 1, 7],
    [9, 3], [7, 1], [9, 1], [7, 1], [5, 1], [7, 1], [5, 1, 0], [3, 1], [5, 1], [3, 1], [2, 1], [3, 1, 9], [5, 2], [6, 1], [7, 1], [8, 1], [9, 1], [8, 1], [7, 1], [6, 1, 1], [5, 2], [3, 1], [2, 1], [0, 1], [2, 2, 6],
    [5, 3], [7, 1], [5, 1], [7, 1], [9, 1], [7, 1], [5, 1, 0], [3, 2], [5, 1], [3, 1], [5, 1], [7, 1], [5, 1], [3, 1, 9], [2, 2], [3, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1, 1], [7, 2], [5, 1], [7, 1], [9, 1], [8, 1], [7, 1], [5, 1, 2], [3, 2], [2, 1], [0, 1, 6], [0, 3, 7]],
  fx: [[2, 'drip'], [8, 'whisper'], [14, 'knock'], [20, 'dark'], [27, 'drip'], [34, 'scream'], [41, 'flash'], [48, 'blood'], [55, 'knock'], [62, 'door'], [70, 'scream'], [78, 'flash'], [86, 'dark'], [94, 'scream']] };
ABY.RITES.riff = { name: 'THE 3:07 RIFF', step: 0.25, win: 0.72, fall: 1.0, tint: '#ff4d9a', lanes: ['#ff4d9a', '#ffd34d', '#39e6ff'],
  mel: [
    [0, 0, 3], [0, 1], [0, 1, 3], [2, 2, 5], [0, 1], [2, 1, 5], [3, 2, 6], [2, 1], [0, 1, 3], [0, 2],
    [5, 3], [6, 1], [7, 1], [9, 1], [7, 1], [6, 1], [5, 1], [3, 1], [5, 1], [6, 1], [8, 1, 2], [7, 2], [9, 1], [8, 1], [7, 1, 1], [5, 2], [3, 1], [5, 1, 0],
    [0, 2, 3], [0, 1], [0, 1, 3], [2, 2, 5], [0, 1], [2, 1, 5], [3, 2, 6], [5, 1], [3, 1, 7], [2, 2],
    [3, 3, 7], [3, 1, 7], [5, 1, 9], [2, 2, 6], [0, 1, 5], [2, 1, 7], [3, 1], [5, 1], [7, 1], [9, 1], [7, 1], [5, 1], [3, 1], [2, 1, 8], [0, 2, 3], [0, 1, 6],
    [6, 2], [7, 1], [9, 1], [7, 1, 2], [6, 1], [5, 1], [3, 1, 8], [2, 1], [3, 1], [5, 1, 9], [7, 2, 0], [5, 1], [3, 1, 6], [2, 2, 5], [0, 1, 3], [0, 3, 7]],
  fx: [[0, 'knock'], [6, 'flash'], [12, 'knock'], [20, 'scream'], [28, 'door'], [36, 'flash'], [44, 'blood'], [52, 'crack'], [60, 'scream'], [68, 'flash'], [76, 'blood'], [84, 'scream'], [92, 'flash']] };
// the finale: every song so far, in pairs and threes. Not as fast as the riff, but the longest, with the most chords, and it asks for 70%.
ABY.RITES.seventh = { name: 'THE SEVENTH NIGHT', step: 0.29, win: 0.7, fall: 1.2, tint: '#ff4d5e', lanes: ['#ff6ec7', '#39e6ff', '#ffd34d'],
  mel: [
    [2, 0], [3, 1], [5, 1], [3, 1], [2, 1], [0, 2, 5], [2, 1], [3, 1], [5, 1], [7, 1], [5, 2, 0], [3, 1], [2, 1], [3, 1], [5, 1], [7, 1], [9, 1], [8, 2, 3],
    [2, 3, 6], [2, 2], [3, 1], [2, 2, 7], [0, 2], [2, 1], [3, 1], [5, 2, 9], [3, 1], [2, 1], [3, 2, 0],
    [0, 3, 3], [0, 1], [0, 1, 3], [2, 2, 5], [0, 1], [2, 1, 5], [3, 2, 6], [2, 1], [0, 1, 3],
    [5, 3], [3, 1], [5, 1], [7, 1], [5, 2, 1], [3, 1], [2, 1], [3, 2, 7], [5, 1], [7, 1], [9, 1], [7, 1], [5, 2, 2],
    [3, 2], [5, 1], [7, 1], [5, 1], [3, 1, 0], [2, 2], [3, 1], [5, 1], [7, 1], [9, 1], [7, 1], [5, 1, 2], [6, 2], [5, 1], [3, 1], [5, 1], [6, 1], [7, 1], [9, 1, 3],
    [5, 3, 0], [5, 1], [3, 1, 6], [5, 2, 1], [7, 1], [5, 1, 0], [3, 2, 9], [2, 1], [3, 1], [5, 1, 1], [7, 2], [8, 1], [9, 1, 2], [7, 2, 0], [5, 1], [3, 1, 8], [2, 2, 5], [0, 2, 3], [0, 4, 7]],
  fx: [[3, 'whisper'], [10, 'knock'], [18, 'door'], [26, 'blood'], [34, 'flash'], [42, 'drip'], [50, 'crack'], [58, 'scream'], [66, 'door'], [74, 'dark'], [82, 'blood'], [90, 'scream'], [98, 'flash'], [104, 'door']] };
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
  holders: { title: 'Contact: Everyone Before You', text: 'One contact, 214 numbers. Every one of them held this phone. The last name is yours. The one above it is in handwriting you know from birthday cards.' },
  next_line: { title: 'The blank line', text: 'Under your name there is one more line, already selected, the cursor blinking. Placeholder text, very faint: "who is next?"' },
  wren_call: { title: 'Call log: Wren, 3:07', text: 'Answered, 41 minutes. Wren picked up. She did not hang up. Nobody has ever stayed on the line this long.' },
  new_line: { title: 'The book, tonight', text: 'The contact has grown a line, in the handwriting you know from birthday cards: Wren. Under it, the blank one, selected, blinking. who is next?' },
  door_crack: { title: 'The door in the haze', text: 'It was open a hand\'s width, and the light inside smelled of birthday candles. Someone small was counting down to something, and you were meant to be inside before they reached one.' },
  bargain: { title: 'What the Queen gave', text: '"Not back. Only kept. Kept safe on the other side of the door, for as long as someone is always holding the phone at 3:07. One night each. One name each."' },
  first_page: { title: 'The first page', text: 'Crayon, pressed very hard: a door, a crown, a woman with a flute, a phone with the number written backwards. Underneath, in an adult\'s shaking hand: forgive me.' },
  nursery_wall: { title: 'Photo: the nursery wall', text: 'SHE LEFT THE DOOR OPEN FIRST. SO I WATCH. I WATCH EVERY ONE OF THEM. SOMEBODY HAS TO SEE ME. The letters get bigger all the way down.' },
  wren_seven: { title: 'Message: Wren, 3:07', text: 'outside. not letting you do the last one on your own. (Sent from the drive. Delivered. Read.)' },
  ten_doors: { title: 'What starts again', text: '"A lift. A bath. A bus. Ten doors, and every one of them opens onto me. You are always so brave on the seventh night, and then it is 3:07 again."' },
  seventh: { title: 'The seventh night', text: 'The first page, every name under it, and the blank line, blinking. "Whatever you choose, I will not write another name."' },
  choir: { title: 'Recording: the stones, again', text: 'Slowed down, the singing stones are not stones. They are people, very far under water, all mouthing the same eleven notes. One of them is mouthing your name instead.' },
};

ABY.NODES = {
  // ======================= chapter 1: the awakening =======================
  awakening: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'glitch',
    teaser: 'You\u2019re awake. Do you hear it? The flute is calling.',
    text: 'Something wakes her. Not a sound: the end of one. 3:07, says the phone in your hand, and somewhere in the haze a door has just stopped closing. She cannot remember her name. She can remember the weight of the flute at her back, and the echo of its song in her blood. Something has already begun to count.',
    choices: [
      { label: 'Follow the flute', next: 'flute_path', add: { resolve: 1 } },
      { label: 'Listen to the stones', next: 'stones_path', add: { heart: 1 } },
      { label: 'Check your phone', next: 'unknown_sms', add: { dread: 1 } },
    ],
  },
  // ---- the other nine openings: a journey after the first starts in one of these (ABY.OPENINGS), somewhere new, and finds the same haze ----
  op_lift: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump', teaser: 'The lift has stopped. The doors are opening on a floor that is not on the panel.',
    text: 'The lift stops between floors with a soft, final bump. The light goes amber. The panel shows a floor that is not a number, only a small engraved crown, and the phone in your hand says 3:07. Then the doors slide open on violet haze, and on a woman with a flute at her back, standing very still, as if she has been waiting for the lift for years.',
    choices: [
      { label: 'Step out into the haze', next: 'flute_path', add: { resolve: 1 } },
      { label: 'Press every button at once', next: 'unknown_sms', add: { dread: 1 } },
      { label: 'Say hello to her', next: 'stones_path', add: { heart: 1 } },
    ],
  },
  op_bath: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'whisper', teaser: 'The bath has gone cold. Something under the water is humming.',
    text: 'You wake in the bath. The water has gone cold and very still, and the phone is balanced on the rim, dry, lit: 3:07. Under the water, where your feet should be, there is no bottom to the tub. Someone far down there is humming eleven slow notes, and a woman with a flute, very small at that distance, is looking up at you.',
    choices: [
      { label: 'Climb out, fast', next: 'torch_first', light: 1, add: { dread: 1 } },
      { label: 'Put your ear to the water', next: 'choir_1', add: { dread: 1 } },
      { label: 'Reach down to her', next: 'stones_path', add: { heart: 1, trust: 1 } },
    ],
  },
  op_bus: {
    ch: 1, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', scare: 'glitch', teaser: 'The night bus has missed every stop. The driver will not turn round.',
    text: 'The night bus. Top deck, front seat, the city going by in long orange smears. You must have slept through your stop. The sign over the driver flips to its next destination: THE GUARDIAN\'S GATE. Then to 3:07. Every other passenger is facing the back of the bus. Every one of them is holding a phone exactly like yours.',
    choices: [
      { label: 'Ring the bell to get off', next: 'flute_path', add: { resolve: 1 } },
      { label: 'Look at their screens', next: 'unknown_sms', add: { dread: 1 } },
      { label: 'Go downstairs to the driver', next: 'vey_come', add: { trust: 1 } },
    ],
  },
  op_ward: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'whisper', teaser: 'Hospital, night ward. The monitor beside you is beeping out a tune.',
    text: 'A hospital bed. A ward at night, every curtain drawn. The heart monitor beside you is not beeping, quite: it is playing notes, eleven of them, and then waiting. Your phone is on the blanket with a sticky label on it in a nurse\'s hand: PATIENT\'S OWN. DO NOT ANSWER AFTER 3. It is 3:07. Behind the last curtain, someone is playing a flute along with your heart.',
    choices: [
      { label: 'Pull back the last curtain', next: 'flute_path', add: { resolve: 1, dread: 1 } },
      { label: 'Answer the phone anyway', next: 'unknown_sms', add: { dread: 1 } },
      { label: 'Listen to the monitor', next: 'stones_path', add: { heart: 1 } },
    ],
  },
  op_shore: {
    ch: 1, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', scare: 'whisper', teaser: 'A lake at night. Wet footprints go into the water. None come out.',
    text: 'You are standing on a lakeshore in the dark with wet feet and no memory of the walk here. The phone says 3:07. A line of small bare footprints leads past you into the water, and none come out. Out on the lake, where the reflection of the moon ought to be, there is a woman with a flute, standing on the surface, waiting to see what you do.',
    choices: [
      { label: 'Follow the footprints back', next: 'footprints', add: { heart: 1 } },
      { label: 'Wade out to her', next: 'choir_1', add: { dread: 1 } },
      { label: 'Switch on the flashlight', next: 'torch_first', light: 1 },
    ],
  },
  op_party: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump', teaser: 'A birthday party. Everyone has gone. Someone is still counting down.',
    text: 'A birthday party, long over. Paper hats on the floor, a cake with four burnt-down candles, every chair pushed back at once, as if everyone left in the same second. From the hall, a child\'s voice, counting down: nine. Eight. Your phone, face up among the plates: 3:07. In the hall mirror, a woman with a flute is standing behind you, with her finger to her lips.',
    choices: [
      { label: 'Find the child before she reaches one', next: 'footprints', add: { heart: 1, dread: 1 } },
      { label: 'Turn round to the woman', next: 'flute_path', add: { trust: 1 } },
      { label: 'Blow out the candles', next: 'unknown_sms', add: { dread: 1 } },
    ],
  },
  op_lost: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'glitch', teaser: 'Lost property found a phone with your face as the lock screen.',
    text: 'A lost-property office, after closing. A box of phones nobody came back for. One of them is buzzing. On its lock screen, a photo of you, asleep, taken from very close. The time on it is 3:07. You have never owned this phone. You put it to your ear and a woman, very far away, plays one long note on a flute, and the office is not there any more.',
    choices: [
      { label: 'Follow the note', next: 'flute_path', add: { resolve: 1 } },
      { label: 'Look at the other photos', next: 'unknown_sms', add: { dread: 1 } },
      { label: 'Call to whoever is near you', next: 'vey_come', add: { trust: 1 } },
    ],
  },
  op_voicemail: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper', teaser: 'One new voicemail. It is your own voice, and it is crying.',
    text: 'One new voicemail, 3:07. You play it. It is your own voice, out of breath, crying: "If you\'re hearing this you\'ve woken up again. Don\'t follow the flute. No. Follow the flute, but don\'t climb anything. Don\'t trust the little one. Trust the little one. I can\'t remember which. I\'m so sorry, I never remember which." Then a flute, very close to the phone.',
    choices: [
      { label: 'Follow the flute', next: 'flute_path', add: { resolve: 1, dread: 1 } },
      { label: 'Ignore yourself', next: 'stones_path', add: { heart: 1 } },
      { label: 'Call yourself back', next: 'unknown_sms', add: { dread: 1 } },
    ],
  },
  op_snow: {
    ch: 1, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', scare: 'glitch', teaser: 'Snow is falling indoors. It is warm, and it is falling up.',
    text: 'You wake on a staircase in a house you do not know, and it is snowing indoors: warm snow, falling up, toward a broken roof and a violet sky. The phone is at 3:07 and it will not move on. At the top of the stairs, where they should end, they do not. They go on up into the haze, and somebody up there is playing a flute to light the way.',
    choices: [
      { label: 'Keep climbing', next: 'spire', add: { resolve: 1, dread: 1 } },
      { label: 'Go back down', next: 'stones_path', add: { heart: 1 } },
      { label: 'Light up the snow', next: 'torch_first', light: 1 },
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
      { label: 'Follow the wet footprints', next: 'footprints', add: { heart: 1 } },
    ],
  },
  footprints: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'Small bare footprints cross the haze, still wet. They are hers. They come out of the dark and stop at her feet, and nothing leads away. Someone has been walking toward her for a very long time.',
    choices: [
      { label: 'Walk them backwards', next: 'footprints_door', add: { resolve: 1 } },
      { label: 'Ignore them and climb', next: 'spire', add: { dread: 1 } },
    ],
  },
  footprints_door: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump', note: 'door_crack',
    text: 'The prints end at a door standing alone in the haze, open a hand\'s width. A crack of warm light. A smell of birthday candles. From inside, a child\'s voice, counting down: nine. Eight. Seven.',
    choices: [
      { label: 'Push it open', next: 'door_open', add: { heart: 1 } },
      { label: 'Hold it shut with your shoulder', next: 'spire', add: { resolve: 1, dread: 1 } },
    ],
  },
  door_open: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'glitch',
    text: 'A small room. A cot. A crown no bigger than a bowl. On the wall, scratched in by a child: SHE LEFT THE DOOR OPEN FIRST. The counting reaches one, and the light behind you goes out.',
    choices: [
      { label: 'Take the little crown', next: 'spire', add: { heart: 1, dread: 1 }, set: 'little_crown', bat: 8 },
      { label: 'Back out slowly', next: 'vey_come', add: { trust: 1 } },
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
      { label: 'Read the names cut into them', next: 'names_cut', add: { heart: 1 } },
    ],
  },
  names_cut: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'Hundreds of names are cut into the stones, each in a different hand. The newest is still wet: yours. Beside it, the Queen\'s. Beneath both, a space the exact width of one more.',
    choices: [
      { label: 'Scratch out your name', next: 'names_scratch', add: { resolve: 1 } },
      { label: 'Say them aloud', next: 'choir_1', add: { dread: 1 } },
    ],
  },
  names_scratch: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump',
    text: 'The stone bleeds where you scratch. Every other name slides across the rock and rearranges itself into a single word, over and over, the whole length of the wall: STAY.',
    choices: [
      { label: 'Leave. Quickly.', next: 'vey_come', add: { dread: 1, resolve: 1 } },
      { label: 'Stay a moment longer', next: 'pillar_door', add: { heart: 1, dread: 1 } },
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
      { label: 'Count the steps', next: 'stair_count', add: { dread: 1 } },
      { label: 'Offer the little crown', next: 'offering', add: { heart: 1, trust: 1 }, bat: -12, set: 'crown_laid', req: { flag: 'little_crown' } },
    ],
  },
  stair_count: {
    ch: 2, speaker: 'NARRATOR', mood: 'dark', focus: 'crystal', scare: 'whisper',
    text: 'One. Two. At seventy the steps begin counting you back. At one hundred and eleven the spire is shorter than it was a minute ago, and still you climb, because the number is the only thing that stays the same.',
    choices: [
      { label: 'Keep counting', next: 'stair_end', add: { dread: 1, resolve: 1 } },
      { label: 'Stop. Look at the phone.', next: 'stair_end', add: { dread: 1 } },
    ],
  },
  stair_end: {
    ch: 2, speaker: 'NARRATOR', mood: 'dark', focus: 'crystal', scare: 'glitch',
    text: 'Three hundred and seven. The last step is the top, and the clock says 3:07, and the crystal is already in your hand. You do not remember reaching for it.',
    choices: [
      { label: 'Take it', next: 'crystal', add: { resolve: 1 }, set: 'crystal', bat: -20 },
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
      { label: 'Take the lantern', next: 'd3_table', set: 'corvin_lamp', bat: -20 /* negative = recharge, like the crystal */, add: { dread: -1 } },
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
      { label: 'Hold the Eye\'s door so it can sleep', next: 'end_vigil', req: { min: { resolve: 3 } } },
      { label: 'Look away', next: 'end_watched' },
    ],
  },
  end_chorus: {
    ch: 8, speaker: 'NARRATOR', mood: 'dawn', focus: 'gate', ending: 'chorus',
    text: 'The Eye sings back.', choices: [],
  },
  end_vigil: {
    ch: 8, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', ending: 'keeper', final: 1,
    text: 'You hold the Eye\'s door.', choices: [],
  },
  end_watched: {
    ch: 8, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', ending: 'watched',
    text: 'You look away.', choices: [],
  },

  // ======================= act four: day four (the drowned choir, and everyone before you) =======================
  d4_wake: {
    ch: 9, speaker: 'CHOIR', mood: 'dark', focus: 'queen', scare: 'glitch',
    text: 'day four. (The phone is wet. There is water behind the glass, and in the water, faces, pressed up against the screen from the inside.) 1 new contact: Everyone Before You.',
    choices: [
      { label: 'Open the contact', next: 'd4_contact', add: { dread: 1 } },
      { label: 'Ask the Queen about the faces', next: 'd4_queen' },
      { label: 'Switch on the flashlight', next: 'd4_wake', light: 1, req: { noLight: 1 } },
      { label: 'Go back to the singing stones', next: 'd4_stones', add: { resolve: 1 } },
    ],
  },
  d4_queen: {
    ch: 9, speaker: 'QUEEN', mood: 'dusk', focus: 'queen',
    text: 'The stones always sang. I told myself it was the cave. (A long pause, three dots that come and go.) It was never the cave. Everyone who held this phone and would not open the gate, I... put them somewhere quiet. I thought it was kind.',
    choices: [
      { label: 'Ask her how many', next: 'd4_contact', add: { trust: 1 } },
      { label: 'Tell her it was not kind', next: 'd4_stones', add: { resolve: 1, trust: -1 } },
      { label: 'Tell her you will go and listen to them', next: 'd4_stones', add: { heart: 1, trust: 1 } },
    ],
  },
  d4_contact: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', dark: true, scare: 'whisper', note: 'holders',
    text: 'One contact. 214 numbers. You scroll and the list keeps going: names, dates, a photo of a hand on a phone, the same phone. Near the bottom, your name. Just above it, a name in handwriting you know from birthday cards.',
    choices: [
      { label: 'Switch on the flashlight', next: 'd4_contact', light: 1, req: { noLight: 1 } },
      { label: 'Read every name out loud', next: 'd4_stones', set: 'read_names', add: { heart: 1 }, bat: 4 },
      { label: 'Scroll past your own name', next: 'd4_bottom', add: { dread: 1 } },
      { label: 'Delete the contact', next: 'd4_delete' },
    ],
  },
  d4_delete: {
    ch: 9, speaker: 'CHOIR', mood: 'dark', focus: 'queen', scare: 'jump',
    text: 'contact deleted. (The phone buzzes in your hand.) 1 new contact: Everyone Before You (and you). we are not a list. you cannot put us in the bin. we have been in the water for a very long time and we are very good at coming back.',
    choices: [
      { label: 'Stop deleting it', next: 'd4_stones', add: { dread: 1 } },
      { label: 'Open it again', next: 'd4_contact', add: { dread: 1 } },
    ],
  },
  d4_bottom: {
    ch: 9, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'eye', note: 'next_line',
    text: 'Under your name there is one more line. It is blank, and already selected, and the cursor is blinking in it. The keyboard has come up by itself. Very faint, the placeholder text says: who is next?',
    choices: [
      { label: 'Type a name', next: 'd4_type', add: { dread: 1 } },
      { label: 'Leave it blank and put the phone down', next: 'd4_stones', add: { resolve: 1 } },
    ],
  },
  d4_type: {
    ch: 9, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'good. (It is a name you did not mean to type. Someone you love.) now tell them it is 3:07. tell them they should not have woken up. it is so much lighter, once someone else is holding it.',
    choices: [
      { label: 'Press send', next: 'end_caller' },
      { label: 'Delete it, one letter at a time', next: 'd4_stones', set: 'refused_next', add: { resolve: 1, dread: 1 } },
    ],
  },
  d4_stones: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', dark: true, scare: 'whisper', img: 'corrupt',
    text: 'The cave of singing stones has flooded to the knee. The stones are not stones. Under the black water, faces, eyes shut, mouths moving, all singing the same eleven notes, very slowly, the way you sing to someone who is falling asleep.',
    choices: [
      { label: 'Switch on the flashlight', next: 'd4_stones', light: 1, req: { noLight: 1 } },
      { label: 'Raise the flute and sing with them', next: 'd4_choir', add: { heart: 1 } },
      { label: 'Wade in to the deepest face', next: 'd4_choir', add: { dread: 1, resolve: 1 } },
    ],
  },
  d4_choir: {
    ch: 9, speaker: 'CHOIR', mood: 'dark', focus: 'gate', song: 'choir', scare: 'whisper',
    text: 'The Drowned Choir. Two hundred and fourteen voices under the water, and they have lost the tune. Every note you catch, the water drops a step. Every note you drop, it rises, and something cold closes round your ankle to keep time.',
    songNext: { win: 'd4_choir_win', fail: 'd4_choir_fail', give: 'd4_choir_give' },
  },
  d4_choir_win: {
    ch: 9, speaker: 'CHOIR', mood: 'dawn', focus: 'queen',
    text: 'we remember the end now. (The water goes down, step by step, and they come up with it: wet hair, open eyes, two hundred and fourteen people blinking at a ceiling.) we were waiting for someone to finish it. nobody ever finishes it.',
    choices: [
      { label: 'Ask them their names', next: 'd4_shore', add: { heart: 1, dread: -1 } },
    ],
  },
  d4_choir_fail: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', scare: 'jump',
    text: 'The water comes up to the screen. You hold the phone over your head and the faces come up with it, pressed flat against the glass from the inside, all of them mouthing the next note at you. Hands. So many hands, very gently, around your legs.',
    choices: [
      { label: 'Find the note again', next: 'd4_choir', retry: true },
      { label: 'Get out of the water', next: 'd4_choir_give', add: { dread: 1 } },
    ],
  },
  d4_choir_give: {
    ch: 9, speaker: 'CHOIR', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'stay. it is warm under. nobody texts you under. nobody asks you to open anything. (A hand you know from birthday cards takes yours, under the water, and holds on.) everyone stays, in the end.',
    choices: [
      { label: 'Stay', next: 'end_drowned' },
      { label: 'Pull your hand free and climb out', next: 'd4_shore', add: { dread: 1, resolve: 1 } },
    ],
  },
  d4_shore: {
    ch: 9, speaker: 'QUEEN', mood: 'gate', focus: 'queen',
    text: 'You are on the shore and the phone is dry, and the contact is open on its own: every name, and yours, and the blank line under it. "Someone has to close that book," the Queen says, very quietly. "Or write the next name in it. I always wrote the next name."',
    choices: [
      { label: 'Take out the little crown', next: 'd4_crown', req: { flag: 'little_crown', noflag: 'crown_laid' } },
      { label: 'Ring the drowned bells', next: 'd4_bells', req: { noflag: 'bells_done' } },
      { label: 'Say every name, then yours, and close the book', next: 'end_names', req: { all: ['rite_choir', 'read_names'], min: { mem: 7 }, maxDread: 4 } },
      { label: 'Write the next name, like she always did', next: 'end_caller' },
      { label: 'Throw the phone into the water', next: 'end_drowned' },
    ],
  },
  d4_crown: {
    ch: 9, speaker: 'QUEEN', mood: 'gate', focus: 'queen',
    text: 'You still have the little crown from the first night. It is dry, which is wrong, and it is warm. The Queen looks at it for a long time. "I made that for her," she says. "Before I made anything else. Put it where it goes."',
    choices: [
      { label: 'Lay it on the water', next: 'd4_shore', add: { heart: 1, dread: -1 }, set: 'crown_laid' },
      { label: 'Keep it. It is yours now', next: 'd4_shore', add: { resolve: 1 }, set: 'crown_laid' },
      { label: 'Cut her name into the blank space, beside yours', next: 'd4_shore', add: { heart: 1, dread: -1 }, set: 'crown_laid', req: { flag: 'read_names' } },
    ],
  },
  d4_bells: {
    ch: 9, speaker: 'CHOIR', mood: 'dark', focus: 'gate', song: 'bells', scare: 'whisper',
    text: 'Under the shallows there is a bell tower, and the bells are still ringing: not one note but two and three at a time, the way the choir was taught before anyone came to teach it wrong. Strike the pairs together. Where a bell rings alone and you answer one note, the water remembers how heavy it is.',
    songNext: { win: 'd4_bells_win', fail: 'd4_bells_fail', give: 'd4_bells_give' },
  },
  d4_bells_win: {
    ch: 9, speaker: 'CHOIR', mood: 'dawn', focus: 'queen',
    text: 'The last pair rings out clean, and the whole lake answers in one voice, and for one held breath all two hundred and fourteen of them are singing the right tune. Nobody is holding your ankle. Somebody has taken your hand and is only holding it.',
    choices: [
      { label: 'Wade back to the shore', next: 'd4_shore', add: { heart: 1, dread: -2 }, set: 'bells_done' },
    ],
  },
  d4_bells_fail: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', scare: 'jump',
    text: 'You land one bell of the pair and not the other, and the one you missed rings alone, a long way down, and the water takes the weight of it out on you. Something under the tower is counting your mistakes.',
    choices: [
      { label: 'Strike the bells again', next: 'd4_bells', retry: true },
      { label: 'Put the flute down', next: 'd4_bells_give', add: { dread: 1 } },
    ],
  },
  d4_bells_give: {
    ch: 9, speaker: 'CHOIR', mood: 'dusk', focus: 'queen',
    text: 'It is all right. (They have waited this long.) The bells go on without you, slowly, a little flat, and nobody blames you. They only ask if you will come back, and they do not say when.',
    choices: [
      { label: 'Wade back to the shore', next: 'd4_shore', add: { dread: 1 }, set: 'bells_done' },
    ],
  },
  end_names: {
    ch: 9, speaker: 'NARRATOR', mood: 'dawn', focus: 'gate', ending: 'names',
    text: 'You close the book.', choices: [],
  },
  end_caller: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', ending: 'caller',
    text: 'Message sent.', choices: [],
  },
  end_drowned: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', ending: 'drowned',
    text: 'The water closes.', choices: [],
  },

  // ======================= act five: day five (the next caller: you are the voice in someone else's phone) =======================
  d5_wake: {
    ch: 10, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'glitch',
    text: 'day five. 3:07. (You are not in the cave any more. You are the voice in a phone on a bedside table, and next to it someone is sitting up in the dark, one hand already out for the screen.) 1 new contact: Wren.',
    choices: [
      { label: 'Say her name', next: 'd5_hello', add: { heart: 1 } },
      { label: 'Breathe, the way it was done to you', next: 'd5_breathe', add: { dread: 1 } },
      { label: 'Hang up before she answers', next: 'd5_hang' },
    ],
  },
  d5_hello: {
    ch: 10, speaker: 'WREN', mood: 'dusk', focus: 'queen',
    text: '...hello? (A sleepy whisper, very close. She is holding the phone with both hands.) It says 3:07. Who is this? How do you have this number? Is this a prank?',
    choices: [
      { label: 'Tell her the truth', next: 'd5_truth', set: 'told_truth', add: { trust: 1 } },
      { label: 'Say it is a wrong number', next: 'd5_lie', add: { dread: 1 } },
      { label: 'Say nothing', next: 'd5_breathe', add: { dread: 1 } },
    ],
  },
  d5_breathe: {
    ch: 10, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'good. you are learning. (Her breathing on the other end, getting faster.) say it. say: you should not have woken up. it is so much lighter once it is in someone else.',
    choices: [
      { label: 'Say it', next: 'd5_cruel', add: { dread: 1 } },
      { label: 'Say her name instead', next: 'd5_hello', add: { heart: 1, resolve: 1 } },
    ],
  },
  d5_cruel: {
    ch: 10, speaker: 'WREN', mood: 'dark', focus: 'queen', scare: 'jump',
    text: 'Why would you say that? (A crash: the lamp. Then, small and shaking, not hanging up.) I know that voice. Please. I know that voice. Is it really you?',
    choices: [
      { label: 'Tell her the truth', next: 'd5_truth', set: 'told_truth', add: { dread: 1 } },
      { label: 'Hang up', next: 'd5_hang' },
    ],
  },
  d5_lie: {
    ch: 10, speaker: 'WREN', mood: 'dark', focus: 'queen',
    text: 'click. (The line goes dead. Then, before you can breathe, the phone rings. Wren is calling you back.) The screen says WREN, and under it, in handwriting you know from birthday cards: she knows your voice.',
    choices: [
      { label: 'Pick up', next: 'd5_truth', set: 'told_truth', add: { heart: 1 } },
      { label: 'Let it ring', next: 'd5_ring' },
    ],
  },
  d5_ring: {
    ch: 10, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', scare: 'jump',
    text: 'It rings. And rings. The ringtone slows down, and flattens, and turns into the eleven notes of the choir. Fourteen missed calls. Twenty. On the glass, her face, pressed to the inside: not asking, now. Waiting.',
    choices: [
      { label: 'Pick up', next: 'd5_truth', set: 'told_truth', add: { dread: 1 } },
      { label: 'Let it ring out', next: 'd5_hang' },
    ],
  },
  d5_hang: {
    ch: 10, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'good. it is quiet. (You can feel the chain settle, the way a stone settles.) the book has a new line. wren. and under wren, the blank one, already blinking. someone has to be next.',
    choices: [
      { label: 'Call her back', next: 'd5_hello', add: { resolve: 1 } },
      { label: 'Leave her to the dark', next: 'end_passed' },
    ],
  },
  d5_truth: {
    ch: 10, speaker: 'WREN', mood: 'dusk', focus: 'queen', note: 'wren_call',
    text: 'You tell her. The phone, the book, the choir, the eye. It takes a long time. She does not hang up. Somewhere in it she starts to cry, and then stops, and then says, very evenly, the way she did when she was nine: okay. Okay. What do I do?',
    choices: [
      { label: 'Tell her about the book', next: 'd5_book', add: { resolve: 1 } },
      { label: 'Tell her to sing with you', next: 'd5_rite', add: { heart: 1 } },
      { label: 'Ask her to stay on the line till it is light', next: 'd5_dawn', set: 'stayed_line' },
    ],
  },
  d5_book: {
    ch: 10, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', dark: true, scare: 'whisper', note: 'new_line',
    text: 'The contact has grown a line in the handwriting you know. It says Wren, and under it the blank one, selected, blinking. The phone wants a name. It has never once been refused by someone who knew what it was.',
    choices: [
      { label: 'Switch on the flashlight', next: 'd5_book', light: 1, req: { noLight: 1 } },
      { label: 'Read her the names, to wake them', next: 'd5_rite', set: 'read_names', add: { heart: 1 }, bat: 4 },
      { label: 'Tell her not to look at it', next: 'd5_dawn', add: { resolve: 1 } },
    ],
  },
  d5_rite: {
    ch: 10, speaker: 'WREN', mood: 'dark', focus: 'gate', song: 'wake', scare: 'whisper',
    text: 'The 3:07 Wake-Up. She hums it down the line (the eleven notes, a half-step wrong) and you answer on the flute, and the book stirs, and the first number in it starts to ring. Every note you land wakes one more of them. Every note you drop, the room gets a little darker.',
    songNext: { win: 'd5_rite_win', fail: 'd5_rite_fail', give: 'd5_rite_give' },
  },
  d5_rite_win: {
    ch: 10, speaker: 'WREN', mood: 'dawn', focus: 'queen',
    text: 'I can hear them. (A hundred phones in a hundred kitchens, ringing at once in the dark.) They are all awake. They are all picking up. Oh, they are so angry. Oh, thank god.',
    choices: [
      { label: 'Tell her to hold on until the light', next: 'd5_dawn', add: { heart: 1, dread: -1 } },
    ],
  },
  d5_rite_fail: {
    ch: 10, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', scare: 'jump',
    text: 'The note goes flat and the line crackles. In the background, Wren\'s room is getting longer: the door further off, the window thinner. "Keep going," she says. "Please keep going. I\'m right here."',
    choices: [
      { label: 'Find the note again', next: 'd5_rite', retry: true },
      { label: 'Tell her it is all right to stop', next: 'd5_rite_give', add: { dread: 1 } },
    ],
  },
  d5_rite_give: {
    ch: 10, speaker: 'WREN', mood: 'dusk', focus: 'queen',
    text: 'Okay. It is okay. (She is humming the wrong note on purpose, so you can hear her.) I am not going anywhere. You do not have to be good at this. You just have to stay.',
    choices: [
      { label: 'Stay on the line', next: 'd5_dawn', add: { resolve: 1, trust: 1 } },
    ],
  },
  d5_dawn: {
    ch: 10, speaker: 'WREN', mood: 'gate', focus: 'gate',
    text: 'It is 5:51. The window is grey. She is sitting on the floor with the phone against her ear and the book open on the screen: every name, and hers, and the blank line, still blinking. "You can say what happens now," she says. "I will do whatever you say. I always did."',
    choices: [
      { label: 'Play her the riff, loud, to wake the street', next: 'd5_riff', req: { noflag: 'riff_done' } },
      { label: 'Have her call the first number in the book', next: 'end_warned', req: { all: ['rite_wake', 'told_truth'], min: { mem: 8 }, maxDread: 4 } },
      { label: 'Promise to stay on the line, every night', next: 'end_nightline', req: { flag: 'told_truth' } },
      { label: 'Hang up and let the book have her', next: 'end_passed' },
    ],
  },
  d5_riff: {
    ch: 10, speaker: 'WREN', mood: 'dark', focus: 'gate', song: 'riff', scare: 'jump',
    text: '"Play it like you mean it," Wren says, and holds the phone up to her open window, and the whole grey street is listening. It is not a lullaby. It is the loudest thing the flute has ever been: two notes at a time, hard, on the beat, and every smash puts one more light on in one more kitchen. Miss the chord, and the street goes dark again.',
    songNext: { win: 'd5_riff_win', fail: 'd5_riff_fail', give: 'd5_riff_give' },
  },
  d5_riff_win: {
    ch: 10, speaker: 'WREN', mood: 'dawn', focus: 'queen',
    text: 'Every window on the street is lit. People are standing in them in their pyjamas, holding up their phones, and every phone is playing the riff back at you, a bit out of time. Wren is laughing, wildly, with her hand over her mouth. "That was so loud," she says. "That was so loud. They\'ll never be able to say they didn\'t hear."',
    choices: [
      { label: 'Come down off the roof of the song', next: 'd5_dawn', add: { heart: 1, resolve: 1, dread: -1 }, set: 'riff_done' },
    ],
  },
  d5_riff_fail: {
    ch: 10, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', scare: 'jump',
    text: 'The chord comes out ragged, a note short, and the lights on the street go out one at a time, in order, as if someone is walking along the row with a hand on every switch. "Again," Wren whispers. "Harder. They can still hear you."',
    choices: [
      { label: 'Hit it again', next: 'd5_riff', retry: true },
      { label: 'Let the street go quiet', next: 'd5_riff_give', add: { dread: 1 } },
    ],
  },
  d5_riff_give: {
    ch: 10, speaker: 'WREN', mood: 'dusk', focus: 'queen',
    text: 'Okay. Okay. (She closes the window on the dark street.) It was a lot to ask. We can try the quiet way.',
    choices: [
      { label: 'Go back to the dawn', next: 'd5_dawn', add: { dread: 1 }, set: 'riff_done' },
    ],
  },
  end_warned: {
    ch: 10, speaker: 'NARRATOR', mood: 'dawn', focus: 'gate', ending: 'warned',
    text: 'She makes the call.', choices: [],
  },
  end_nightline: {
    ch: 10, speaker: 'NARRATOR', mood: 'gate', focus: 'gate', ending: 'nightline',
    text: 'You stay on the line.', choices: [],
  },
  end_passed: {
    ch: 10, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', ending: 'passed',
    text: 'Your turn is over.', choices: [],
  },

  // ======================= act six: day six (the first page, and who wrote it) =======================
  d6_wake: {
    ch: 11, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'glitch',
    text: 'Day six. 3:07, and the phone is warm, as if someone was holding it while you slept. The contact Everyone Before You is open on its own and scrolling, slowly, upward: past Wren, past you, past two hundred and fourteen names, to a page you have never seen. The first page. No name on it. One number, and a drawing of a crown no bigger than a bowl.',
    choices: [
      { label: 'Look at the first page', next: 'd6_page', add: { resolve: 1 } },
      { label: 'Ask the Queen whose number it is', next: 'd6_queen', add: { trust: 1 } },
      { label: 'Call the number', next: 'd6_ring', add: { dread: 1 } },
    ],
  },
  d6_queen: {
    ch: 11, speaker: 'QUEEN', mood: 'dusk', focus: 'queen',
    text: 'She does not answer for a long time. Then: "Sorrel. My daughter. She was four. She left the door open first, and something came in, and something went out, and in the morning the door was shut and she was on the other side of it." A long breath. "I wrote the first name to keep her. I have been writing the next one ever since."',
    choices: [
      { label: 'Ask what she gave for it', next: 'd6_story', add: { resolve: 1 } },
      { label: 'Call Sorrel', next: 'd6_ring', add: { heart: 1 } },
    ],
  },
  d6_story: {
    ch: 11, speaker: 'QUEEN', mood: 'dark', focus: 'queen', scare: 'whisper', note: 'bargain',
    text: '"I asked the dark for her back, and it said: not back. Only kept. Kept safe on the other side of the door, for as long as someone is always holding the phone at 3:07. One night each. One name each. Nobody ever told me how long a child stays four." Her voice breaks on it, very quietly. "You must think I am a monster."',
    choices: [
      { label: 'Tell her you would have done the same', next: 'd6_ring', add: { heart: 1, trust: 1 } },
      { label: 'Tell her she did this to all of them', next: 'd6_ring', add: { resolve: 1, dread: 1 }, set: 'blamed_queen' },
    ],
  },
  d6_page: {
    ch: 11, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', dark: true, note: 'first_page',
    text: 'The first page is not typed. It is drawn, in crayon, very hard, by someone too small to hold a crayon properly: a door, a crown, a stick-woman with a flute, and a phone with the number written on it backwards. Underneath, in an adult\'s handwriting, newer, shaking: forgive me. Your thumb is already on the number.',
    choices: [
      { label: 'Call it', next: 'd6_ring', add: { heart: 1 }, set: 'first_page' },
      { label: 'Delete the first page', next: 'd6_delete', add: { resolve: 1 } },
      { label: 'Switch on the flashlight', next: 'd6_page', light: 1, req: { noLight: 1 } },
    ],
  },
  d6_delete: {
    ch: 11, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'jump',
    text: 'you cannot delete the first page. (Every name in the book flickers at once, like a room of candles in a draught.) it is the only page holding up the others. pull it out and all of them fall. all of them. down. where she is.',
    choices: [
      { label: 'Call the number instead', next: 'd6_ring', add: { dread: 1 }, set: 'first_page' },
      { label: 'Close the book and leave the page alone', next: 'd6_dawn', add: { dread: 1 }, set: 'page_unread' },
    ],
  },
  d6_ring: {
    ch: 11, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump', call: { from: 'Sorrel', sub: 'calling... 3:07' },
    text: 'It rings in a room you know. You can hear it: a small bell, a long way off, in a room that smells of birthday candles. It rings for a long time. Something is coming to the phone very slowly, on very short legs.',
    choices: [
      { label: 'Wait for her to answer', next: 'd6_sorrel', bat: 6 },
      { label: 'Hang up before she answers', next: 'd6_hangup', add: { dread: 1 } },
    ],
  },
  d6_hangup: {
    ch: 11, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'eye',
    text: 'she was going to answer. (One new message, No Caller ID.) she has been standing by that phone for a very long time. she was so sure it would be her mother.',
    choices: [
      { label: 'Call back', next: 'd6_ring', add: { dread: 1 } },
      { label: 'Put the phone face down until morning', next: 'd6_dawn', add: { dread: 1 }, set: 'page_unread' },
    ],
  },
  d6_sorrel: {
    ch: 11, speaker: 'SORREL', mood: 'dusk', focus: 'queen',
    text: 'Hello? (A small voice, very close to the phone, breathing through its mouth.) Is it Mummy? I counted to one. I counted to one lots of times. Is it my turn yet? Mummy said when it\'s my turn I can come out.',
    choices: [
      { label: 'Tell her who you are', next: 'd6_who', add: { trust: 1 } },
      { label: 'Pretend to be her mother', next: 'd6_pretend', add: { dread: 1 } },
      { label: 'Ask her to open the door', next: 'd6_door', add: { resolve: 1 } },
    ],
  },
  d6_who: {
    ch: 11, speaker: 'SORREL', mood: 'dusk', focus: 'queen',
    text: 'You\'re the one with the phone. Everyone has the phone for a bit. It\'s like pass-the-parcel, Mummy says, and when the music stops you have to write a name, and then it\'s their go. (A pause.) Nobody has ever rung me before. They only ever ring the next one.',
    choices: [
      { label: 'Ask her where she is', next: 'd6_room', add: { heart: 1 } },
      { label: 'Ask her to open the door', next: 'd6_door', add: { resolve: 1 } },
    ],
  },
  d6_pretend: {
    ch: 11, speaker: 'SORREL', mood: 'dark', focus: 'queen', scare: 'jump',
    text: 'You\'re not Mummy. (The line goes very cold, very fast, the way a room goes cold when a door opens onto winter.) Mummy\'s voice has water in it. Why do grown-ups always lie at three oh seven? The last one lied. I keep the last one in here with me.',
    choices: [
      { label: 'Say sorry and tell her the truth', next: 'd6_who', add: { heart: 1 } },
      { label: 'Keep pretending', next: 'd6_room', add: { dread: 2 } },
    ],
  },
  d6_room: {
    ch: 11, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', dark: true, scare: 'whisper', img: 'stairs',
    text: 'The phone shows you where she is, the way it has shown you everything: a small room. A cot. Paper hats. A door standing open a hand\'s width onto red light. And writing scratched into the wall above the cot, too high and too big for anyone four years old.',
    choices: [
      { label: 'Read the wall', next: 'd6_wall', light: 1, req: { light: 1 }, add: { dread: 1 }, set: 'eye_is_sorrel' },
      { label: 'Switch on the flashlight', next: 'd6_room', light: 1, req: { noLight: 1 } },
      { label: 'Go to the door', next: 'd6_door' },
    ],
  },
  d6_wall: {
    ch: 11, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'eye', img: 'eye', note: 'nursery_wall',
    text: 'SHE LEFT THE DOOR OPEN FIRST, from the very first night. And under it, newer, the letters getting bigger all the way down the wall, the way handwriting does when the hand gets older and older and is still not allowed out: SO I WATCH. I WATCH EVERY ONE OF THEM. SOMEBODY HAS TO SEE ME. The light through the door is red, and round, and it blinks.',
    choices: [
      { label: 'Go to the door', next: 'd6_door', add: { heart: 1 } },
    ],
  },
  d6_door: {
    ch: 11, speaker: 'SORREL', mood: 'gate', focus: 'gate',
    text: 'The door\'s open a bit. You can come in if you want. (Very quietly.) But if you come in you have to stay. That\'s the rule. Somebody always has to be in here with me, or I get big, and when I get big everyone has to look at me.',
    choices: [
      { label: 'Go in and keep her company', next: 'end_cradle', add: { heart: 1 } },
      { label: 'Sing her the lullaby through the door', next: 'd6_lull', req: { flag: 'lullaby' }, add: { heart: 1, dread: -1 } },
      { label: 'Give her the little crown back', next: 'd6_crown', req: { flag: 'little_crown' }, add: { heart: 1, trust: 1 } },
      { label: 'Tell her you will come back tomorrow', next: 'd6_dawn', add: { trust: 1 }, set: 'promised_sorrel' },
      { label: 'Shut the door on her', next: 'd6_shut', add: { resolve: 1, dread: 1 } },
    ],
  },
  d6_lull: {
    ch: 11, speaker: 'SORREL', mood: 'dawn', focus: 'queen',
    text: 'That\'s Mummy\'s song. (She is lying down; you can hear the cot creak.) Mummy sang it wrong on purpose so I\'d know it was her. You sang it wrong too. (A long, slow yawn.) Will you come back? Promise. Promise properly.',
    choices: [
      { label: 'Promise properly', next: 'd6_dawn', set: 'promised_sorrel' },
    ],
  },
  d6_crown: {
    ch: 11, speaker: 'SORREL', mood: 'dawn', focus: 'queen',
    text: 'My crown! (A small hand, through the gap in the door, very cold, very quick.) I made it with Mummy. It\'s too small for anyone but me. I thought the dark took it. (She is crying and not sad.) Now I\'m the queen in here. The queen gets to say who goes next. I say nobody.',
    choices: [
      { label: 'Tell her that is a good rule', next: 'd6_dawn', set: 'promised_sorrel', add: { heart: 1 } },
    ],
  },
  d6_shut: {
    ch: 11, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'eye',
    text: '(The voice behind the door is not small any more. It has not been small for a very long time.) i will wait. i am very good at waiting. tomorrow is the seventh night, and on the seventh night nobody is allowed to shut a door.',
    choices: [
      { label: 'Wait for morning', next: 'd6_dawn', set: 'door_shut' },
    ],
  },
  d6_dawn: {
    ch: 11, speaker: 'QUEEN', mood: 'gate', focus: 'gate',
    text: 'It is 6:00 on the sixth day. The Queen heard all of it; she always does. "Tomorrow is the seventh night," she says. "Seven is when the book is finished, or when it begins again. It has begun again more times than there are names in it." She waits. "Will you come back for the last one?"',
    choices: [
      { label: 'Say you will come back', next: 'end_firstpage', add: { resolve: 1 } },
      { label: 'Go back through the door and stay with Sorrel', next: 'end_cradle', req: { flag: 'promised_sorrel' } },
    ],
  },
  end_firstpage: {
    ch: 11, speaker: 'NARRATOR', mood: 'gate', focus: 'gate', ending: 'firstpage',
    text: 'You will come back.', choices: [],
  },
  end_cradle: {
    ch: 11, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', ending: 'cradle',
    text: 'You go in.', choices: [],
  },

  // ======================= act seven: day seven (the seventh night: the last one) =======================
  d7_wake: {
    ch: 12, speaker: 'NARRATOR', mood: 'throne', focus: 'gate', scare: 'glitch',
    text: 'Day seven. 3:07. Every app on the phone is open at once and every one of them is a message: the Queen, Vey, the Guardian, Wren, Everyone Before You. The last notification is from No Caller ID, and it is only two words, and the phone reads them out loud in a little girl\'s voice: last one.',
    choices: [
      { label: 'Open the Queen\'s message', next: 'd7_queen', add: { trust: 1 } },
      { label: 'Open No Caller ID', next: 'd7_eye', add: { dread: 1 } },
      { label: 'Call Wren', next: 'd7_wren', req: { flag: 'told_truth' }, add: { heart: 1 } },
    ],
  },
  d7_wren: {
    ch: 12, speaker: 'WREN', mood: 'dusk', focus: 'queen', note: 'wren_seven',
    text: 'I know. I know what night it is; I counted. (A car door. Footsteps on gravel.) I\'m outside. I\'m not letting you do the last one on your own. You stayed on the line for me. (She is breathing hard, as if she ran.) Tell me what to do and I\'ll do it.',
    choices: [
      { label: 'Ask her to hold the phone with you', next: 'd7_gather', set: 'wren_with', add: { trust: 1, dread: -1 } },
      { label: 'Tell her to go home where it is safe', next: 'd7_eye', add: { resolve: 1 } },
    ],
  },
  d7_queen: {
    ch: 12, speaker: 'QUEEN', mood: 'gate', focus: 'queen',
    text: '"The seventh night. Everything I ever locked is open tonight: the gate, the door, the water, the book. The book can only be closed from the first page, and only by somebody who is not afraid of who is on it." The flute at her back is humming on its own. "I have never once not been afraid of her."',
    choices: [
      { label: 'Tell her you will do it together', next: 'd7_gather', add: { heart: 1, trust: 1 } },
      { label: 'Ask about No Caller ID', next: 'd7_eye', add: { resolve: 1 } },
    ],
  },
  d7_eye: {
    ch: 12, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'eye', img: 'eye',
    text: 'last one. (The screen is entirely red, and round, and wet.) then it starts again. it always starts again. you wake up somewhere new with a phone in your hand at 3:07 and you do not remember any of this. a lift. a bath. a bus. ten doors, and every one of them opens onto me.',
    choices: [
      { label: 'Say her name: Sorrel', next: 'd7_named', req: { flag: 'eye_is_sorrel' }, add: { heart: 2, dread: -2 }, set: 'named_eye' },
      { label: 'Ask what starts again', next: 'd7_again', add: { dread: 1 } },
      { label: 'Block the number', next: 'd7_gather', add: { dread: 1 } },
    ],
  },
  d7_again: {
    ch: 12, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'whisper', note: 'ten_doors',
    text: 'the beginning. all the beginnings. the haze, and the flute, and a woman who cannot remember her name, and you, holding the phone. it is very kind, forgetting. you have done this before. you have done this so many times. you are always so brave on the seventh night, and then it is 3:07 again.',
    choices: [
      { label: 'Not this time', next: 'd7_gather', add: { resolve: 2 }, set: 'knows_loop' },
      { label: 'How many times?', next: 'd7_gather', add: { dread: 1 }, set: 'knows_loop' },
    ],
  },
  d7_named: {
    ch: 12, speaker: 'SORREL', mood: 'dawn', focus: 'queen',
    text: 'Nobody says my name. (The red on the screen blinks, and for a second it is not the Eye at all: it is one small eye, close to a gap in a door, bloodshot from crying.) Nobody has said my name since Mummy shut the door. Say it again. Say it again so I know it\'s still mine.',
    choices: [
      { label: 'Say it again', next: 'd7_gather', add: { heart: 1 } },
    ],
  },
  d7_gather: {
    ch: 12, speaker: 'NARRATOR', mood: 'throne', focus: 'gate', scare: 'whisper', img: 'eye',
    text: 'Tonight the cave and the red corridor and the shore and Wren\'s bedroom and the nursery are all one room, and everyone is in it. The Guardian, at the door, with his hand on the frame. Vey, very small, at your ankle. The Choir, dripping, along the walls. The Queen with her flute. And in the gap of the door, enormous now, and red, and round, a child\'s eye, watching you raise the phone.',
    choices: [
      { label: 'Raise the flute', next: 'd7_rite', add: { resolve: 1 } },
      { label: 'Give the phone to the Queen', next: 'd7_end', add: { trust: 1, dread: 1 } },
    ],
  },
  d7_rite: {
    ch: 12, speaker: 'QUEEN', mood: 'throne', focus: 'gate', song: 'seventh', scare: 'eye',
    text: 'The Seventh Night. Everything you have played is in it: the Song of Recall, the doors, the red corridor, the lullaby, the drowned choir, the bells, the riff, all at once, in pairs and threes, the whole room singing. Strike the chords together and the door holds open. Drop them and it starts, gently, to close on all of you.',
    songNext: { win: 'd7_rite_win', fail: 'd7_rite_fail', give: 'd7_rite_give' },
  },
  d7_rite_win: {
    ch: 12, speaker: 'CHOIR', mood: 'dawn', focus: 'gate',
    text: 'the door is open all the way. (Two hundred and fourteen voices, and then two hundred and fifteen, and then one very small one, singing the eleven notes right for the first time.) the first page is lit up. it is waiting for somebody to read it.',
    choices: [
      { label: 'Go to the first page', next: 'd7_end', add: { heart: 1, dread: -1 } },
    ],
  },
  d7_rite_fail: {
    ch: 12, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', scare: 'jump',
    text: 'The chord breaks, and the door swings, slowly, a hand\'s width toward shut. The red behind it gets bigger, the way a pupil does in the dark. The Guardian puts his whole weight on the frame. "Again," he says, through his teeth. "I held it for a hundred years. I can hold it for one more song."',
    choices: [
      { label: 'Play it again', next: 'd7_rite', retry: true },
      { label: 'Let the song go', next: 'd7_rite_give', add: { dread: 1 } },
    ],
  },
  d7_rite_give: {
    ch: 12, speaker: 'QUEEN', mood: 'dusk', focus: 'queen',
    text: '"It is all right." (She takes the flute from you, very gently.) "I never once finished it either. Not in all the beginnings." The door is open a hand\'s width. It has always been open a hand\'s width. "Come. There is still the page."',
    choices: [
      { label: 'Go to the first page', next: 'd7_end' },
    ],
  },
  d7_end: {
    ch: 12, speaker: 'QUEEN', mood: 'gate', focus: 'gate', note: 'seventh',
    text: 'It is nearly six on the seventh day. The book is open at the first page: the crayon door, the crayon crown, the number written backwards. Under it, every name. Under every name, the blank line, blinking, waiting, as it has always waited. "Choose," the Queen says, and she is not asking as a queen. "Whatever you choose, I will not write another name."',
    choices: [
      { label: 'Read the first page aloud, say her name, and close the book', next: 'end_seventh', req: { all: ['rite_seventh', 'named_eye', 'told_truth'], min: { mem: 10, heart: 3 }, maxDread: 3 } },
      { label: 'Take the Queen\'s place, and keep the book shut', next: 'end_throne', add: { resolve: 1 } },
      { label: 'Let it be 3:07 again', next: 'end_again', add: { dread: 1 } },
    ],
  },
  end_seventh: {
    ch: 12, speaker: 'NARRATOR', mood: 'dawn', focus: 'gate', ending: 'seventh',
    text: 'You read the first page.', choices: [],
  },
  end_throne: {
    ch: 12, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', ending: 'throne',
    text: 'You take her place.', choices: [],
  },
  end_again: {
    ch: 12, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', ending: 'again',
    text: 'It is 3:07.', choices: [],
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
  chorus: { tag: 'DAY THREE: SING ALL THREE RITES AS ONE', name: 'The Eye Remembered', hint: 'On Day Three, win all three rites, then sing them as one.', mood: 'dawn', cont: 'd4_wake',
    text: 'You sing the doors and the red corridor and the lullaby as one song, and the Eye, which has never been sung to, sings the last line back, a little wrong, perfectly. Every door in the Abyss opens at once, and for the first time anything that was ever watched there is allowed to look away.' },
  watched: { tag: 'DAY THREE: LOOK AWAY', name: 'The Watched', hint: 'On Day Three, look away from the Eye.', mood: 'dark', cont: 'd4_wake',
    text: 'You look away. It is such a small thing. The Eye does not mind, not exactly. It only learns, very slowly, what it is to be looked away from, and starts to practise on you: every screen, every window, every dark glass you ever pass. It is always, quietly, watching.' },
  names: { tag: 'DAY FOUR: SAY EVERY NAME, CLOSE THE BOOK', name: 'The Last Name', hint: 'On Day Four, read every name, finish the Drowned Choir\'s song, then close the book. It only closes for someone who has been here many times.', mood: 'dawn',
    text: 'You say all two hundred and fourteen names, and then your own, and then you close the book. It is only a contact, in the end: it deletes like anything else. In the cave the water is gone, and the stones are only stones, and they are quiet. The phone shows 3:07 for one more second. Then, for the first time in four days, it shows the right time.' },
  caller: { tag: 'DAY FOUR: WRITE THE NEXT NAME', name: 'The Next Caller', hint: 'On Day Four, write a name on the blank line.', mood: 'dark', cont: 'd5_wake',
    text: 'Message sent. It is so much lighter, the way it promised. Somewhere across town a phone lights up on a bedside table, 3:07, from a number they do not know, and someone you love sits up in the dark. You were never the one being haunted. You were the next voice in the phone.' },
  drowned: { tag: 'DAY FOUR: STAY IN THE WATER', name: 'The Drowned Choir', hint: 'On Day Four, stay with the choir under the water.', mood: 'dark', cont: 'd5_wake',
    text: 'The water closes over the screen and it is warm, as they said. You find the tune at once: everyone does, down here. Two hundred and fifteen voices now, mouthing eleven slow notes. The next person who wakes up in the cave will think the stones are singing.' },
  warned: { tag: 'DAY FIVE: WAKE EVERY NUMBER IN THE BOOK', name: 'The Warning', hint: 'On Day Five, tell Wren the truth, win the 3:07 Wake-Up, then have her call the first number. It only works for someone who has found many endings.', mood: 'dawn',
    text: 'She makes the call. Two hundred and fourteen phones ring at once in two hundred and fourteen kitchens, in the grey, in daylight, and every one of them is picked up by someone who was ready. The book deletes itself a name at a time. At 6:00 a message comes in from a number you do not know, in handwriting you know from birthday cards: thank you for waking us. At 6:01 the phone, for the first time, is only a phone.' },
  nightline: { tag: 'DAY FIVE: STAY ON THE LINE', name: 'The Night Line', hint: 'On Day Five, tell Wren the truth and promise to stay on the line.', mood: 'gate', cont: 'd6_wake',
    text: 'You promise to stay on the line, and you do. Every night at 3:07 the phone rings, and she picks up, and you talk about nothing: school, her stupid cat, what the stairs sounded like. It is the first time the phone has ever been used to keep someone company. The book never closes. But in all the long years after, nobody else ever has to be the next name.' },
  passed: { tag: 'DAY FIVE: HANG UP', name: 'Everyone Gets a Turn', hint: 'On Day Five, hang up on Wren and leave her to the book.', mood: 'dark', cont: 'd6_wake',
    text: 'You hang up. It is so light. Across the room Wren is looking at a phone that says 3:07, and then at the blank line in the contact that is already selected, and then at the dark corner of her room that is, just now, not entirely empty. She is very good at doing what she is told. She picks up her phone and she thinks of someone she loves.' },
  firstpage: { tag: 'DAY SIX: FIND THE FIRST PAGE, COME BACK FOR THE LAST', name: 'The First Page', hint: 'On Day Six, find out whose number is on the first page, and promise to come back.', mood: 'gate', cont: 'd7_wake',
    text: 'You put the phone down at six and it stays down. The first page is still open on it: a crayon door, a crayon crown. Somebody small drew that, and somebody grown wrote forgive me under it, and both of them have been waiting a very long time for the same thing. Tomorrow is the seventh night. You said you would come back. In the gap of a door you cannot see from here, something red and round closes, for the first time in years, and sleeps.' },
  cradle: { tag: 'DAY SIX: GO IN AND STAY WITH HER', name: 'The Cradle', hint: 'On Day Six, go through the door and keep Sorrel company.', mood: 'dark',
    text: 'You go in, and the door closes behind you, gently, the way you close a door on someone sleeping. It is warm. There are paper hats. Sorrel is so pleased she cannot speak, and then cannot stop. Outside, the phone lies face up on a bed in an empty room, 3:07, and the first page has a second name on it now, in crayon, pressed very hard: yours. Somebody always has to be in here with her. It may as well be someone who said her name.' },
  seventh: { tag: 'DAY SEVEN: READ THE FIRST PAGE, SAY HER NAME, CLOSE THE BOOK', name: 'The Seventh Morning', hint: 'On Day Seven, win the Seventh Night, call the Eye by its name and have told Wren the truth, then close the book. It only closes for someone who has found many endings.', mood: 'dawn',
    text: 'You read the first page out loud, crayon and all, and then you say her name, Sorrel, and the door is only a door, and a small girl in a paper hat walks out of it into her mother\'s arms, and both of them are crying, and neither of them is four any more, or a queen. Then every name, all two hundred and fourteen, and Wren\'s, and yours. Then you close the book. It is 6:00. It is 6:01. The phone, for the first time in seven days, is only a phone, and the next time you wake up, you will not remember any of this, and you will not need to.' },
  throne: { tag: 'DAY SEVEN: TAKE THE QUEEN\'S PLACE', name: 'The Seventh Queen', hint: 'On Day Seven, take the Queen\'s place and keep the book shut.', mood: 'throne',
    text: 'You take the flute and the crown of folded wings, and the Queen walks down out of the haze, light, old, toward a door she can finally go through. Nobody else writes a name. Nobody else wakes at 3:07. Only you, on a throne at the bottom of the dark, holding the book shut with both hands, for as long as it takes. It is a very quiet kind of love. Some nights you hear a child laughing on the other side of the door, and it is enough.' },
  again: { tag: 'DAY SEVEN: LET IT BE 3:07 AGAIN', name: 'Day One, Again', hint: 'On Day Seven, let it begin again.', mood: 'dark',
    text: 'It is 3:07. Something wakes you. Not a sound: the end of one. You are somewhere you do not remember coming to, a lift, a bath, a night bus, a shore, and the phone in your hand is warm, as if someone was holding it while you slept. You cannot remember your name. You can remember, very faintly, that you have been brave before. There is a message waiting. It will be different this time. It is always different this time.' },
  blackout: { tag: 'LET THE BATTERY DIE', name: 'Zero Percent', hint: 'Let the battery die in the dark.', mood: 'dark',
    text: 'The screen goes black and stays black. In the glass you can see your own face, lit from beneath by nothing. Somewhere very close, very gently, something starts to knock on the other side of the screen.' },
};
ABY.ENDING_IDS = Object.keys(ABY.ENDINGS);

// ---- state ----
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
ABY.newState = function (mem, open) {
  return { node: ABY.OPENINGS.indexOf(open) >= 0 ? open : ABY.START, mem: Number.isInteger(mem) ? clamp(mem, 0, 99) : 0, heart: 0, resolve: 0, trust: 0, dread: 0, bat: ABY.BAT0, light: 0, flags: {}, notes: [], tries: 0, choices: 0, back: '' };
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
  const id = ABY.endingOf(s), E = id && ABY.ENDINGS[id], n = ABY.NODES[s.node]; if (!E || !E.cont || (n && n.final)) return null;
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
  { id: 'last_name', name: 'The Last Name', hint: 'Close the book on Day Four.' },
  { id: 'first_warning', name: 'First Warning', hint: 'Warn Wren on Day Five.' },
  { id: 'seventh_morning', name: 'Seventh Morning', hint: 'Close the book on Day Seven.' },
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
  if (id === 'names') out.push('last_name');
  if (id === 'warned') out.push('first_warning');
  if (id === 'seventh') out.push('seventh_morning');
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
    if (won) o.flags['rite_' + id] = 1; else o.flags['fail_' + id] = 1;
    const gaveUp = !won && s.tries >= ABY.MAX_SONG_TRIES; o.tries = won || gaveUp ? 0 : s.tries;
    o.node = won ? n.songNext.win : (gaveUp ? n.songNext.give : n.songNext.fail);
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

// the phone's App Store: a fictional shop, nothing is bought; each listing is free, unlocks by endings found, and opens a page of lore
ABY.STORE = [
  { id: 'lantern', name: 'Lantern', glyph: '\u2600', c: ['#ffe27a', '#e07a10'], tag: 'Light for dark rooms', need: 0, blurb: 'A torch that remembers where you have been. Tap it twice before you go in.', lore: ['Installed by 4 people in your building.', 'It never asks for a permission. It knows which ones you would grant.', 'Review: "It lit the hall. Then it lit the thing in the hall."'] },
  { id: 'hush', name: 'Hush', glyph: '\u263E', c: ['#8fa0ff', '#3a2a8a'], tag: 'Silence, on demand', need: 1, blurb: 'Mutes every call, every ring. Not the one that is already inside.', lore: ['Muting keeps the sound out. It does not keep the caller out.', 'Review: "Slept eight hours. Woke with my phone open to a voicemail I did not record."'] },
  { id: 'echo', name: 'Echo Map', glyph: '\u25CE', c: ['#39e6ff', '#0a5a7a'], tag: 'Draws rooms by sound', need: 2, blurb: 'Listens, then draws. Some rooms on the map are newer than the building.', lore: ['The map has one more door than the floor plan.', 'Review: "Accurate until the third stair. Then it just says COME DOWN."'] },
  { id: 'ledger', name: 'Ledger of Names', glyph: '\u2020', c: ['#ff8a8a', '#7a1020'], tag: 'Who stayed, who left', need: 3, blurb: 'Lists everyone who held this phone before you. The list is longer than you think.', lore: ['Your name is already on it, in your own handwriting.', 'It is sorted by who answered the last call.'] },
  { id: 'eye', name: 'The Eye', glyph: '\u25C9', c: ['#ff4d5e', '#3a0008'], tag: 'It is watching you back', need: 5, blurb: 'Not an app. It installed itself. This listing is only here so you can find it.', lore: ['There is no uninstall.', 'It rates you five stars. It rates everyone five stars.'] }
];

if (typeof module !== 'undefined') module.exports = ABY;
