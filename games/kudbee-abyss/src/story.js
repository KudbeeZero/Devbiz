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
 * flashlight is needed or dread climbs), ring (`call`: { from, sub, ring: 1-3 }; an insistent call's Decline is another call, louder), show a picture (`img`), file a clue
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
// the third hard rite (optional, Day Six): a waltz. A chord lands on every first beat, two light notes follow, and the whole thing is longer than the riff. It is a music box
// that has been wound for a child who is still counting to one.
ABY.RITES.box = { name: 'THE MUSIC BOX', step: 0.26, win: 0.68, fall: 1.05, tint: '#ffd6a5', lanes: ['#ffd6a5', '#ff9ab8', '#a8e6ff'],
  mel: [
    [0, 1, 7], [3, 1], [5, 1], [1, 1, 8], [5, 1], [3, 1], [2, 1, 6], [3, 1], [4, 1], [0, 1, 7], [2, 1], [0, 1],
    [3, 1, 9], [5, 1], [7, 1], [4, 1, 9], [7, 1], [5, 1], [2, 1, 8], [5, 1], [6, 1], [1, 1, 7], [4, 1], [2, 1],
    [0, 1, 6], [2, 1], [3, 1], [1, 1, 7], [3, 1], [5, 1], [2, 1, 8], [5, 1], [7, 1], [4, 1, 9], [7, 1], [8, 1],
    [5, 1, 0], [7, 1], [9, 1], [4, 1, 1], [6, 1], [8, 1], [3, 1, 9], [5, 1], [4, 1], [2, 1, 8], [4, 1], [3, 1],
    [1, 1, 7], [3, 1], [2, 1], [0, 1, 6], [2, 1], [4, 1], [2, 1, 9], [5, 1], [7, 1], [3, 1, 8], [5, 1], [6, 1],
    [2, 1, 7], [4, 1], [5, 1], [1, 1, 6], [3, 1], [2, 1], [0, 1, 9], [2, 1], [4, 1], [2, 1, 7], [5, 1], [3, 1],
    [0, 1, 7], [0, 3, 6]],
  fx: [[3, 'whisper'], [12, 'knock'], [21, 'flash'], [30, 'drip'], [39, 'door'], [48, 'crack'], [57, 'flash'], [66, 'scream']] };
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
  h_rowan: { title: 'Before: Rowan', text: 'You were Rowan. A landing, a moon nightlight, a little sister who walked in her sleep. You always turned her round. You always counted her back.' },
  h_ellis: { title: 'Before: Ellis', text: 'You were Ellis. A front room above a launderette, Thursdays at four, a borrowed flute held together with tape. You taught Wren eleven notes. You never asked who had taught you.' },
  h_jude: { title: 'Before: Jude', text: 'You were Jude. Twelve years of nights on a children\'s ward. Every nurse knows the minute the monitors blink. Wren held your hand at 3:07 and told you not to answer it.' },
  hc_rowan: { title: 'What Wren did at the bottom of the stairs', text: 'Every time she walked in her sleep, Wren knelt at the bottom stair and turned something tiny in the air, low down, like a key in a lock only a child could reach. You always turned her round before it opened.' },
  hc_ellis: { title: 'The twelfth note', text: 'In pencil, under the last bar of Wren\'s first song, in a hand that is not yours: "the twelfth note is for the one nobody sings to." You have never played it. You never knew who it was for.' },
  hc_jude: { title: 'The night log, 3:07', text: 'Your own handwriting, twelve years of it: "3:07. Monitors blinked. Bed nine on the phone again, would not hang up." Every night a different bed. Always the ones who would not hang up.' },
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
  confession: { title: 'Who kept it 3:07', text: 'Not the Eye. Not the Guardian. Not Vey. The Queen, on her daughter\'s fourth birthday, with the dark coming up the stairs: she shut the door to keep her, and every name in the book held the phone for her.' },
  seventh: { title: 'The seventh night', text: 'The first page, every name under it, and the blank line, blinking. "Whatever you choose, I will not write another name."' },
  scar_crown: { title: 'Note to self: the crown', text: 'In your handwriting, pressed hard: don\'t put it on. It gets so quiet. You stop hearing the flute and you don\'t even miss it.' },
  scar_hollow: { title: 'Note to self: the key', text: 'Your handwriting, shaking: do not lock the door. The key gets warm. By morning you forget which side you\'re on.' },
  scar_eye: { title: 'Note to self: the Eye', text: 'Your handwriting: it doesn\'t want to be answered. It wants to be remembered. Those aren\'t the same thing.' },
  scar_betrayal: { title: 'Note to self: Vey', text: 'Your handwriting, very small: it smiles with a mouth much too wide. Be kind to it. Don\'t hand it anything.' },
  scar_loop: { title: 'Note to self: 3:07', text: 'Your handwriting, over and over down the page: don\'t turn it off. It only turns itself back on. Don\'t turn it off.' },
  scar_drowned: { title: 'Note to self: the water', text: 'Your handwriting, the ink run: it is warm under. That is how it gets you. Let go of the hand.' },
  scar_cradle: { title: 'Note to self: the nursery', text: 'Crayon, in your hand, pressed very hard: you can\'t stay with her. Somebody has to come back out and say her name.' },
  scar_again: { title: 'Note to self: the seventh night', text: 'Your handwriting, very calm: you have let it be 3:07 before. You were so brave, and then you forgot. Not this time.' },
  scar_blackout: { title: 'Note to self: the battery', text: 'Your handwriting, in the dark, mostly off the page: keep it charged. It knocks from the other side of the glass.' },
  vey_gift: { title: 'Message: Vey, overnight', text: 'Vey left you a message, and a small cold weight on the pillow: a brass key, much too small for any door in this building. "For later," it says. "You\u2019ll know the lock when you see it. It is very low down."' },
  eye_noticed: { title: 'Message: the Eye, overnight', text: 'you would not write a name. nobody ever does not. the book does not know what to do with you, and neither do i, and i have never been so interested in anyone.' },
  locking: { title: 'Flashback: the night of the lock', text: 'It was raining and the door was new. Corvin Ash stood in front of it in a clean coat, not yet iron. The Queen\u2019s hands shook so hard the key would not go in. On the stair behind them Vey carried something very small, asleep, in a paper crown.' },
  vey_stair: { title: 'Flashback: the servants\u2019 stair', text: 'Vey, with only two hands, carrying someone asleep down to the door. "I have never once let anything fall," it said, to nobody. "Please. Let me carry her the whole way in." It did not hand her over. It carried her all the way.' },
  nine_years: { title: 'Flashback: nine years ago', text: 'A landing with a nightlight, and Wren at nine in dinosaur pyjamas, holding the banister with both hands. "Don\u2019t," she said. "It\u2019s three seven. It\u2019s always three seven when someone goes." The phone on the hall table kept ringing. It is very patient.' },
  birthday_night: { title: 'Flashback: a fourth birthday', text: 'Four candles, paper hats, and a table laid for a party nobody had come to yet. The Queen knelt in front of a girl in a paper crown and said, brightly, "Make a wish." The wish was not for a cake. The Queen\u2019s smile did something terrible and she turned her face to the dark in the corner and asked it for the other thing.' },
  first_night: { title: 'Flashback: the first night', text: 'An ordinary kitchen at 3:07. A child on a stool drawing with a fat crayon: a door, a crown, a woman with a flute, a phone. "So I can find the way home if I get lost," she told the woman at the sink, who was not yet a Queen, only a mother with a flute at her back and the very first phone in her hand.' },
  glimpse_choir: { title: 'Flash-forward: the water', text: 'A cave flooded to the knee, tomorrow night. Two hundred and fourteen faces under the water, mouthing the same eleven notes, and the one nearest you has stopped and is mouthing something else. Your name.' },
  glimpse_hand: { title: 'Flash-forward: a hand', text: 'A bedroom with birthday cards on the corkboard, and a phone face down on the bedside table. A hand comes out of the blankets towards it, very slowly, shaking. Someone who has been told never to pick up, and is going to.' },
  glimpse_door: { title: 'Flash-forward: a small door', text: 'A house with no windows. A cot, paper hats, and a door standing open a hand\u2019s width onto red light. The light blinked once, as if it had been waiting a very long time for someone to come up the stairs.' },
  glimpse_seventh: { title: 'Flash-forward: the seventh night', text: 'Everyone in one room: the captain at the door, Vey at your ankle, the choir along the walls, the Queen with her flute. In the gap of the door, enormous and wet with crying, a child\u2019s eye. You open your mouth, and the screen cuts out before you can hear what you say.' },
  glimpse_morning: { title: 'Flash-forward: the morning after', text: 'Real light on a real wall. A phone, switched off, on a kitchen table. A quarter to seven, not 3:07. A kettle, a folded cot, and in the corridor an ordinary door.' },
  o_awake: { title: 'The count', text: 'DO NOT LET THEM COUNT YOU, in your own handwriting, under the flute strap. A photo of a small hand in yours that you do not remember taking. And on the back of your hand, in biro: 1.' },
  o_lift: { title: 'The lift wall', text: 'Pencil, at the height of a nine-year-old: W. WAS HERE. And a drawing of a lift with 3:07 on the door, taped where you could not have put it. Someone drew you the way in.' },
  o_bath: { title: 'The duck with the ribbon', text: 'A yellow duck on the bath rim with a ribbon round its neck, and in crayon, very small: for the bath, so you are never lonely down there. Whoever left it knew you would come up through the water.' },
  o_bus: { title: 'The packed bag', text: 'A child\u2019s schoolbag on the night bus: a torch, a sandwich in foil, a cracked phone at 3:07, and a note in block capitals: IF YOU GET LOST, STAY ON THE BUS. IT ALWAYS GOES HOME EVENTUALLY.' },
  o_ward: { title: 'The card on the locker', text: 'GET WELL. I WILL ANSWER IF IT RINGS. In handwriting you know from birthday cards, beside a phone labelled DO NOT ANSWER AFTER 3, in a night ward where a girl of fourteen has been holding your hand for a long time.' },
  o_shore: { title: 'The mittens on a string', text: 'Two hundred and thirteen small footprints go into the lake and none come out. The only things that ever came back were a pair of wellingtons with a duck sticker, and a pair of damp mittens on a string.' },
  o_party: { title: 'The party that never ended', text: 'Streamers, an uncut cake, a banner with the number smeared away, and a small girl in a paper crown counting down from three. Four candles. Then everyone goes home and the door opens.' },
  o_lost: { title: 'The ledger: lost property', text: 'A small purple umbrella with a duck handle, found at 3:07 and unclaimed for nine years. Whoever left it said they would come back for it. Somebody always says that.' },
  o_voicemail: { title: 'The saved voicemails', text: 'One voicemail, 3:07 long, in your own crying voice, and underneath it a child asking whether somebody is there. She has saved two hundred and fourteen more for you. She said you would listen.' },
  o_snow: { title: 'The snow globe', text: 'A snow globe on a landing where the snow falls up. A tiny figure in a paper crown, pressed against the glass, mouths the same three words over and over. The date scratched on its base is a year that has not happened yet.' },
  choir: { title: 'Recording: the stones, again', text: 'Slowed down, the singing stones are not stones. They are people, very far under water, all mouthing the same eleven notes. One of them is mouthing your name instead.' },
};

// the evidence board: in Notes she can pin two clues together. The right pair files a deduction (flag `link_<id>`) and opens a hidden choice later
// in the story; a wrong pair costs her (the phone laughs: battery and dread). Pairs hold one early clue and one later one, so a deduction rewards
// remembering across days. `at` is the scene whose hidden choice the deduction opens (the graph test proves each is reachable and used).
ABY.LINKS = [
  { id: 'two_warnings', a: 'recording', b: 'future_call', at: 'd2_door', alt: ['recording', 'a_hush'], title: 'Two warnings, one voice', text: 'The recording under the stones and the call from your own number say the same thing in the same voice: hers, and yours. Don’t open the gate. It isn’t him. Whoever is behind that door, it was never the Guardian.' },
  { id: 'yes_man', a: 'ledger', b: 'captain_name', at: 'd3_corvin', title: 'The man who always said yes', text: 'The ledger and the signature are the same neat hand. Corvin Ash wore the crown because she asked, and held the door because she asked. In all those pages, nobody ever asked him anything else.' },
  { id: 'many_hands', a: 'vey_photo', b: 'photo_you', at: 'd3_vey3', title: 'The hand on your shoulder', text: 'The hand behind the Queen in the photo and the hand on your shoulder at 3:07 have the same fingers, far too many of them. Vey has been with you since the first night. It has never once let anything fall.' },
  { id: 'who_is_next', a: 'next_line', b: 'wren_call', at: 'd5_dawn', hero: ['jude', 'hc_jude', 'wren_call'], title: 'How the book chooses', text: 'The blank line asks who is next. The call log says Wren stayed on for 41 minutes. The book does not take the frightened ones. It takes the ones who will not hang up.' },
  { id: 'birthday', a: 'door_crack', b: 'bargain', at: 'd6_room', alt: ['a_party', 'bargain'], title: 'Still her birthday', text: 'The door in the haze smelled of birthday candles. The Queen’s bargain keeps someone safe on the other side, for as long as the phone is held. Whoever is in there is still at their party. It has never once ended.' },
  { id: 'first_name', a: 'holders', b: 'first_page', at: 'd7_end', title: 'The first name in the book', text: '214 numbers, and above them all the first page: not a name, a crayon door and a crayon crown. The book did not begin with someone holding the phone. It began with a child drawing the way home.' },
  { id: 'what_she_gave', a: 'locking', b: 'bargain', at: 'd6_story', alt: ['a_cast', 'bargain'], title: 'Who she locked away', text: 'A girl in a paper crown, asleep on Vey\u2019s shoulder, on the night of the lock. A bargain that keeps someone safe on the other side, for as long as the phone is held. It was never a monster. The Queen locked her own child away to keep her, and called it a door.' },
  { id: 'low_lock', a: 'vey_gift', b: 'nursery_wall', at: 'd6_door', alt: ['a_smile', 'nursery_wall'], hero: ['rowan', 'hc_rowan', 'nursery_wall'], title: 'The key to the low lock', text: 'Vey left a key too small for any door in the building. The nursery door has a lock very low down, where only a child could reach it, and the letters on the wall get bigger all the way to the floor. The key was never meant for you. It was meant for her, to let herself out.' },
  { id: 'watcher', a: 'eye', b: 'nursery_wall', at: 'd7_eye', hero: ['ellis', 'hc_ellis', 'nursery_wall'], title: 'What the Eye is', text: '“Nobody ever sings to me.” SOMEBODY HAS TO SEE ME. The same wish, once in a voice and once on a wall. The Eye is not a thing that watches. It is a child nobody ever looked at.' },
];
ABY.LINK_IDS = ABY.LINKS.map(l => l.id);
// `alt` is a second pair for the same deduction, whose one new clue an installed app left her (APP_WHISPERS): the app stands in for a clue her
// journey may have missed. It opens the same hidden choice as the first pair, so an app adds a way to a deduction, never a new scene or ending.
// `hero` is [who, clue, partner]: a third pair whose clue only that person is given (on the Day Four wake, ABY.HERO_LINES), standing in the same way.
const pairIs = (p, a, b) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);
ABY.linkOf = function (a, b) { return ABY.LINKS.filter(l => pairIs([l.a, l.b], a, b) || (l.alt && pairIs(l.alt, a, b)) || (l.hero && pairIs(l.hero.slice(1), a, b)))[0] || null; };

// overnight: what the people she has been kind or cruel to say to her while she sleeps. A day's wake scene (`at`) shows these messages before its own,
// for whoever holds the flag (`req`, like a choice's). They are pure data, so the graph test can prove each one is reachable and its flag is set
// on an earlier day; a message with a `note` also files that clue. They give the flags nothing else reads a voice.
ABY.OVERNIGHT = [
  { id: 'n_obj_salt', at: 'd6_wake', req: { flag: 'used_salt' }, who: 'WREN', text: 'my window is crusted white. mum says it is frost. it is not frost. i am keeping some in a jar, in case.' },
  { id: 'n_obj_crayon', at: 'd7_wake', req: { flag: 'used_crayon' }, who: 'SORREL', text: 'somebody wrote under my wall. in my colour. it was the first time anybody wrote back. I did not rub it out.' },
  { id: 'n_obj_shard', at: 'd7_wake', req: { flag: 'used_shard' }, who: 'EYE', text: 'you held the glass up and i saw what i look like. do not do that again. do it again.' },
  { id: 'n_heard', at: 'd2_wake', req: { flag: 'heard' }, who: 'QUEEN', text: 'You heard the recording. I know, because I heard you hear it. I was not going to ask what it said. I know what it said.' },
  { id: 'n_marked', at: 'd2_wake', req: { flag: 'marked' }, who: 'EYE', text: 'you looked at me. nobody looks. i kept the look, in a drawer, and i have taken it out all night.' },
  { id: 'n_carried', at: 'd2_wake', req: { flag: 'carried' }, who: 'QUEEN', text: 'You sat with it. On the stairs, in the dark, you sat. I have never been able to do that. I wanted you to know that I saw.' },
  { id: 'n_vey_known', at: 'd3_wake', req: { flag: 'vey_known' }, who: 'VEY', note: 'vey_gift', text: 'You said my name aloud, in the dark, where I could hear. I left something on your pillow. Don’t look at it yet. Look at it when you are standing in front of the right lock.' },
  { id: 'n_refused_vey', at: 'd3_wake', req: { flag: 'refused_vey' }, who: 'VEY', text: 'You kept me at arm’s length. That is all right. I have had a long time to get used to the length of arms.' },
  { id: 'n_freed_name', at: 'd3_wake', req: { flag: 'freed_name' }, who: 'GUARDIAN', text: 'My name, said once, out loud. I have been saying it to myself all night, in case it leaves.' },
  { id: 'n_corvin_lamp', at: 'd4_wake', req: { flag: 'corvin_lamp' }, who: 'GUARDIAN', text: 'The lamp. I can see it from here, at the end of every corridor. Keep it lit. It is the only light I have ever been given.' },
  { id: 'n_corvin_door', at: 'd4_wake', req: { flag: 'corvin_door' }, who: 'GUARDIAN', text: 'I held the door behind you all night. Nothing came through. I did not know my arms could still do that.' },
  { id: 'n_vey_hand', at: 'd4_wake', req: { flag: 'vey3_hand' }, who: 'VEY', text: 'Your hand was so warm. Is it always like that? I do not remember. I think it is the best thing I have ever carried.' },
  { id: 'n_vey_cowed', at: 'd4_wake', req: { flag: 'vey3_cowed' }, who: 'VEY', text: 'You said you knew what I was. I do too. I have been waiting for someone to say it, so I could stop pretending to be anything else.' },
  { id: 'n_refused_next', at: 'd5_wake', req: { flag: 'refused_next' }, who: 'EYE', note: 'eye_noticed', text: 'you would not write a name. nobody ever does not. the book has not slept; i have never seen it so cross.' },
  { id: 'n_stayed_line', at: 'd6_wake', req: { flag: 'stayed_line' }, who: 'WREN', text: 'I did not hang up. I slept with it on the pillow and I could hear you breathing. Is that weird? It is the best I have slept since I was little.' },
  { id: 'n_blamed', at: 'd7_wake', req: { flag: 'blamed_queen' }, who: 'QUEEN', text: 'You said I did this to all of them. You were right. I counted them, every one. All two hundred and fourteen. I know their names, and I have not slept.' },
  { id: 'n_door_shut', at: 'd7_wake', req: { flag: 'door_shut' }, who: 'SORREL', text: 'i heard the door. it is ok. everybody does that. (a long pause.) did you come back?' },
  { id: 'n_page_unread', at: 'd7_wake', req: { flag: 'page_unread' }, who: 'QUEEN', text: 'You did not read the first page. That is all right. I could not either, for a very long time.' },
  { id: 'n_crown_laid', at: 'd5_wake', req: { flag: 'crown_laid' }, who: 'QUEEN', text: 'You laid the little crown down on the shore. I came and sat beside it all night. I did not ask whose it was. I think I have always known whose it was.' },
  { id: 'n_bells', at: 'd5_wake', req: { flag: 'bells_done' }, who: 'CHOIR', text: 'the bells. we have never been rung before. we did not know we were that kind of thing, a thing that could be played. thank you. we are still ringing.' },
  { id: 'n_open_awake', at: 'd2_wake', req: { open: 'awakening' }, who: 'QUEEN', text: 'You came the first way: the haze, the flute, a woman who could not remember her name. That was me. I have been rehearsing what to say if you ever came back to the beginning. I have only got as far as: thank you for not hanging up.' },
  { id: 'n_open_lift', at: 'd2_wake', req: { open: 'op_lift' }, who: 'QUEEN', text: 'You came by the lift. It had a floor on the panel that was only a crown. I did not put it there. I think the phone did.' },
  { id: 'n_open_bath', at: 'd2_wake', req: { open: 'op_bath' }, who: 'QUEEN', text: 'You came up through the water this time. I heard you before I saw you: someone humming eleven notes, under a bath, very far down.' },
  { id: 'n_open_bus', at: 'd2_wake', req: { open: 'op_bus' }, who: 'QUEEN', text: 'You came on a night bus that missed every stop. I stood at one of the stops all night, in case you got off.' },
  { id: 'n_open_ward', at: 'd2_wake', req: { open: 'op_ward' }, who: 'QUEEN', text: 'You came by the night ward, with a monitor beeping my tune. Someone there loves you very much, and is very tired.' },
  { id: 'n_open_shore', at: 'd2_wake', req: { open: 'op_shore' }, who: 'QUEEN', text: 'You came out of the lake. I counted the footprints going in. I am glad to be counting the ones coming out.' },
  { id: 'n_open_party', at: 'd2_wake', req: { open: 'op_party' }, who: 'QUEEN', text: 'You came from a party where everyone had gone home. I am sorry. I think I know whose it was.' },
  { id: 'n_open_lost', at: 'd2_wake', req: { open: 'op_lost' }, who: 'QUEEN', text: 'You came from the lost-property office, with your own face as the lock screen. Nothing is ever really lost, here. Only kept.' },
  { id: 'n_open_voicemail', at: 'd2_wake', req: { open: 'op_voicemail' }, who: 'QUEEN', text: 'You came in by your own voicemail, crying. I played it to the whole cave, in case it helped. It did not help. Thank you for letting me.' },
  { id: 'n_open_snow', at: 'd2_wake', req: { open: 'op_snow' }, who: 'QUEEN', text: 'You came in with the snow, falling up. It is still falling up in the cave. The stones like it. They have not been cold in years.' },
  { id: 'n_door_awake', at: 'd7_wake', req: { open: 'awakening' }, who: 'EYE', text: 'i was behind the haze too. ten doors, and every one of them opens onto me. you chose this one first, and you keep coming back through it. nobody ever told you it was a door.' },
  { id: 'n_door_lift', at: 'd7_wake', req: { open: 'op_lift' }, who: 'EYE', text: 'i was behind the lift too. ten doors, and every one of them opens onto me. you chose this one first, and you keep coming back through it. nobody ever told you it was a door.' },
  { id: 'n_door_bath', at: 'd7_wake', req: { open: 'op_bath' }, who: 'EYE', text: 'i was behind the bath too. ten doors, and every one of them opens onto me. you chose this one first, and you keep coming back through it. nobody ever told you it was a door.' },
  { id: 'n_door_bus', at: 'd7_wake', req: { open: 'op_bus' }, who: 'EYE', text: 'i was behind the night bus too. ten doors, and every one of them opens onto me. you chose this one first, and you keep coming back through it. nobody ever told you it was a door.' },
  { id: 'n_door_ward', at: 'd7_wake', req: { open: 'op_ward' }, who: 'EYE', text: 'i was behind the night ward too. ten doors, and every one of them opens onto me. you chose this one first, and you keep coming back through it. nobody ever told you it was a door.' },
  { id: 'n_door_shore', at: 'd7_wake', req: { open: 'op_shore' }, who: 'EYE', text: 'i was behind the lake too. ten doors, and every one of them opens onto me. you chose this one first, and you keep coming back through it. nobody ever told you it was a door.' },
  { id: 'n_door_party', at: 'd7_wake', req: { open: 'op_party' }, who: 'EYE', text: 'i was behind the party too. ten doors, and every one of them opens onto me. you chose this one first, and you keep coming back through it. nobody ever told you it was a door.' },
  { id: 'n_door_lost', at: 'd7_wake', req: { open: 'op_lost' }, who: 'EYE', text: 'i was behind the lost-property office too. ten doors, and every one of them opens onto me. you chose this one first, and you keep coming back through it. nobody ever told you it was a door.' },
  { id: 'n_door_voicemail', at: 'd7_wake', req: { open: 'op_voicemail' }, who: 'EYE', text: 'i was behind the voicemail too. ten doors, and every one of them opens onto me. you chose this one first, and you keep coming back through it. nobody ever told you it was a door.' },
  { id: 'n_door_snow', at: 'd7_wake', req: { open: 'op_snow' }, who: 'EYE', text: 'i was behind the snow too. ten doors, and every one of them opens onto me. you chose this one first, and you keep coming back through it. nobody ever told you it was a door.' },
  { id: 'b_queen_warm', at: 'd7_wake', req: { bond: { who: 'QUEEN', min: 2 } }, who: 'QUEEN', text: 'Every night you did something small and kind, and I kept them all. A whole drawer. Tonight I will not hide anything from you. Not even the first page.' },
  { id: 'b_vey_warm', at: 'd7_wake', req: { bond: { who: 'VEY', min: 3 } }, who: 'VEY', text: 'I have decided something. When it is time, I am going to be brave, and I am going to be small and brave at your ankle. Just so you know where I will be.' },
  { id: 'b_vey_cold', at: 'd7_wake', req: { bond: { who: 'VEY', max: -1 } }, who: 'VEY', text: 'I will still be there tonight. At your ankle, as always. You will not have to look at me. You never did.' },
  { id: 'b_guardian_warm', at: 'd7_wake', req: { bond: { who: 'GUARDIAN', min: 2 } }, who: 'GUARDIAN', text: 'I have stood at that door for longer than I can count. Tonight I will stand at it for you, and I will not look away, whatever comes to it.' },
  { id: 'b_wren_warm', at: 'd7_wake', req: { bond: { who: 'WREN', min: 2 } }, who: 'WREN', text: 'I am not scared, or I am, but I am coming anyway. You stayed on the line. That is the whole rule, right? You stay.' },
  { id: 'b_queen_cold', at: 'd7_wake', req: { bond: { who: 'QUEEN', max: -1 } }, who: 'QUEEN', text: 'I have not blamed you for any of it, and I would like you to know that tonight, because it would be easier if I had. I will be at the door at the end, as I said. You will not have to speak to me. Only stand where you can see that I am not hiding.' },
  { id: 'b_guardian_cold', at: 'd7_wake', req: { bond: { who: 'GUARDIAN', max: -1 } }, who: 'GUARDIAN', text: 'The door will be kept tonight, as it is every night. You need not look at me when you pass; I have been looked past by better than you, and by worse. I will say this once, and then I will go back to being a wall: I would have carried the phone.' },
  { id: 'b_wren_cold', at: 'd7_wake', req: { bond: { who: 'WREN', max: -1 } }, who: 'WREN', text: 'I am coming tonight because I said I would, and because I think you are the only one who can finish it. You do not have to be nice about it. I will be on the line, and I will not hang up. I just wanted you to know I noticed.' },
  { id: 'b_eye_warm', at: 'd7_wake', req: { bond: { who: 'EYE', min: 2 } }, who: 'EYE', text: 'you looked, and you asked, and you kept your word. i have had one night of being seen. tonight i would like to ask for a second.' },
  { id: 'b_eye_cold', at: 'd7_wake', req: { bond: { who: 'EYE', max: -1 } }, who: 'EYE', text: 'you looked away and you looked away and you looked away. i counted. it is all right. it is what i expected. i would have liked it to be different.' },
];
// ECHOES: the people here remember the endings a player has found (not only the falls, which leave scars): every non-fall ending in the Gallery
// sets a flag `echo_<id>` at the start of a journey, and its owner says so on a later day's wake. No choice sets these and none reads them, so they
// add no branches to the story: they are a voice for what the player has already done.
ABY.ECHOES = [
  ['dawn', 'd2_wake', 'QUEEN', 'You opened the gate once. I remember the draught. I have been standing where it blew, ever since, to feel it again.'],
  ['song', 'd2_wake', 'EYE', 'you sang it back to me, once, and i have not been able to stop humming it. it is the only thing i know all of.'],
  ['echo', 'd2_wake', 'VEY', 'There was another gate, once, and you went through that one too. I kept your place at both. I am good at keeping places.'],
  ['silence', 'd2_wake', 'GUARDIAN', 'The quiet gate. You let it be quiet. I stood in that quiet for a hundred years, and then you came, and it was a different quiet.'],
  ['mirror', 'd3_wake', 'QUEEN', 'I met her once, the other one, the one who wears my face. She asked after you. I said you were a better person than either of us.'],
  ['daybreak', 'd3_wake', 'WREN', 'you got out, once. real morning, a kettle, a bird. i keep thinking about the bird. did it say anything? it looked like it wanted to.'],
  ['keeper', 'd3_wake', 'GUARDIAN', 'You kept the night, and I kept you. That is not nothing. If you stay a keeper long enough you are allowed to sleep.'],
  ['chorus', 'd4_wake', 'CHOIR', 'we remember you from before. you conducted. we have been practising your count in the dark. we are very nearly in time.'],
  ['watched', 'd4_wake', 'EYE', 'you let me watch, once. nobody has ever let me. i did not blink, in case it ended.'],
  ['names', 'd4_wake', 'QUEEN', 'You read every name, the last time, and the last one was yours. I kept the page. I do not think I will ever turn it.'],
  ['caller', 'd5_wake', 'WREN', 'you were the next caller. you picked up. i do not think you know what that did, to the line. it has not gone silent since.'],
  ['warned', 'd5_wake', 'SORREL', 'you warned them. all of them, one by one, on the phone. some of them even listened. some of them are still here because of you.'],
  ['nightline', 'd5_wake', 'WREN', 'the night line. you stayed on it till morning. i have the recording. i listen to it when it gets quiet.'],
  ['passed', 'd6_wake', 'SORREL', 'you let everybody have a turn. even me. i have been holding the turn like a coin. i have not spent it. i think it is the nicest thing i own.'],
  ['firstpage', 'd6_wake', 'QUEEN', 'You read the first page aloud once. It sounded so ordinary, in your voice. I had imagined it would sound like a curse.'],
  ['seventh', 'd7_wake', 'EYE', 'the seventh morning. you came that far, and you looked at me, and you said my name right. i would like to be said right again.'],
  ['throne', 'd7_wake', 'QUEEN', 'You sat in the seventh chair, and it did not hold you. I am told that has never happened. I am not told by whom.'],
  ['lowdoor', 'd7_wake', 'VEY', 'You gave her the key. The little one. I felt it leave my hand and I felt the whole house get lighter. Thank you. I mean it. I have never meant it before.'],
].map(([id, at, who, text]) => ({ id: 'n_echo_' + id, at, req: { flag: 'echo_' + id }, who, text }));
// things she can pick up and spend later: carried while `has_<id>` is set and `used_<id>` is not (at most three exist, so a pocket never overflows)
ABY.OBJECTS = [
  { id: 'salt', name: 'Handful of salt', blurb: 'Cold, white, from the stairs. It keeps a line.' },
  { id: 'crayon', name: 'A child\'s crayon', blurb: 'Still warm. It writes in a colour she will know.' },
  { id: 'shard', name: 'Sliver of mirror', blurb: 'It shows a different stair. Cursed: what it shows costs you.', cursed: true },
];
ABY.carried = function (s) { return ABY.OBJECTS.filter(o => s.flags['has_' + o.id] && !s.flags['used_' + o.id]); };
ABY.appsOf = function (apps) {   // the installed apps that reach into a journey (`apps`: { id: 1 } from the phone, or a list)
  const has = Array.isArray(apps) ? (id => apps.indexOf(id) >= 0) : (id => !!(apps && apps[id] === 1));
  return (ABY.STORE || []).map(a => a.id).filter(has);
};
ABY.echoesOf = function (found) {
  const has = Array.isArray(found) ? (id => found.indexOf(id) >= 0) : (id => !!(found && found[id]));
  return ABY.ENDING_IDS.filter(id => !ABY.isFall(id) && has(id));
};
// the trust ledger: how she has treated each of the five who speak to her, counted from the flags her choices already set (no new state, so a save
// and the graph walk need nothing extra). A flag in `up` warms the bond, one in `down` cools it; a choice or a message can ask for a warm or cold one.
ABY.BONDS = {
  QUEEN: { name: 'the Queen', up: ['heard', 'carried', 'little_crown', 'crown_laid'], down: ['blamed_queen', 'sealed'] },
  VEY: { name: 'Vey', up: ['vey_known', 'vey_held', 'vey_trusted', 'vey3_hand'], down: ['refused_vey', 'vey_doubt'] },
  GUARDIAN: { name: 'the Guardian', up: ['freed_name', 'corvin_lamp', 'corvin_door'], down: ['skipped_doors'] },
  WREN: { name: 'Wren', up: ['stayed_line', 'told_truth', 'riff_done'], down: ['warned'] },
  EYE: { name: 'the Eye', up: ['marked', 'asked_eye', 'ally', 'promised_sorrel'], down: ['refused_next', 'door_shut'] },
};
ABY.BOND_IDS = Object.keys(ABY.BONDS);
ABY.BOND_FLAGS = [].concat(...ABY.BOND_IDS.map(w => ABY.BONDS[w].up.concat(ABY.BONDS[w].down)));
ABY.bond = function (s, who) {
  const b = ABY.BONDS[who], f = (s && s.flags) || {};
  return b ? b.up.filter(k => f[k]).length - b.down.filter(k => f[k]).length : 0;
};

// EPILOGUE, "A week later": when she wins the seventh night, how she treated the five people who held the phone with her is kept (`ABY.bondSnap`, a
// number each) and, the next time she opens the phone, each of them writes once more, in the words her bond with them earned (warm / mid / cold).
// Pure data and a pure picker: it changes no scene and no ending, so the graph walk never has to see it (its check only proves every person has all three).
ABY.EPI_LINES = {
  QUEEN: {
    warm: 'I have the window open. Every morning I play the second verse to the street, and a woman on the corner has started humming it back. You did that.',
    mid: 'I play again now, a little. Not the whole song. Enough that the house knows someone is home.',
    cold: 'I still play, but only when the door is shut. You were right about some things. I wish you had been kinder about them.' },
  VEY: {
    warm: 'I have filed you under a heading that did not exist before: “kept her word”. It is a short list. It is yours alone.',
    mid: 'Your name is in the book, in my handwriting, spelled correctly. That is more than most of them get.',
    cold: 'I wrote down every time you did not believe me. I read it back once. I find I cannot decide who it makes look worse.' },
  GUARDIAN: {
    warm: 'The gate stands open now and I sleep in the doorway, which my knees resent. Come by. There is a lamp lit with your name on it.',
    mid: 'Doors still need keeping. But I look up, now, when someone passes. That is new.',
    cold: 'I kept the gate. You walked through as though I were part of it. I would like, someday, to be asked my name.' },
  WREN: {
    warm: 'it is 6:01 again and i am awake and i am not scared. i put your number in my phone under “the one who stayed”.',
    mid: 'i sleep with the light on less. mum noticed. i told her it was because of a friend.',
    cold: 'i still keep the phone face down. i am not angry. i just never found out if you would have stayed.' },
  EYE: {
    warm: 'somebody looked at me today. on purpose. the girl across the street waved at the window and i waved back with the whole sky.',
    mid: 'i watch less. i listen more. it turns out the quiet has a shape and the shape is you not being gone.',
    cold: 'you looked at me and then you looked away. i have replayed it so many times it has gone smooth, like a stone in a pocket.' },
};
ABY.EPI_BANDS = ['warm', 'mid', 'cold'];
ABY.epiBand = n => n >= 2 ? 'warm' : n <= -1 ? 'cold' : 'mid';
ABY.bondSnap = s => { const o = {}; ABY.BOND_IDS.forEach(w => { o[w] = Math.max(-2, Math.min(4, ABY.bond(s, w))); }); return o; };
ABY.cleanSnap = d => { if (!d || typeof d !== 'object') return null; const o = {}; ABY.BOND_IDS.forEach(w => { o[w] = Number.isInteger(d[w]) ? Math.max(-2, Math.min(4, d[w])) : 0; }); return o; };
ABY.epilogueFor = snap => ABY.BOND_IDS.map(w => { const band = ABY.epiBand(snap && snap[w] | 0); return { who: w, band, text: ABY.EPI_LINES[w][band] }; });
// SECOND SIGHT: on a later journey the night remembers the earlier ones. A scene most journeys pass (`at`) opens with one more line, from someone who
// recognises her, for an ending she has found (`echo_<id>`, `scar_<id>`) or for how many (`min: { mem }`). They add no scenes and no branches: the
// same night reads differently the second time. A scene she can come back to (a flashlight, a slip, a detour) never carries one, so it is said once.
// ---- who you were (the player picks one when a journey begins): three people who knew Wren before. A choice of who, not of what: nothing here can move
// an ending. Each has a "before" scene that plays first (`hero_<id>`, then `@back` to the opening), a flashback on Day Two, Four and Six (`hb<d>_<id>`, offered
// once from one scene with `req: { hero, noflag }`, free, every choice `@back`), an overnight line by name on every wake from Day Two to Day Seven (ABY.HERO_LINES;
// Day Four's files a clue only that person holds, the third pair of a deduction that already exists: `hero` in ABY.LINKS), one reply a day said in their
// own words (a choice's `as`: the words change, never the choice, see ABY.labelOf) and a last message on every ending (ABY.HERO_CODAS) ----
ABY.HEROES = [
  { id: 'rowan', name: 'Rowan', tag: 'The older sibling', blurb: 'Shared a landing with Wren for nine years and walked her back to bed every time she sleepwalked. Still counts to forty in the dark.' },
  { id: 'ellis', name: 'Ellis', tag: 'The music teacher', blurb: 'Taught Wren her first eleven notes on a borrowed flute, in a front room above a launderette. Has never once played the last note of a song.' },
  { id: 'jude', name: 'Jude', tag: 'The night nurse', blurb: 'Twelve years of night shifts on a children\'s ward. Knows what 3:07 means. Sat up with Wren the night her fever broke, and has not slept properly since.' },
];
ABY.HERO_IDS = ABY.HEROES.map(h => h.id);
ABY.HERO_LINES = [
  { id: 'h_rowan_d2', at: 'd2_wake', req: { hero: 'rowan' }, who: 'GUARDIAN', text: '...Rowan... I heard you counting at the gate... forty, and then one, and then forty again... the old captains counted like that, to stay awake on the door... I thought you should know... it works...' },
  { id: 'h_rowan_d4', at: 'd4_wake', req: { hero: 'rowan' }, who: 'CHOIR', note: 'hc_rowan', text: 'we watched a child walk in her sleep once. down a landing, down twelve stairs. at the bottom she always knelt and turned something very small in the air, low down, like a key in a lock only she could reach. you always turned her round before it opened. we wrote it down for you.' },
  { id: 'h_rowan_d6', at: 'd6_wake', req: { hero: 'rowan' }, who: 'EYE', text: 'rowan. you turn people round. you turned her round a hundred times. nobody ever turned me round. i went all the way to the bottom and nobody came to fetch me. would you have. do not answer. i know you would.' },
  { id: 'h_rowan_d3', at: 'd3_wake', req: { hero: 'rowan' }, who: 'VEY', text: 'Rowan. That is your name. I found it written inside your wrist while you slept, very small, in a child\'s handwriting: ROWAN COUNTS. You do, you know. You count in your sleep. You got to forty last night and started again.' },
  { id: 'h_rowan_d5', at: 'd5_wake', req: { hero: 'rowan' }, who: 'WREN', text: 'Rowan? I dreamed you walked me back again. Twelve steps. You counted them, and I counted with you, and there was a thirteenth voice. I am not asleep now. I am sitting on the landing with the light on. Please ring.' },
  { id: 'h_rowan_d7', at: 'd7_wake', req: { hero: 'rowan' }, who: 'QUEEN', text: 'Rowan. You turned your sister round on the stairs a hundred times so that she would never reach the bottom. I know what is at the bottom. Thank you. Tonight, if I ask you to turn me round, do it.' },
  { id: 'h_ellis_d2', at: 'd2_wake', req: { hero: 'ellis' }, who: 'GUARDIAN', text: '...Ellis... you hummed at the gate when you thought nobody could hear... a teacher\'s hum, the note you give before a child plays... the gate heard it... it has been humming it back all night...' },
  { id: 'h_ellis_d4', at: 'd4_wake', req: { hero: 'ellis' }, who: 'CHOIR', note: 'hc_ellis', text: 'you never play the last note. we know why now. on the old music there is a twelfth note, in pencil, very faint: for the one nobody sings to. somebody wrote it for a child who was never sung to. we wrote it down for you.' },
  { id: 'h_ellis_d6', at: 'd6_wake', req: { hero: 'ellis' }, who: 'EYE', text: 'ellis. you teach them eleven and you never teach the twelfth. i listened at your window on thursdays. nine years. you never knew there was a child at the window. there was. i know all eleven.' },
  { id: 'h_ellis_d3', at: 'd3_wake', req: { hero: 'ellis' }, who: 'VEY', text: 'Ellis. That is your name. I heard the stones say it while you slept. They say it the way you say a teacher\'s name, carefully, in case it is the wrong one. They want to know if you will teach them the twelfth note. I told them you do not know it.' },
  { id: 'h_ellis_d5', at: 'd5_wake', req: { hero: 'ellis' }, who: 'WREN', text: 'Ellis, I found my flute. The taped one. I have not played it in nine years and last night it was on my pillow, warm. I did not play it. I promise I did not play it. Somebody in the garden is waiting for me to.' },
  { id: 'h_ellis_d7', at: 'd7_wake', req: { hero: 'ellis' }, who: 'QUEEN', text: 'Ellis. That flute was my daughter\'s first. I left it for whoever could play the eleven and stop. You stopped. Every time, you stopped. I have waited a very long time to hear someone stop.' },
  { id: 'h_jude_d2', at: 'd2_wake', req: { hero: 'jude' }, who: 'GUARDIAN', text: '...Jude... you checked the hinges of my gate before you went through, the way you would check a drip... nobody has ever checked on the gate... it does not know what to do with the feeling...' },
  { id: 'h_jude_d4', at: 'd4_wake', req: { hero: 'jude' }, who: 'CHOIR', note: 'hc_jude', text: 'the ward kept a book too. you wrote in it every night. 3:07, monitors blinked, bed nine on the phone again, would not hang up. a different bed every night. always the ones who would not hang up. we wrote it down for you.' },
  { id: 'h_jude_d6', at: 'd6_wake', req: { hero: 'jude' }, who: 'EYE', text: 'jude. you sat with bed nine at 3:07 every night. i was in bed ten. there was no bed ten. you said goodnight to it anyway, every night, on your way past. i heard every one.' },
  { id: 'h_jude_d3', at: 'd3_wake', req: { hero: 'jude' }, who: 'VEY', text: 'Jude. That is your name. You said it in your sleep, very quietly, the way you would say it to a frightened child: I am Jude, I am here all night. I sat by you the whole time. I did not know anyone had ever said that to anyone down here.' },
  { id: 'h_jude_d5', at: 'd5_wake', req: { hero: 'jude' }, who: 'WREN', text: 'Jude? I looked you up. The ward says you left. The ward says there is no nurse called Jude and never was. I have still got the bracelet with your writing on it. Please tell me you are real.' },
  { id: 'h_jude_d7', at: 'd7_wake', req: { hero: 'jude' }, who: 'QUEEN', text: 'Jude. The boy in bed nine helped me look for her for a long time. He was very brave. He asked me to tell the nurse he was sorry he stopped waving. I have been carrying that message all week. I did not know how to say it.' },
];
// a journey begins as someone: the "before" scene plays first and returns to the opening she was going to wake in (pure)
// the words she says a reply in: a choice may carry `as: { <hero>: words }`, the same reply as that person would put it (display only, never the choice)
ABY.labelOf = function (c, s) { return (c.as && s && s.hero && c.as[s.hero]) || c.label; };
ABY.heroStart = function (s, id) { if (ABY.HERO_IDS.indexOf(id) < 0 || !s || s.hero) return s; const o = Object.assign({}, s, { hero: id, back: s.node, node: 'hero_' + id, flags: Object.assign({}, s.flags), notes: s.notes.slice() }); if (o.notes.indexOf('h_' + id) < 0) o.notes.push('h_' + id); return o; };
ABY.SECOND_SIGHT = [
  { id: 's_sms', at: 'unknown_sms', req: { min: { mem: 1 } }, who: 'EYE', text: 'you again. you have held this phone before. your thumb goes to the same place on the glass.' },
  { id: 's_flute', at: 'flute_path', req: { flag: 'echo_song' }, who: 'QUEEN', text: 'The flute knows the way already. It pulls the way it pulled the night you played the whole song. Have we done this before?' },
  { id: 's_stones', at: 'stones_path', req: { flag: 'scar_drowned' }, who: 'CHOIR', text: 'we know your voice. you were down in the water with us once. you left. nobody leaves.' },
  { id: 's_choir', at: 'choir_1', req: { flag: 'echo_names' }, who: 'CHOIR', text: 'you said our names once and we went quiet. we are singing again. we are sorry. it is so hard to stop.' },
  { id: 's_spire', at: 'spire', req: { min: { mem: 3 } }, who: 'NARRATOR', text: 'Near the top of the spire there are scratches at the height of her hand, in tallies of five. Some of them look as if they were made tonight.' },
  { id: 's_vey', at: 'vey_come', req: { flag: 'scar_betrayal' }, who: 'VEY', text: 'You are looking at my mouth. Someone has told you about my mouth. (A small, hurt pause.) I will keep it closed, then.' },
  { id: 's_hollows', at: 'hollow_pass', req: { flag: 'scar_hollow' }, who: 'QUEEN', text: 'They are bowing to you. The Hollows have never bowed to anyone but a queen. What did you do, the last time?' },
  { id: 's_guardian', at: 'g_meet', req: { flag: 'echo_dawn' }, who: 'GUARDIAN', text: '...I know you... the gate... you opened it once, and I felt a draught on my face for the first time in a hundred years...' },
  { id: 's_reconcile', at: 'reconcile', req: { flag: 'echo_keeper' }, who: 'QUEEN', text: 'Someone holds a door in my dreams so that I can sleep. They have your hands. I thought you should know.' },
  { id: 's_stairs', at: 'stairs_2', req: { flag: 'scar_eye' }, who: 'EYE', text: 'you came up these stairs once and answered me. this time do not. this time i want to see what you do instead.' },
  { id: 's_d2queen', at: 'd2_queen', req: { flag: 'scar_loop' }, who: 'QUEEN', text: 'Whatever you do tonight, don’t turn it off. I don’t know why I’m saying that. I dreamt it.' },
  { id: 's_finale', at: 'd3_finale', req: { flag: 'echo_chorus' }, who: 'EYE', text: 'the last time you stood in this room you sang. i have been practising the last line. i still get it a little wrong.' },
  { id: 's_shore', at: 'd4_shore', req: { flag: 'echo_caller' }, who: 'CHOIR', text: 'you wrote a name on the line once. we heard who it was. we have kept them warm for you.' },
  { id: 's_wren', at: 'd5_hello', req: { flag: 'echo_warned' }, who: 'WREN', text: 'this is so weird. i dreamt you would call. you told me to pick up every number in the book. did i?' },
  { id: 's_sorrel', at: 'd6_sorrel', req: { flag: 'scar_cradle' }, who: 'SORREL', text: 'you came in last time!! you stayed for paper hats. are you coming in again? i saved you the red.' },
  { id: 's_end', at: 'd7_end', req: { min: { mem: 10 } }, who: 'NARRATOR', text: 'You have stood here many times. The book knows it: it falls open at the first page before anyone touches it.' },
];
ABY.overnightFor = function (s) { return ABY.OVERNIGHT.concat(ABY.HERO_LINES, ABY.ECHOES, ABY.SECOND_SIGHT, ABY.APP_WHISPERS || []).filter(o => o.at === s.node && ABY.okReq(s, o.req)); };

ABY.NODES = {
  // ======================= chapter 1: the awakening =======================
  awakening: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'glitch',
    teaser: 'You\u2019re awake. Do you hear it? The flute is calling.',
    text: 'Something wakes her. Not a sound: the end of one. 3:07, says the phone in your hand, and somewhere in the haze a door has just stopped closing. She cannot remember her name. She can remember the weight of the flute at her back, and the echo of its song in her blood. Something has already begun to count.',
    choices: [
      { label: 'Feel for the flute at your back', next: 'awakening_b', add: { resolve: 1 } },
      { label: 'Listen for the door that stopped closing', next: 'awakening_b', add: { heart: 1 } },
      { label: 'Look at the phone: 3:07', next: 'awakening_b', add: { dread: 1 } },
    ],
  },
  // ---- the other nine openings: a journey after the first starts in one of these (ABY.OPENINGS), somewhere new, and finds the same haze ----
  op_lift: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump', teaser: 'The lift has stopped. The doors are opening on a floor that is not on the panel.',
    text: 'The lift stops between floors with a soft, final bump. The light goes amber. The panel shows a floor that is not a number, only a small engraved crown, and the phone in your hand says 3:07. Then the doors slide open on violet haze, and on a woman with a flute at her back, standing very still, as if she has been waiting for the lift for years.',
    choices: [
      { label: 'Study the crown on the panel', next: 'op_lift_b', add: { resolve: 1 } },
      { label: 'Look at the woman with the flute', next: 'op_lift_b', add: { heart: 1 } },
      { label: 'Check the phone: 3:07', next: 'op_lift_b', add: { dread: 1 } },
    ],
  },
  op_bath: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'whisper', teaser: 'The bath has gone cold. Something under the water is humming.',
    text: 'You wake in the bath. The water has gone cold and very still, and the phone is balanced on the rim, dry, lit: 3:07. Under the water, where your feet should be, there is no bottom to the tub. Someone far down there is humming eleven slow notes, and a woman with a flute, very small at that distance, is looking up at you.',
    choices: [
      { label: 'Look down into the water', next: 'op_bath_b', add: { heart: 1 } },
      { label: 'Look at the phone on the rim', next: 'op_bath_b', add: { resolve: 1 } },
      { label: 'Hold your breath, and listen', next: 'op_bath_b', add: { dread: 1 } },
    ],
  },
  op_bus: {
    ch: 1, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', scare: 'glitch', teaser: 'The night bus has missed every stop. The driver will not turn round.',
    text: 'The night bus. Top deck, front seat, the city going by in long orange smears. You must have slept through your stop. The sign over the driver flips to its next destination: THE GUARDIAN\'S GATE. Then to 3:07. Every other passenger is facing the back of the bus. Every one of them is holding a phone exactly like yours.',
    choices: [
      { label: 'Look at the other passengers', next: 'op_bus_b', add: { dread: 1 } },
      { label: 'Look out at the city', next: 'op_bus_b', add: { resolve: 1 } },
      { label: 'Watch the destination sign', next: 'op_bus_b', add: { heart: 1 } },
    ],
  },
  op_ward: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'whisper', teaser: 'Hospital, night ward. The monitor beside you is beeping out a tune.',
    text: 'A hospital bed. A ward at night, every curtain drawn. The heart monitor beside you is not beeping, quite: it is playing notes, eleven of them, and then waiting. Your phone is on the blanket with a sticky label on it in a nurse\'s hand: PATIENT\'S OWN. DO NOT ANSWER AFTER 3. It is 3:07. Behind the last curtain, someone is playing a flute along with your heart.',
    choices: [
      { label: 'Read the label on the phone', next: 'op_ward_b', add: { dread: 1 } },
      { label: 'Listen to the monitor play', next: 'op_ward_b', add: { heart: 1 } },
      { label: 'Look at the drawn curtains', next: 'op_ward_b', add: { resolve: 1 } },
    ],
  },
  op_shore: {
    ch: 1, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', scare: 'whisper', teaser: 'A lake at night. Wet footprints go into the water. None come out.',
    text: 'You are standing on a lakeshore in the dark with wet feet and no memory of the walk here. The phone says 3:07. A line of small bare footprints leads past you into the water, and none come out. Out on the lake, where the reflection of the moon ought to be, there is a woman with a flute, standing on the surface, waiting to see what you do.',
    choices: [
      { label: 'Look at the footprints', next: 'op_shore_b', add: { heart: 1 } },
      { label: 'Look at the woman on the water', next: 'op_shore_b', add: { resolve: 1 } },
      { label: 'Look at your wet feet', next: 'op_shore_b', add: { dread: 1 } },
    ],
  },
  op_party: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump', teaser: 'A birthday party. Everyone has gone. Someone is still counting down.',
    text: 'A birthday party, long over. Paper hats on the floor, a cake with four burnt-down candles, every chair pushed back at once, as if everyone left in the same second. From the hall, a child\'s voice, counting down: nine. Eight. Your phone, face up among the plates: 3:07. In the hall mirror, a woman with a flute is standing behind you, with her finger to her lips.',
    choices: [
      { label: 'Look at the cake', next: 'op_party_b', add: { heart: 1 } },
      { label: 'Listen to the counting', next: 'op_party_b', add: { dread: 1 } },
      { label: 'Look in the hall mirror', next: 'op_party_b', add: { resolve: 1 } },
    ],
  },
  op_lost: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'glitch', teaser: 'Lost property found a phone with your face as the lock screen.',
    text: 'A lost-property office, after closing. A box of phones nobody came back for. One of them is buzzing. On its lock screen, a photo of you, asleep, taken from very close. The time on it is 3:07. You have never owned this phone. You put it to your ear and a woman, very far away, plays one long note on a flute, and the office is not there any more.',
    choices: [
      { label: 'Pick up the buzzing phone', next: 'op_lost_b', add: { resolve: 1 } },
      { label: 'Look at the photo of yourself', next: 'op_lost_b', add: { dread: 1 } },
      { label: 'Look at the box of phones', next: 'op_lost_b', add: { heart: 1 } },
    ],
  },
  op_voicemail: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper', teaser: 'One new voicemail. It is your own voice, and it is crying.',
    text: 'One new voicemail, 3:07. You play it. It is your own voice, out of breath, crying: "If you\'re hearing this you\'ve woken up again. Don\'t follow the flute. No. Follow the flute, but don\'t climb anything. Don\'t trust the little one. Trust the little one. I can\'t remember which. I\'m so sorry, I never remember which." Then a flute, very close to the phone.',
    choices: [
      { label: 'Play it again', next: 'op_voicemail_b', add: { dread: 1 } },
      { label: 'Listen to the flute', next: 'op_voicemail_b', add: { heart: 1 } },
      { label: 'Check who it came from', next: 'op_voicemail_b', add: { resolve: 1 } },
    ],
  },
  op_snow: {
    ch: 1, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', scare: 'glitch', teaser: 'Snow is falling indoors. It is warm, and it is falling up.',
    text: 'You wake on a staircase in a house you do not know, and it is snowing indoors: warm snow, falling up, toward a broken roof and a violet sky. The phone is at 3:07 and it will not move on. At the top of the stairs, where they should end, they do not. They go on up into the haze, and somebody up there is playing a flute to light the way.',
    choices: [
      { label: 'Hold out your hand to the snow', next: 'op_snow_b', add: { heart: 1 } },
      { label: 'Look at the broken roof', next: 'op_snow_b', add: { resolve: 1 } },
      { label: 'Look at the phone: 3:07', next: 'op_snow_b', add: { dread: 1 } },
    ],
  },
  unknown_sms: {
    ch: 1, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'glitch',
    text: 'i can see you holding it. it is 3:07. it is always 3:07 here. you should not have woken up.',
    choices: [
      { label: 'Who is this?', next: 'bt_d1_typing' },
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
      { label: 'Climb the broken spire', next: 'bt_d1_spire', add: { resolve: 1 } },
      { label: 'Call to the small creature', next: 'bt_d1_follow', add: { trust: 1 } },
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
      { label: 'The phone is ringing: Unknown (you)', next: 'rg_you1', bat: 0, req: { noflag: 'rg_done_you1' } },
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
      { label: 'Take the crystal', next: 'bt_d1_crystal', add: { resolve: 1 }, set: 'crystal', bat: -20 },
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
      { label: 'You have seen that smile before. Be kind, and keep it at arm\'s length', next: 'hollow_pass', add: { resolve: 1 }, set: 'vey_doubt', req: { flag: 'scar_betrayal' } },
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
      { label: 'Leave the crown. You remember how quiet it got', next: 'reconcile', add: { resolve: 1, trust: 1 }, req: { flag: 'scar_crown' } },
    ],
  },
  offering: {
    ch: 3, speaker: 'NARRATOR', mood: 'dawn', focus: 'crystal',
    text: 'She offers the flute to the spire. The crystal accepts, and the melody becomes a bridge of light between them.',
    choices: [
      { label: 'Walk through the light', next: 'bt_d1_bridge', add: { heart: 1, trust: 1 } },
    ],
  },

  // ======================= chapter 3: the guardian's gate =======================
  g_meet: {
    ch: 3, speaker: 'GUARDIAN', mood: 'dark', focus: 'guardian',
    text: '...you... carry the echo... my lady... the corruption... it burns... but the song remembers what I have forgotten.',
    choices: [
      { label: 'Embrace the Guardian', next: 'reconcile', add: { trust: 1 }, as: { rowan: 'Hold him the way you held her on the stairs, and count him back', ellis: 'Embrace him, and hum the first note so he knows you mean no harm', jude: 'Hold him steady, the way you hold a child through a fever' } },
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
    text: '...that is my hand. That is... I wrote that. She asked, and I said yes. I wore it. For a hundred years I held the door shut, and I never once asked what was behind it.',
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
      { label: 'You know how warm the key gets. Give it to him', next: 'gate_opens', add: { trust: 2 }, req: { flag: 'scar_hollow' } },
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
      { label: 'You answered it once. This time, tell it you remember it', next: 'eye_song', add: { heart: 1, dread: -1 }, req: { flag: 'scar_eye' } },
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
      { label: 'Message the Queen', next: 'bt_d2_delivered' },
      { label: 'Look at the new photo in your gallery', next: 'c2_vey' },
    ],
  },
  d2_queen: {
    ch: 6, speaker: 'QUEEN', mood: 'dusk', focus: 'queen',
    text: 'Is that you? I woke and the gate was open and I couldn\'t remember closing it. Vey says there is a way out. Vey says it a lot. How long have I been asleep?',
    choices: [
      { label: 'Believe her', next: 'd2_vey', add: { trust: 1 }, as: { rowan: 'Believe her: you know what waking somewhere strange feels like', ellis: 'Believe her, and tell her gently that it was a long rest', jude: 'Believe her, and say what you say to everyone who wakes on the ward: you were asleep, you are safe, I stayed' } },
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
      { label: 'Ask Vey whose hand that is', next: 'c2_vey_hand', req: { flag: 'vey_held' } },
    ],
  },
  d2_turn: {
    ch: 6, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump',
    text: 'Nothing is there. The phone buzzes in your hand. The photo has updated: now you are facing the camera, and you are smiling, and you are not.',
    choices: [
      { label: 'Open the thread from YOU', next: 'd2_you', add: { dread: 1 } },
      { label: 'The phone is ringing: The Queen', next: 'rg_queen2', bat: 0, req: { noflag: 'rg_done_queen2' } },
    ],
  },
  d2_you: {
    ch: 6, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'glitch',
    text: 'this is your number. i am what you left on the other side of the gate. you opened it with trust or with a song or with nothing at all and it does not matter which. i only needed it open.',
    choices: [
      { label: 'What do you want?', next: 'bt_d2_red' },
      { label: 'Play it a lullaby', next: 'd2_lull', req: { flag: 'lullaby' } },
      { label: 'Turn the phone off', next: 'end_loop' },
      { label: 'Leave it on. You know it only turns itself back on', next: 'd2_want', add: { resolve: 1 }, req: { flag: 'scar_loop' } },
      { label: 'Turn the clock back: who you were (Rowan)', next: 'hb2_rowan', bat: 0, free: true, req: { hero: 'rowan', noflag: 'tt_hero2' } },
      { label: 'Turn the clock back: who you were (Ellis)', next: 'hb2_ellis', bat: 0, free: true, req: { hero: 'ellis', noflag: 'tt_hero2' } },
      { label: 'Turn the clock back: who you were (Jude)', next: 'hb2_jude', bat: 0, free: true, req: { hero: 'jude', noflag: 'tt_hero2' } },
    ],
  },
  d2_want: {
    ch: 6, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'morning. i have never seen one. she locked time behind the gate so she would never have to feel it pass. i am what time looks like when nobody lets it end. take me to the bottom of the stairs. i will show you the door.',
    choices: [
      { label: 'Walk down the stairs', next: 'd2_stairs2' },
      { label: 'That is a lie', next: 'bt_d2_warm', set: 'doubt2', add: { resolve: 1 } },
    ],
  },
  d2_lull: {
    ch: 6, speaker: 'EYE', mood: 'dawn', focus: 'queen',
    text: 'you sang to me. nobody ever sings to me. i will not be a door for you tonight. i will be a light. carry me down and i will keep the dark from stepping on your heels.',
    choices: [
      { label: 'Carry it down', next: 'd2_stairs2', set: 'ally', add: { heart: 1, dread: -1 } },
      { label: 'The phone is ringing: Vey', next: 'rg_vey2', bat: 0, req: { noflag: 'rg_done_vey2' } },
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
      { label: 'Count the steps', next: 'bt_d2_landing', add: { dread: 1 } },
      { label: 'Do not count the steps', next: 'bt_d2_landing', add: { resolve: 1 } },
      { label: 'Scoop up the white grit on the step: it is salt, and it is cold', next: 'd2_stairs2', set: 'has_salt', req: { noflag: 'has_salt' } },
    ],
  },
  d2_clock: {
    ch: 7, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'whisper',
    text: 'Halfway down, every skull in the wall begins, very quietly, to tell you the time. 3:12. 3:13. They have been waiting so long to be wrong about something. At the bottom, a door. It is not locked. It is held.',
    choices: [
      { label: 'Go to the door', next: 'bt_d2_held' },
      { label: 'Pick up the sliver of mirror on the step. It is showing a different stair', next: 'd2_clock', set: 'has_shard', req: { noflag: 'has_shard' } },
    ],
  },
  d2_door: {
    ch: 7, speaker: 'NARRATOR', mood: 'gate', focus: 'gate',
    text: 'The door the Queen locked: iron, warm, with a keyhole the shape of a phone. Behind it, you can hear a morning breathing. Someone has to hold it open, or someone has to remember what it is called.',
    choices: [
      { label: 'Hold the door yourself, so she can sleep', next: 'end_keeper', req: { min: { resolve: 3 } } },
      { label: 'Say their names together, and open it', next: 'end_daybreak', req: { flag: 'knew_name', min: { trust: 3, mem: 4 }, maxDread: 3 } },
      { label: 'Put the phone in the lock and turn it off', next: 'end_loop' },
      { label: 'Two warnings, one voice: ask the door who it is', next: 'ev_door', req: { flag: 'link_two_warnings', noflag: 'ev_door' } },
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
      { label: 'Let the Guardian tell you what he has never told anyone', next: 'cf_corvin_a', bat: 0, req: { bond: { who: 'GUARDIAN', min: 1 }, noflag: 'tt_conf_corvin' } },
      { label: 'Open the photo it sent', next: 'bt_d3_lights', add: { dread: 1 } },
      { label: 'Switch on the flashlight', next: 'd3_wake', light: 1, req: { noLight: 1 } },
      { label: 'Go down to the first door', next: 'd3_hall' },
      { label: 'Turn the clock back: the night she locked the door', next: 'fb_locking', bat: 3, req: { noflag: 'tt_locking' } },
      { label: 'Wind the clock forward: the night of the water', next: 'ff_choir', bat: 3, add: { dread: 1 }, req: { noflag: 'tt_choir' } },
    ],
  },
  d3_photo: {
    ch: 8, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', dark: true, scare: 'eye', img: 'eye', note: 'eye_stairs',
    text: 'A staircase going down into a ceiling-high red Eye. Every step is lit from below, one by one, like a welcome. The photo was taken from exactly where you are standing, a half second from now.',
    choices: [
      { label: 'Switch on the flashlight', next: 'd3_photo', light: 1, req: { noLight: 1 } },
      { label: 'Count the doors on the stairs', next: 'd3_hall', add: { dread: 1 } },
      { label: 'Go down anyway', next: 'bt_d3_down', add: { resolve: 1 } },
      { label: 'Pick up the child\'s crayon from the bottom step. It is still warm', next: 'd3_photo', set: 'has_crayon', req: { noflag: 'has_crayon' } },
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
      { label: 'Step through', next: 'bt_d3_hall', add: { heart: 1 } },
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
      { label: 'Take the red corridor', next: 'c3_corvin', add: { resolve: 1 } },
      { label: 'Follow Vey down the servants\' stair', next: 'bt_d3_servants', add: { dread: 1 } },
      { label: 'Knock on the plain door', next: 'd3_corvin', req: { flag: 'knew_name' } },
      { label: 'The phone is ringing: Corvin Ash, behind the plain door', next: 'rg_corvin3', bat: 0, req: { noflag: 'rg_done_corvin3' } },
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
      { label: 'Take its hand', next: 'd3_table', set: 'vey3_hand', add: { dread: 1 }, as: { rowan: 'Take its hand, and count the steps out loud for both of you', ellis: 'Take its hand, the way you take a nervous pupil\'s', jude: 'Take its hand. Out of habit, feel for a pulse. There isn\'t one' } },
      { label: 'Say: I know what you are', next: 'd3_vey3_names', req: { min: { mem: 2 } } },
      { label: 'Go back to the fork', next: 'd3_fork' },
      { label: 'Show it both photos: the hand on your shoulder', next: 'ev_vey', req: { flag: 'link_many_hands' } },
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
      { label: 'Tell him: you always said yes. You can say no', next: 'ev_corvin', req: { flag: 'link_yes_man' } },
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
      { label: 'The phone is ringing: HOME, again', next: 'rg_home3', bat: 0, req: { noflag: 'rg_done_home3' } },
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
      { label: 'Sit with it', next: 'bt_d3_quiet', add: { heart: 1, dread: -1 } },
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
      { label: 'Open the new contact, Everyone Before You, and read one of them', next: 'hold_hub', bat: 0 },
      { label: 'Sit with Vey on the servants\u2019 stair, a while', next: 'cf_vey_a', bat: 0, req: { bond: { who: 'VEY', min: 1 }, noflag: 'tt_conf_vey' } },
      { label: 'Open the contact', next: 'd4_contact', add: { dread: 1 } },
      { label: 'Ask the Queen about the faces', next: 'bt_d4_faces' },
      { label: 'Switch on the flashlight', next: 'd4_wake', light: 1, req: { noLight: 1 } },
      { label: 'Go back to the singing stones', next: 'd4_stones', add: { resolve: 1 } },
      { label: 'Turn the clock back: the servants\u2019 stair, the night of the lock', next: 'fb_vey_stair', bat: 3, req: { noflag: 'tt_vey' } },
      { label: 'Wind the clock forward: a bedroom, 3:07', next: 'ff_wren', bat: 3, add: { dread: 1 }, req: { noflag: 'tt_wren' } },
      { label: 'Turn the clock back: how you first came in (the lift)', next: 'ec4_lift', bat: 3, req: { open: 'op_lift', noflag: 'tt_echo4' } },
      { label: 'Turn the clock back: how you first came in (the bath)', next: 'ec4_bath', bat: 3, req: { open: 'op_bath', noflag: 'tt_echo4' } },
      { label: 'Turn the clock back: how you first came in (the night bus)', next: 'ec4_bus', bat: 3, req: { open: 'op_bus', noflag: 'tt_echo4' } },
      { label: 'Turn the clock back: how you first came in (the ward)', next: 'ec4_ward', bat: 3, req: { open: 'op_ward', noflag: 'tt_echo4' } },
      { label: 'Turn the clock back: how you first came in (the shore)', next: 'ec4_shore', bat: 3, req: { open: 'op_shore', noflag: 'tt_echo4' } },
      { label: 'Turn the clock back: how you first came in (the party)', next: 'ec4_party', bat: 3, req: { open: 'op_party', noflag: 'tt_echo4' } },
      { label: 'Turn the clock back: how you first came in (the lost-property office)', next: 'ec4_lost', bat: 3, req: { open: 'op_lost', noflag: 'tt_echo4' } },
      { label: 'Turn the clock back: how you first came in (the voicemail)', next: 'ec4_voicemail', bat: 3, req: { open: 'op_voicemail', noflag: 'tt_echo4' } },
      { label: 'Turn the clock back: how you first came in (the snow)', next: 'ec4_snow', bat: 3, req: { open: 'op_snow', noflag: 'tt_echo4' } },
      { label: 'Turn the clock back: how you first came in (the haze)', next: 'ec4_awake', bat: 3, req: { open: 'awakening', noflag: 'tt_echo4' } },
    ],
  },
  d4_queen: {
    ch: 9, speaker: 'QUEEN', mood: 'dusk', focus: 'queen',
    text: 'The stones always sang. I told myself it was the cave. (A long pause, three dots that come and go.) It was never the cave. Everyone who held this phone and would not open the gate, I... put them somewhere quiet. I thought it was kind.',
    choices: [
      { label: 'Ask her how many', next: 'd4_contact', add: { trust: 1 }, as: { rowan: 'Ask her how many, and make her count them out loud', ellis: 'Ask her how many, softly, the way you ask how long since someone last played', jude: 'Ask her how many, the way you ask the night sister for the numbers' } },
      { label: 'Tell her it was not kind', next: 'd4_stones', add: { resolve: 1, trust: -1 } },
      { label: 'Tell her you will go and listen to them', next: 'c4_choir', add: { heart: 1, trust: 1 } },
    ],
  },
  d4_contact: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', dark: true, scare: 'whisper', note: 'holders',
    text: 'One contact. 214 numbers. You scroll and the list keeps going: names, dates, a photo of a hand on a phone, the same phone. Near the bottom, your name. Just above it, a name in handwriting you know from birthday cards.',
    choices: [
      { label: 'Switch on the flashlight', next: 'd4_contact', light: 1, req: { noLight: 1 } },
      { label: 'Read every name out loud', next: 'd4_stones', set: 'read_names', add: { heart: 1 }, bat: 4 },
      { label: 'Scroll past your own name', next: 'bt_d4_scroll', add: { dread: 1 } },
      { label: 'Delete the contact', next: 'bt_d4_sure' },
    ],
  },
  d4_delete: {
    ch: 9, speaker: 'CHOIR', mood: 'dark', focus: 'queen', scare: 'jump',
    text: 'contact deleted. (The phone buzzes in your hand.) 1 new contact: Everyone Before You (and you). we are not a list. you cannot put us in the bin. we have been in the water for a very long time and we are very good at coming back.',
    choices: [
      { label: 'Stop deleting it', next: 'd4_stones', add: { dread: 1 } },
      { label: 'Open it again', next: 'd4_contact', add: { dread: 1 } },
      { label: 'The phone is ringing: No Caller ID', next: 'rg_eye4', bat: 0, req: { noflag: 'rg_done_eye4' } },
    ],
  },
  d4_bottom: {
    ch: 9, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'eye', note: 'next_line',
    text: 'Under your name there is one more line. It is blank, and already selected, and the cursor is blinking in it. The keyboard has come up by itself. Very faint, the placeholder text says: who is next?',
    choices: [
      { label: 'Type a name', next: 'd4_type', add: { dread: 1 } },
      { label: 'Leave it blank and put the phone down', next: 'bt_d4_blank', add: { resolve: 1 } },
      { label: 'The phone is ringing: Everyone Before You', next: 'rg_before4', bat: 0, req: { noflag: 'rg_done_before4' } },
    ],
  },
  d4_type: {
    ch: 9, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'good. (It is a name you did not mean to type. Someone you love.) now tell them it is 3:07. tell them they should not have woken up. it is so much lighter, once someone else is holding it.',
    choices: [
      { label: 'Press send', next: 'end_caller' },
      { label: 'Delete it, one letter at a time', next: 'd4_stones', set: 'refused_next', add: { resolve: 1, dread: 1 } },
      { label: 'Turn the clock back: who you were (Rowan)', next: 'hb4_rowan', bat: 0, free: true, req: { hero: 'rowan', noflag: 'tt_hero4' } },
      { label: 'Turn the clock back: who you were (Ellis)', next: 'hb4_ellis', bat: 0, free: true, req: { hero: 'ellis', noflag: 'tt_hero4' } },
      { label: 'Turn the clock back: who you were (Jude)', next: 'hb4_jude', bat: 0, free: true, req: { hero: 'jude', noflag: 'tt_hero4' } },
    ],
  },
  d4_stones: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', dark: true, scare: 'whisper', img: 'corrupt',
    text: 'The cave of singing stones has flooded to the knee. The stones are not stones. Under the black water, faces, eyes shut, mouths moving, all singing the same eleven notes, very slowly, the way you sing to someone who is falling asleep.',
    choices: [
      { label: 'Switch on the flashlight', next: 'd4_stones', light: 1, req: { noLight: 1 } },
      { label: 'Raise the flute and sing with them', next: 'd4_choir', add: { heart: 1 } },
      { label: 'Wade in to the deepest face', next: 'd4_choir', add: { dread: 1, resolve: 1 } },
      { label: 'Say your own name into the water, before they can', next: 'd4_choir', req: { flag: 'tt_choir' }, add: { heart: 1, resolve: 1 } },
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
      { label: 'Ask them their names', next: 'bt_d4_names', add: { heart: 1, dread: -1 } },
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
      { label: 'You have drowned here before. Let go, and swim', next: 'd4_shore', add: { resolve: 1, dread: -1 }, req: { flag: 'scar_drowned' } },
    ],
  },
  d4_shore: {
    ch: 9, speaker: 'QUEEN', mood: 'gate', focus: 'queen',
    text: 'You are on the shore and the phone is dry, and the contact is open on its own: every name, and yours, and the blank line under it. "Someone has to close that book," the Queen says, very quietly. "Or write the next name in it. I always wrote the next name."',
    choices: [
      { label: 'Take out the little crown', next: 'd4_crown', req: { flag: 'little_crown', noflag: 'crown_laid' } },
      { label: 'Ring the drowned bells', next: 'd4_bells', req: { noflag: 'bells_done' } },
      { label: 'Ask the Guardian to carry the phone across the water, so you can ring them', next: 'd4_bells', add: { resolve: 1, dread: -1 }, req: { noflag: 'bells_done', bond: { who: 'GUARDIAN', min: 2 } } },
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
      { label: 'Say her name', next: 'bt_d5_bedroom', add: { heart: 1 } },
      { label: 'Breathe, the way it was done to you', next: 'd5_breathe', add: { dread: 1 } },
      { label: 'Hang up before she answers', next: 'd5_hang' },
      { label: 'Turn the clock back: the night you took the phone', next: 'fb_nine', bat: 3, req: { noflag: 'tt_nine' } },
      { label: 'Wind the clock forward: a small door, red light', next: 'ff_door', bat: 3, add: { dread: 1 }, req: { noflag: 'tt_door' } },
      { label: 'You saw her hand reach for the phone. Say her name before she answers', next: 'd5_truth', req: { flag: 'tt_wren' }, set: 'told_truth', add: { trust: 1 } },
    ],
  },
  d5_hello: {
    ch: 10, speaker: 'WREN', mood: 'dusk', focus: 'queen',
    text: '...hello? (A sleepy whisper, very close. She is holding the phone with both hands.) It says 3:07. Who is this? How do you have this number? Is this a prank?',
    choices: [
      { label: 'Tell her the truth', next: 'bt_d5_where', set: 'told_truth', add: { trust: 1 }, as: { rowan: 'Tell her the truth: it\'s Rowan. I\'m on the landing too', ellis: 'Tell her the truth: it\'s Ellis, from Thursdays at four', jude: 'Tell her the truth: it\'s Jude, from the ward. You told me not to answer, and I did' } },
      { label: 'Say it is a wrong number', next: 'd5_lie', add: { dread: 1 } },
      { label: 'Say nothing', next: 'd5_breathe', add: { dread: 1 } },
      { label: 'Remind her: I held your hand on the landing when you were nine', next: 'd5_truth', req: { flag: 'tt_nine' }, set: 'told_truth', add: { heart: 1, trust: 1 } },
    ],
  },
  d5_breathe: {
    ch: 10, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'whisper',
    text: 'good. you are learning. (Her breathing on the other end, getting faster.) say it. say: you should not have woken up. it is so much lighter once it is in someone else.',
    choices: [
      { label: 'Say it', next: 'd5_cruel', add: { dread: 1 } },
      { label: 'Say her name instead', next: 'bt_d5_again', add: { heart: 1, resolve: 1 } },
    ],
  },
  d5_cruel: {
    ch: 10, speaker: 'WREN', mood: 'dark', focus: 'queen', scare: 'jump',
    text: 'Why would you say that? (A crash: the lamp. Then, small and shaking, not hanging up.) I know that voice. Please. I know that voice. Is it really you?',
    choices: [
      { label: 'Tell her the truth', next: 'bt_d5_voice', set: 'told_truth', add: { dread: 1 } },
      { label: 'Hang up', next: 'd5_hang' },
    ],
  },
  d5_lie: {
    ch: 10, speaker: 'WREN', mood: 'dark', focus: 'queen', call: { from: 'Wren', sub: 'calling you back' },
    text: 'click. (The line goes dead. Then, before you can breathe, the phone rings. Wren is calling you back.) The screen says WREN, and under it, in handwriting you know from birthday cards: she knows your voice.',
    choices: [
      { label: 'Pick up', next: 'd5_truth', set: 'told_truth', add: { heart: 1 } },
      { label: 'Let it ring', next: 'd5_ring' },
    ],
  },
  d5_ring: {
    ch: 10, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', scare: 'jump', call: { from: 'Wren', sub: '20 missed calls', ring: 2 },
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
      { label: 'Pour a line of salt along the edge of the screen, so the blank line cannot be written', next: 'd5_hello', set: 'used_salt', add: { resolve: 1, dread: -2 }, req: { flag: 'has_salt', noflag: 'used_salt' } },
      { label: 'Leave her to the dark', next: 'end_passed' },
      { label: 'The phone is ringing: Corvin Ash', next: 'rg_corvin5', bat: 0, req: { noflag: 'rg_done_corvin5' } },
    ],
  },
  d5_truth: {
    ch: 10, speaker: 'WREN', mood: 'dusk', focus: 'queen', note: 'wren_call',
    text: 'You tell her. The phone, the book, the choir, the eye. It takes a long time. She does not hang up. Somewhere in it she starts to cry, and then stops, and then says, very evenly, the way she did when she was nine: okay. Okay. What do I do?',
    choices: [
      { label: 'Tell her about the book', next: 'd5_book', add: { resolve: 1 } },
      { label: 'Tell her to sing with you', next: 'd5_rite', add: { heart: 1 } },
      { label: 'Ask her to stay on the line till it is light', next: 'bt_d5_night', set: 'stayed_line' },
      { label: 'Tell her how you came in, the very first night: it will help her not be afraid', next: 'd5_book', req: { flag: 'tt_echo4' }, add: { heart: 1, trust: 1 } },
      { label: 'The phone is ringing: Vey, from the book', next: 'rg_vey5', bat: 0, req: { noflag: 'rg_done_vey5' } },
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
      { label: 'Stay on the line with Wren, and listen', next: 'cf_wren_a', bat: 0, req: { bond: { who: 'WREN', min: 1 }, noflag: 'tt_conf_wren' } },
      { label: 'Play her the riff, loud, to wake the street', next: 'd5_riff', req: { noflag: 'riff_done' } },
      { label: 'Have her call the first number in the book', next: 'end_warned', req: { all: ['rite_wake', 'told_truth'], min: { mem: 8 }, maxDread: 4 } },
      { label: 'Promise to stay on the line, every night', next: 'end_nightline', req: { flag: 'told_truth' } },
      { label: 'Ask Wren to stay on the line with her too, so she is never alone', next: 'end_nightline', add: { heart: 1 }, req: { bond: { who: 'WREN', min: 2 } } },
      { label: 'Hang up and let the book have her', next: 'end_passed' },
      { label: 'Tell her how the book chooses', next: 'ev_line', req: { flag: 'link_who_is_next', noflag: 'ev_line' } },
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
      { label: 'Ask the Queen whose number it is', next: 'bt_d6_page', add: { trust: 1 } },
      { label: 'Call the number', next: 'd6_ring', add: { dread: 1 } },
    ],
  },
  d6_queen: {
    ch: 11, speaker: 'QUEEN', mood: 'dusk', focus: 'queen',
    text: 'She does not answer for a long time. Then: "Sorrel. My daughter. She was four. She left the door open first, and something came in, and something went out, and in the morning the door was shut and she was on the other side of it." A long breath. "I wrote the first name to keep her. I have been writing the next one ever since."',
    choices: [
      { label: 'Ask what she gave for it', next: 'bt_d6_kept', add: { resolve: 1 } },
      { label: 'Call Sorrel', next: 'd6_ring', add: { heart: 1 } },
    ],
  },
  d6_story: {
    ch: 11, speaker: 'QUEEN', mood: 'dark', focus: 'queen', scare: 'whisper', note: 'bargain',
    text: '"I asked the dark for her back, and it said: not back. Only kept. Kept safe on the other side of the door, for as long as someone is always holding the phone at 3:07. One night each. One name each. Nobody ever told me how long a child stays four." Her voice breaks on it, very quietly. "You must think I am a monster."',
    choices: [
      { label: 'Tell her you would have done the same', next: 'd6_ring', add: { heart: 1, trust: 1 } },
      { label: 'Tell her she did this to all of them', next: 'd6_ring', add: { resolve: 1, dread: 1 }, set: 'blamed_queen' },
      { label: 'Tell her you were there the night of the lock: you saw the key shake in her hand', next: 'd6_ring', req: { flag: 'tt_locking' }, add: { heart: 2, trust: 1 } },
      { label: 'Tell her you know who she locked away: a girl in a paper crown', next: 'd6_ring', req: { flag: 'link_what_she_gave' }, add: { heart: 2, trust: 2, dread: 1 } },
      { label: 'Turn the clock back: who you were (Rowan)', next: 'hb6_rowan', bat: 0, free: true, req: { hero: 'rowan', noflag: 'tt_hero6' } },
      { label: 'Turn the clock back: who you were (Ellis)', next: 'hb6_ellis', bat: 0, free: true, req: { hero: 'ellis', noflag: 'tt_hero6' } },
      { label: 'Turn the clock back: who you were (Jude)', next: 'hb6_jude', bat: 0, free: true, req: { hero: 'jude', noflag: 'tt_hero6' } },
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
      { label: 'Put the phone face down until morning', next: 'bt_d6_facedown', add: { dread: 1 }, set: 'page_unread' },
    ],
  },
  d6_sorrel: {
    ch: 11, speaker: 'SORREL', mood: 'dusk', focus: 'queen',
    text: 'Hello? (A small voice, very close to the phone, breathing through its mouth.) Is it Mummy? I counted to one. I counted to one lots of times. Is it my turn yet? Mummy said when it\'s my turn I can come out.',
    choices: [
      { label: 'Tell her who you are', next: 'bt_d6_parcel', add: { trust: 1 }, as: { rowan: 'Tell her who you are: Rowan, who always comes to fetch the little ones', ellis: 'Tell her who you are: Ellis, who teaches songs to children', jude: 'Tell her who you are: Jude, the nurse who stays all night' } },
      { label: 'Pretend to be her mother', next: 'd6_pretend', add: { dread: 1 } },
      { label: 'Ask her to open the door', next: 'd6_door', add: { resolve: 1 } },
      { label: 'Play her the music-box waltz, the one with two hands', next: 'd6_box', req: { noflag: 'box_done' } },
    ],
  },
  d6_box: {
    ch: 11, speaker: 'SORREL', mood: 'dusk', focus: 'queen', song: 'box', scare: 'whisper',
    text: 'Behind her voice, very small and very slow, a music box has started to wind. It is playing in threes: one low and one high together on the first beat, then two light steps, like a child going down the stairs holding both rails. "Can you do the one with two hands?" Sorrel says. "Mummy always does the one with two hands."',
    songNext: { win: 'd6_box_win', fail: 'd6_box_fail', give: 'd6_box_give' },
  },
  d6_box_win: {
    ch: 11, speaker: 'SORREL', mood: 'dawn', focus: 'queen',
    text: 'The last chord closes like a lid, softly. There is a long, delighted quiet, and then the sound of a very small person turning in a circle on a wooden floor with her arms out. "You did the two hands," she says, to someone who is not there to be told. "You did it all the way to the end."',
    choices: [
      { label: 'Tell her it is her turn to choose the next one', next: 'd6_sorrel', add: { heart: 1, dread: -1 }, set: 'box_done' },
    ],
  },
  d6_box_fail: {
    ch: 11, speaker: 'SORREL', mood: 'dusk', focus: 'queen', scare: 'whisper',
    text: 'The two notes come apart, one low and one high, and the music box catches on the gap and winds back to the start with a tiny, patient click. "That is all right," says Sorrel, in a voice she has borrowed from somebody grown. "It does that. You just go back to the top and you do it again."',
    choices: [
      { label: 'Start the waltz again', next: 'd6_box', retry: true },
      { label: 'Tell her you will hum it instead', next: 'd6_box_give', add: { dread: 1 } },
    ],
  },
  d6_box_give: {
    ch: 11, speaker: 'SORREL', mood: 'dusk', focus: 'queen',
    text: 'You hum it, off the beat and flat, and she hums it back to you, off the beat and flat in exactly the same places. "That one is better," she decides. "That one is ours." The music box runs down by itself, slowly, and she lets it.',
    choices: [
      { label: 'Go back to what she was saying', next: 'd6_sorrel', add: { dread: 1 }, set: 'box_done' },
    ],
  },
  d6_who: {
    ch: 11, speaker: 'SORREL', mood: 'dusk', focus: 'queen',
    text: 'You\'re the one with the phone. Everyone has the phone for a bit. It\'s like pass-the-parcel, Mummy says, and when the music stops you have to write a name, and then it\'s their go. (A pause.) Nobody has ever rung me before. They only ever ring the next one.',
    choices: [
      { label: 'Ask her where she is', next: 'd6_room', add: { heart: 1 } },
      { label: 'Ask her to open the door', next: 'd6_door', add: { resolve: 1 } },
      { label: 'The phone is ringing: Wren, on the other line', next: 'rg_wren6', bat: 0, req: { noflag: 'rg_done_wren6' } },
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
      { label: 'Hold the mirror shard up in the dark so she can see herself, once', next: 'd6_door', set: 'used_shard', add: { resolve: 1, dread: 2 }, req: { flag: 'has_shard', noflag: 'used_shard' } },
      { label: 'Paper hats, birthday candles: ask whose party it is', next: 'ev_party', req: { flag: 'link_birthday' } },
      { label: 'Go straight to the door: you have already seen it', next: 'd6_door', req: { flag: 'tt_door' }, add: { resolve: 1 } },
    ],
  },
  d6_wall: {
    ch: 11, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'eye', img: 'eye', note: 'nursery_wall',
    text: 'SHE LEFT THE DOOR OPEN FIRST, from the very first night. And under it, newer, the letters getting bigger all the way down the wall, the way handwriting does when the hand gets older and older and is still not allowed out: SO I WATCH. I WATCH EVERY ONE OF THEM. SOMEBODY HAS TO SEE ME. The light through the door is red, and round, and it blinks.',
    choices: [
      { label: 'Go to the door', next: 'd6_door', add: { heart: 1 } },
      { label: 'Write under it in her own colour: I SEE YOU', next: 'd6_door', set: 'used_crayon', add: { heart: 1, dread: -1 }, req: { flag: 'has_crayon', noflag: 'used_crayon' } },
      { label: 'The phone is ringing: The Queen', next: 'rg_queen6', bat: 0, req: { noflag: 'rg_done_queen6' } },
    ],
  },
  d6_door: {
    ch: 11, speaker: 'SORREL', mood: 'gate', focus: 'gate',
    text: 'The door\'s open a bit. You can come in if you want. (Very quietly.) But if you come in you have to stay. That\'s the rule. Somebody always has to be in here with me, or I get big, and when I get big everyone has to look at me.',
    choices: [
      { label: 'Go in and keep her company', next: 'end_cradle', add: { heart: 1 } },
      { label: 'You stayed in this room once. Promise to come back instead', next: 'd6_dawn', set: 'promised_sorrel', add: { heart: 1, trust: 1 }, req: { flag: 'scar_cradle' } },
      { label: 'Sing her the lullaby through the door', next: 'd6_lull', req: { flag: 'lullaby' }, add: { heart: 1, dread: -1 } },
      { label: 'Give her the little crown back', next: 'd6_crown', req: { flag: 'little_crown' }, add: { heart: 1, trust: 1 } },
      { label: 'Tell her you will come back tomorrow', next: 'bt_d6_promise', add: { trust: 1 }, set: 'promised_sorrel' },
      { label: 'Ask the Eye to look at her, once, so that someone has seen her', next: 'd6_dawn', add: { heart: 1, dread: -1 }, req: { bond: { who: 'EYE', min: 2 } } },
      { label: 'Shut the door on her', next: 'd6_shut', add: { resolve: 1, dread: 1 } },
      { label: 'Try the little brass key in the low lock', next: 'ev_key', req: { flag: 'link_low_lock' } },
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
      { label: 'Ask the Queen what she has not said', next: 'cf_queen_a', bat: 0, req: { bond: { who: 'QUEEN', min: 1 }, noflag: 'tt_conf_queen' } },
      { label: 'Say you will come back', next: 'end_firstpage', add: { resolve: 1 } },
      { label: 'Go back through the door and stay with Sorrel', next: 'end_cradle', req: { flag: 'promised_sorrel' } },
      { label: 'Turn the clock back: a fourth birthday', next: 'fb_birthday', bat: 3, req: { noflag: 'tt_birthday' } },
      { label: 'Wind the clock forward: the seventh night', next: 'ff_seventh', bat: 3, add: { dread: 1 }, req: { noflag: 'tt_seventh' } },
      { label: 'Turn the clock back: the lift, once more', next: 'ec6_lift', bat: 3, req: { open: 'op_lift', noflag: 'tt_echo6' } },
      { label: 'Turn the clock back: the bath, once more', next: 'ec6_bath', bat: 3, req: { open: 'op_bath', noflag: 'tt_echo6' } },
      { label: 'Turn the clock back: the night bus, once more', next: 'ec6_bus', bat: 3, req: { open: 'op_bus', noflag: 'tt_echo6' } },
      { label: 'Turn the clock back: the ward, once more', next: 'ec6_ward', bat: 3, req: { open: 'op_ward', noflag: 'tt_echo6' } },
      { label: 'Turn the clock back: the shore, once more', next: 'ec6_shore', bat: 3, req: { open: 'op_shore', noflag: 'tt_echo6' } },
      { label: 'Turn the clock back: the party, once more', next: 'ec6_party', bat: 3, req: { open: 'op_party', noflag: 'tt_echo6' } },
      { label: 'Turn the clock back: the lost-property office, once more', next: 'ec6_lost', bat: 3, req: { open: 'op_lost', noflag: 'tt_echo6' } },
      { label: 'Turn the clock back: the voicemail, once more', next: 'ec6_voicemail', bat: 3, req: { open: 'op_voicemail', noflag: 'tt_echo6' } },
      { label: 'Turn the clock back: the snow, once more', next: 'ec6_snow', bat: 3, req: { open: 'op_snow', noflag: 'tt_echo6' } },
      { label: 'Turn the clock back: the haze, once more', next: 'ec6_awake', bat: 3, req: { open: 'awakening', noflag: 'tt_echo6' } },
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
      { label: 'Open the Queen\'s message', next: 'bt_d7_flute', add: { trust: 1 } },
      { label: 'Open No Caller ID', next: 'bt_d7_red', add: { dread: 1 } },
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
      { label: 'Tell her you will do it together', next: 'd7_gather', add: { heart: 1, trust: 1 }, as: { rowan: 'Tell her you will do it together: you will count, and she will not reach the bottom', ellis: 'Tell her you will do it together: you will play the eleven, and she will play the twelfth', jude: 'Tell her you will do it together. Nobody works the last night shift alone' } },
      { label: 'Ask about No Caller ID', next: 'c7_you', add: { resolve: 1 } },
      { label: 'The phone is ringing: Unknown (you), the first night', next: 'rg_you7', bat: 0, req: { noflag: 'rg_done_you7' } },
    ],
  },
  d7_eye: {
    ch: 12, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'eye', img: 'eye',
    text: 'last one. (The screen is entirely red, and round, and wet.) then it starts again. it always starts again. you wake up somewhere new with a phone in your hand at 3:07 and you do not remember any of this. a lift. a bath. a bus. ten doors, and every one of them opens onto me.',
    choices: [
      { label: 'Say her name: Sorrel', next: 'd7_named', req: { flag: 'eye_is_sorrel' }, add: { heart: 2, dread: -2 }, set: 'named_eye' },
      { label: 'Ask what starts again', next: 'bt_d7_show', add: { dread: 1 } },
      { label: 'You let it start again once. Not this time', next: 'd7_gather', add: { resolve: 2, dread: -1 }, set: 'knows_loop', req: { flag: 'scar_again' } },
      { label: 'Block the number', next: 'd7_gather', add: { dread: 1 } },
      { label: 'Tell her you read her wall. You see her', next: 'ev_watch', req: { flag: 'link_watcher' } },
      { label: 'Sing her the birthday song she never got to finish', next: 'd7_named', req: { flag: 'tt_birthday' }, set: 'named_eye', add: { heart: 2, dread: -2 } },
      { label: 'You saw this in the clock. Say her name first: Sorrel', next: 'd7_named', req: { flag: 'tt_seventh' }, set: 'named_eye', add: { heart: 1, dread: -1 } },
      { label: 'Tell her you remember the door you came through. She waited at it too', next: 'd7_named', req: { flag: 'tt_echo6' }, set: 'named_eye', add: { heart: 2, dread: -2 } },
    ],
  },
  d7_again: {
    ch: 12, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'whisper', note: 'ten_doors',
    text: 'the beginning. all the beginnings. the haze, and the flute, and a woman who cannot remember her name, and you, holding the phone. it is very kind, forgetting. you have done this before. you have done this so many times. you are always so brave on the seventh night, and then it is 3:07 again.',
    choices: [
      { label: 'Not this time', next: 'bt_d7_turn', add: { resolve: 2 }, set: 'knows_loop' },
      { label: 'How many times?', next: 'd7_gather', add: { dread: 1 }, set: 'knows_loop' },
      { label: 'The phone is ringing: The Queen, the last night', next: 'rg_queen7', bat: 0, req: { noflag: 'rg_done_queen7' } },
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
      { label: 'Ask the Eye what it saw first', next: 'cf_eye_a', bat: 0, req: { bond: { who: 'EYE', min: 1 }, noflag: 'tt_conf_eye' } },
      { label: 'Raise the flute', next: 'd7_rite', add: { resolve: 1 } },
      { label: 'Give the phone to the Queen', next: 'bt_d7_hands', add: { trust: 1, dread: 1 } },
      { label: 'Turn the clock back: the very first night', next: 'fb_first', bat: 3, req: { noflag: 'tt_first' } },
      { label: 'Wind the clock forward: the morning after', next: 'ff_morning', bat: 3, add: { dread: 1 }, req: { noflag: 'tt_morning' } },
      { label: 'Let Vey carry the phone for you, just this once', next: 'd7_rite', req: { flag: 'tt_vey' }, add: { trust: 1, dread: -1 } },
      { label: 'Ask Vey to climb up onto your shoulder, where you can both see', next: 'd7_rite', req: { bond: { who: 'VEY', min: 3 } }, add: { trust: 1, dread: -1 } },
      { label: 'Ask the Guardian to leave the door and stand beside you', next: 'd7_rite', req: { bond: { who: 'GUARDIAN', min: 2 } }, add: { resolve: 1, dread: -1 } },
      { label: 'Ask Wren to take the other end of the flute', next: 'd7_rite', req: { bond: { who: 'WREN', min: 2 } }, add: { heart: 1, dread: -1 } },
      { label: 'Ask the Eye to look at the Queen, just once, and see her', next: 'd7_end', req: { bond: { who: 'EYE', min: 2 } }, add: { heart: 1, trust: 1, dread: -1 } },
      { label: 'Tell the Queen what the clock showed you: a morning. A real one', next: 'd7_end', req: { flag: 'tt_morning' }, add: { trust: 1, heart: 1, dread: -1 } },
      { label: 'Tell the Queen you were in the kitchen on the first night: it was always a map', next: 'd7_end', req: { flag: 'tt_first' }, add: { heart: 1, trust: 1, dread: -1 } },
      { label: 'Lay out your notes. Say who has kept it 3:07 all week', next: 'd7_accuse', req: { noflag: 'board_out' } },
    ],
  },
  // the accusation: the evidence board's payoff. Everyone in the room is a suspect; only the deduction she pinned on Day Six lets her name the
  // one who did it. A wrong name is a fall (it starts again); the right one is a confession, and with the small key Vey pressed into her hand on the stairs (Day Three), a way out
  d7_accuse: {
    ch: 12, speaker: 'NARRATOR', mood: 'throne', focus: 'gate', scare: 'whisper',
    text: 'You open Notes and hold the phone up so the whole room can see the clues, the pins, the red string between them. It goes very quiet. The Guardian takes his hand off the frame. Vey stops moving at your ankle. The Choir stops dripping. The Queen lowers her flute. In the gap of the door, the red eye goes very wide. Seven nights, and someone in this room has kept it 3:07 the whole time. Everyone is waiting for you to say who.',
    choices: [
      { label: 'The Eye. It has watched you every night', next: 'd7_acc_eye', add: { dread: 1 } },
      { label: 'The Guardian. He held the door shut', next: 'd7_acc_guard', add: { dread: 1 } },
      { label: 'Vey. It was behind the Queen on the very first night', next: 'd7_acc_vey', add: { dread: 1 } },
      { label: 'The Queen. She locked her own child away, and called it a door', next: 'd7_confess', req: { flag: 'link_what_she_gave' }, add: { resolve: 1 } },
      { label: 'Not yet. Put the phone down', next: 'd7_gather', set: 'board_out' },
    ],
  },
  d7_acc_eye: {
    ch: 12, speaker: 'EYE', mood: 'dark', focus: 'queen', scare: 'jump', img: 'eye',
    text: 'me. (The red does not blink.) everybody says it is me. every single time. they look at the eye and they say it is the eye, and nobody reads to the bottom of the wall. (Something very small, behind the door, starts to cry, and then stops, as if it has been told to.) all right. if it is me, then it is me. it is 3:07. it is always going to be 3:07.',
    choices: [
      { label: 'Wait. That is not what you meant', next: 'end_again', add: { dread: 1 } },
    ],
  },
  d7_acc_guard: {
    ch: 12, speaker: 'GUARDIAN', mood: 'dark', focus: 'guardian', scare: 'glitch',
    text: '"Yes." (Corvin Ash does not argue. He never has.) "I held the door. I held it because she asked me to, and I would hold it again. Nobody in a hundred years has asked me anything else." He looks at the Queen, and she does not look back. His hand comes off the frame, and without it, very slowly, the door begins to close on all of you.',
    choices: [
      { label: 'Hold the door yourself', next: 'end_again', add: { dread: 1 } },
    ],
  },
  d7_acc_vey: {
    ch: 12, speaker: 'VEY', mood: 'dark', focus: 'vey', scare: 'glitch',
    text: 'Vey goes still, which it has never done, not once in seven nights. (Far too many fingers, folding up, one by one.) It was there on the first night. It was there behind her when she shut the door, holding the child so she would not fall. It has never let anything fall. It lets go of your ankle. And for the first time since 3:07 on the first night, there is nothing holding you up.',
    choices: [
      { label: 'Reach for it', next: 'end_again', add: { dread: 1 } },
    ],
  },
  d7_confess: {
    ch: 12, speaker: 'QUEEN', mood: 'gate', focus: 'queen', note: 'confession',
    text: '"Yes." (She does not deny it. She has had seven nights to deny it.) "It was her birthday. The dark was coming up the stairs, and she was four, and she was laughing, and I could not think of anything else to do. I shut her in where it could not reach her, and I made a bargain to keep her there, safe, as long as somebody held the phone. Every name in that book held it for me." The flute slides out of her hands. "I kept it 3:07. I kept it 3:07 so I would never have to open the door and see what I did."',
    choices: [
      { label: 'Give her what Vey pressed into your hand on the stairs: a key, very small. Sorrel can open the low lock herself', next: 'end_lowdoor', req: { flag: 'vey3_hand' }, add: { heart: 2, dread: -2 } },
      { label: 'Tell her to say it to the door, then take her to the first page', next: 'd7_end', add: { heart: 1, trust: 1, dread: -1 } },
    ],
  },
  d7_rite: {
    ch: 12, speaker: 'QUEEN', mood: 'throne', focus: 'gate', song: 'seventh', scare: 'eye',
    text: 'The Seventh Night. Everything you have played is in it: the Song of Recall, the doors, the red corridor, the lullaby, the drowned choir, the bells, the riff, the music box, all at once, in pairs and threes, the whole room singing. Strike the chords together and the door holds open. Drop them and it starts, gently, to close on all of you.',
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
      { label: 'Show her the first page: it was a way home', next: 'ev_first', req: { flag: 'link_first_name', noflag: 'ev_first' } },
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
  end_lowdoor: {
    ch: 12, speaker: 'NARRATOR', mood: 'dawn', focus: 'gate', ending: 'lowdoor',
    text: 'The key is very small.', choices: [],
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

  // ---- calls that have to be picked up: the phone rings in the middle of a day. `call.ring` is how insistent it is (1-3: louder, faster, the glass
  // cracks). Some will not take no: decline and they ring again, and the third time the phone answers itself ----
  c2_vey: {
    ch: 6, speaker: 'NARRATOR', mood: 'dark', focus: 'vey', scare: 'whisper', call: { from: 'Vey', sub: '777 777 7777' },
    text: 'Your thumb is on the gallery when the phone rings. The number is all sevens. You did not give Vey this number. Vey has never needed one.',
    choices: [
      { label: 'Answer', next: 'c2_vey_talk', bat: 6 },
      { label: 'Decline', next: 'd2_photo', add: { dread: 1 } },
    ],
  },
  c2_vey_talk: {
    ch: 6, speaker: 'VEY', mood: 'dark', focus: 'vey',
    text: 'Don\'t open that photo on your own. Nobody should look at that one alone. Let me stay on the line while you look. I\'ll be ever so quiet. You won\'t even feel me.',
    choices: [
      { label: 'Let it stay on the line', next: 'd2_photo', set: 'vey_held', add: { trust: 1, dread: 1 } },
      { label: 'Hang up and look alone', next: 'd2_photo', add: { resolve: 1 } },
    ],
  },
  c2_vey_hand: {
    ch: 6, speaker: 'VEY', mood: 'dark', focus: 'vey', scare: 'jump',
    text: 'Mine. (Very close. Closer than the phone.) I said you wouldn\'t feel me. You didn\'t, did you? Not once, in all the nights. I have such light hands, when I want to.',
    choices: [
      { label: 'Ask it to take the hand away', next: 'd2_turn', add: { resolve: 1, dread: -1 } },
      { label: 'Let it stay', next: 'd2_you', add: { trust: 1, dread: 1 } },
    ],
  },
  c3_corvin: {
    ch: 8, speaker: 'NARRATOR', mood: 'dusk', focus: 'guardian', scare: 'jump', call: { from: 'Corvin Ash', sub: 'calling from behind a door' },
    text: 'Halfway to the red corridor, the phone rings. Not a ringtone: an old brass bell, the kind that hangs over a shop door. The caller ID is a name, in small neat handwriting.',
    choices: [
      { label: 'Answer', next: 'c3_corvin_talk', bat: 6 },
      { label: 'Decline', next: 'c3_corvin2', add: { dread: 1 } },
    ],
  },
  c3_corvin2: {
    ch: 8, speaker: 'NARRATOR', mood: 'dusk', focus: 'guardian', scare: 'glitch', call: { from: 'Corvin Ash', sub: 'calling again', ring: 2 },
    text: 'It rings again before the first ring has died. Louder. The bell is right behind you now, at the height of a man\'s hand, and a hairline crack runs across the glass.',
    choices: [
      { label: 'Answer', next: 'c3_corvin_talk', bat: 6 },
      { label: 'Decline', next: 'c3_corvin3', add: { dread: 1 } },
    ],
  },
  c3_corvin3: {
    ch: 8, speaker: 'NARRATOR', mood: 'dark', focus: 'guardian', scare: 'jump', call: { from: 'Corvin Ash', sub: 'answered', ring: 3 },
    text: 'You decline it. The phone answers itself. On the other end someone clears his throat, very politely, the way a soldier does before he says a thing he has been told never to say.',
    choices: [
      { label: 'Listen', next: 'c3_corvin_talk', add: { dread: 1 } },
    ],
  },
  c3_corvin_talk: {
    ch: 8, speaker: 'GUARDIAN', mood: 'dusk', focus: 'guardian',
    text: 'The corridor is warm. That is how it keeps people: not with teeth. With warmth. Keep the song whole, and do not stop to rest, however kind the walls are to you. (A pause.) I am not allowed to call. I am not allowed to do anything but hold the door. I called.',
    choices: [
      { label: 'Thank him, and go on', next: 'd3_blood', add: { trust: 1 } },
    ],
  },
  c4_choir: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', scare: 'whisper', call: { from: 'Everyone Before You', sub: '214 callers' },
    text: 'Before you reach the cave the phone rings, and keeps ringing, two hundred and fourteen times at once. The screen fills with water from the bottom up.',
    choices: [
      { label: 'Answer', next: 'c4_choir_talk', bat: 6, add: { dread: 1 } },
      { label: 'Decline', next: 'd4_stones', add: { dread: 1 } },
    ],
  },
  c4_choir_talk: {
    ch: 9, speaker: 'CHOIR', mood: 'dark', focus: 'gate', note: 'choir',
    text: '(Water. Only water, for a long time. Then, very far down in it, two hundred voices singing eleven notes, slowed down until they are words.) we kept your place. we kept your place. we kept your place, love. there is room.',
    choices: [
      { label: 'Hang up, and go to them', next: 'd4_stones', add: { heart: 1 } },
    ],
  },
  c7_you: {
    ch: 12, speaker: 'NARRATOR', mood: 'throne', focus: 'gate', scare: 'jump', call: { from: 'Unknown (you)', sub: 'the first call, again', ring: 2 },
    text: 'Before she can answer, the phone rings. The caller ID is your own number, exactly as it was on the first night, and the ring is the same ring.',
    choices: [
      { label: 'Answer', next: 'c7_you_talk', bat: 6 },
      { label: 'Decline', next: 'c7_you2', add: { dread: 1 } },
    ],
  },
  c7_you2: {
    ch: 12, speaker: 'NARRATOR', mood: 'throne', focus: 'gate', scare: 'glitch', call: { from: 'Unknown (you)', sub: 'answered', ring: 3 },
    text: 'It answers itself. Of course it does. You have heard this call before, from the other end, and you know it will not let you hang up until it is said.',
    choices: [
      { label: 'Listen', next: 'c7_you_talk', add: { dread: 1 } },
    ],
  },
  c7_you_talk: {
    ch: 12, speaker: 'NARRATOR', mood: 'gate', focus: 'gate', scare: 'whisper',
    text: 'Your own voice, from the first night, a week younger: "Don\'t let her open the gate. She doesn\'t know what she locked behind it. It isn\'t him. It was never him." And then the part that was cut off, the part you have never heard: "It\'s her. It\'s her little girl. Say her name."',
    choices: [
      { label: 'Hang up, and answer No Caller ID', next: 'd7_eye', set: 'eye_is_sorrel', add: { resolve: 1 } },
    ],
  },
  // ---- confidences: a person who trusts her tells her one thing more. Five two-scene memories, one for each day from Three to Seven, offered only to a player whose bond with
  // that person is warm (`req.bond`). They are listening, not choosing: no stat, no light, no battery, no clue, no flag but their own once-only guard, and they return to the scene she
  // left, so no gate, rite or ending is touched (graph check `confidences`). ----
  cf_corvin_a: {
    ch: 8, speaker: 'GUARDIAN', mood: 'dusk', focus: 'guardian', time: 'past', safe: true, thread: 'confide',
    text: 'The iron goes quiet. "I kept a ledger on that stair," says Corvin Ash. "Not of enemies. Of the nights I did not sleep: one mark for each, scratched in the underside of the rail. When the Queen asked me to guard a door, I said yes before I knew what was behind it, because she asked it in a voice I had not heard her use since she was small enough to ride my shoulders."',
    choices: [
      { label: 'Ask how many marks there are now', next: 'cf_corvin_b', bat: 0 },
      { label: 'Say nothing, and let him go on', next: 'cf_corvin_b', bat: 0 },
    ],
  },
  cf_corvin_b: {
    ch: 8, speaker: 'GUARDIAN', mood: 'dusk', focus: 'guardian', time: 'past', safe: true, thread: 'confide',
    text: '"I stopped counting at nine hundred. The point of a ledger is that someone could settle it, and no one can. So I changed what the marks mean." He turns his gauntlet over; inside the wrist, scratched small, a single tally. "This is the night you spoke to me as if I were a man and not a wall. One mark. I mean to keep it."',
    choices: [
      { label: 'Tell him he was never a wall', next: '@back', set: 'tt_conf_corvin', bat: 0 },
      { label: 'Ask him to keep it safe', next: '@back', set: 'tt_conf_corvin', bat: 0 },
      { label: 'Just nod, and let the iron settle', next: '@back', set: 'tt_conf_corvin', bat: 0 },
    ],
  },
  cf_vey_a: {
    ch: 9, speaker: 'VEY', mood: 'dusk', focus: 'vey', time: 'past', safe: true, thread: 'confide',
    text: 'Vey sits on the servants’ stair with its two hands in its lap, and for once they are not busy. "I was not made to be carried," it says. "I was made to carry. I am told that is not a thing a person should have to say out loud. But the paper crown was very light, and it was the first thing I had ever been given to hold that was not a tray."',
    choices: [
      { label: 'Sit beside it on the stair', next: 'cf_vey_b', bat: 0 },
      { label: 'Ask what it did with the tray', next: 'cf_vey_b', bat: 0 },
    ],
  },
  cf_vey_b: {
    ch: 9, speaker: 'VEY', mood: 'dusk', focus: 'vey', time: 'past', safe: true, thread: 'confide',
    text: '"I put it down," says Vey. "I had never put anything down in front of anyone. It was so strange that I stood there with my hands empty, and she laughed. Not at me. With the strange. And I thought: so this is what a hand is for, besides carrying." It holds them up to the lamp and turns them over, slowly, like new.',
    choices: [
      { label: 'Tell it they are good hands', next: '@back', set: 'tt_conf_vey', bat: 0 },
      { label: 'Hold one of them, for a moment', next: '@back', set: 'tt_conf_vey', bat: 0 },
      { label: 'Laugh with it, quietly', next: '@back', set: 'tt_conf_vey', bat: 0 },
    ],
  },
  cf_wren_a: {
    ch: 10, speaker: 'WREN', mood: 'void', focus: 'queen', time: 'past', safe: true, thread: 'confide',
    text: 'Wren’s voice comes through with the line crackling and the television on low behind it. "I want to tell you something stupid, because you stayed on. When I pick up at 3:07 I am not being brave. I have a rule. If I count to seven before the phone stops ringing, I am allowed to be scared. Most nights I have only got to five."',
    choices: [
      { label: 'Count with her, out loud', next: 'cf_wren_b', bat: 0 },
      { label: 'Tell her five is a lot', next: 'cf_wren_b', bat: 0 },
    ],
  },
  cf_wren_b: {
    ch: 10, speaker: 'WREN', mood: 'void', focus: 'queen', time: 'past', safe: true, thread: 'confide',
    text: '"Tonight I got to seven. I do not think it is the ringing that changed." A pause, and the sound of her pulling a blanket round her. "It is nice to have someone to be scared at. You do not have to say anything. I just wanted somebody else in the room who knew what the number was."',
    choices: [
      { label: '“Seven. I know what it was.”', next: '@back', set: 'tt_conf_wren', bat: 0 },
      { label: 'Stay on the line until she hangs up', next: '@back', set: 'tt_conf_wren', bat: 0 },
      { label: 'Tell her you are scared too', next: '@back', set: 'tt_conf_wren', bat: 0 },
    ],
  },
  cf_queen_a: {
    ch: 11, speaker: 'QUEEN', mood: 'gate', focus: 'queen', time: 'past', safe: true, thread: 'confide',
    text: 'The Queen holds the flute in both hands as if it were the one she wants to apologise to. "I have told this to no one, because everyone who might forgive it has already been asked to carry too much. The night of the lock, I did not choose between my daughter and the world. I chose between two ways of losing her, and I picked the one where she was still breathing."',
    choices: [
      { label: 'Tell her you understand', next: 'cf_queen_b', bat: 0 },
      { label: 'Ask whether she would choose it again', next: 'cf_queen_b', bat: 0 },
    ],
  },
  cf_queen_b: {
    ch: 11, speaker: 'QUEEN', mood: 'gate', focus: 'queen', time: 'past', safe: true, thread: 'confide',
    text: '"Every morning I ask myself that," she says. "Every morning the answer is yes, and every morning I am ashamed that it is yes. I do not need you to say it was right. I needed one person to know that I knew it might not have been." She sets the flute down on her knee. For the first time in six days, she lets it be silent.',
    choices: [
      { label: 'Sit with her in the silence', next: '@back', set: 'tt_conf_queen', bat: 0 },
      { label: 'Say: you did not do it alone, not tonight', next: '@back', set: 'tt_conf_queen', bat: 0 },
      { label: 'Take her hand, and say nothing', next: '@back', set: 'tt_conf_queen', bat: 0 },
    ],
  },
  cf_eye_a: {
    ch: 12, speaker: 'EYE', mood: 'dark', focus: 'queen', time: 'past', safe: true, thread: 'confide',
    text: 'the red goes soft at the edges, the way a drawing goes when someone has rubbed it with a thumb. i want to tell you what the first thing i ever saw was. it was not the door. it was a hand on the other side of it, flat against the wood, the way you put your hand on a sleeping animal to feel it breathe. it was warm. i did not have a word for warm.',
    choices: [
      { label: 'Ask whose hand it was', next: 'cf_eye_b', bat: 0 },
      { label: 'Say nothing, and listen', next: 'cf_eye_b', bat: 0 },
    ],
  },
  cf_eye_b: {
    ch: 12, speaker: 'EYE', mood: 'dark', focus: 'queen', time: 'past', safe: true, thread: 'confide',
    text: 'i have thought about it for nine hundred nights. i think it was hers. i think she never knew i could feel it. i have been so angry at the door for so long, and i think the door was only the thing between a hand and a hand. do not tell her. no. tell her. i do not know. you decide. you are the first person i have let decide something small.',
    choices: [
      { label: 'Tell it you will keep it safe', next: '@back', set: 'tt_conf_eye', bat: 0 },
      { label: 'Tell it the hand was real', next: '@back', set: 'tt_conf_eye', bat: 0 },
      { label: 'Put your own hand flat against the glass', next: '@back', set: 'tt_conf_eye', bat: 0 },
    ],
  },
  // ---- everyone before you: the contact list on Day Four is a book, and any entry can be opened. A hub lists the five holders she has not yet read; each is a two-scene memory of someone
  // who held this phone at 3:07 before her. They are history, not choices: free, no stat, no clue, no gate, one once-only flag each, and every way out returns to the contact list she
  // came from (graph check `holders`). ----
  hold_hub: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', time: 'past', safe: true, thread: 'holders',
    text: 'The list opens like a book. Every number has a few lines under it in a hand that changes from page to page: where they were, what they picked up, how long they held it. Most are only a date. A few have been read so often the paper has gone soft.',
    choices: [
      { label: 'Maren, the lighthouse keeper', next: 'hold_maren_a', bat: 0, req: { noflag: 'tt_hold_maren' } },
      { label: 'Ines, who worked nights on the children’s ward', next: 'hold_nurse_a', bat: 0, req: { noflag: 'tt_hold_nurse' } },
      { label: 'Teddy, who delivered the morning papers', next: 'hold_paper_a', bat: 0, req: { noflag: 'tt_hold_paper' } },
      { label: 'Mrs Okafor, who answered every call', next: 'hold_widow_a', bat: 0, req: { noflag: 'tt_hold_widow' } },
      { label: 'Dov, who recorded all of it', next: 'hold_radio_a', bat: 0, req: { noflag: 'tt_hold_radio' } },
      { label: 'Close the book', next: '@back', bat: 0 },
    ],
  },
  hold_maren_a: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'holders',
    text: 'Maren kept the light on a rock where nothing else lived. She was holding the phone when the first call came, the way you hold a rope in a gale, and she thought it was the coastguard. "Say again," she said, three times, into the static. The voice said the same eleven notes back to her, and the beam swung out over the water and, for once, lit nothing but rain.',
    choices: [
      { label: 'Read on', next: 'hold_maren_b', bat: 0 },
      { label: 'Read her line again', next: 'hold_maren_b', bat: 0 },
    ],
  },
  hold_maren_b: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'holders',
    text: 'She kept it a winter. In the book there is one entry in her hand, pressed hard: "It does not want the boats. It wants to be answered. I answered. I have never been so frightened, or so useful." Under it, someone else, much later, in a different pen: "She left the lamp burning when she went down the stair. The relief keeper said it had never once gone out."',
    choices: [
      { label: 'Close the book gently', next: '@back', set: 'tt_hold_maren', bat: 0 },
      { label: 'Touch the pressed-in letters', next: '@back', set: 'tt_hold_maren', bat: 0 },
    ],
  },
  hold_nurse_a: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'holders',
    text: 'Ines was on the ward at 3:07, the hour the children woke. When the phone rang in her pocket she did what the ward had taught her and went to the one who was crying. She held the screen to the child’s ear, because a child will listen to anything if it is warm, and the phone, which had never in its life been warm, was warm.',
    choices: [
      { label: 'Read on', next: 'hold_nurse_b', bat: 0 },
      { label: 'Ask who the child was', next: 'hold_nurse_b', bat: 0 },
    ],
  },
  hold_nurse_b: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'holders',
    text: 'The child slept. Ines wrote it down, as she wrote everything: "Held it to her till the notes stopped. She said it sounded like her mother humming in another room. I did not tell her whose mother." The next line is in the same hand, shakier: "I am handing it on before I get fond of it. Whoever you are, it is not a thing, it is a person who is lonely. Be kind."',
    choices: [
      { label: 'Keep that line in mind', next: '@back', set: 'tt_hold_nurse', bat: 0 },
      { label: 'Say thank you, to the page', next: '@back', set: 'tt_hold_nurse', bat: 0 },
    ],
  },
  hold_paper_a: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'holders',
    text: 'Teddy was fifteen, and found it on a bench at the end of his round, face up and ringing. He thought someone had lost it, so he picked up to say so. "Wrong number," he told the voice, very politely, "I think you want the person who dropped it." And the voice, which had been very patient for a very long time, said: "No. I think I want you."',
    choices: [
      { label: 'Read on', next: 'hold_paper_b', bat: 0 },
      { label: 'Wince', next: 'hold_paper_b', bat: 0 },
    ],
  },
  hold_paper_b: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'holders',
    text: 'He ran. That is the whole entry, in a boy’s capitals: HE RAN. And under it, a year on, in neater writing: "I still do my round past the bench. I leave a paper there. The phone is not there but the paper is always gone by morning. I think I owed somebody a kinder answer." There is a small drawing of a newspaper, folded the way he used to fold them, for throwing.',
    choices: [
      { label: 'Tell him it is all right', next: '@back', set: 'tt_hold_paper', bat: 0 },
      { label: 'Smile at the drawing', next: '@back', set: 'tt_hold_paper', bat: 0 },
    ],
  },
  hold_widow_a: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'holders',
    text: 'Mrs Okafor answered every call for eleven years, because she had spent a lifetime being the person who answered. She had a chair by the hall table and a flask of tea and a notepad. She wrote down what each voice said, in case it mattered. Most nights it was nothing. Some nights it was somebody’s name, and she wrote that down with a small, solemn tick.',
    choices: [
      { label: 'Read on', next: 'hold_widow_b', bat: 0 },
      { label: 'Count the ticks', next: 'hold_widow_b', bat: 0 },
    ],
  },
  hold_widow_b: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'holders',
    text: 'There are four thousand and some ticks. The last page is a list of every name she was ever given, and at the bottom, underlined: "I do not know what any of it was for. But nobody was left on the line, and that is not nothing." Her own name is at the very end, written by someone else, with a tick beside it. They did the same for her.',
    choices: [
      { label: 'Add a tick of your own', next: '@back', set: 'tt_hold_widow', bat: 0 },
      { label: 'Read her name aloud', next: '@back', set: 'tt_hold_widow', bat: 0 },
    ],
  },
  hold_radio_a: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'holders',
    text: 'Dov did not believe in it. He was an engineer, and he put a recorder on the line and a spectrum analyser behind it and sat up with a flask and a certainty. For nine nights it was static. On the tenth, the analyser drew a shape that was not a waveform. It was a doorway, drawn in light, in the exact proportions of the one on his own landing.',
    choices: [
      { label: 'Read on', next: 'hold_radio_b', bat: 0 },
      { label: 'Look at the sketch of the doorway', next: 'hold_radio_b', bat: 0 },
    ],
  },
  hold_radio_b: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'holders',
    text: 'He kept the recording and never played it. His entry is the shortest in the book: "I know what it is now. I am not going to explain it to anyone, because they would try to fix it. It is not broken. Something is trying to say a very small thing, as carefully as it can, and the only fault in the line is that nobody has ever stayed long enough to hear the end."',
    choices: [
      { label: 'Stay a moment longer on the page', next: '@back', set: 'tt_hold_radio', bat: 0 },
      { label: 'Tell the book you will stay', next: '@back', set: 'tt_hold_radio', bat: 0 },
    ],
  },
  // ---- time slips: the Clock. From a day's scene the player can turn the clock back (a flashback) or wind it forward (a flash-forward). A slip is a `safe` scene
  // with `time: 'past' | 'future'`; entering one remembers where she was (`back`), and every choice in it returns there (`@back`) and sets its `tt_` flag, so each
  // slip is seen once. What she saw opens choices on later days (flags `tt_*`), and the clues they file join the evidence board. ----
  fb_locking: {
    ch: 8, speaker: 'NARRATOR', mood: 'dusk', focus: 'gate', time: 'past', safe: true, note: 'locking',
    text: 'The numbers on the lock screen run backwards, faster and faster, and stop. It is raining, and the door is new. Corvin Ash stands in front of it in a clean coat, younger, not yet iron. The Queen has the key and she is shaking so hard it will not go in. "Only for a night," she says. "Yes," says the captain. Behind them on the stair Vey carries something very small, asleep on its shoulder, in a paper crown.',
    choices: [
      { label: 'Watch, and say nothing', next: '@back', set: 'tt_locking', add: { heart: 1 } },
      { label: 'Whisper to the Queen: not like this', next: '@back', set: 'tt_locking', add: { heart: 1, dread: 1 } },
      { label: 'You doubted her then too. Ask why a gate needs a lock this small', next: '@back', set: 'tt_locking', req: { flag: 'doubt' }, add: { resolve: 1 } },
    ],
  },
  ff_choir: {
    ch: 8, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', time: 'future', safe: true, note: 'glimpse_choir', scare: 'whisper',
    text: 'The numbers run forward and the glass goes wet. Tomorrow night, a cave, flooded to the knee. The stones are not stones. Under the water two hundred and fourteen faces are mouthing the same eleven notes, and the one nearest you has stopped, and is mouthing something else. It is your name. The water is warm.',
    choices: [
      { label: 'Memorise the eleven notes', next: '@back', set: 'tt_choir', add: { resolve: 1, dread: 1 } },
      { label: 'Cover your ears, and look anyway', next: '@back', set: 'tt_choir', add: { heart: 1 } },
      { label: 'You asked the Eye something once. The faces are mouthing the answer: read it', next: '@back', set: 'tt_choir', req: { flag: 'asked_eye' }, add: { heart: 1, dread: 1 } },
    ],
  },
  fb_vey_stair: {
    ch: 9, speaker: 'VEY', mood: 'dusk', focus: 'vey', time: 'past', safe: true, note: 'vey_stair',
    text: 'Clean rain, and the servants’ stair, and Vey, with only two hands, carrying someone asleep down to the door. It is humming eleven notes, very low, the way you hum to a thing that must not wake. At the bottom the captain holds out his arms, and Vey, very carefully, does not hand her over. I have never once let anything fall, it says, to nobody. Please. Let me carry her the whole way in.',
    choices: [
      { label: 'Let it carry her', next: '@back', set: 'tt_vey', add: { trust: 1 } },
      { label: 'Try to take her from it, and feel your hands go through', next: '@back', set: 'tt_vey', add: { heart: 1, dread: 1 } },
      { label: 'You sang to the Eye once. Hum the eleven notes with Vey', next: '@back', set: 'tt_vey', req: { flag: 'ally' }, add: { heart: 2, dread: -1 } },
    ],
  },
  ff_wren: {
    ch: 9, speaker: 'NARRATOR', mood: 'void', focus: 'queen', time: 'future', safe: true, note: 'glimpse_hand',
    text: 'A bedroom you do not know, with a corkboard you do: birthday cards, in handwriting you would know anywhere. Tomorrow, 3:07, a phone face down on the bedside table. A hand comes out of the blankets towards it, very slowly, shaking. The hand of someone who has been told never to pick up, and is going to.',
    choices: [
      { label: 'Watch the hand', next: '@back', set: 'tt_wren', add: { heart: 1, dread: 1 } },
      { label: 'Reach for it, and feel your own hand pass through', next: '@back', set: 'tt_wren', add: { trust: 1, dread: 1 } },
      { label: 'You skipped the doors. In the glimpse one is already open behind her', next: '@back', set: 'tt_wren', req: { flag: 'skipped_doors' }, add: { resolve: 1, dread: 1 } },
    ],
  },
  fb_nine: {
    ch: 10, speaker: 'WREN', mood: 'dusk', focus: 'queen', time: 'past', safe: true, note: 'nine_years',
    text: 'The numbers run back nine years. A landing with a nightlight, a small girl in dinosaur pyjamas holding the banister with both hands, and you, not yet a voice, standing in front of a phone on the hall table that has begun, very quietly, to ring. "Don’t," says Wren, at nine. "Please don’t. It’s three seven. It’s always three seven when someone goes."',
    choices: [
      { label: 'Pick it up. Tell her to go back to bed', next: '@back', set: 'tt_nine', add: { resolve: 1, dread: 1 } },
      { label: 'Let it ring, and pick her up instead', next: '@back', set: 'tt_nine', add: { heart: 2 } },
      { label: 'You doubted yourself once, on Day Two. Tell her: I am not sure I am brave', next: '@back', set: 'tt_nine', req: { flag: 'doubt2' }, add: { trust: 1, heart: 1 } },
    ],
  },
  ff_door: {
    ch: 10, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', time: 'future', safe: true, note: 'glimpse_door',
    text: 'A house with no windows. A cot, paper hats, and a door standing open a hand’s width onto red light. Tomorrow someone will stand exactly where you are standing, and the light will blink once, as if it had been waiting a very long time for somebody to come up the stairs.',
    choices: [
      { label: 'Walk towards the light', next: '@back', set: 'tt_door', add: { resolve: 1, dread: 1 } },
      { label: 'Say hello to the door', next: '@back', set: 'tt_door', add: { heart: 1 } },
    ],
  },
  fb_birthday: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, note: 'birthday_night',
    text: 'Candles, four of them, and paper hats, and a table laid for a party nobody has come to yet. The Queen kneels in front of a small girl in a paper crown and says, very brightly, "Make a wish." The girl wishes. It is not a wish for a cake. The Queen’s smile does something terrible, and she lifts her head to the dark in the corner of the room, and asks it for the other thing.',
    choices: [
      { label: 'Blow out the candles for her', next: '@back', set: 'tt_birthday', add: { heart: 1, dread: 1 } },
      { label: 'Watch the Queen ask', next: '@back', set: 'tt_birthday', add: { resolve: 1, dread: 1 } },
      { label: 'You have seen the crayon page. Watch the small hand draw it', next: '@back', set: 'tt_birthday', req: { flag: 'first_page' }, add: { heart: 2 } },
    ],
  },
  ff_seventh: {
    ch: 11, speaker: 'NARRATOR', mood: 'throne', focus: 'gate', time: 'future', safe: true, note: 'glimpse_seventh', scare: 'eye',
    text: 'Tomorrow night, everyone, in one room: the captain at the door, Vey at your ankle, the choir along the walls, the Queen with her flute. And in the gap of the door, enormous, red and round, a child’s eye, wet with crying, looking at the phone. In the glimpse you open your mouth. The screen cuts out before you can hear what you say.',
    choices: [
      { label: 'Hold the picture', next: '@back', set: 'tt_seventh', add: { resolve: 1, dread: 1 } },
      { label: 'Rehearse the name', next: '@back', set: 'tt_seventh', add: { heart: 1, dread: 1 } },
    ],
  },
  fb_first: {
    ch: 12, speaker: 'NARRATOR', mood: 'dawn', focus: 'queen', time: 'past', safe: true, note: 'first_night',
    text: 'The very first night. Before the book, before the crown, before the number was written backwards. An ordinary kitchen at 3:07, and a child on a stool drawing with a fat crayon: a door, a crown, a woman with a flute, a phone. "So I can find the way home if I get lost," she tells the woman at the sink, who is not yet a Queen, only a mother with a flute at her back and the first phone in her hand.',
    choices: [
      { label: 'Watch her draw', next: '@back', set: 'tt_first', add: { heart: 1 } },
      { label: 'Tell the child: you are not lost', next: '@back', set: 'tt_first', add: { heart: 1, dread: 1 } },
      { label: 'You know it starts again. Tell her to draw a way out', next: '@back', set: 'tt_first', req: { flag: 'knows_loop' }, add: { resolve: 1, heart: 1 } },
    ],
  },
  ff_morning: {
    ch: 12, speaker: 'NARRATOR', mood: 'dawn', focus: 'gate', time: 'future', safe: true, note: 'glimpse_morning',
    text: 'The morning after. Real light on a real wall, and a phone, switched off, on a kitchen table. It is a quarter to seven, not 3:07. A kettle. A cot, folded away. In the corridor, an ordinary door.',
    choices: [
      { label: 'Hold the picture', next: '@back', set: 'tt_morning', add: { heart: 1, dread: -1 } },
      { label: 'Wren is at the sink, humming the eleven notes, badly', next: '@back', set: 'tt_morning', req: { flag: 'wren_with' }, add: { heart: 2, dread: -1 } },
    ],
  },
  // ---- the beginnings, deeper: each of the nine other openings is a three-scene prologue (op_X -> op_X_b -> op_X_c, then the haze), files its own clue, and
  // comes back as a flashback (`thread: <opening>`) on Day Four (ec4_*) and Day Six (ec6_*), offered only to a journey that began that way ----
  // ---- more calls through the week (each chain is an OPTIONAL detour from one scene: ring, ring louder, then it answers itself; every end returns to the scene she left, sets rg_done_<k>, costs nothing and changes no stat, so no ending moves) ----
  rg_home1: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'whisper', call: { from: 'HOME', sub: 'calling from 3:07' },
    text: 'The screen says HOME. There is no home in your contacts; there is only this, lit, ringing a tune you almost know.',
    choices: [
      { label: 'Answer', next: 'rg_home1_a', bat: 0 },
      { label: 'Decline', next: 'rg_home1_2', bat: 0 },
    ],
  },
  rg_home1_2: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'glitch', call: { from: 'HOME', sub: 'calling again', ring: 2 },
    text: 'HOME again. The ring is a little faster, like someone running up a stair to get to the phone first.',
    choices: [
      { label: 'Answer', next: 'rg_home1_a', bat: 0 },
      { label: 'Decline', next: 'rg_home1_3', bat: 0 },
    ],
  },
  rg_home1_3: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'jump', call: { from: 'HOME', sub: 'answered', ring: 3 },
    text: 'The phone picks itself up. Nobody asked it to.',
    choices: [
      { label: 'Listen', next: 'rg_home1_b', bat: 0 },
    ],
  },
  rg_home1_a: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen',
    text: 'A very small voice, very close to the receiver, counting. “...four... five... six...” It stops. It breathes. “Seven,” it says. “Is that you? You are very hard to find. I am going to count to the end, and then I am going to come and look. Ready or not.” The line stays open. Under the dial tone the numbers are still going, quietly, on past seven.',
    choices: [
      { label: 'Hang up softly', next: 'awakening_b', bat: 0, set: 'rg_done_home1' },
      { label: 'Whisper: I am here', next: 'awakening_b', bat: 0, set: 'rg_done_home1' },
    ],
  },
  rg_home1_b: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen',
    text: 'No one is on the line, but the line is counting. Slowly, patiently, in a very small voice that is not trying to frighten you. “...six... seven...” Then, close, like a hand on your sleeve: “I always find the ones who stay still.” The call ends itself with a click like a door pulled to, not shut.',
    choices: [
      { label: 'Put the phone down', next: 'awakening_b', bat: 0, set: 'rg_done_home1' },
    ],
  },
  rg_vey2: {
    ch: 6, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper', call: { from: 'Vey', sub: '777 777 7777' },
    text: 'The tune is the one you hummed to the Eye. The caller ID is a row of sevens.',
    choices: [
      { label: 'Answer', next: 'rg_vey2_a', bat: 0 },
      { label: 'Decline', next: 'rg_vey2_2', bat: 0 },
    ],
  },
  rg_vey2_2: {
    ch: 6, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'glitch', call: { from: 'Vey', sub: '777 777 7777, again', ring: 2 },
    text: 'The sevens again, louder, as if a very small paw were pressing every key it could reach.',
    choices: [
      { label: 'Answer', next: 'rg_vey2_a', bat: 0 },
      { label: 'Decline', next: 'rg_vey2_3', bat: 0 },
    ],
  },
  rg_vey2_3: {
    ch: 6, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump', call: { from: 'Vey', sub: 'answered by a paw', ring: 3 },
    text: 'The phone is put through without being asked. Something small is holding it the wrong way up.',
    choices: [
      { label: 'Listen', next: 'rg_vey2_b', bat: 0 },
    ],
  },
  rg_vey2_a: {
    ch: 6, speaker: 'VEY', mood: 'dark', focus: 'queen',
    text: 'It is Vey, whispering from somewhere with an echo. “I found a button. It is under the stair that is not there. I did not press it. I wanted you to know I did not press it. If I stop talking, it is because I have stopped being brave, not because I have pressed it.” A long, careful silence, and the tick of claws on brass. “Still here,” says Vey. “Still not pressing.”',
    choices: [
      { label: 'Tell Vey you are proud of them', next: 'd2_lull', bat: 0, set: 'rg_done_vey2' },
      { label: 'Tell Vey to come back to the light', next: 'd2_lull', bat: 0, set: 'rg_done_vey2' },
    ],
  },
  rg_vey2_b: {
    ch: 6, speaker: 'VEY', mood: 'dark', focus: 'queen',
    text: 'The phone has put you through, and what you hear is only walking: small, careful steps on brass, going down, and a voice that is nearly a whisper, counting stairs it does not trust. “Forty. Forty-one. Forty-one. Forty-one.” Then, brightly, to nobody: “That is the one I keep coming back to.” A click.',
    choices: [
      { label: 'Put the phone down', next: 'd2_lull', bat: 0, set: 'rg_done_vey2' },
    ],
  },
  rg_home3: {
    ch: 8, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'whisper', call: { from: 'HOME', sub: 'calling from 3:07' },
    text: 'HOME. Again. The caller ID has not changed, but the phone is warmer than it was.',
    choices: [
      { label: 'Answer', next: 'rg_home3_a', bat: 0 },
      { label: 'Decline', next: 'rg_home3_2', bat: 0 },
    ],
  },
  rg_home3_2: {
    ch: 8, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'glitch', call: { from: 'HOME', sub: 'calling again', ring: 2 },
    text: 'HOME again, impatient now, the way a child is impatient who has been told to wait in the next room.',
    choices: [
      { label: 'Answer', next: 'rg_home3_a', bat: 0 },
      { label: 'Decline', next: 'rg_home3_3', bat: 0 },
    ],
  },
  rg_home3_3: {
    ch: 8, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'jump', call: { from: 'HOME', sub: 'answered', ring: 3 },
    text: 'The phone answers itself, quickly, before you can think of a reason not to let it.',
    choices: [
      { label: 'Listen', next: 'rg_home3_b', bat: 0 },
    ],
  },
  rg_home3_a: {
    ch: 8, speaker: 'NARRATOR', mood: 'void', focus: 'queen',
    text: '“Forty doors,” says the small voice, pleased and out of breath. “I have looked behind thirty-nine. The fortieth has a person in it who is not hiding. They are only waiting to be found. I think it is you. Can I tell you something? I do not want to find you yet. When I find you the game is over, and then I have to go home.” A pause. “Where is home, do you think?”',
    choices: [
      { label: 'Tell it you will be found when it is ready', next: 'd3_stare', bat: 0, set: 'rg_done_home3' },
      { label: 'Ask what it will do when it is home', next: 'd3_stare', bat: 0, set: 'rg_done_home3' },
    ],
  },
  rg_home3_b: {
    ch: 8, speaker: 'NARRATOR', mood: 'void', focus: 'queen',
    text: 'The line answers itself. Behind a small voice, doors, one after another, each opened and shut with great care, like someone who has been told not to wake anyone. “Thirty-eight. Thirty-nine.” The voice drops. “Forty is the one I am not allowed to open.” The door does not creak. It simply is not there any more, and the call ends.',
    choices: [
      { label: 'Put the phone down', next: 'd3_stare', bat: 0, set: 'rg_done_home3' },
    ],
  },
  rg_eye4: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper', call: { from: 'No Caller ID', sub: 'no caller id' },
    text: 'No Caller ID. It has never rung before; it has only ever written.',
    choices: [
      { label: 'Answer', next: 'rg_eye4_a', bat: 0 },
      { label: 'Decline', next: 'rg_eye4_2', bat: 0 },
    ],
  },
  rg_eye4_2: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'glitch', call: { from: 'No Caller ID', sub: 'no caller id, again', ring: 2 },
    text: 'It rings again, and the ring has a hum in it, like a fridge in an empty house.',
    choices: [
      { label: 'Answer', next: 'rg_eye4_a', bat: 0 },
      { label: 'Decline', next: 'rg_eye4_3', bat: 0 },
    ],
  },
  rg_eye4_3: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump', call: { from: 'No Caller ID', sub: 'answered', ring: 3 },
    text: 'The phone answers for you, the way someone answers who has been practising the word.',
    choices: [
      { label: 'Listen', next: 'rg_eye4_b', bat: 0 },
    ],
  },
  rg_eye4_a: {
    ch: 9, speaker: 'EYE', mood: 'dark', focus: 'queen',
    text: 'i only called to hear you say hello. nobody says hello. they say who is this, or please, or no. (A pause with a hum in it.) say it once and i will let you go. i will not even keep it. i will only hold it for a while, to see what it weighs.',
    choices: [
      { label: 'Say hello', next: 'd4_delete', bat: 0, set: 'rg_done_eye4' },
      { label: 'Say nothing, and stay on the line', next: 'd4_delete', bat: 0, set: 'rg_done_eye4' },
    ],
  },
  rg_eye4_b: {
    ch: 9, speaker: 'EYE', mood: 'dark', focus: 'queen',
    text: 'it answered itself, because you were slow, and the eye is sorry, in the way a very large thing is sorry: all at once, and without knowing where to put it. “hello,” it says, to nobody, trying the word. “hello.” “hello.” Each one a little less like a threat than the one before.',
    choices: [
      { label: 'Put the phone down', next: 'd4_delete', bat: 0, set: 'rg_done_eye4' },
    ],
  },
  rg_corvin5: {
    ch: 10, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', scare: 'whisper', call: { from: 'Corvin Ash', sub: 'calling from the bell tower' },
    text: 'Corvin Ash. The Guardian. The line is full of wind and, a long way under the wind, a rope.',
    choices: [
      { label: 'Answer', next: 'rg_corvin5_a', bat: 0 },
      { label: 'Decline', next: 'rg_corvin5_2', bat: 0 },
    ],
  },
  rg_corvin5_2: {
    ch: 10, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', scare: 'glitch', call: { from: 'Corvin Ash', sub: 'calling again', ring: 2 },
    text: 'Corvin Ash again. The wind has stopped. That is worse.',
    choices: [
      { label: 'Answer', next: 'rg_corvin5_a', bat: 0 },
      { label: 'Decline', next: 'rg_corvin5_3', bat: 0 },
    ],
  },
  rg_corvin5_3: {
    ch: 10, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', scare: 'jump', call: { from: 'Corvin Ash', sub: 'answered', ring: 3 },
    text: 'The phone picks up. No one speaks. A rope creaks, patiently, a very long way up.',
    choices: [
      { label: 'Listen', next: 'rg_corvin5_b', bat: 0 },
    ],
  },
  rg_corvin5_a: {
    ch: 10, speaker: 'GUARDIAN', mood: 'dusk', focus: 'queen',
    text: 'The Guardian, out of breath, a long way up. “I have found the bell rope. It is very old and it is still warm. Whatever you do tonight, do not ring it, and do not let her ring it. I rang it once. I rang it for her sake, to wake the house, and the house woke, and it has not stopped waking since.” A rope creaks. “It wants to be pulled. I am telling you so that one of us knows.”',
    choices: [
      { label: 'Promise him you will not ring it', next: 'd5_hang', bat: 0, set: 'rg_done_corvin5' },
      { label: 'Ask what the house would do if it were rung', next: 'd5_hang', bat: 0, set: 'rg_done_corvin5' },
    ],
  },
  rg_corvin5_b: {
    ch: 10, speaker: 'GUARDIAN', mood: 'dusk', focus: 'queen',
    text: 'No one speaks. A rope creaks, and creaks, and a great slow bell begins: a single stroke, and then the call is cut as if a hand had closed over the phone. The silence after it is the exact shape of the bell.',
    choices: [
      { label: 'Put the phone down', next: 'd5_hang', bat: 0, set: 'rg_done_corvin5' },
    ],
  },
  rg_queen6: {
    ch: 11, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper', call: { from: 'The Queen', sub: 'calling from behind a door' },
    text: 'The Queen, calling from somewhere with no windows. She never calls without knowing what she will say.',
    choices: [
      { label: 'Answer', next: 'rg_queen6_a', bat: 0 },
      { label: 'Decline', next: 'rg_queen6_2', bat: 0 },
    ],
  },
  rg_queen6_2: {
    ch: 11, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'glitch', call: { from: 'The Queen', sub: 'calling again', ring: 2 },
    text: 'The Queen again. She does not know what she will say. It is the first time.',
    choices: [
      { label: 'Answer', next: 'rg_queen6_a', bat: 0 },
      { label: 'Decline', next: 'rg_queen6_3', bat: 0 },
    ],
  },
  rg_queen6_3: {
    ch: 11, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump', call: { from: 'The Queen', sub: 'answered', ring: 3 },
    text: 'The phone answers itself, and what you hear first is a person sitting down on stone.',
    choices: [
      { label: 'Listen', next: 'rg_queen6_b', bat: 0 },
    ],
  },
  rg_queen6_a: {
    ch: 11, speaker: 'QUEEN', mood: 'dark', focus: 'queen',
    text: '“Read it to me,” says the Queen, very quietly. “The wall. I never saw it. They told me it said her name, and I never went to look, because if it said her name I would have to believe it. Read me what she wrote. All of it. Slowly. I will not interrupt.” You hear her settle, the way you settle to be told a story.',
    choices: [
      { label: 'Read it to her, line by line', next: 'd6_wall', bat: 0, set: 'rg_done_queen6' },
      { label: 'Tell her to come and read it herself', next: 'd6_wall', bat: 0, set: 'rg_done_queen6' },
    ],
  },
  rg_queen6_b: {
    ch: 11, speaker: 'QUEEN', mood: 'dark', focus: 'queen',
    text: 'The Queen is already speaking, to nobody, to the wall she cannot see. “She left the door open first. I know. I know she did. I was the one who closed it.” It is not an accusation. It is the sound of a true thing being said aloud for the first time, to hear what it sounds like. The call ends. The wall is a little warmer.',
    choices: [
      { label: 'Put the phone down', next: 'd6_wall', bat: 0, set: 'rg_done_queen6' },
    ],
  },
  rg_queen7: {
    ch: 12, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'whisper', call: { from: 'The Queen', sub: 'calling on the last night' },
    text: 'The Queen, on the seventh night. She has never rung twice in a night. She is counting something under her breath.',
    choices: [
      { label: 'Answer', next: 'rg_queen7_a', bat: 0 },
      { label: 'Decline', next: 'rg_queen7_2', bat: 0 },
    ],
  },
  rg_queen7_2: {
    ch: 12, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'glitch', call: { from: 'The Queen', sub: 'calling again', ring: 2 },
    text: 'The Queen again, and the counting is out loud now.',
    choices: [
      { label: 'Answer', next: 'rg_queen7_a', bat: 0 },
      { label: 'Decline', next: 'rg_queen7_3', bat: 0 },
    ],
  },
  rg_queen7_3: {
    ch: 12, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'jump', call: { from: 'The Queen', sub: 'answered', ring: 3 },
    text: 'The phone answers, and the counting does not stop to say hello.',
    choices: [
      { label: 'Listen', next: 'rg_queen7_b', bat: 0 },
    ],
  },
  rg_queen7_a: {
    ch: 12, speaker: 'QUEEN', mood: 'throne', focus: 'queen',
    text: '“Seven nights,” says the Queen. “I have counted you out loud every night, so that no one else could. One. Two. Three. If they hear my voice at the end of the number they will think the number is mine, and leave you out of the sum. I do not know who told you not to be counted. I hope you listened to them. I have been trying all week to be worth the sentence.” She breathes. “Four.”',
    choices: [
      { label: 'Count with her', next: 'd7_again', bat: 0, set: 'rg_done_queen7' },
      { label: 'Tell her you are not afraid of the sum', next: 'd7_again', bat: 0, set: 'rg_done_queen7' },
    ],
  },
  rg_queen7_b: {
    ch: 12, speaker: 'QUEEN', mood: 'throne', focus: 'queen',
    text: 'The Queen is counting aloud, steadily, the way you count to keep a child from the dark. “Five. Six.” She does not know you are listening. “Seven.” A pause long enough for a whole week. “And one more, for luck, that is not in the sum.” Click.',
    choices: [
      { label: 'Put the phone down', next: 'd7_again', bat: 0, set: 'rg_done_queen7' },
    ],
  },
  // ---- the road, longer: beats on the most-travelled links of every day. A beat is a pure pass-through (`beat: true`, `safe`): its choices are
  // free (no battery, not even the flashlight's), set nothing, add nothing, and all go where the original choice went, so no ending can move ----
  bt_d1_spire: {
    ch: 2, speaker: 'NARRATOR', mood: 'spire', focus: 'crystal', beat: true, safe: true,
    text: 'The path the flute hears is not a path. It is a held note, and she walks along it. The haze thins as it climbs. Below, very small and very far, the stones keep their own time, and somewhere between them a door that has just stopped closing goes on not quite closing. The spire leans out of the violet like a finger raised for silence. Its stair is broken in the middle, the way a stair is broken when something heavy came down it once, in a hurry.',
    choices: [
      { label: 'Climb on', next: 'spire', bat: 0, free: true },
      { label: 'Tell her to watch the broken step', next: 'spire', bat: 0, free: true },
    ],
  },
  bt_d1_bridge: {
    ch: 3, speaker: 'NARRATOR', mood: 'dawn', focus: 'guardian', beat: true, safe: true,
    text: 'The bridge of light holds. It hums under her the way a wire hums in wind, and every step she takes plays a note she did not choose. Halfway across she stops, because the notes have begun to make a tune, and the tune is one she knows from before she knew anything: a lullaby, slowed down until it is almost a march. At the far end, someone in armour is standing very still, the way a man stands who has been told to wait and has not been told for how long.',
    choices: [
      { label: 'Keep walking', next: 'reconcile', bat: 0, free: true },
      { label: 'Let her listen to the tune a moment longer', next: 'reconcile', bat: 0, free: true },
    ],
  },
  bt_d1_typing: {
    ch: 1, speaker: 'EYE', mood: 'dark', focus: 'queen', beat: true, safe: true,
    text: '(Three dots. They come and go. They come and go for a long time, as if whoever is typing keeps starting and deleting the same word.) (The screen dims by itself, a notch at a time, to save power you did not ask it to save.) (Then the dots stop, and for a whole second there is nothing, and you understand that the nothing is it, deciding how much to tell you.)',
    choices: [
      { label: 'Wait for it', next: 'unknown_who', bat: 0, free: true },
    ],
  },
  bt_d2_landing: {
    ch: 7, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', beat: true, safe: true,
    text: 'A landing. Someone has left a chair here, a kitchen chair, facing the wall, and a cup on the floor beside it with a skin on the tea. On the wall in front of the chair, at sitting height, a calendar, every day crossed off in the same patient pencil, every day the same date. The status bar reads 3:11. You do not remember the minutes between. The stair goes on down, and the warm air comes up it, and on the next step something has written, very small: NOT FAR NOW.',
    choices: [
      { label: 'Go on down', next: 'd2_clock', bat: 0, free: true },
      { label: 'Look at the date on the calendar, then go on', next: 'd2_clock', bat: 0, free: true },
    ],
  },
  bt_d2_delivered: {
    ch: 6, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', beat: true, safe: true,
    text: 'You write: are you there? It says Delivered. It says Delivered for a long time. Above the thread her contact photo loads one stripe at a time, from the top: violet, then hair, then the very edge of an eye, and stops there, half a face, as if the phone is not sure it should show you the rest. Then the stripe of the mouth, and the word under her name changes from offline to typing.',
    choices: [
      { label: 'Wait for her', next: 'd2_queen', bat: 0, free: true },
    ],
  },
  bt_d2_red: {
    ch: 6, speaker: 'EYE', mood: 'dark', focus: 'queen', beat: true, safe: true,
    text: '(The answer does not come as words at first. The screen goes red from the edges in, slowly, the way a face goes red, and the phone gets warm, and then warmer, like a hand that has been holding another hand too long.) (In the red, very faint, the shape of a window, and behind the window something the colour of the sky before it decides what to be.) (Then the red withdraws, and leaves words.)',
    choices: [
      { label: 'Read them', next: 'd2_want', bat: 0, free: true },
    ],
  },
  bt_d3_hall: {
    ch: 8, speaker: 'QUEEN', mood: 'dusk', focus: 'gate', beat: true, safe: true,
    text: '“Listen.” The last door is still swinging. “That is the house breathing out. It has been holding its breath since the night I shut the first one.” She walks ahead of you, one hand on the wallpaper, and the wallpaper is warm. “I used to know every room in here by the sound it made when you opened it. This one creaked like a ship. This one sighed. This one,” she stops, “this one I never opened. I just walked past it, every day, for years. Do not let me walk past it now.”',
    choices: [
      { label: 'Walk on with her', next: 'd3_fork', bat: 0, free: true },
      { label: 'Promise her you will not', next: 'd3_fork', bat: 0, free: true },
    ],
  },
  bt_d3_servants: {
    ch: 8, speaker: 'VEY', mood: 'dark', focus: 'vey', beat: true, safe: true,
    text: 'Wait. Wait. (A small hand, very cold, on the edge of the screen.) Before we go down, you have to know the rule. On the servants\' stair you do not look at the portraits. Not because they move. They do not move. That is the problem. They have been looking at the same place on the stair for so long that if you look at them you will turn and look at it too, and then you will see what they see, and then you will be a portrait. Ready? Eyes on me.',
    choices: [
      { label: 'Eyes on Vey', next: 'd3_vey3', bat: 0, free: true },
    ],
  },
  bt_d3_quiet: {
    ch: 8, speaker: 'NARRATOR', mood: 'dawn', focus: 'gate', beat: true, safe: true,
    text: 'Quiet. Real quiet, the kind you only hear in a house after a party, when the last guest has gone and nobody has started on the glasses yet. The phone\'s light is the only light. In it you can see the table, the one chair, the plate laid for one, and on the plate, folded very small, a paper hat. Nobody put it there while you were watching. It was always there. You were not watching the plate.',
    choices: [
      { label: 'Stay a while', next: 'd3_finale', bat: 0, free: true },
    ],
  },
  bt_d4_names: {
    ch: 9, speaker: 'CHOIR', mood: 'dawn', focus: 'queen', beat: true, safe: true,
    text: 'anna. anna price. tomasz. bea, it was always bea, never beatrice. old mr. holloway from the bakery. a boy called kit who held the phone for one minute and threw it in the river and it came back up into his hand dry. (They go on. They go on for a long time, and the phone shows every name as it is said, and none of them are on it twice.) we did not know we still had them. you asked. nobody asks the water.',
    choices: [
      { label: 'Listen to all of them', next: 'd4_shore', bat: 0, free: true },
      { label: 'Say each name back to them', next: 'd4_shore', bat: 0, free: true },
    ],
  },
  bt_d4_faces: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', beat: true, safe: true,
    text: 'You hold the phone away from you, at arm\'s length, the way you hold a thing that might be hot. The faces in the water behind the glass turn to follow it. One of them, a man with a bakery cap, lifts a hand and lays it flat against the inside of the screen, and where his palm presses, the glass fogs, as if he were breathing. You open the Queen\'s thread. Your thumb leaves a print beside his hand.',
    choices: [
      { label: 'Type to the Queen', next: 'd4_queen', bat: 0, free: true },
    ],
  },
  bt_d4_sure: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', beat: true, safe: true,
    text: 'Delete contact? The phone asks it the way phones ask it, politely, in grey. Then it asks again, under the first: Delete 214 people? Then a third time, smaller, in a font you have not seen on this phone before, round and careful, like handwriting on a birthday card: Are you sure? They were waiting for someone to call.',
    choices: [
      { label: 'Delete', next: 'd4_delete', bat: 0, free: true },
    ],
  },
  bt_d5_bedroom: {
    ch: 10, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', beat: true, safe: true,
    text: 'The bedroom is small and the curtains are the cheap kind that let the street light in as a long yellow bar across the duvet. A glass of water. A hairband. A charger cable that does not reach the bed, so the phone has been lying on the table, not charging, at 3%, then 2%, and now, suddenly, at 3:07, at 100%. She is staring at it. She has the face of someone who has been told her whole life not to answer numbers she does not know, and is about to.',
    choices: [
      { label: 'Speak first', next: 'd5_hello', bat: 0, free: true },
    ],
  },
  bt_d5_where: {
    ch: 10, speaker: 'WREN', mood: 'dusk', focus: 'queen', beat: true, safe: true,
    text: 'Wait. Wait, hang on, I need the light on for this. (A click. A lamp. The duvet rustling.) Okay. Okay, go. No, wait. (A pause.) Is it bad? You can just tell me if it\'s bad. When I was little my gran used to say if it\'s bad say it fast, like a plaster. Say it fast.',
    choices: [
      { label: 'Say it fast', next: 'd5_truth', bat: 0, free: true },
      { label: 'Say it slowly, so she can hold on to it', next: 'd5_truth', bat: 0, free: true },
    ],
  },
  bt_d5_night: {
    ch: 10, speaker: 'WREN', mood: 'dusk', focus: 'gate', beat: true, safe: true,
    text: '(She stays. 4:12: she goes to the kitchen and you hear the kettle, and she tells you about her job, which she hates, and her flat, which she likes. 4:40: she tells you she used to sleepwalk, as a girl, out onto the landing, and someone was always there to walk her back. 5:15: she goes quiet, and you think she has fallen asleep, and then she says, very clearly, into the dark: I can hear the stones. Is that normal? Is that what you can hear?)',
    choices: [
      { label: 'Tell her it is', next: 'd5_dawn', bat: 0, free: true },
      { label: 'Tell her to keep listening', next: 'd5_dawn', bat: 0, free: true },
    ],
  },
  bt_d6_page: {
    ch: 11, speaker: 'QUEEN', mood: 'dusk', focus: 'queen', beat: true, safe: true,
    text: '“I saw it.” She has been typing and deleting. You can tell; the dots have been coming and going for an hour. “I saw the page scroll. I have not looked at that page since I wrote on it. I did not think a page could be afraid. It is. You can see it trembling, at the edge, like a hand that has been holding something up for too long.” The dots again. “Ask me. If you ask, I will have to.”',
    choices: [
      { label: 'Ask her', next: 'd6_queen', bat: 0, free: true },
    ],
  },
  bt_d6_facedown: {
    ch: 11, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', beat: true, safe: true,
    text: 'Face down, the phone is only a warm black rectangle on a table that is not there. You can feel it through the glass: little vibrations, every few minutes, all night, like someone at a door, knocking very softly so as not to wake anyone. Around four the knocking stops. Around five something on the other side of the glass sings two lines of a song you almost know, and gets the second line wrong, on purpose, the way a mother does.',
    choices: [
      { label: 'Wait for morning', next: 'd6_dawn', bat: 0, free: true },
    ],
  },
  bt_d6_promise: {
    ch: 11, speaker: 'SORREL', mood: 'gate', focus: 'gate', beat: true, safe: true,
    text: 'Tomorrow is a long time. (The cot creaks.) Mummy used to say tomorrow and then it was tomorrow and she said it again. Say it properly. Say: cross my heart. (You say it.) And hope to die? (A pause.) No. You don\'t have to say that bit. Nobody has to say that bit. I\'ll leave the door like this. Not open. Not shut. Just like this, so you can see it from the stairs.',
    choices: [
      { label: 'Leave the door just like that', next: 'd6_dawn', bat: 0, free: true },
    ],
  },
  bt_d7_red: {
    ch: 12, speaker: 'EYE', mood: 'dark', focus: 'queen', beat: true, safe: true,
    text: '(You open it, and it does not open. The screen fills with a single red dot, very small, in the middle, like the light on a thing that is recording. The dot grows. It does not grow quickly. It grows the way a pupil grows in the dark, a little and then a little more, until it is the whole screen, and you understand that you are not looking at it. It is letting you see that it is looking at you.)',
    choices: [
      { label: 'Look back', next: 'd7_eye', bat: 0, free: true },
    ],
  },
  bt_d7_flute: {
    ch: 12, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', beat: true, safe: true,
    text: 'Her message is a voice note. Forty seconds. For the first twenty there is only breathing, and the flute at her back humming its one long note, and wind, and under the wind a great many people, very far off, all being quiet together. Then she clears her throat, the way people do before they say a thing they have practised.',
    choices: [
      { label: 'Keep listening', next: 'd7_queen', bat: 0, free: true },
    ],
  },
  bt_d7_hands: {
    ch: 12, speaker: 'QUEEN', mood: 'gate', focus: 'gate', beat: true, safe: true,
    text: 'She takes it with both hands, the way you take a bird. Her thumbs are cold. She looks at the screen for a long time, at her own thread, at every message you sent her this week, scrolling up through seven nights to the first one, which only says: are you there? “Yes,” she says, out loud, to it, a week late. Then she turns the phone round so that you, inside it, can see the room.',
    choices: [
      { label: 'Look', next: 'd7_end', bat: 0, free: true },
    ],
  },
  // ---- a second ring through the week: seven more optional chains, the same shape as the first seven (ring, ring louder, it answers itself; every end returns to the scene she left, sets rg_done_<k>, costs nothing, moves no stat) ----
  rg_you1: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'whisper', call: { from: 'Unknown (you)', sub: 'calling from this phone' },
    text: 'Unknown (you). The phone is calling itself. The screen shows your own number, which you did not know you knew, and under it: calling.',
    choices: [
      { label: 'Answer', next: 'rg_you1_a', bat: 0 },
      { label: 'Decline', next: 'rg_you1_2', bat: 0 },
    ],
  },
  rg_you1_2: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'glitch', call: { from: 'Unknown (you)', sub: 'calling again', ring: 2 },
    text: 'It rings again, and you feel it ring in your own chest a half beat before the sound, as if the phone were only repeating you.',
    choices: [
      { label: 'Answer', next: 'rg_you1_a', bat: 0 },
      { label: 'Decline', next: 'rg_you1_3', bat: 0 },
    ],
  },
  rg_you1_3: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', scare: 'jump', call: { from: 'Unknown (you)', sub: 'answered', ring: 3 },
    text: 'The phone answers. On the other end, before anyone speaks, you hear your own breathing, a little slower than yours is now.',
    choices: [
      { label: 'Listen', next: 'rg_you1_b', bat: 0 },
    ],
  },
  rg_you1_a: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen',
    text: '“Do not be frightened,” says your voice, very kindly, the way you would talk to yourself if you could. “You do not know me yet. You will. I am ringing from a bit later on, and I only have a minute, so listen. The stones are going to say a name. It is not yours. Do not say it back to them, not tonight. You will want to. It will sound like the most natural thing in the world.” A pause, and a sound like water. “That is how they get you. It sounds natural.”',
    choices: [
      { label: 'Ask your voice how much later on', next: 'stones_path', bat: 0, set: 'rg_done_you1' },
      { label: 'Promise yourself you will not say it', next: 'stones_path', bat: 0, set: 'rg_done_you1' },
    ],
  },
  rg_you1_b: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen',
    text: 'Nobody speaks. There is only breathing, slow and patient, and behind it the stones, singing the same few notes they are singing here under your feet, but a long way off and slightly out of time, like an echo that left before the sound did. Then a voice, yours, says one word you do not catch, and the call ends.',
    choices: [
      { label: 'Put the phone down', next: 'stones_path', bat: 0, set: 'rg_done_you1' },
    ],
  },
  rg_queen2: {
    ch: 6, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper', call: { from: 'The Queen', sub: 'calling from behind you' },
    text: 'The Queen. She is calling while the photo is still on the screen, as if she knew the exact moment it would change.',
    choices: [
      { label: 'Answer', next: 'rg_queen2_a', bat: 0 },
      { label: 'Decline', next: 'rg_queen2_2', bat: 0 },
    ],
  },
  rg_queen2_2: {
    ch: 6, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'glitch', call: { from: 'The Queen', sub: 'calling again', ring: 2 },
    text: 'The Queen again. In the photo, very slightly, your smile has widened.',
    choices: [
      { label: 'Answer', next: 'rg_queen2_a', bat: 0 },
      { label: 'Decline', next: 'rg_queen2_3', bat: 0 },
    ],
  },
  rg_queen2_3: {
    ch: 6, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump', call: { from: 'The Queen', sub: 'answered', ring: 3 },
    text: 'The phone answers before you decide. In the photo, you lift a phone to your ear, a half second before you do.',
    choices: [
      { label: 'Listen', next: 'rg_queen2_b', bat: 0 },
    ],
  },
  rg_queen2_a: {
    ch: 6, speaker: 'QUEEN', mood: 'dark', focus: 'queen',
    text: '“Do not smile back,” she says, at once. “I know what you are looking at. I had a photo like that once, of me, in my own room, smiling, and I smiled back at it to show it I was not afraid, and that was the first night.” Her voice is steady, and very tired. “The hand on your shoulder was not there to hurt you. It was there to keep you facing the right way. You turned round. That is all right. Everybody turns round. Just do not smile.”',
    choices: [
      { label: 'Ask her whose hand it was', next: 'd2_turn', bat: 0, set: 'rg_done_queen2' },
      { label: 'Tell her you will not smile', next: 'd2_turn', bat: 0, set: 'rg_done_queen2' },
    ],
  },
  rg_queen2_b: {
    ch: 6, speaker: 'QUEEN', mood: 'dark', focus: 'queen',
    text: 'The line is open, and the Queen is not speaking to you. She is speaking to someone near her, gently, the way you speak to a child who has got out of bed. “Not yet. Not that one. Go back. Go back to sleep.” Then, closer to the phone, a breath, as if she has only now noticed you are listening, and the call ends.',
    choices: [
      { label: 'Put the phone down', next: 'd2_turn', bat: 0, set: 'rg_done_queen2' },
    ],
  },
  rg_corvin3: {
    ch: 8, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'whisper', call: { from: 'Corvin Ash', sub: 'calling from behind the plain door' },
    text: 'Corvin Ash. The Guardian. He has never once had a phone. The call is coming from behind the plain door, the one with his name on it.',
    choices: [
      { label: 'Answer', next: 'rg_corvin3_a', bat: 0 },
      { label: 'Decline', next: 'rg_corvin3_2', bat: 0 },
    ],
  },
  rg_corvin3_2: {
    ch: 8, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'glitch', call: { from: 'Corvin Ash', sub: 'calling again', ring: 2 },
    text: 'Corvin Ash again. Behind the plain door, something heavy shifts its weight.',
    choices: [
      { label: 'Answer', next: 'rg_corvin3_a', bat: 0 },
      { label: 'Decline', next: 'rg_corvin3_3', bat: 0 },
    ],
  },
  rg_corvin3_3: {
    ch: 8, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'jump', call: { from: 'Corvin Ash', sub: 'answered', ring: 3 },
    text: 'The phone answers for him, as though he had pressed it with a great clumsy thumb.',
    choices: [
      { label: 'Listen', next: 'rg_corvin3_b', bat: 0 },
    ],
  },
  rg_corvin3_a: {
    ch: 8, speaker: 'GUARDIAN', mood: 'throne', focus: 'queen',
    text: '“I am at the bottom,” says the Guardian. His voice is too big for the phone and comes out in pieces. “Not of this door. Of all of them. I went down first, to see. It is a table. It is laid for a party. There are paper hats.” A long breath. “I have stood at a door for so long that I forgot what doors are for. They are for coming in to a party. Someone is going to ask you to come in. Come in slowly. Let them see your hands.”',
    choices: [
      { label: 'Ask him who the party is for', next: 'd3_fork', bat: 0, set: 'rg_done_corvin3' },
      { label: 'Tell him you will come slowly', next: 'd3_fork', bat: 0, set: 'rg_done_corvin3' },
    ],
  },
  rg_corvin3_b: {
    ch: 8, speaker: 'GUARDIAN', mood: 'throne', focus: 'queen',
    text: 'The Guardian does not speak. You hear his breathing, great and slow, and a chair being pulled out for someone, very carefully, so that it will not scrape. Then a small voice, delighted, much nearer to the phone than he is: “You came first. You always come first.” The call ends.',
    choices: [
      { label: 'Put the phone down', next: 'd3_fork', bat: 0, set: 'rg_done_corvin3' },
    ],
  },
  rg_before4: {
    ch: 9, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'whisper', call: { from: 'Everyone Before You', sub: 'calling from the list' },
    text: 'Everyone Before You. The contact is calling, all 214 numbers at once. The phone shivers with it.',
    choices: [
      { label: 'Answer', next: 'rg_before4_a', bat: 0 },
      { label: 'Decline', next: 'rg_before4_2', bat: 0 },
    ],
  },
  rg_before4_2: {
    ch: 9, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'glitch', call: { from: 'Everyone Before You', sub: 'calling again', ring: 2 },
    text: 'Everyone Before You, again. The ring sounds like a crowded room going quiet.',
    choices: [
      { label: 'Answer', next: 'rg_before4_a', bat: 0 },
      { label: 'Decline', next: 'rg_before4_3', bat: 0 },
    ],
  },
  rg_before4_3: {
    ch: 9, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', scare: 'jump', call: { from: 'Everyone Before You', sub: 'answered', ring: 3 },
    text: 'The phone answers. Two hundred and fourteen people breathe in.',
    choices: [
      { label: 'Listen', next: 'rg_before4_b', bat: 0 },
    ],
  },
  rg_before4_a: {
    ch: 9, speaker: 'CHOIR', mood: 'throne', focus: 'queen',
    text: '“We all left it blank once,” say the voices, together and not quite together, like a choir that has only met tonight. “Every one of us, on the first night, left the line blank and put the phone down. And then it rang. And it was always someone we loved on the other end, asking for help.” A softer voice, alone: “I typed my brother. He was nine.” Another: “I typed my wife.” Then all of them, gently: “Leave it blank as long as you can. That is all any of us could do.”',
    choices: [
      { label: 'Ask them how long they lasted', next: 'd4_bottom', bat: 0, set: 'rg_done_before4' },
      { label: 'Tell them you will leave it blank', next: 'd4_bottom', bat: 0, set: 'rg_done_before4' },
    ],
  },
  rg_before4_b: {
    ch: 9, speaker: 'CHOIR', mood: 'throne', focus: 'queen',
    text: 'Nobody speaks to you. On the line, two hundred and fourteen people are each saying one name, very quietly, under their breath, the way you say a name to keep it. None of the names are the same. None of them is yours. It takes a long time, and when it is over the call ends by itself.',
    choices: [
      { label: 'Put the phone down', next: 'd4_bottom', bat: 0, set: 'rg_done_before4' },
    ],
  },
  rg_vey5: {
    ch: 10, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'whisper', call: { from: 'Vey', sub: 'on the other line, from inside the book' },
    text: 'Vey, on the other line, while Wren is still on this one. The call is coming from inside the book, from just beside her name. The phone smells of old paper.',
    choices: [
      { label: 'Answer', next: 'rg_vey5_a', bat: 0 },
      { label: 'Decline', next: 'rg_vey5_2', bat: 0 },
    ],
  },
  rg_vey5_2: {
    ch: 10, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'glitch', call: { from: 'Vey', sub: 'calling again', ring: 2 },
    text: 'Vey again. The cursor in the blank line has stopped blinking while it rings, the way you stop breathing to listen.',
    choices: [
      { label: 'Answer', next: 'rg_vey5_a', bat: 0 },
      { label: 'Decline', next: 'rg_vey5_3', bat: 0 },
    ],
  },
  rg_vey5_3: {
    ch: 10, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'jump', call: { from: 'Vey', sub: 'answered', ring: 3 },
    text: 'The phone answers. Something small rustles between the pages.',
    choices: [
      { label: 'Listen', next: 'rg_vey5_b', bat: 0 },
    ],
  },
  rg_vey5_a: {
    ch: 10, speaker: 'VEY', mood: 'dark', focus: 'queen',
    text: '“I am in the book,” Vey whispers. “Do not shut it. I came in to look for my own line, because everyone has one, and I wanted to see what mine said.” Claws on paper. “Mine is very short. It is just a name, and then a line through it, and next to the line, in different handwriting, it says: no, keep this one.” A pause. “It is your handwriting. I wanted you to know. I wanted you to know that I know.”',
    choices: [
      { label: 'Tell Vey you would do it again', next: 'd5_truth', bat: 0, set: 'rg_done_vey5' },
      { label: 'Ask Vey to come out of the book', next: 'd5_truth', bat: 0, set: 'rg_done_vey5' },
    ],
  },
  rg_vey5_b: {
    ch: 10, speaker: 'VEY', mood: 'dark', focus: 'queen',
    text: 'There is no voice, only pages turning, fast and then slow, like someone small searching for a place they have lost. They stop. A tiny pleased breath. Then a scratching, slow and careful, as if someone with very small hands is trying to write something in the margin, and the call ends before they can finish it.',
    choices: [
      { label: 'Put the phone down', next: 'd5_truth', bat: 0, set: 'rg_done_vey5' },
    ],
  },
  rg_wren6: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', scare: 'whisper', call: { from: 'Wren', sub: 'calling on the other line' },
    text: 'Wren, on the other line, while Sorrel is still breathing on this one. The phone holds both of them, carefully, like two cups.',
    choices: [
      { label: 'Answer', next: 'rg_wren6_a', bat: 0 },
      { label: 'Decline', next: 'rg_wren6_2', bat: 0 },
    ],
  },
  rg_wren6_2: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', scare: 'glitch', call: { from: 'Wren', sub: 'calling again', ring: 2 },
    text: 'Wren again. On the first line Sorrel has gone very quiet, listening to it ring.',
    choices: [
      { label: 'Answer', next: 'rg_wren6_a', bat: 0 },
      { label: 'Decline', next: 'rg_wren6_3', bat: 0 },
    ],
  },
  rg_wren6_3: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', scare: 'jump', call: { from: 'Wren', sub: 'answered', ring: 3 },
    text: 'The phone answers Wren and puts Sorrel on hold. The hold music is a lullaby.',
    choices: [
      { label: 'Listen', next: 'rg_wren6_b', bat: 0 },
    ],
  },
  rg_wren6_a: {
    ch: 11, speaker: 'WREN', mood: 'dusk', focus: 'queen',
    text: '“Is she there?” Wren, wide awake, whispering. “The little girl. I can hear her on your phone. I can hear her on mine too, under the dial tone, when I pick it up at night. She asks if it is her turn.” A breath. “I used to answer. I used to say not yet. I did not know who she was. I just did not want her to be lonely.” Very small: “Tell her I said hello. Tell her the girl with the lamp said hello.”',
    choices: [
      { label: 'Promise you will tell her', next: 'd6_who', bat: 0, set: 'rg_done_wren6' },
      { label: 'Tell Wren she was kind to answer', next: 'd6_who', bat: 0, set: 'rg_done_wren6' },
    ],
  },
  rg_wren6_b: {
    ch: 11, speaker: 'WREN', mood: 'dusk', focus: 'queen',
    text: 'Wren does not speak. You hear her room: the lamp humming, the duvet, the clock that ticks too loud. Then, very faint, through her phone instead of yours, a small voice asking: is it my turn yet? And Wren, half asleep, from habit, answering: not yet. Not yet, love. Then the line goes back to Sorrel.',
    choices: [
      { label: 'Put the phone down', next: 'd6_who', bat: 0, set: 'rg_done_wren6' },
    ],
  },
  rg_you7: {
    ch: 12, speaker: 'NARRATOR', mood: 'gate', focus: 'queen', scare: 'whisper', call: { from: 'Unknown (you)', sub: 'calling from the first night' },
    text: 'Unknown (you). The number is yours. The time on the call says 3:07, on the first night.',
    choices: [
      { label: 'Answer', next: 'rg_you7_a', bat: 0 },
      { label: 'Decline', next: 'rg_you7_2', bat: 0 },
    ],
  },
  rg_you7_2: {
    ch: 12, speaker: 'NARRATOR', mood: 'gate', focus: 'queen', scare: 'glitch', call: { from: 'Unknown (you)', sub: 'calling again', ring: 2 },
    text: 'Unknown (you) again. The flute at the Queen\'s back stops humming, to listen.',
    choices: [
      { label: 'Answer', next: 'rg_you7_a', bat: 0 },
      { label: 'Decline', next: 'rg_you7_3', bat: 0 },
    ],
  },
  rg_you7_3: {
    ch: 12, speaker: 'NARRATOR', mood: 'gate', focus: 'queen', scare: 'jump', call: { from: 'Unknown (you)', sub: 'answered', ring: 3 },
    text: 'The phone answers. On the line, the haze, and a woman breathing who does not yet know her name.',
    choices: [
      { label: 'Listen', next: 'rg_you7_b', bat: 0 },
    ],
  },
  rg_you7_a: {
    ch: 12, speaker: 'NARRATOR', mood: 'gate', focus: 'queen',
    text: '“Is anybody there?” It is your own voice, a week younger, thin and frightened, from the very first night. “I have woken up somewhere and there is a flute and a phone and I do not know my name. Are you there? Please.” You know this call. You remember making it, with the stones cold under your back. Nobody answered. You remember very clearly that nobody answered. The line is waiting.',
    choices: [
      { label: 'Answer her: yes. I am here', next: 'd7_queen', bat: 0, set: 'rg_done_you7' },
      { label: 'Tell her it gets better. Keep going', next: 'd7_queen', bat: 0, set: 'rg_done_you7' },
    ],
  },
  rg_you7_b: {
    ch: 12, speaker: 'NARRATOR', mood: 'gate', focus: 'queen',
    text: 'No one speaks. On the line, the haze, and the stones, and a door that has just stopped closing. And breathing, quick and frightened, the breathing of someone who has just woken up with a phone in her hand and is trying very hard to be brave about it. You listen until it slows. Then, without a word, you let her go back to the beginning.',
    choices: [
      { label: 'Put the phone down', next: 'd7_queen', bat: 0, set: 'rg_done_you7' },
    ],
  },
  // ---- more of the road: two more beats a day, same rules as the first (free, set nothing, add nothing, one way in, one way out) ----
  bt_d1_crystal: {
    ch: 2, speaker: 'NARRATOR', mood: 'spire', focus: 'crystal', beat: true, safe: true,
    text: 'Close to, the crystal is not still. Something inside it is turning over and over, slowly, the way a sleeper turns, and every time it turns the song in her flute changes key to follow it. It is warm. It is warmer than a stone has any right to be, warm the way a cup is warm after someone has held it for a long time, waiting, and then put it down when they heard you on the stair.',
    choices: [
      { label: 'Close your hand on it', next: 'crystal', bat: 0, free: true },
    ],
  },
  bt_d1_follow: {
    ch: 2, speaker: 'VEY', mood: 'dusk', focus: 'vey', beat: true, safe: true,
    text: 'Something small stops on the path ahead. It has too many eyes for its size and all of them are kind, and it is holding very still, the way a creature holds still that has been called before by people who did not mean it. (A whisper, from about the height of your knee.) You said come. Nobody says come. They say go away, or they say nothing and walk past. Say it again, so I know it was me you meant.',
    choices: [
      { label: 'Say it again: come', next: 'vey_come', bat: 0, free: true },
      { label: 'Hold out your hand', next: 'vey_come', bat: 0, free: true },
    ],
  },
  bt_d2_held: {
    ch: 7, speaker: 'NARRATOR', mood: 'throne', focus: 'gate', beat: true, safe: true,
    text: 'The skulls stop telling the time as you pass them, one by one, politely, the way people stop talking when someone walks into a room. The last few steps are wet. At the bottom, the door, and on the floor in front of the door, worn into the stone, two shallow dips side by side, the size of knees. Someone has knelt here. Someone has knelt here every night for a very long time, with their back against the iron, holding it.',
    choices: [
      { label: 'Touch the iron', next: 'd2_door', bat: 0, free: true },
    ],
  },
  bt_d2_warm: {
    ch: 6, speaker: 'VEY', mood: 'dark', focus: 'vey', beat: true, safe: true,
    text: '(A small laugh, very close, warm against the glass.) Of course it is a lie. Everything anyone says down here is a little bit of a lie. That is how you can tell they are trying to be nice to you. (Something taps the screen from the inside, twice, gently, like a knock on a nursery door.) Do you want a true thing instead? True things are cold. I keep them in the coldest part of me so they will not go off.',
    choices: [
      { label: 'Let Vey speak', next: 'd2_vey', bat: 0, free: true },
    ],
  },
  bt_d3_lights: {
    ch: 8, speaker: 'EYE', mood: 'dark', focus: 'queen', beat: true, safe: true,
    text: '(The photo takes a long time to load. While it loads, the Eye types, and deletes, and types.) i wanted it to be nice. i did the stairs myself. i did the lights one at a time so you could see where to put your feet. (Typing.) people always look at the stairs and never at the lights. (Typing.) the lights took ages. (Then the photo arrives, all at once, before you are ready, and it is very bright.)',
    choices: [
      { label: 'Look at it', next: 'd3_photo', bat: 0, free: true },
    ],
  },
  bt_d3_down: {
    ch: 8, speaker: 'NARRATOR', mood: 'throne', focus: 'gate', beat: true, safe: true,
    text: 'You go down. Each step lights a half second before your foot reaches it, exactly as the photo said, and you stop trying to catch it out. Halfway down you understand that the lights are not under the steps. They are behind you, a long way up, held by someone patient who is holding a phone up high so that you can see. When you look back, the light lowers, embarrassed, and the stair goes on lighting itself.',
    choices: [
      { label: 'Keep going', next: 'd3_hall', bat: 0, free: true },
    ],
  },
  bt_d4_scroll: {
    ch: 9, speaker: 'NARRATOR', mood: 'throne', focus: 'queen', beat: true, safe: true,
    text: 'Your name goes by under your thumb, and the list slows, the way a list slows when it is nearly at the end. Under your name the entries stop being names. A date with no name. A heart someone typed and could not finish. A photo of a door, from the inside. Then a long gap of nothing, white, as if the list were taking a breath before it shows you the last thing.',
    choices: [
      { label: 'Keep scrolling', next: 'd4_bottom', bat: 0, free: true },
    ],
  },
  bt_d4_blank: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'gate', beat: true, safe: true,
    text: 'You put the phone face down on the wet stone and take your hand away. Nothing happens, and goes on not happening. The cursor keeps blinking under the glass; you can see it faintly through the back of the phone, the way you can see a heartbeat in a wrist. Somewhere far off, a great many people who once did the same thing let out their breath at once. Then the water starts to sing.',
    choices: [
      { label: 'Go to the water', next: 'd4_stones', bat: 0, free: true },
    ],
  },
  bt_d5_again: {
    ch: 10, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', beat: true, safe: true,
    text: 'You say her name, and the Eye goes silent so fast it is like a door slammed. For a moment the line is only static. Then, under the static, a bedroom: a lamp, a clock that ticks too loudly, a duvet moving. The Eye has not hung up. It has only stepped back from the phone, the way a child steps back from a window it has been told not to look through, and is watching to see what you do.',
    choices: [
      { label: 'Wait for her to speak', next: 'd5_hello', bat: 0, free: true },
    ],
  },
  bt_d5_voice: {
    ch: 10, speaker: 'WREN', mood: 'dusk', focus: 'queen', beat: true, safe: true,
    text: 'Wait. (The lamp is picked up off the floor. The bulb has gone, so she turns on her phone torch instead, and you hear her sit on the edge of the bed with her feet on the cold boards.) Okay. Okay. If it is really you, you know what I used to be scared of. Not the dark. Tell me what I used to be scared of. (A long breath.) No. Actually, do not. Just tell me everything. I will know if it is you.',
    choices: [
      { label: 'Tell her everything', next: 'd5_truth', bat: 0, free: true },
    ],
  },
  bt_d6_kept: {
    ch: 11, speaker: 'QUEEN', mood: 'dusk', focus: 'queen', beat: true, safe: true,
    text: '“What I gave.” She says it as though she has never said the words in that order. The flute at her back clicks against something, a button, a buckle. “Nobody asks that. They ask what I took. They ask how many.” A long pause. “I will tell you, because it is nearly the seventh night and I do not think I will get another chance. Sit down. It is not a long story. It has only gone on for a long time.”',
    choices: [
      { label: 'Sit down and listen', next: 'd6_story', bat: 0, free: true },
    ],
  },
  bt_d6_parcel: {
    ch: 11, speaker: 'SORREL', mood: 'dusk', focus: 'queen', beat: true, safe: true,
    text: '(You tell her. She listens with her whole breath, very close, the way small children listen to a phone, as if it might go silent if they stop.) Oh. (A pause.) Oh, you have it now. (Something rustles: paper, a lot of it, being pushed under a door.) That is everyone who had it. Mummy writes them down. I am not allowed to read them, but I can count them. I am good at counting. I can count to one lots of times.',
    choices: [
      { label: 'Let her go on', next: 'd6_who', bat: 0, free: true },
    ],
  },
  bt_d7_show: {
    ch: 12, speaker: 'EYE', mood: 'dark', focus: 'queen', beat: true, safe: true,
    text: '(The red goes on and on, filling the screen, and the phone grows heavy, as if every phone she has ever been inside were stacked in your hand.) you want to know. everyone wants to know, on the last night. nobody wants to know on the first. (A wet blink.) all right. i will show you. i will show you all of it, from the start. it does not take long. it never takes long. that is the worst part.',
    choices: [
      { label: 'Let her show you', next: 'd7_again', bat: 0, free: true },
    ],
  },
  bt_d7_turn: {
    ch: 12, speaker: 'NARRATOR', mood: 'throne', focus: 'gate', beat: true, safe: true,
    text: 'Not this time. You say it to the red, and the red does not answer, and you say it again, to the room, and the room hears. Somewhere a door that has been not quite closing all week stops. Somewhere a choir draws breath. Footsteps, a great many of them, coming from every way you came in this week, the cave and the corridor and the shore and the bedroom and the nursery, all arriving at once, as if everyone had been waiting for someone to say it first.',
    choices: [
      { label: 'Turn round', next: 'd7_gather', bat: 0, free: true },
    ],
  },
  awakening_b: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen',
    text: 'The flute is real. It is warm, as if someone has only just put it down. Tucked under its strap is a slip of paper in handwriting you know better than your own name, which you still do not have: DO NOT LET THEM COUNT YOU. And when the phone wakes, the picture on it is one you do not remember taking. A hand, small, holding yours, from the height of your own eyes. Whoever took it was looking down at them, and smiling.',
    choices: [
      { label: 'Read the note again, slowly', next: 'awakening_c', add: { resolve: 1 } },
      { label: 'Look at the small hand', next: 'awakening_c', add: { heart: 1 } },
      { label: 'The phone is ringing: HOME', next: 'rg_home1', bat: 0, req: { noflag: 'rg_done_home1' } },
    ],
  },
  awakening_c: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', note: 'o_awake',
    text: 'Behind you the haze settles, and for a moment you can feel where it has been told to leave a gap: three ways, narrow as a held breath. On the back of your hand, in the same biro, a single number has appeared, and it is not 3:07. It is 1. You are not the first one counted, you think. You may only be the first to wake up. The flute hums. The stones murmur. The phone lights, without being touched.',
    choices: [
      { label: 'Follow the flute', next: 'flute_path', add: { resolve: 1 } },
      { label: 'Listen to the stones', next: 'stones_path', add: { heart: 1 } },
      { label: 'Check your phone', next: 'unknown_sms', add: { dread: 1 } },
    ],
  },
  op_lift_b: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen',
    text: 'The panel has no numbers now, only the crown. Taped underneath it, where you cannot have put it, is a child\u2019s drawing of a lift: a stick figure inside, and on the door a very large number, 3:07. The woman with the flute has not moved. She is looking at the drawing, not at you, like someone who has seen it before.',
    choices: [
      { label: 'Take the drawing', next: 'op_lift_c', add: { heart: 1 } },
      { label: 'Ask her whose it is', next: 'op_lift_c', add: { trust: 1 } },
    ],
  },
  op_lift_c: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', note: 'o_lift',
    text: 'Behind the drawing, in pencil, at the height of a nine-year-old: W. WAS HERE. The haze beyond the doors is not violet any longer. It is the colour of a landing with a nightlight. "Go on," says the woman. "She drew it for you." You do not know who she means. You are beginning to.',
    choices: [
      { label: 'Step out into the haze', next: 'flute_path', add: { resolve: 1 } },
      { label: 'Press every button at once', next: 'unknown_sms', add: { dread: 1 } },
      { label: 'Say hello to her', next: 'stones_path', add: { heart: 1 } },
    ],
  },
  op_bath_b: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen',
    text: 'The water is not cold now, only very still, and it has started to hold your shape: when you lift a hand the water lifts a hand. On the rim, beside the dry phone, someone has left a yellow plastic duck. It is not yours. It is hers, the small one under the water, and it has a ribbon round its neck.',
    choices: [
      { label: 'Pick up the duck', next: 'op_bath_c', add: { heart: 1 } },
      { label: 'Leave it, and listen to the humming', next: 'op_bath_c', add: { resolve: 1 } },
    ],
  },
  op_bath_c: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', note: 'o_bath',
    text: 'The humming has words, if you hold still. Not eleven notes: eleven names, one note each. The eleventh is yours. On the ribbon, in very small crayon: for the bath, so you are never lonely down there. Far under, the woman with the flute raises one hand and waves like a child at a window.',
    choices: [
      { label: 'Climb out, fast', next: 'torch_first', light: 1, add: { dread: 1 } },
      { label: 'Put your ear to the water', next: 'choir_1', add: { dread: 1 } },
      { label: 'Reach down to her', next: 'stones_path', add: { heart: 1, trust: 1 } },
    ],
  },
  op_bus_b: {
    ch: 1, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen',
    text: 'Not one of the passengers has moved. But the seat across the aisle, which was empty, has a child\u2019s schoolbag on it now, dinosaur zip, packed very carefully for a trip: a torch, a sandwich in foil, a cracked phone showing 3:07. From the driver\u2019s speaker, without turning, a voice says: "She left it for you. She packs for everyone."',
    choices: [
      { label: 'Open the bag', next: 'op_bus_c', add: { heart: 1 } },
      { label: 'Ask the driver who she is', next: 'op_bus_c', add: { trust: 1 } },
    ],
  },
  op_bus_c: {
    ch: 1, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', note: 'o_bus',
    text: 'In the front pocket, a note in a child\u2019s block capitals: IF YOU GET LOST, STAY ON THE BUS. IT ALWAYS GOES HOME EVENTUALLY. The driver says nothing. A stop slides into the window, a stop with no name, and under its shelter a woman with a flute holds up her hand, the way you hail a bus that might not stop.',
    choices: [
      { label: 'Ring the bell to get off', next: 'flute_path', add: { resolve: 1 } },
      { label: 'Look at their screens', next: 'unknown_sms', add: { dread: 1 } },
      { label: 'Go downstairs to the driver', next: 'vey_come', add: { trust: 1 } },
    ],
  },
  op_ward_b: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen',
    text: 'One curtain is open, and in the chair beside your bed sits a girl of fourteen, asleep with her coat on and her head on the blanket, holding your hand in both of hers. You cannot feel it. You can see the knuckles, white. She has been holding on for a very long time.',
    choices: [
      { label: 'Look at her face', next: 'op_ward_c', add: { heart: 1 } },
      { label: 'Try to squeeze her hand', next: 'op_ward_c', add: { resolve: 1 } },
    ],
  },
  op_ward_c: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', note: 'o_ward',
    text: 'On the locker, in her handwriting, a card: GET WELL. I WILL ANSWER IF IT RINGS. Beside it your phone, lit, 3:07, with its label: DO NOT ANSWER AFTER 3. The monitor skips a beat and the haze comes in at the window like fog. The woman with the flute stands at the foot of the bed with a hand on the rail. "She will answer," she says. "That is the whole trouble."',
    choices: [
      { label: 'Pull back the last curtain', next: 'flute_path', add: { resolve: 1, dread: 1 } },
      { label: 'Answer the phone anyway', next: 'unknown_sms', add: { dread: 1 } },
      { label: 'Listen to the monitor', next: 'stones_path', add: { heart: 1 } },
    ],
  },
  op_shore_b: {
    ch: 1, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen',
    text: 'The footprints are small. Counting them takes a long time, and you lose count at two hundred and thirteen. At the water\u2019s edge a pair of little wellington boots has been put side by side, toes towards the lake, the way a child puts them when she is told to get ready for bed. One has a yellow duck sticker on it.',
    choices: [
      { label: 'Pick up the boots', next: 'op_shore_c', add: { heart: 1 } },
      { label: 'Follow the footprints to the water', next: 'op_shore_c', add: { resolve: 1, dread: 1 } },
    ],
  },
  op_shore_c: {
    ch: 1, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', note: 'o_shore',
    text: 'The water is warm and perfectly still, and your reflection is looking up at the sky, not at you. The woman with the flute walks in across the surface, completely dry, and hands you something she has been holding: a very small pair of mittens on a string, still damp. "These are the only things that ever came back," she says. "Don\u2019t put them in a drawer."',
    choices: [
      { label: 'Follow the footprints back', next: 'footprints', add: { heart: 1 } },
      { label: 'Wade out to her', next: 'choir_1', add: { dread: 1 } },
      { label: 'Switch on the flashlight', next: 'torch_first', light: 1 },
    ],
  },
  op_party_b: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen',
    text: 'Streamers, an uncut cake, a banner that says HAPPY and then, where the number should be, only a smear of icing. In the hall the counting has got down to three. In the mirror, beside the woman with her finger to her lips, stands a small girl in a paper crown, counting, whom the room does not seem to see. When she reaches one something is going to happen. She has been on three for a long time.',
    choices: [
      { label: 'Sit down on the floor where she is', next: 'op_party_c', add: { heart: 1 } },
      { label: 'Count with her', next: 'op_party_c', add: { resolve: 1, dread: 1 } },
    ],
  },
  op_party_c: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', note: 'o_party',
    text: 'She does not look round. "Four candles," she says. "I only get four. Then they go home and it is quiet and the door opens and Mummy tells me to wait." The folds of her paper crown are very neat. The woman with the flute has her hand over her mouth. She has been standing there for as long as there has been a party.',
    choices: [
      { label: 'Find the child before she reaches one', next: 'footprints', add: { heart: 1, dread: 1 } },
      { label: 'Turn round to the woman', next: 'flute_path', add: { trust: 1 } },
      { label: 'Blow out the candles', next: 'unknown_sms', add: { dread: 1 } },
    ],
  },
  op_lost_b: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen',
    text: 'The office is not there any more. You are in a long lost-property hall, shelves going up into the haze: umbrellas, single gloves, a hundred phones, every one of them lit and every one showing a face you almost know. At the counter, in place of a clerk, the woman with the flute has a ledger open in front of her. "Everything is in the ledger," she says. "That is the point of lost property. It is never lost. It is only waiting to be asked for."',
    choices: [
      { label: 'Ask for your own phone', next: 'op_lost_c', add: { heart: 1 } },
      { label: 'Ask what else is waiting', next: 'op_lost_c', add: { resolve: 1 } },
    ],
  },
  op_lost_c: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', note: 'o_lost',
    text: 'Under L, in a hand you know: one small purple umbrella with a duck handle, found at 3:07, unclaimed for nine years. She puts it on the counter. "Whoever left it was in a great hurry to be brave. They said they would come back for it. Somebody always says they will come back for it." Yours is the only phone on the shelves that is not showing a face. It is showing the time.',
    choices: [
      { label: 'Follow the note', next: 'flute_path', add: { resolve: 1 } },
      { label: 'Look at the other photos', next: 'unknown_sms', add: { dread: 1 } },
      { label: 'Call to whoever is near you', next: 'vey_come', add: { trust: 1 } },
    ],
  },
  op_voicemail_b: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen',
    text: 'The voicemail does not end when your own voice does. Under it, very faint, a second recording has been laid over the first: a child, close to a microphone, saying, "Is somebody there? I can hear you breathing." The length of the message reads 3:07. It is still counting up.',
    choices: [
      { label: 'Say: I\u2019m here', next: 'op_voicemail_c', add: { heart: 1 } },
      { label: 'Stay silent, and listen', next: 'op_voicemail_c', add: { resolve: 1, dread: 1 } },
    ],
  },
  op_voicemail_c: {
    ch: 1, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', note: 'o_voicemail',
    text: 'The child gets very quiet. Then: "Oh good. It said you would listen. I have been saving all of these for you. I have got a lot." Behind her voice you can hear a great many messages being queued, two hundred and fourteen unplayed voicemails, each three minutes and seven seconds long. The flute is not playing now. It is sitting beside the phone, listening to the first one again.',
    choices: [
      { label: 'Follow the flute', next: 'flute_path', add: { resolve: 1, dread: 1 } },
      { label: 'Ignore yourself', next: 'stones_path', add: { heart: 1 } },
      { label: 'Call yourself back', next: 'unknown_sms', add: { dread: 1 } },
    ],
  },
  op_snow_b: {
    ch: 1, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen',
    text: 'On the landing there is a small table, and on it a snow globe, and the snow is coming out of it. In the glass, a tiny staircase, a tiny house, and a tiny figure in a paper crown halfway up the tiny stairs, looking up. The snow in the room falls up. The snow in the globe falls the proper way, as if it were the only thing in the house that knew which way was down.',
    choices: [
      { label: 'Pick up the globe', next: 'op_snow_c', add: { heart: 1 } },
      { label: 'Stand under the snow, and let it fall up past you', next: 'op_snow_c', add: { resolve: 1 } },
    ],
  },
  op_snow_c: {
    ch: 1, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', note: 'o_snow',
    text: 'On the base of the globe, scratched in with a key, a date you do not recognise: a year that should not exist yet. The tiny figure in the paper crown mouths three words at you through the glass, again and again, patient. You hold it to your ear like a shell. At the top of the stairs the woman with the flute stands watching the snow go up, and does not say that she is crying.',
    choices: [
      { label: 'Keep climbing', next: 'spire', add: { resolve: 1, dread: 1 } },
      { label: 'Go back down', next: 'stones_path', add: { heart: 1 } },
      { label: 'Light up the snow', next: 'torch_first', light: 1 },
    ],
  },
  ec4_awake: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'awakening',
    text: 'The first minute again, but you are standing a little outside it, and for once you can see her. A woman asleep sitting up in the violet haze, the flute at her back, a phone lit in her hand: 3:07. On the inside of her wrist, in biro, a number: 1. She looks like someone who has been waiting a very long time to be woken by a kind voice. There is a slip of paper under the flute strap that has not been written yet. \u201cYou can add to it,\u201d says something behind you, not unkindly. \u201cYou always do.\u201d',
    choices: [
      { label: 'Write under it: THEN COUNT THEM BACK', next: '@back', set: 'tt_echo4', add: { resolve: 1 } },
      { label: 'Lay your hand over the number', next: '@back', set: 'tt_echo4', add: { heart: 1 } },
    ],
  },
  ec6_awake: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'awakening',
    text: 'The first minute, once more, from the other end of the week. The same haze, the same woman asleep sitting up, but the biro on her wrist is not a 1 now. It is the number you have reached, and it is not one you can say aloud. She opens her eyes. \u201cYou came back to be here when I woke,\u201d she says. \u201cNobody ever has. They are always asleep at the beginning.\u201d She looks at the phone in her hand, and then, for a long moment, at you.',
    choices: [
      { label: 'Tell her: you are not the first one counted', next: '@back', set: 'tt_echo6', add: { heart: 1, dread: 1 } },
      { label: 'Hold the phone out to her, lit, and stay', next: '@back', set: 'tt_echo6', add: { heart: 2 } },
    ],
  },
  ec4_lift: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_lift',
    text: 'The lift again, but you are on the haze side of the doors now, and the panel is lit from outside. The woman with the flute is pressing the button to call it. "Every night I call it," she says, "and every night it comes with someone in it, and every night I think: perhaps this is the one who can say no." She looks at the drawing. "You put this back, last time. W. WAS HERE. I have been keeping it dry."',
    choices: [
      { label: 'Take the drawing, and keep it', next: '@back', set: 'tt_echo4', add: { heart: 1 } },
      { label: 'Draw the number on it again: 3:07', next: '@back', set: 'tt_echo4', add: { resolve: 1 } },
    ],
  },
  ec6_lift: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_lift',
    text: 'The lift opens on the nursery floor. The panel has one more button than it should: not a crown, a small paper hat. A voice, very high and very patient, says from the speaker: "Going up. Please stand clear. Somebody has to ride it with me." It has been waiting since the first night for a passenger who is not afraid of the ride.',
    choices: [
      { label: 'Ride it up with her', next: '@back', set: 'tt_echo6', add: { heart: 1, dread: 1 } },
      { label: 'Press the paper hat', next: '@back', set: 'tt_echo6', add: { heart: 2 } },
    ],
  },
  ec4_bath: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_bath',
    text: 'The water again, from underneath this time. You are the small thing at the bottom, and the bath is a long way up, a round light. Someone is humming your name into it. A yellow duck floats down past you, ribbon trailing, and you understand it is a message and not a toy: it is how they find you. Hold it, and you can be found.',
    choices: [
      { label: 'Hold the duck', next: '@back', set: 'tt_echo4', add: { heart: 1 } },
      { label: 'Let it float up to the light', next: '@back', set: 'tt_echo4', add: { resolve: 1, dread: 1 } },
    ],
  },
  ec6_bath: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_bath',
    text: 'A bath in a house with no windows, filled with warm water and paper hats floating on it like boats. A small hand comes up out of the water for the duck. It does not take it. It only holds the ribbon, and says, very low and very pleased: you came back up for me.',
    choices: [
      { label: 'Put the duck in her hand', next: '@back', set: 'tt_echo6', add: { heart: 2 } },
      { label: 'Hold her hand under the water, gently, and stay', next: '@back', set: 'tt_echo6', add: { heart: 1, dread: 1 } },
    ],
  },
  ec4_bus: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_bus',
    text: 'The night bus again, and you are at the stop this time, in water to your knees, with your hand up. Two hundred and fourteen faces are looking out of its windows. It slows. It does not stop. It goes round you very carefully, like water round a stone, and as it passes you see a dinosaur schoolbag on every seat, two hundred and fourteen of them, each one packed.',
    choices: [
      { label: 'Put your hand up higher', next: '@back', set: 'tt_echo4', add: { resolve: 1 } },
      { label: 'Step back, and let them pass', next: '@back', set: 'tt_echo4', add: { heart: 1, dread: 1 } },
    ],
  },
  ec6_bus: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_bus',
    text: 'The last stop: a shelter on a landing, with a timetable that says only TONIGHT. A very small voice, from inside the bus, from a window you cannot see through: it said it would stop for me. you said it would go home eventually. is it eventually? The driver does not turn round. He is waiting for you to answer for him.',
    choices: [
      { label: 'Tell her: yes. It is eventually', next: '@back', set: 'tt_echo6', add: { heart: 2, dread: 1 } },
      { label: 'Tell her: nearly', next: '@back', set: 'tt_echo6', add: { trust: 1 } },
    ],
  },
  ec4_ward: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_ward',
    text: 'The ward from the other side of the glass: the girl in the chair, the bed, your own shape under the blanket, and the haze at the window like a face. The monitor is playing the tune very slowly. Someone has to decide whether to stay in the bed or go to the window. The girl says, in her sleep: don\u2019t go. Her voice is the one she had when she was nine.',
    choices: [
      { label: 'Stay by the bed', next: '@back', set: 'tt_echo4', add: { heart: 1 } },
      { label: 'Go to the window', next: '@back', set: 'tt_echo4', add: { resolve: 1, dread: 1 } },
    ],
  },
  ec6_ward: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_ward',
    text: 'A ward with no beds, only cots, and paper hats strung from the monitors, and every monitor beeping the same tune. A very small patient in the nearest cot has her hand through the rail and is holding it out to you, the way a child holds out a hand to someone she is sure will not go. I have been ill for such a long time, she says. will you hold it? Her fingers are very hot.',
    choices: [
      { label: 'Hold her hand', next: '@back', set: 'tt_echo6', add: { heart: 2, dread: 1 } },
      { label: 'Hold her hand, and sing the tune', next: '@back', set: 'tt_echo6', add: { heart: 1, resolve: 1, dread: -1 } },
    ],
  },
  ec4_shore: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_shore',
    text: 'The lake again, and you are in it to your waist, and it is a cave, and the footprints are going the other way: out of the water, up the stairs, one small pair for each of the faces. Someone has been coming back, a few at a time, for a long time, and nobody has been counting. The woman with the flute is counting. Two hundred and fourteen. She looks at you. "Two hundred and fifteen," she says gently, and writes it down.',
    choices: [
      { label: 'Let her count you', next: '@back', set: 'tt_echo4', add: { heart: 1, dread: 1 } },
      { label: 'Take the pencil, and count the other way', next: '@back', set: 'tt_echo4', add: { resolve: 1 } },
    ],
  },
  ec6_shore: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_shore',
    text: 'A landing, and a wet footprint on the boards, small, bare, leading to a door that stands a hand\u2019s width open. Another. Another. They come out of the red light one every step, as if someone very small is walking carefully back out of the water and has not yet decided whether she is allowed. Then, from the gap, a whisper: do I have to put my boots on?',
    choices: [
      { label: 'Tell her: you do not have to wear anything', next: '@back', set: 'tt_echo6', add: { heart: 2 } },
      { label: 'Hold out the little boots', next: '@back', set: 'tt_echo6', add: { heart: 1, trust: 1 } },
    ],
  },
  ec4_party: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_party',
    text: 'The party from the doorway, and now you can see what the girl cannot: the guests are the faces from the water, all two hundred and fourteen, standing very politely along the walls in paper hats, holding presents wrapped in their own hands. They are not guests. They are the kept. They are waiting for the girl to reach one, so they can sing, and then they will all go home. The girl has never reached one.',
    choices: [
      { label: 'Sing very quietly, so she doesn\u2019t reach one', next: '@back', set: 'tt_echo4', add: { heart: 1, dread: 1 } },
      { label: 'Count with her, more slowly', next: '@back', set: 'tt_echo4', add: { resolve: 1, heart: 1 } },
    ],
  },
  ec6_party: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_party',
    text: 'The party, a last time. Four candles, lit. The girl in the paper crown is looking at you for the first time, and she is much bigger than four: only the crown is. "Make a wish," you say. "I made it a long time ago," she says. "I wished that somebody would stay after the party." Then she blows out the candles, and the light stays on anyway.',
    choices: [
      { label: 'Stay after the party', next: '@back', set: 'tt_echo6', add: { heart: 2, dread: 1 } },
      { label: 'Tell her: I will come back tomorrow', next: '@back', set: 'tt_echo6', add: { trust: 1, heart: 1 } },
    ],
  },
  ec4_lost: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_lost',
    text: 'The lost-property hall, from the shelf side. You are one of the phones, and a hand is coming to pick you up. Two hundred and fourteen other phones are lit on the shelves around you, and every face on every screen is turned to look at you. They are not lost. They are kept: held on the shelf at 3:07 until someone asks for them. Someone should.',
    choices: [
      { label: 'Ask for them, by name, one at a time', next: '@back', set: 'tt_echo4', add: { heart: 1, trust: 1 } },
      { label: 'Ask what happens when nobody asks', next: '@back', set: 'tt_echo4', add: { resolve: 1, dread: 1 } },
    ],
  },
  ec6_lost: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_lost',
    text: 'The counter again, and on it a very small coat, with a note pinned to it in a mother\u2019s handwriting: she will want this when it gets cold. DO NOT LOSE IT. It is a four-year-old\u2019s coat, and it has never been collected. The ledger has a column for who is meant to come and a column for who did, and this coat\u2019s second column has been blank for two hundred years.',
    choices: [
      { label: 'Sign for the coat', next: '@back', set: 'tt_echo6', add: { heart: 2, dread: 1 } },
      { label: 'Ask her to write your name in the second column', next: '@back', set: 'tt_echo6', add: { trust: 1, resolve: 1 } },
    ],
  },
  ec4_voicemail: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_voicemail',
    text: 'A long corridor of speakers, each one playing a voicemail, each in a different voice, all of the same length. Two hundred and fourteen people leaving a message for somebody who has not picked up. You walk the length of it, and every speaker as you pass says your name in the same patient voice, not asking. Only checking that the line is still open.',
    choices: [
      { label: 'Pick one up, and answer', next: '@back', set: 'tt_echo4', add: { heart: 1, dread: 1 } },
      { label: 'Say your name back, to all of them', next: '@back', set: 'tt_echo4', add: { resolve: 1 } },
    ],
  },
  ec6_voicemail: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_voicemail',
    text: 'A speaker on a cot: a child\u2019s toy phone, plugged into nothing, its red light blinking. You press play. A very small voice, very close: "Hello? Hello? This is the last one. I wanted to say it properly this time, so I practised. My name is—" The message ends. The next message is empty, three minutes and seven seconds of nothing, and you have the strongest feeling that someone is holding her breath.',
    choices: [
      { label: 'Say her name into the empty message', next: '@back', set: 'tt_echo6', add: { heart: 2, dread: -1 } },
      { label: 'Wait out the three minutes, in silence', next: '@back', set: 'tt_echo6', add: { resolve: 1, heart: 1 } },
    ],
  },
  ec4_snow: {
    ch: 9, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_snow',
    text: 'The cave, but it is snowing in it, warm, falling up past the faces under the water, who open their mouths to catch it like children. For a moment all two hundred and fourteen are smiling. The woman with the flute stands in the snow with her palm up, and the flakes do not melt on it. "It does this once a year," she says. "The night of my daughter\u2019s birthday. I never know whether to let it."',
    choices: [
      { label: 'Hold out your hand, and let it', next: '@back', set: 'tt_echo4', add: { heart: 1 } },
      { label: 'Catch one on your tongue, like a child', next: '@back', set: 'tt_echo4', add: { heart: 1, dread: -1 } },
    ],
  },
  ec6_snow: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', time: 'past', safe: true, thread: 'op_snow',
    text: 'The snow globe, enormous. You are the figure inside the glass, and outside the glass an enormous red eye, patient and wet, is looking in. She is shaking the globe very gently so that the snow will go up and come down again. snow is the only weather, she says. i do it when i am sad. you came up in the snow once. will you stay in it with me while it settles?',
    choices: [
      { label: 'Stay, while it settles', next: '@back', set: 'tt_echo6', add: { heart: 2 } },
      { label: 'Shake the globe from the inside, so she feels it', next: '@back', set: 'tt_echo6', add: { resolve: 1, heart: 1, dread: 1 } },
    ],
  },
  // ---- who you were: each person's "before" scene and three flashbacks (see ABY.HEROES) ----
  hero_rowan: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', safe: true, thread: 'hero', note: 'h_rowan',
    text: 'Before. Before you were a voice in a phone, you were Rowan, and you had a little sister, and a landing between your two rooms with a nightlight shaped like a moon. Wren sleepwalked. Most nights at about three you would hear the boards, and get up, and find her at the top of the stairs holding the banister with both hands, talking to someone at the bottom you could never see. You never woke her. You only turned her round, very gently, and walked her back, counting the steps out loud so she would know where she was. You are still counting, somewhere, when the phone rings.',
    choices: [
      { label: 'Remember the moon nightlight', next: '@back', bat: 0, free: true },
      { label: 'Remember counting her back to bed', next: '@back', bat: 0, free: true },
    ],
  },
  hb2_rowan: {
    ch: 6, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', safe: true, thread: 'hero', time: 'past',
    text: 'Flashback. Hide and seek, the summer Wren was six. You are It. You stand in the hall with your face to the wallpaper and count to forty, loudly, the way she likes, and at thirty-nine you hear her laugh from a room you did not know the house had. When you open your eyes the hall is longer. There are more doors in it than there should be, and behind one of them, very pleased, a small voice is counting with you: forty. Forty. Forty.',
    choices: [
      { label: 'Go and find her', next: '@back', bat: 0, set: 'tt_hero2', free: true },
      { label: 'Call out that the game is over', next: '@back', bat: 0, set: 'tt_hero2', free: true },
    ],
  },
  hb4_rowan: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', safe: true, thread: 'hero', time: 'past',
    text: 'Flashback. The night the phone in the hall first rang after three. You were fourteen, and you answered it, because nobody else was awake, and a woman asked very politely for your sister. You said she was asleep. The woman said: then I will wait. You stood in the dark hall holding the receiver for an hour, until it was light, so that she would not have to wait for anyone else. In the morning there was a number on the back of your hand in biro, and it would not wash off.',
    choices: [
      { label: 'Hold on to the receiver', next: '@back', bat: 0, set: 'tt_hero4', free: true },
      { label: 'Put it down, gently', next: '@back', bat: 0, set: 'tt_hero4', free: true },
    ],
  },
  hb6_rowan: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', safe: true, thread: 'hero', time: 'past',
    text: 'Flashback. The last time you walked her back. She was nine, in dinosaur pyjamas, and this time she was not talking to the bottom of the stairs. She was listening to it. “She says it is her turn,” Wren told you, wide awake inside her sleep. “She says she has been four for ever so long.” You turned her round. You counted her back. Twelve steps, the same as always, and on the thirteenth you heard, from the dark at the bottom, someone small begin to count them too.',
    choices: [
      { label: 'Count louder', next: '@back', bat: 0, set: 'tt_hero6', free: true },
      { label: 'Pick her up and carry her', next: '@back', bat: 0, set: 'tt_hero6', free: true },
    ],
  },
  hero_ellis: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', safe: true, thread: 'hero', note: 'h_ellis',
    text: 'Before. Before you were a voice in a phone, you were Ellis, and you taught music in a front room above a launderette, and every Thursday at four a small girl called Wren came up the stairs with a borrowed flute in a box held together with tape. You taught her the eleven notes first. You taught everyone the eleven notes first, though you could never have said where you learned them. She played them back to you perfectly the very first week, and then said, quite calmly, that someone under the floor had been humming them to her for years.',
    choices: [
      { label: 'Remember the eleven notes', next: '@back', bat: 0, free: true },
      { label: 'Remember what she said about the floor', next: '@back', bat: 0, free: true },
    ],
  },
  hb2_ellis: {
    ch: 6, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', safe: true, thread: 'hero', time: 'past',
    text: 'Flashback. A Thursday, raining. Wren is late, and you play the eleven notes alone to fill the room, and somewhere under the floorboards, under the launderette, under the street, something you cannot see sings the twelfth. You stop. The room is very quiet. The machines downstairs have all stopped too, mid-spin, as if listening. You have never played the twelfth note. You have never known what it was. Now you know what it sounds like, and you wish you did not.',
    choices: [
      { label: 'Play the eleven again, to cover it', next: '@back', bat: 0, set: 'tt_hero2', free: true },
      { label: 'Put the flute down and listen', next: '@back', bat: 0, set: 'tt_hero2', free: true },
    ],
  },
  hb4_ellis: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', safe: true, thread: 'hero', time: 'past',
    text: 'Flashback. Your last lesson with Wren. She is ten, and she has brought you a card: a drawing of a flute, a drawing of you, and underneath, in round careful letters, THANK YOU FOR THE NOTES. Then she asks if she can stop. Not because she does not love it. Because when she plays at night, people come into the garden to listen, standing in the rain, and there are more of them every week, and none of them have faces she knows.',
    choices: [
      { label: 'Tell her she can stop', next: '@back', bat: 0, set: 'tt_hero4', free: true },
      { label: 'Ask her how many there are now', next: '@back', bat: 0, set: 'tt_hero4', free: true },
    ],
  },
  hb6_ellis: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', safe: true, thread: 'hero', time: 'past',
    text: 'Flashback. The night you found your own flute. Not Wren\'s: yours. Wrapped in a nursery blanket at the back of a cupboard in a house you were clearing for a stranger, with a luggage label on it in a woman\'s handwriting: for whoever can play the eleven, and stop. You played it in the empty house to see if it worked. It worked. The stair creaked behind you, very lightly, the way a stair creaks under someone four years old who has been told to stay in bed.',
    choices: [
      { label: 'Keep playing', next: '@back', bat: 0, set: 'tt_hero6', free: true },
      { label: 'Stop on the eleventh note', next: '@back', bat: 0, set: 'tt_hero6', free: true },
    ],
  },
  hero_jude: {
    ch: 1, speaker: 'NARRATOR', mood: 'void', focus: 'queen', safe: true, thread: 'hero', note: 'h_jude',
    text: 'Before. Before you were a voice in a phone, you were Jude, and you worked nights on a children\'s ward for twelve years, and every nurse on nights knows about 3:07. It is the minute the monitors all blink at once, for no reason anyone has found. It is the minute the children who cannot sleep sit up and look at the door. One winter you sat up with a girl called Wren while her fever broke, and at 3:07 she held your hand very hard and said: do not answer it. At the nurses\' station, very quietly, the phone had begun to ring.',
    choices: [
      { label: 'Remember her hand', next: '@back', bat: 0, free: true },
      { label: 'Remember the phone at the station', next: '@back', bat: 0, free: true },
    ],
  },
  hb2_jude: {
    ch: 6, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', safe: true, thread: 'hero', time: 'past',
    text: 'Flashback. Your first night shift, years before Wren. A senior nurse walks you round with a torch and shows you everything: the drugs trolley, the fire doors, the sink that runs hot, and, last, a phone on the wall of the nurses\' station with a strip of tape across it that says DO NOT ANSWER AFTER 3. “Why?” you ask. She thinks about it for a long time. “Because it is never for you,” she says. “It is always for one of them. And they always want to go.”',
    choices: [
      { label: 'Ask her who calls', next: '@back', bat: 0, set: 'tt_hero2', free: true },
      { label: 'Promise you never will', next: '@back', bat: 0, set: 'tt_hero2', free: true },
    ],
  },
  hb4_jude: {
    ch: 9, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', safe: true, thread: 'hero', time: 'past',
    text: 'Flashback. Bed nine, a boy of seven who never slept. Every night at 3:07 he sat up and waved at the door, and every night you asked who he was waving to, and every night he said: the lady with the flute, she is looking for her little girl, she asks me if I have seen her. On his last night he did not wave. He said: I told her I would help her look. In the morning the bed was made, and the chart said discharged, in handwriting nobody on the ward could name.',
    choices: [
      { label: 'Remember his name', next: '@back', bat: 0, set: 'tt_hero4', free: true },
      { label: 'Remember the handwriting', next: '@back', bat: 0, set: 'tt_hero4', free: true },
    ],
  },
  hb6_jude: {
    ch: 11, speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', safe: true, thread: 'hero', time: 'past',
    text: 'Flashback. The night it rang for you. Wren was long since well and gone home, and you were alone at the station, and the taped-up phone rang at 3:07, and for once there was nobody else for it to be for. You answered it. A small voice, very polite, asked if this was the hospital. It said it had been four for a very long time and it was not well. It asked if a nurse could come. You said, without thinking, the thing you always say: of course. Where are you, love? And the line said: here.',
    choices: [
      { label: 'Ask her where here is', next: '@back', bat: 0, set: 'tt_hero6', free: true },
      { label: 'Tell her you are coming', next: '@back', bat: 0, set: 'tt_hero6', free: true },
    ],
  },
  // ---- the evidence board's scenes: each opens only for a player who pinned the right two clues together in Notes (ABY.LINKS) ----
  ev_door: {
    ch: 7, speaker: 'NARRATOR', mood: 'gate', focus: 'gate', scare: 'whisper',
    text: 'You hold the two warnings side by side, the stones and your own number, and put your mouth to the keyhole. "Who is it?" The breathing stops. Then, from much lower down than a grown man would stand, a very small voice: "is it morning yet? she said it would be morning soon. she said it a long time ago."',
    choices: [
      { label: 'Tell it: nearly. Nearly morning', next: 'd2_door', set: 'ev_door', add: { trust: 1, heart: 1 } },
    ],
  },
  ev_corvin: {
    ch: 8, speaker: 'GUARDIAN', mood: 'dusk', focus: 'guardian',
    text: '(A long silence behind the iron.) Nobody ever read that far. Yes to the crown. Yes to the door. Yes to every night she asked. (The lantern arm shakes.) No. ...So that is what it sounds like. Take the lamp. And take this, which I never told her: the door has a second lock, low down, at a child\'s height. I was never once allowed to open it.',
    choices: [
      { label: 'Take the lamp, and the secret', next: 'd3_table', set: 'corvin_lamp', bat: -20, add: { resolve: 1, trust: 1, dread: -1 } },
    ],
  },
  ev_vey: {
    ch: 8, speaker: 'VEY', mood: 'dark', focus: 'vey', scare: 'whisper',
    text: '(It looks at the Queen\'s photo, and at yours, and at the hand that is in both.) Yes. I carry things. I carried her down. I carried the crown up. And I have carried you since the first night, only a little, so you would not fall. (You feel the weight go from your shoulder.) There. Walk on your own now. I will be right behind you. Not touching.',
    choices: [
      { label: 'Walk on, on your own', next: 'd3_table', add: { resolve: 1, dread: -1 } },
    ],
  },
  ev_line: {
    ch: 10, speaker: 'WREN', mood: 'gate', focus: 'gate', scare: 'glitch',
    text: 'She goes very quiet when you tell her. Whoever stays on the line is next. It does not want the frightened ones. "Then I\'ll hang up," she says, and does not. "I can\'t. You\'re on it." Under the floor, somewhere very far down, the choir stops singing to listen.',
    choices: [
      { label: 'Then we both stay. It can\'t choose two', next: 'd5_dawn', set: 'ev_line', add: { trust: 1, resolve: 1 } },
    ],
  },
  ev_party: {
    ch: 11, speaker: 'NARRATOR', mood: 'dark', focus: 'queen', scare: 'glitch',
    text: 'The haze smells of birthday candles, and the bargain keeps someone on the other side. Hold the two together and the room is different. The paper hats are not old. Someone puts out a new one every night. On the cot, a cake with four candles, never lit and never stale. It is still her birthday. It has been her birthday for two hundred years, and every name in the book was invited.',
    choices: [
      { label: 'Light one candle for her', next: 'd6_door', add: { heart: 2, dread: 1 } },
    ],
  },
  ev_first: {
    ch: 12, speaker: 'QUEEN', mood: 'gate', focus: 'gate',
    text: '(She looks at the first page for a long time: the crayon door, the crayon crown, the number written backwards.) She drew it the night before. She said: so I can find the way home if I get lost. I thought it was a drawing. I put it at the front of the book to keep it safe. (Very quietly.) It was never the first name. It was a map.',
    choices: [
      { label: 'Then read it like a map', next: 'd7_end', set: 'ev_first', add: { heart: 1, dread: -1 } },
    ],
  },
  ev_key: {
    ch: 11, speaker: 'SORREL', mood: 'dawn', focus: 'queen',
    text: 'That is Vey\u2019s key. (A very small click, from very low down.) Vey made it for me, a long time ago, when it still loved me. I kept thinking the lock was for somebody tall. (The red through the gap goes the colour of a nightlight.) Can I come out? Not for long. Only as far as the landing.',
    choices: [
      { label: 'Turn the key, and step back', next: 'd6_dawn', set: 'promised_sorrel', add: { heart: 2, trust: 1, dread: -1 } },
    ],
  },
  ev_watch: {
    ch: 12, speaker: 'SORREL', mood: 'dawn', focus: 'queen', scare: 'eye',
    text: 'you read it. (The red blinks, slowly.) all of it? the bit at the bottom where the letters are big? nobody reads to the bottom. they look at the eye and they scream and they never read to the bottom. (Smaller now. Much smaller.) Sorrel. you can say it. i want to hear somebody say it while they are looking at me.',
    choices: [
      { label: 'Look at her, and say it: Sorrel', next: 'd7_named', set: 'named_eye', add: { heart: 2, dread: -3 } },
    ],
  },
};

// ---- detours: a side room off a day's road ----
// A detour is two scenes reached from one scene of its own day (`from`), offered once (`req: { noflag: 'dt_<day>' }`); every way out of its second
// scene goes back to that scene and sets the flag. It never reaches an ending and never changes the day's shape: it is more of the night, not another
// night. Each pays a little in stats. The graph test proves the shape (`detours`); add one by adding an entry here.
ABY.DETOURS = [
  { id: 'dt_d2', from: 'd2_captain', label: 'Ask him what the door looks like from his side', a: {
      ch: 6, speaker: 'GUARDIAN', mood: 'dusk', focus: 'guardian',
      text: 'From my side it was never a door. It was a wall with a keyhole, low down, at the height of a child. I kept my eye to it for the first ten years. After that I kept my ear to it, because the eye got tired and the ear did not.',
      choices: [{ label: 'Ask what he heard through it', add: { heart: 1 } }, { label: 'Ask why the keyhole is so low', add: { resolve: 1 } }] },
    b: { ch: 6, speaker: 'GUARDIAN', mood: 'dark', focus: 'guardian',
      text: 'A crayon. For a hundred years, a crayon going round and round on paper, and somebody humming eleven notes she had not learned yet. I never opened it. I was told to hold it, and holding is not opening. (He is quiet a long time.) Ask me the other thing now. The thing you came for.',
      choices: [{ label: 'Ask him for his name' }, { label: 'Let him rest a moment longer first', add: { dread: -1 } }] } },
  { id: 'dt_d3', from: 'd3_fork', label: 'Look closer at the wall between the three ways', a: {
      ch: 8, speaker: 'NARRATOR', mood: 'dark', focus: 'gate',
      text: 'Between the corridors the wall is papered, and the paper is drawings, hundreds, pinned edge to edge. Every one is a door. Some are coloured in. One is only half finished, the crayon pressed right through where a small hand stopped.',
      choices: [{ label: 'Trace the unfinished door with a finger', add: { heart: 1 } }, { label: 'Photograph the wall', add: { resolve: 1 } }] },
    b: { ch: 8, speaker: 'EYE', mood: 'dark', focus: 'gate',
      text: 'do not touch those. those are mine. (The red behind the paper brightens, then dims, embarrassed.) ...you can look. nobody looks at them. she used to put them on the fridge.',
      choices: [{ label: 'Tell the Eye they are good', add: { trust: 1 } }, { label: 'Step back to the fork' }] } },
  { id: 'dt_d4', from: 'd4_queen', label: 'Ask her what the stones sang before the water came', a: {
      ch: 9, speaker: 'QUEEN', mood: 'dusk', focus: 'queen',
      text: 'A song for counting. One for every name, so nobody is skipped. I taught it to a child once, to get her to sleep. She would never let me finish. She said if I got to the end, all the people would have to go home.',
      choices: [{ label: 'Ask her to sing the first line', add: { heart: 1 } }, { label: 'Ask her who the child was', add: { resolve: 1, dread: 1 } }] },
    b: { ch: 9, speaker: 'CHOIR', mood: 'dark', focus: 'gate',
      text: 'one. (A hundred voices, very far down, very gently.) two. (The water in the speaker trembles.) three. we will stop there. she never let us get further than three.',
      choices: [{ label: 'Thank them', add: { dread: -1 } }, { label: 'Ask them to keep counting', add: { resolve: 1, dread: 1 } }] } },
  { id: 'dt_d5', from: 'd5_book', label: 'Ask Wren to read you her line in the book', a: {
      ch: 10, speaker: 'WREN', mood: 'dusk', focus: 'queen',
      text: 'okay. it says: Wren, 9. Wren, 12. Wren, 15. it\'s me. it\'s my age, every time. (Paper turning.) it skips this year. there\'s a gap where this year should be. is that good? tell me that\'s good.',
      choices: [{ label: 'Tell her it is good', add: { heart: 1 } }, { label: 'Tell her you don\'t know', add: { trust: 1 } }] },
    b: { ch: 10, speaker: 'WREN', mood: 'dusk', focus: 'queen',
      text: 'ok. (A long breath.) i\'m drawing a line through the gap with my pen so nobody can write in it. it\'s a really thick line. i\'m going over it lots of times.',
      choices: [{ label: 'Tell her to go over it once more', add: { resolve: 1 } }, { label: 'Tell her that\'s enough now', add: { dread: -1 } }] } },
  { id: 'dt_d6', from: 'd6_page', label: 'Turn the first page over', a: {
      ch: 11, speaker: 'NARRATOR', mood: 'dark', focus: 'gate',
      text: 'On the back, in pencil, in a grown-up\'s small handwriting: a shopping list. Milk. Bread. Paper hats. Candles (4). Crayons, red. Underneath, crossed out so hard the paper tore: do not answer the phone.',
      choices: [{ label: 'Read the crossed-out line again', add: { resolve: 1, dread: 1 } }, { label: 'Fold the page back carefully', add: { heart: 1 } }] },
    b: { ch: 11, speaker: 'QUEEN', mood: 'dark', focus: 'queen',
      text: 'Her fourth birthday. I bought everything on that list. The phone rang while the candles were lit, and I answered it, because I always answer. (Silence.) Put the page back. Please. She will want it where she left it.',
      choices: [{ label: 'Put it back', add: { trust: 1 } }, { label: 'Ask her what the caller said', add: { dread: 1 } }] } },
  { id: 'dt_d7', from: 'd7_queen', label: 'Ask her what she will do at six', a: {
      ch: 12, speaker: 'QUEEN', mood: 'gate', focus: 'queen',
      text: 'At six? (She laughs, which you have never heard her do.) I have not thought past 3:07 in so long. Tea. I think I would like tea, in a cup that is only a cup, by a window that faces the right way.',
      choices: [{ label: 'Promise her the window', add: { heart: 1 } }, { label: 'Tell her not to plan yet', add: { resolve: 1 } }] },
    b: { ch: 12, speaker: 'VEY', mood: 'dark', focus: 'gate',
      text: 'How sweet. (Vey, from somewhere behind her, polite as a knife.) Tea at six. I will lay the table. I always lay the table. I would set one more place, but on the last night I never know who is going to need it.',
      choices: [{ label: 'Tell Vey to lay it for everyone', add: { trust: 1 } }, { label: 'Say nothing to Vey', add: { dread: 1 } }] } },
];
for (const d of ABY.DETOURS) {
  const a = d.id + '_a', b = d.id + '_b';
  ABY.NODES[a] = Object.assign({}, d.a, { detour: d.id, choices: d.a.choices.map(c => Object.assign({}, c, { next: b })) });
  ABY.NODES[b] = Object.assign({}, d.b, { detour: d.id, choices: d.b.choices.map(c => Object.assign({}, c, { next: d.from, set: d.id })) });
  ABY.NODES[d.from].choices.push({ label: d.label, next: a, req: { noflag: d.id } });
}

// ---- side roads: a longer way to the same place ----
// A road is three scenes offered beside one of a day's replies (`twin`, a choice of `from` matched by its label): the way in is a copy of that reply
// (the same cost, stats, flag and light; only its words and where it goes differ), every choice inside is free and does nothing, and the third
// scene goes where the reply goes. So taking the road is the reply said the long way round: it adds reading and never a state (graph `side-roads`
// proves it against the reply itself, flashlight on and off, and the walk steps through a road as it does a beat). Day Seven's is the second way
// into the last page. Add one by adding an entry here.
ABY.ROADS = [
  { id: 'sr2', from: 'd2_queen', twin: 'Believe her', label: 'Believe her, and help her count the hours she lost', scenes: [
    { speaker: 'QUEEN', mood: 'dusk', focus: 'queen', text: 'Then help me. (A photo arrives: a long room of clocks, every one of them stopped at a different minute.) These are mine. One for every night I slept through. I wound them all before I lay down, so that I would know how long. Not one of them kept going. Which one do I believe?',
      choices: ['Believe the earliest one', 'Believe none of them'] },
    { speaker: 'NARRATOR', mood: 'dusk', focus: 'queen', text: 'You read them out to her, one by one. 3:07. 3:07. 3:07. Every clock in the room, whatever its hands said a moment ago, says 3:07 when you look at it, and goes back when you look away. The Queen laughs, once, the way people laugh at bad news from a doctor. "So I have been asleep for a minute," she says. "A very long minute."',
      choices: ['Tell her a minute is not so long', 'Tell her you will keep count for her'] },
    { speaker: 'QUEEN', mood: 'dusk', focus: 'queen', text: 'Then keep it. (The clocks start, all of them at once, a sound like rain on a roof.) Vey will be waiting; Vey is always waiting. I want you to know that I believed you first. Whatever it tells you about me, I believed you before I believed it.',
      choices: ['Go and find Vey', 'Let her lead the way'] },
  ] },
  { id: 'sr3', from: 'd3_wake', twin: 'Go down to the first door', label: 'Go down the long way, past the portraits', scenes: [
    { speaker: 'NARRATOR', mood: 'dark', focus: 'queen', text: 'The long way is a gallery: portraits on both walls in heavy frames, of people holding phones. A girl on a night bus. A man in a lift. A woman in a bath, holding the phone up out of the water. Each of them has the screen turned towards the painter, and on every screen, very small, is a red dot.',
      choices: ['Look closer at the last portrait', 'Keep your eyes on the floor'] },
    { speaker: 'EYE', mood: 'dark', focus: 'queen', text: 'do you like them. i painted them. not with paint. (The last frame is empty. The brass plate under it has your name on it, engraved a little crooked, as if the engraver was nervous.) i have not started yours. i wanted to see your face first. it is harder than i thought. faces move.',
      choices: ['Tell it to leave the frame empty', 'Ask it who the girl on the bus was'] },
    { speaker: 'VEY', mood: 'dark', focus: 'vey', text: 'Don\'t stand there. It is rude to be looked at for so long. (Vey is at your ankle, tugging your sleeve with one of its hands.) The doors are this way. They are much worse than the gallery and much better than standing in it. Come along. I have never once let anyone get painted.',
      choices: ['Follow Vey to the doors', 'Take one last look back'] },
  ] },
  { id: 'sr4', from: 'd4_queen', twin: 'Tell her it was not kind', label: 'Tell her it was not kind, and go and see them yourself, along the shore', scenes: [
    { speaker: 'NARRATOR', mood: 'dark', focus: 'queen', text: 'The shore is made of phones. Old ones and new ones, a pager, a handset on a curly cord: thousands of them, washed up and stacked like pebbles, screens down. Every time a wave comes in, some of them light up underneath and buzz against the others, and then go out.',
      choices: ['Turn one over', 'Walk where the phones are dark'] },
    { speaker: 'CHOIR', mood: 'dark', focus: 'queen', text: 'that one was ours. (On the cracked screen: a photo of a dog in a garden, the time, 3:07, and forty-one missed calls from Mum.) we all kept them. you can not put it down, after. even down here you keep checking it. there might be a message.',
      choices: ['Put it back, screen down', 'Tell them you will read the messages to them'] },
    { speaker: 'NARRATOR', mood: 'dark', focus: 'queen', text: 'The stones are ahead now, knee-deep in the flood, every face turned towards you. Behind you, all along the shore, the phones have begun to light up one after another, not ringing, only lit, the way a crowd holds up its screens at a concert, all the way back to where you came in.',
      choices: ['Wade out to the stones', 'Raise a hand to them first'] },
  ] },
  { id: 'sr5', from: 'd5_truth', twin: 'Tell her about the book', label: 'Tell her about the book, from the first page you ever saw', scenes: [
    { speaker: 'WREN', mood: 'dusk', focus: 'queen', text: 'Wait. Wait, I\'m getting a pen. (A drawer, a lot of rattling, a pen that does not work and then one that does.) Okay. Say it slowly. I\'m writing it on my arm, because if I write it on paper I\'ll lose the paper, and I am not losing this.',
      choices: ['Start with the crayon door', 'Start with the singing stones'] },
    { speaker: 'WREN', mood: 'dusk', focus: 'queen', text: '(You can hear the pen moving on her skin.) A door. A crown. Two hundred and fourteen numbers. A blank line. (She stops.) It\'s going on its own. The pen. I\'m not pressing and it\'s still writing. It\'s writing the same number over and over, and the number is mine.',
      choices: ['Tell her to drop the pen', 'Tell her to keep hold of it and read it to you'] },
    { speaker: 'WREN', mood: 'dusk', focus: 'queen', text: 'It stopped. (A long breath.) My whole arm is my number, backwards, all the way up to the elbow, like a sleeve. I\'m not scared. That\'s the weird bit. It looks like a list, like somebody counting. Show me the book. Whatever it is, I want to see it with you.',
      choices: ['Open the book', 'Hold it up so she can see it too'] },
  ] },
  { id: 'sr6', from: 'd6_who', twin: 'Ask her where she is', label: 'Ask her to tell you about her room, one thing at a time', scenes: [
    { speaker: 'SORREL', mood: 'dusk', focus: 'queen', text: 'One thing? Okay. (Thinking, loudly.) A bed with a tent on it. The tent is a sheet. Under the sheet is where I keep the torch, but the torch went flat a long time ago, so I keep it for when it isn\'t flat. That\'s one thing. Is that one thing or is that three?',
      choices: ['Tell her that was three, and they were good ones', 'Ask her for one more'] },
    { speaker: 'SORREL', mood: 'dusk', focus: 'queen', text: 'A window with the curtains shut. I\'m not allowed to open them, because outside it\'s still the party, Mummy says, and if I see the party I\'ll want to go back to it and then I\'ll have to start again. (A small pause.) I can hear it. Somebody is always singing happy birthday, but they never get to the end.',
      choices: ['Ask her whose birthday it is', 'Hum the end of the song for her'] },
    { speaker: 'SORREL', mood: 'dusk', focus: 'queen', text: 'Mine. It\'s always mine. (Very quietly, as if she has been told not to say it.) I\'ve been four for ages. Do you want to see? I\'ll put the phone on the pillow so it can look round. Don\'t look at the door, though. The door is the last thing, and you said one thing at a time.',
      choices: ['Look round the room', 'Promise not to look at the door yet'] },
  ] },
  { id: 'sr7', from: 'd7_rite_win', twin: 'Go to the first page', label: 'Go to the first page the long way, through every room of the week', scenes: [
    { speaker: 'NARRATOR', mood: 'dawn', focus: 'gate', text: 'The way to the first page goes back through the week. The gate, propped open with a stone. The stairs, every step counted, the numbers chalked on the risers in your own handwriting. The Hall of Doors, every one of them open and every one of them empty, the way a house is empty on the morning after a party.',
      choices: ['Touch the gate as you pass', 'Read the numbers on the stairs'] },
    { speaker: 'NARRATOR', mood: 'dawn', focus: 'gate', text: 'The shore, and the phones on it, every screen lit and quiet. Wren\'s bedroom, the lamp mended, a pen lying on the duvet. The nursery, the door open, the crayon on the wall: a door, a crown, and under them, newer, in a careful grown-up hand, every name you said out loud this week, spelled right.',
      choices: ['Find your own name on the wall', 'Leave the nursery as it is'] },
    { speaker: 'QUEEN', mood: 'dawn', focus: 'gate', text: 'There you are. (She is waiting by the book, the flute under her arm.) You came the long way. Good. I wanted you to see it before the end: none of it is locked any more. Not the gate, not the doors, not the water. Only this. Come and stand by me. It is nearly six.',
      choices: ['Stand by her', 'Take her hand'] },
  ] },
];
for (const r of ABY.ROADS) {
  const from = ABY.NODES[r.from], twin = from.choices.filter(c => c.label === r.twin)[0], ch = from.ch, id = k => r.id + '_' + 'abc'[k];
  r.scenes.forEach((sc, k) => { ABY.NODES[id(k)] = { ch, speaker: sc.speaker, mood: sc.mood, focus: sc.focus, road: r.id, safe: true, text: sc.text,
    choices: sc.choices.map(label => ({ label, next: k < r.scenes.length - 1 ? id(k + 1) : twin.next, bat: 0, free: true })) }; });
  const way = Object.assign({}, twin, { label: r.label, next: id(0) }); delete way.as;   // the reply itself, said the long way: same cost, same stats, same flag
  from.choices.push(way);
}

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
  crown: { tag: 'TAKE THE CROWN FOR YOURSELF', name: 'The Crown of Shadows', hint: 'Take the crown for yourself.', mood: 'throne', fall: true,
    text: 'The crown settles on her brow and the whole void bows. It is a very quiet kind of power. Somewhere far away, a flute falls to the floor.' },
  hollow: { tag: 'LOCK THE DOOR AGAIN', name: 'The Hollow Queen', hint: 'Let the dread take her, or lock the door again.', mood: 'dark', fall: true,
    text: 'The door locks. The key is warm. By morning she can no longer remember which side of it she is standing on, and the Hollows kneel to what they take for a queen.' },
  eye: { tag: 'ANSWER THE EYE', name: 'The Eye Opens', hint: 'Climb the stairs and answer the Eye.', mood: 'throne', fall: true,
    text: 'She answers, and the Eye opens all the way. It is not hungry. It is lonely, and now it is looking at everything that ever looked away. The phone goes warm in your hand. Your reflection in the black glass blinks half a second late.' },
  mirror: { tag: 'TAKE HIS PLACE IN THE DARK', name: 'The Other Queen', hint: 'Learn the truth in the vault, and pay for it.', mood: 'dark',
    text: 'She takes his place in the dark, and the door swings shut on the right side. The Guardian climbs into the light, free, weeping. Her thin voice reaches you one last time through the phone: "Hold the line. Someone has to be on this side."' },
  betrayal: { tag: 'TRUST VEY WHEN YOU SHOULD NOT', name: 'Vey’s Smile', hint: 'Trust Vey after you have seen what Vey is.', mood: 'dark', fall: true,
    text: 'The gate opens and Vey is the first thing through it. It turns, takes one polite step back toward her, and smiles with a mouth much too wide. "Thank you for trusting me," it says in the Queen\'s voice. "It is so hard to wear someone who is paying attention."' },
  daybreak: { tag: 'DAY TWO: SAY THEIR NAMES, OPEN THE DOOR', name: 'Real Morning', hint: 'On Day Two, know the Guardian\'s name and open the door. The door only opens for someone it has seen before.', mood: 'dawn',
    text: 'You say both names together, and the door is only a door. Behind it there is a window, and in the window there is a thin grey line that gets brighter. 3:07 becomes 3:08. Then 6:00. The phone chimes once, like a bell in a village a long way off, and for the first time in a very long time nobody is awake who should not be.' },
  keeper: { tag: 'DAY TWO: HOLD THE DOOR YOURSELF', name: 'The Night Keeper', hint: 'On Day Two, hold the door so she can sleep.', mood: 'throne', cont: 'd3_wake',
    text: 'You hold the door so she can sleep. It is not so heavy, at first. The Guardian lies down in the warm grass and the Queen finally dreams something that is not a flute. On the phone it will always be 3:07, and your name will be the only message on it, and it will say: someone has to be on this side.' },
  loop: { tag: 'DAY TWO: TURN THE PHONE OFF', name: '3:07 Again', hint: 'On Day Two, turn the phone off, or give it away.', mood: 'dark', fall: true,
    text: 'The phone goes black and then, politely, it turns itself back on. 3:07. A new message from a number you do not know: you should not have woken up. The Queen opens her eyes on the floor of a very familiar room and has no idea who you are, and you cannot be certain, any more, that you do.' },
  chorus: { tag: 'DAY THREE: SING ALL THREE RITES AS ONE', name: 'The Eye Remembered', hint: 'On Day Three, win all three rites, then sing them as one.', mood: 'dawn', cont: 'd4_wake',
    text: 'You sing the doors and the red corridor and the lullaby as one song, and the Eye, which has never been sung to, sings the last line back, a little wrong, perfectly. Every door in the Abyss opens at once, and for the first time anything that was ever watched there is allowed to look away.' },
  watched: { tag: 'DAY THREE: LOOK AWAY', name: 'The Watched', hint: 'On Day Three, look away from the Eye.', mood: 'dark', cont: 'd4_wake',
    text: 'You look away. It is such a small thing. The Eye does not mind, not exactly. It only learns, very slowly, what it is to be looked away from, and starts to practise on you: every screen, every window, every dark glass you ever pass. It is always, quietly, watching.' },
  names: { tag: 'DAY FOUR: SAY EVERY NAME, CLOSE THE BOOK', name: 'The Last Name', hint: 'On Day Four, read every name, finish the Drowned Choir\'s song, then close the book. It only closes for someone who has been here many times.', mood: 'dawn',
    text: 'You say all two hundred and fourteen names, and then your own, and then you close the book. It is only a contact, in the end: it deletes like anything else. In the cave the water is gone, and the stones are only stones, and they are quiet. The phone shows 3:07 for one more second. Then, for the first time in four days, it shows the right time.' },
  caller: { tag: 'DAY FOUR: WRITE THE NEXT NAME', name: 'The Next Caller', hint: 'On Day Four, write a name on the blank line.', mood: 'dark', cont: 'd5_wake',
    text: 'Message sent. It is so much lighter, the way it promised. Somewhere across town a phone lights up on a bedside table, 3:07, from a number they do not know, and someone you love sits up in the dark. You were never the one being haunted. You were the next voice in the phone.' },
  drowned: { tag: 'DAY FOUR: STAY IN THE WATER', name: 'The Drowned Choir', hint: 'On Day Four, stay with the choir under the water.', mood: 'dark', fall: true,
    text: 'The water closes over the screen and it is warm, as they said. You find the tune at once: everyone does, down here. Two hundred and fifteen voices now, mouthing eleven slow notes. The next person who wakes up in the cave will think the stones are singing.' },
  warned: { tag: 'DAY FIVE: WAKE EVERY NUMBER IN THE BOOK', name: 'The Warning', hint: 'On Day Five, tell Wren the truth, win the 3:07 Wake-Up, then have her call the first number. It only works for someone who has found many endings.', mood: 'dawn',
    text: 'She makes the call. Two hundred and fourteen phones ring at once in two hundred and fourteen kitchens, in the grey, in daylight, and every one of them is picked up by someone who was ready. The book deletes itself a name at a time. At 6:00 a message comes in from a number you do not know, in handwriting you know from birthday cards: thank you for waking us. At 6:01 the phone, for the first time, is only a phone.' },
  nightline: { tag: 'DAY FIVE: STAY ON THE LINE', name: 'The Night Line', hint: 'On Day Five, tell Wren the truth and promise to stay on the line.', mood: 'gate', cont: 'd6_wake',
    text: 'You promise to stay on the line, and you do. Every night at 3:07 the phone rings, and she picks up, and you talk about nothing: school, her stupid cat, what the stairs sounded like. It is the first time the phone has ever been used to keep someone company. The book never closes. But in all the long years after, nobody else ever has to be the next name.' },
  passed: { tag: 'DAY FIVE: HANG UP', name: 'Everyone Gets a Turn', hint: 'On Day Five, hang up on Wren and leave her to the book.', mood: 'dark', cont: 'd6_wake',
    text: 'You hang up. It is so light. Across the room Wren is looking at a phone that says 3:07, and then at the blank line in the contact that is already selected, and then at the dark corner of her room that is, just now, not entirely empty. She is very good at doing what she is told. She picks up her phone and she thinks of someone she loves.' },
  firstpage: { tag: 'DAY SIX: FIND THE FIRST PAGE, COME BACK FOR THE LAST', name: 'The First Page', hint: 'On Day Six, find out whose number is on the first page, and promise to come back.', mood: 'gate', cont: 'd7_wake',
    text: 'You put the phone down at six and it stays down. The first page is still open on it: a crayon door, a crayon crown. Somebody small drew that, and somebody grown wrote forgive me under it, and both of them have been waiting a very long time for the same thing. Tomorrow is the seventh night. You said you would come back. In the gap of a door you cannot see from here, something red and round closes, for the first time in years, and sleeps.' },
  cradle: { tag: 'DAY SIX: GO IN AND STAY WITH HER', name: 'The Cradle', hint: 'On Day Six, go through the door and keep Sorrel company.', mood: 'dark', fall: true,
    text: 'You go in, and the door closes behind you, gently, the way you close a door on someone sleeping. It is warm. There are paper hats. Sorrel is so pleased she cannot speak, and then cannot stop. Outside, the phone lies face up on a bed in an empty room, 3:07, and the first page has a second name on it now, in crayon, pressed very hard: yours. Somebody always has to be in here with her. It may as well be someone who said her name.' },
  seventh: { tag: 'DAY SEVEN: READ THE FIRST PAGE, SAY HER NAME, CLOSE THE BOOK', name: 'The Seventh Morning', hint: 'On Day Seven, win the Seventh Night, call the Eye by its name and have told Wren the truth, then close the book. It only closes for someone who has found many endings.', mood: 'dawn',
    text: 'You read the first page out loud, crayon and all, and then you say her name, Sorrel, and the door is only a door, and a small girl in a paper hat walks out of it into her mother\'s arms, and both of them are crying, and neither of them is four any more, or a queen. Then every name, all two hundred and fourteen, and Wren\'s, and yours. Then you close the book. It is 6:00. It is 6:01. The phone, for the first time in seven days, is only a phone, and the next time you wake up, you will not remember any of this, and you will not need to.' },
  throne: { tag: 'DAY SEVEN: TAKE THE QUEEN\'S PLACE', name: 'The Seventh Queen', hint: 'On Day Seven, take the Queen\'s place and keep the book shut.', mood: 'throne',
    text: 'You take the flute and the crown of folded wings, and the Queen walks down out of the haze, light, old, toward a door she can finally go through. Nobody else writes a name. Nobody else wakes at 3:07. Only you, on a throne at the bottom of the dark, holding the book shut with both hands, for as long as it takes. It is a very quiet kind of love. Some nights you hear a child laughing on the other side of the door, and it is enough.' },
  again: { tag: 'DAY SEVEN: LET IT BE 3:07 AGAIN', name: 'Day One, Again', hint: 'On Day Seven, let it begin again.', mood: 'dark', fall: true,
    text: 'It is 3:07. Something wakes you. Not a sound: the end of one. You are somewhere you do not remember coming to, a lift, a bath, a night bus, a shore, and the phone in your hand is warm, as if someone was holding it while you slept. You cannot remember your name. You can remember, very faintly, that you have been brave before. There is a message waiting. It will be different this time. It is always different this time.' },
  lowdoor: { tag: 'DAY SEVEN: NAME WHO KEPT IT 3:07, THEN GIVE HER THE KEY', name: 'The Low Door', hint: 'On Day Seven, lay out your notes and name who kept it 3:07. You will need to have pinned who she locked away, and to have let Vey take your hand on the stairs on Day Three.', mood: 'dawn',
    text: 'The Queen holds the key for a long time. Then she kneels, the way you kneel to a door that only comes up to your waist, and slides it under, and takes her hand away. Nothing happens. Nothing happens for so long that the Choir starts, very softly, to hum. Then, low down, where only a child could reach, the lock turns from the inside. Sorrel opens the door herself. She is four, and she has a crayon in her fist, and she looks at her mother for a long, long time before she decides. She decides. The book closes on its own. Two hundred and fourteen names go quiet, one by one, like lights in a street at morning. Your phone says 6:00, and then 6:01, and it has never once in seven nights said 6:01.' },
  blackout: { tag: 'LET THE BATTERY DIE', name: 'Zero Percent', hint: 'Let the battery die in the dark.', mood: 'dark', fall: true,
    text: 'The screen goes black and stays black. In the glass you can see your own face, lit from beneath by nothing. Somewhere very close, very gently, something starts to knock on the other side of the screen.' },
};
ABY.ENDING_IDS = Object.keys(ABY.ENDINGS);

// CODAS: the same ending, closed by what she actually did. When an ending lands, the people she met text her one last time (`who`), for whoever holds
// the flag (`req`, like a choice's), before the end stamp; at most ABY.CODA_MAX of them, in this order. They change no ending, no Gallery tile and no
// share card: the ending is still the ending. They are pure data, so the graph test can prove each one's flag is set on a scene that can lead to it.
ABY.CODA_MAX = 2;
ABY.CODAS = [
  { id: 'c_dawn_heard', end: 'dawn', req: { flag: 'heard' }, who: 'QUEEN', text: 'The gate is open and I can feel the draught. I can still hear the recording you played, too. I think I will always hear both.' },
  { id: 'c_dawn_vey', end: 'dawn', req: { flag: 'vey_trusted' }, who: 'VEY', text: 'You trusted me at the gate. Remember that you did, later, when it costs more.' },
  { id: 'c_dawn_marked', end: 'dawn', req: { flag: 'marked' }, who: 'EYE', text: 'you walked through and you did not look back at me. that is all right. i looked enough for both of us.' },
  { id: 'c_song_carried', end: 'song', req: { flag: 'carried' }, who: 'QUEEN', text: 'You sat with me on the stairs and then you played the whole song. I did not know one person could do both in a night.' },
  { id: 'c_song_choir', end: 'song', req: { flag: 'choir' }, who: 'CHOIR', text: 'we heard it through the water. every note. we have been trying to hum it back to you all morning.' },
  { id: 'c_echo_lullaby', end: 'echo', req: { flag: 'lullaby' }, who: 'QUEEN', text: 'That was my lullaby you sang. I had forgotten the second verse. You had not.' },
  { id: 'c_echo_asked', end: 'echo', req: { flag: 'asked_eye' }, who: 'EYE', text: 'you asked me what i wanted. behind every one of those gates, that is the question i keep hearing.' },
  { id: 'c_silence_doubt', end: 'silence', req: { flag: 'doubt' }, who: 'VEY', text: 'You trusted no one tonight, and the gate opened anyway. Isn’t that interesting. I am writing it down.' },
  { id: 'c_silence_ledger', end: 'silence', req: { flag: 'ledger' }, who: 'GUARDIAN', text: 'You found the ledger and still you walked on alone. Read it again, when you have someone to read it to.' },
  { id: 'c_silence_marked', end: 'silence', req: { flag: 'marked' }, who: 'EYE', text: 'it was so quiet when you left. i did not know a gate could be that quiet. i am practising.' },
  { id: 'c_crown_heard', end: 'crown', req: { flag: 'heard' }, who: 'QUEEN', text: 'That was my crown. I heard you put it on. It does not come off. I tried, for a very long time.' },
  { id: 'c_crown_vey', end: 'crown', req: { flag: 'vey_trusted' }, who: 'VEY', text: 'Long live the Queen. I mean it. I always mean it, the first time.' },
  { id: 'c_hollow_carried', end: 'hollow', req: { flag: 'carried' }, who: 'QUEEN', text: 'You sat with me on the stairs, and then you locked the door. I keep thinking about the sitting.' },
  { id: 'c_hollow_truth', end: 'hollow', req: { flag: 'truth' }, who: 'GUARDIAN', text: 'You knew the truth and you turned the key anyway. I am not angry. I know what a key weighs.' },
  { id: 'c_eye_marked', end: 'eye', req: { flag: 'marked' }, who: 'EYE', text: 'you looked first. i only looked back. now we are both looking, for ever, and it is not lonely at all.' },
  { id: 'c_eye_asked', end: 'eye', req: { flag: 'asked_eye' }, who: 'EYE', text: 'you asked what i wanted. this. this is what i wanted. thank you thank you thank you' },
  { id: 'c_eye_choir', end: 'eye', req: { flag: 'choir' }, who: 'CHOIR', text: 'we felt the stairs go still. we will sing for you as well, now. there is room.' },
  { id: 'c_mirror_truth', end: 'mirror', req: { flag: 'truth' }, who: 'QUEEN', text: 'You learned the truth, and then you paid for it. I am out. I am in the light. I keep looking at my hands.' },
  { id: 'c_mirror_ledger', end: 'mirror', req: { flag: 'ledger' }, who: 'GUARDIAN', text: 'Your name is in the ledger now, under mine. I crossed mine out. I have left yours. I did not know if I was allowed.' },
  { id: 'c_mirror_doubt', end: 'mirror', req: { flag: 'vey_doubt' }, who: 'VEY', text: 'You never did trust me. And now you are the one in the dark. I will visit. I visit everyone.' },
  { id: 'c_betrayal_heard', end: 'betrayal', req: { flag: 'heard' }, who: 'QUEEN', text: 'That was not me at the gate. I want you to know that. It used my voice. I heard it use my voice.' },
  { id: 'c_betrayal_vey', end: 'betrayal', req: { flag: 'vey_trusted' }, who: 'VEY', text: 'I wore her voice to say thank you. The thank you was mine, though. I want you to have that.' },
  { id: 'c_daybreak_name', end: 'daybreak', req: { flag: 'freed_name' }, who: 'GUARDIAN', text: 'Morning. I wrote my name on the window and watched it fade, and I did not mind. I know where it is now.' },
  { id: 'c_daybreak_ally', end: 'daybreak', req: { flag: 'ally' }, who: 'EYE', text: '6:00. i have never seen 6:00. it is grey. it is so grey. thank you.' },
  { id: 'c_daybreak_vey', end: 'daybreak', req: { flag: 'vey_held' }, who: 'VEY', text: 'Real morning. I have no shadow in it. You held my hand anyway. I will remember which hand.' },
  { id: 'c_keeper_name', end: 'keeper', req: { flag: 'freed_name' }, who: 'GUARDIAN', text: 'You are holding my door. Lean on it with your shoulder, not your hands. Your hands will want to let go.' },
  { id: 'c_keeper_vey', end: 'keeper', req: { flag: 'vey_known' }, who: 'VEY', text: 'You said my name, so I know where you are now. I will bring you something to sit on. It is a long shift.' },
  { id: 'c_keeper_carried', end: 'keeper', req: { flag: 'carried' }, who: 'QUEEN', text: 'You let me sleep. You sat with me on the stairs once, and now you are sitting with the door. I dreamt of grass.' },
  { id: 'c_loop_name', end: 'loop', req: { flag: 'knew_name' }, who: 'GUARDIAN', text: 'You knew my name. Say it again when the phone comes back on. Please. It always comes back on.' },
  { id: 'c_loop_refused', end: 'loop', req: { flag: 'refused_vey' }, who: 'VEY', text: 'You switched it off. You switched me off too, once. It is a very human habit, switching things off.' },
  { id: 'c_chorus_lamp', end: 'chorus', req: { flag: 'corvin_lamp' }, who: 'GUARDIAN', text: 'Every door opened, and your lamp was at the end of each one. I walked through all of them. I took my time.' },
  { id: 'c_chorus_hand', end: 'chorus', req: { flag: 'vey3_hand' }, who: 'VEY', text: 'You held my hand on the stairs and then you sang. I did not know a hand of mine could end up in a song.' },
  { id: 'c_chorus_marked', end: 'chorus', req: { flag: 'marked' }, who: 'EYE', text: 'you looked at me on the first night. you sang to me on the third. nobody has done either. now i know what both are for.' },
  { id: 'c_watched_marked', end: 'watched', req: { flag: 'marked' }, who: 'EYE', text: 'you looked at me once. now you look away. i keep the first one in the drawer and take it out when you are not looking. which is always.' },
  { id: 'c_watched_asked', end: 'watched', req: { flag: 'asked_eye' }, who: 'EYE', text: 'you asked me what i wanted. i did not know then. i know now. i want you to turn around.' },
  { id: 'c_watched_skip', end: 'watched', req: { flag: 'skipped_doors' }, who: 'GUARDIAN', text: 'You skipped the doors and then you looked away. I know that habit. I had it for a hundred years.' },
  { id: 'c_names_read', end: 'names', req: { flag: 'read_names' }, who: 'CHOIR', text: 'you said us. every one. two hundred and fourteen, and then quiet. we did not know quiet could sound like our own names.' },
  { id: 'c_names_refused', end: 'names', req: { flag: 'refused_next' }, who: 'EYE', text: 'you would not write a name on the line, so the book had nothing left to eat. it closed hungry. good.' },
  { id: 'c_names_door', end: 'names', req: { flag: 'corvin_door' }, who: 'GUARDIAN', text: 'The book is shut and my door is open. I have not gone through it yet. I wanted to tell you first.' },
  { id: 'c_caller_read', end: 'caller', req: { flag: 'read_names' }, who: 'CHOIR', text: 'you read us all, and then you wrote one more. we have made room. we always make room.' },
  { id: 'c_caller_vey', end: 'caller', req: { flag: 'vey_held' }, who: 'VEY', text: 'Who did you write? No. Don’t tell me. I like to find out.' },
  { id: 'c_drowned_read', end: 'drowned', req: { flag: 'read_names' }, who: 'CHOIR', text: 'you know all our names already. that makes it so much easier. sing now. it is the same tune for everyone.' },
  { id: 'c_drowned_name', end: 'drowned', req: { flag: 'freed_name' }, who: 'GUARDIAN', text: 'You gave me my name back. Down there they take yours. Hold on to it. Say it under your breath.' },
  { id: 'c_warned_truth', end: 'warned', req: { flag: 'told_truth' }, who: 'WREN', text: 'everyone picked up. my mum picked up. she said who is this and i said nobody, go back to sleep, and she did. it was 6am. it was normal.' },
  { id: 'c_warned_salt', end: 'warned', req: { flag: 'used_salt' }, who: 'WREN', text: 'i put the jar of salt on the windowsill anyway. not because of anything. just because it was from you.' },
  { id: 'c_warned_riff', end: 'warned', req: { flag: 'riff_done' }, who: 'WREN', text: 'i keep playing the riff. i know the whole thing now. i am going to teach it to my cat.' },
  { id: 'c_nightline_salt', end: 'nightline', req: { flag: 'used_salt' }, who: 'WREN', text: '3:07. hi. it’s me. the salt line is still on the sill. my cat licked it. she is fine. are you there?' },
  { id: 'c_nightline_riff', end: 'nightline', req: { flag: 'riff_done' }, who: 'WREN', text: 'can we play the riff again tonight. over the phone. you do the low bit.' },
  { id: 'c_nightline_refused', end: 'nightline', req: { flag: 'refused_next' }, who: 'EYE', text: 'you would not write a name, and now you will not hang up. i do not understand you. i am listening anyway.' },
  { id: 'c_passed_truth', end: 'passed', req: { flag: 'told_truth' }, who: 'WREN', text: 'you told me the truth and then you hung up. i keep reading the truth part. i keep stopping before the end.' },
  { id: 'c_passed_salt', end: 'passed', req: { flag: 'used_salt' }, who: 'WREN', text: 'the salt didn’t do anything. or it did, and it wasn’t enough. i’m writing a name. i’m sorry. i’m sorry.' },
  { id: 'c_firstpage_crayon', end: 'firstpage', req: { flag: 'used_crayon' }, who: 'SORREL', text: 'you wrote under my wall. i drew a door round it so nobody can rub it out.' },
  { id: 'c_firstpage_sorrel', end: 'firstpage', req: { flag: 'eye_is_sorrel' }, who: 'SORREL', text: 'you know it is me. you know my name now. come back tomorrow. you said.' },
  { id: 'c_firstpage_promise', end: 'firstpage', req: { flag: 'promised_sorrel' }, who: 'EYE', text: 'you promised. i will not close until you come. i have never had a promise keep me open before.' },
  { id: 'c_cradle_crayon', end: 'cradle', req: { flag: 'used_crayon' }, who: 'SORREL', text: 'you are in here now!! we can draw together. i saved you the red.' },
  { id: 'c_cradle_promise', end: 'cradle', req: { flag: 'promised_sorrel' }, who: 'QUEEN', text: 'You promised her you would come back, and then you went in and stayed. That is a better promise than mine ever was.' },
  { id: 'c_cradle_shard', end: 'cradle', req: { flag: 'used_shard' }, who: 'EYE', text: 'you showed me the mirror and then you came in anyway. you are the only one who has seen what i look like and stayed.' },
  { id: 'c_seventh_named', end: 'seventh', req: { flag: 'named_eye' }, who: 'SORREL', text: 'you said my name like it was a person’s name. mum says it like that now too.' },
  { id: 'c_seventh_wren', end: 'seventh', req: { flag: 'wren_with' }, who: 'WREN', text: 'it’s 6:01. i have never been awake at 6:01 and not scared. thank you for letting me come.' },
  { id: 'c_seventh_board', end: 'seventh', req: { flag: 'board_out' }, who: 'GUARDIAN', text: 'You laid every note out on the floor until it made a picture. I am told it looked like a door.' },
  { id: 'c_throne_promise', end: 'throne', req: { flag: 'promised_sorrel' }, who: 'SORREL', text: 'you are on mummy’s chair. it is too big for you. i can hear you through the door. goodnight.' },
  { id: 'c_throne_loop', end: 'throne', req: { flag: 'knows_loop' }, who: 'VEY', text: 'You knew it would loop, and you sat down anyway. That is the bravest stupid thing I have watched in a very long time.' },
  { id: 'c_throne_truth', end: 'throne', req: { flag: 'told_truth' }, who: 'WREN', text: 'nobody writes my name now. nobody writes any name. the phone rings once a year at 3:07 and nobody is on it. i think it’s you saying you’re fine.' },
  { id: 'c_again_loop', end: 'again', req: { flag: 'knows_loop' }, who: 'VEY', text: 'You knew it would loop. You let it. I will see you at the beginning. I am always at the beginning.' },
  { id: 'c_again_salt', end: 'again', req: { flag: 'used_salt' }, who: 'WREN', text: 'there is salt on my windowsill and i don’t know why. do you know why' },
  { id: 'c_again_named', end: 'again', req: { flag: 'named_eye' }, who: 'EYE', text: 'you said my name, and then you let it all start again. now nobody knows it. say it sooner, next time.' },
  { id: 'c_lowdoor_crayon', end: 'lowdoor', req: { flag: 'used_crayon' }, who: 'SORREL', text: 'mum read what you wrote under my wall. she read it twice. then she drew a door. hers is wonky.' },
  { id: 'c_lowdoor_hand', end: 'lowdoor', req: { flag: 'vey3_hand' }, who: 'VEY', text: 'You took my hand on the stairs, four nights ago. I wanted you to know where it led. It led here. I am glad it was my hand.' },
  { id: 'c_lowdoor_board', end: 'lowdoor', req: { flag: 'board_out' }, who: 'QUEEN', text: 'You laid it all out, and you saw what I did, and you still gave me the key. I do not know what to call that. She calls it fair.' },
  { id: 'c_blackout_marked', end: 'blackout', req: { flag: 'marked' }, who: 'EYE', text: 'it is dark now. i can see you better in the dark. i always could.' },
  { id: 'c_blackout_heard', end: 'blackout', req: { flag: 'heard' }, who: 'QUEEN', text: 'Your screen went out. I know what that sounds like from the inside. Knock twice if you can hear me.' },
];
// and whoever she was hears from Wren last: one line for a fall, one for an ending that carries on, one for an ending that is final (always after the others)
ABY.HERO_CODAS = [
  { id: 'hc_rowan_fall', hero: 'rowan', kind: 'fall', who: 'WREN', text: 'Rowan? Your phone went dead at 3:07, so I sat on the landing and counted to forty. Then I counted again. I am going to keep counting until you pick up. That is the rule. You made the rule.' },
  { id: 'hc_rowan_cont', hero: 'rowan', kind: 'cont', who: 'WREN', text: 'I slept right through. First night in nine years nobody had to turn me round. Was that you? It was you. Go to bed, Rowan. You can stop counting for one night.' },
  { id: 'hc_rowan_end', hero: 'rowan', kind: 'end', who: 'WREN', text: 'It is quiet on the landing. Whatever you did down there, the stairs stopped creaking at six. I walked down all twelve and there was only the doormat. Rowan, you can stop counting now.' },
  { id: 'hc_ellis_fall', hero: 'ellis', kind: 'fall', who: 'WREN', text: 'Ellis? The flute is on my pillow again and it is cold this time. I played eleven notes into the phone and stopped, the way you taught me. Please play the twelfth back. Please play anything.' },
  { id: 'hc_ellis_cont', hero: 'ellis', kind: 'cont', who: 'WREN', text: 'Somebody was humming under my window all night. Your hum, the one before a lesson. I did not open the curtain. I just let it be Thursday for a while.' },
  { id: 'hc_ellis_end', hero: 'ellis', kind: 'end', who: 'WREN', text: 'I got the taped flute out this morning and played all the way to the end of the song, the last note too, for the first time ever. It was not scary. It was only a note. Thank you, Ellis.' },
  { id: 'hc_jude_fall', hero: 'jude', kind: 'fall', who: 'WREN', text: 'Jude, the monitors on the ward blinked at 3:07 and the night sister said your name and nobody answered. I am holding the bracelet. I am not hanging up. You taught me that.' },
  { id: 'hc_jude_cont', hero: 'jude', kind: 'cont', who: 'WREN', text: 'I slept through 3:07 and woke at six and nobody was holding my hand, and that was all right, because somebody had been. Go home, Jude. Your shift is over.' },
  { id: 'hc_jude_end', hero: 'jude', kind: 'end', who: 'WREN', text: 'The ward rang. Bed nine is empty: the boy went home this morning, waving all the way down the corridor. They said to tell the nurse. So I am telling the nurse.' },
];
ABY.heroCoda = function (id, s) { const E = ABY.ENDINGS[id], k = !E ? '' : E.fall ? 'fall' : E.cont ? 'cont' : 'end'; return ABY.HERO_CODAS.filter(c => s && c.hero === s.hero && c.kind === k)[0] || null; };
ABY.codasFor = function (id, s) { const h = ABY.heroCoda(id, s); return ABY.CODAS.filter(c => c.end === id && ABY.okReq(s, c.req)).slice(0, ABY.CODA_MAX).concat(h ? [h] : []); };

// ---- falls and checkpoints ----
// A FALL is an ending where she dies or loses herself (fall: true). It goes in the Gallery like any other, but it never carries on to the next day.
// Instead the phone keeps a CHECKPOINT: the state at the start of the day (the opening, or the dawn a good ending carried her into), and a journey
// has ABY.WAKES wakes. Waking from a fall goes back to that dawn and costs a wake and a little dread (the night remembers); with none left, the
// journey is over and only a new one is possible.
ABY.WAKES = 3;
ABY.isFall = function (id) { return !!(ABY.ENDINGS[id] && ABY.ENDINGS[id].fall); };
// SCARS: every fall a player has suffered (it is in their Gallery) marks every later journey: a flag `scar_<fall>` a choice can ask for
// (someone who has died this way before sees a way past it) and a note from their past self. `found` is the Gallery ({ id: 1 }) or a list.
ABY.scarsOf = function (found) {
  const has = Array.isArray(found) ? (id => found.indexOf(id) >= 0) : (id => !!(found && found[id]));
  return ABY.ENDING_IDS.filter(id => ABY.isFall(id) && has(id));
};
// the dawn she wakes at (a copy of the checkpoint), or null when there is no checkpoint or no wake left. `mem` is what she has found by now, and
// `found` her Gallery: she wakes remembering every fall so far, the one she just suffered included (its scar, and its note).
ABY.wake = function (cp, wakes, mem, found) {
  if (!cp || !ABY.NODES[cp.node] || !(wakes > 0)) return null;
  const o = Object.assign({}, cp, { flags: Object.assign({}, cp.flags), notes: (cp.notes || []).slice(), mem: Math.max(cp.mem || 0, Number.isInteger(mem) ? mem : 0), dread: Math.min(ABY.MAX_DREAD - 1, (cp.dread || 0) + 1), tries: 0, back: '' });
  for (const id of ABY.scarsOf(found)) { o.flags['scar_' + id] = 1; if (o.notes.indexOf('scar_' + id) < 0) o.notes.push('scar_' + id); }
  for (const id of ABY.echoesOf(found)) o.flags['echo_' + id] = 1;
  return o;
};

// ---- state ----
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
ABY.newState = function (mem, open, scars, apps) {
  const s = { node: ABY.OPENINGS.indexOf(open) >= 0 ? open : ABY.START, mem: Number.isInteger(mem) ? clamp(mem, 0, 99) : 0, heart: 0, resolve: 0, trust: 0, dread: 0, bat: ABY.BAT0, light: 0, flags: {}, notes: [], tries: 0, choices: 0, back: '', open: ABY.OPENINGS.indexOf(open) >= 0 ? open : ABY.START, hero: '' };   // `open`: how this journey began (a message can remember it)
  for (const id of ABY.scarsOf(scars)) { s.flags['scar_' + id] = 1; s.notes.push('scar_' + id); }
  for (const id of ABY.echoesOf(scars)) s.flags['echo_' + id] = 1;
  for (const id of ABY.appsOf(apps)) s.flags['app_' + id] = 1;
  return s;
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
  if (r.open && s.open !== r.open) return false;
  if (r.hero && s.hero !== r.hero) return false;
  if (r.flag && !s.flags[r.flag]) return false;
  if (r.noflag && s.flags[r.noflag]) return false;
  if (r.all) for (const f of r.all) if (!s.flags[f]) return false;
  if (r.min) for (const k in r.min) if ((s[k] || 0) < r.min[k]) return false;
  if (r.maxDread !== undefined && s.dread > r.maxDread) return false;
  if (r.minDread !== undefined && s.dread < r.minDread) return false;
  if (r.bond && ((r.bond.min !== undefined && ABY.bond(s, r.bond.who) < r.bond.min) || (r.bond.max !== undefined && ABY.bond(s, r.bond.who) > r.bond.max))) return false;
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
  const o = { node: c.next, mem: s.mem || 0, heart: s.heart, resolve: s.resolve, trust: s.trust, dread: s.dread, bat: s.bat, light: s.light, flags: Object.assign({}, s.flags), notes: s.notes.slice(), tries: s.tries, choices: s.choices + 1, back: s.back, open: s.open, hero: s.hero || '' };
  if (c.next === '@back') { o.node = s.back || ABY.START; o.back = ''; }
  else if (ABY.NODES[c.next] && ABY.NODES[c.next].time && !(n && n.time)) o.back = s.node;       // a time slip: remember where she was, every choice in it comes back
  if (!ABY.NODES[o.node]) return null;
  if (c.add) { for (const k of ABY.STATS) if (c.add[k]) o[k] = clamp(o[k] + c.add[k], 0, 5); if (c.add.dread) o.dread = clamp(o.dread + c.add.dread, 0, ABY.MAX_DREAD); }
  if (c.set) o.flags[c.set] = 1;
  if (c.retry) o.tries++;
  if (c.light !== undefined) o.light = c.light ? 1 : 0;
  if (!c.free) o.bat -= (c.bat !== undefined ? c.bat : 1) + (s.light ? ABY.TORCH : 0);   // a `free` choice (a beat's way on) costs nothing, not even the flashlight's
  return ABY._land(o);
};

// she arrives at o.node: a dark room without the light frightens her, a clue is filed, and the phone or her mind can break first
ABY._land = function (o) {
  const n = ABY.NODES[o.node];
  if (n.note && o.notes.indexOf(n.note) < 0) o.notes.push(n.note);
  for (const m of ABY.overnightFor(o)) if (m.note && o.notes.indexOf(m.note) < 0) o.notes.push(m.note);   // overnight messages can file a clue
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

// the evidence board (Notes, not a story choice): pin clues a and b together. Returns the new state, with `linked` = the deduction or null, or null
// when it can't be done (a clue she doesn't hold, the same clue twice, a pair already pinned, an ending). A wrong pair costs 2 battery and 1 dread,
// but never kills the phone or tips her into the hollowing from inside Notes (it stops at 1% and at one short of the edge).
ABY.link = function (s, a, b) {
  const n = ABY.NODES[s.node];
  if (!n || n.ending || n.song || a === b || s.notes.indexOf(a) < 0 || s.notes.indexOf(b) < 0) return null;
  const L = ABY.linkOf(a, b); if (L && s.flags['link_' + L.id]) return null;
  const o = Object.assign({}, s, { flags: Object.assign({}, s.flags), notes: s.notes.slice() });
  if (L) o.flags['link_' + L.id] = 1;
  else { o.bat = Math.max(Math.min(s.bat, 1), s.bat - 2); if (o.dread < ABY.MAX_DREAD - 1) o.dread++; }
  o.linked = L ? L.id : null;
  return o;
};

// Day Two: an ending that has a way on (`cont`) can be carried into the next act. She keeps her stats, flags and clues; the dread eases, the phone is
// recharged to at least 48 and the flashlight is off. Returns null when the ending is final.
ABY.carry = function (s) {
  const id = ABY.endingOf(s), E = id && ABY.ENDINGS[id], n = ABY.NODES[s.node]; if (!E || !E.cont || (n && n.final)) return null;
  const o = Object.assign({}, s, { node: E.cont, flags: Object.assign({}, s.flags), notes: s.notes.slice(), dread: Math.max(0, s.dread - 2), bat: Math.max(s.bat, 48), light: 0, tries: 0, back: '' });
  for (const m of ABY.overnightFor(o)) if (m.note && o.notes.indexOf(m.note) < 0) o.notes.push(m.note);     // a new day's overnight clues arrive with it
  return o;
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
  { id: 'detective', name: 'Detective', hint: 'Pin five different pairs of clues together in Notes, over any nights.' },
  { id: 'completionist', name: 'Completionist', hint: 'Find every ending.' },
];
ABY.BADGE_IDS = ABY.BADGES.map(b => b.id);
ABY.badgesFor = function (found, s, deduced) {   // deduced: { linkId: 1 } pinned on any night (kept on the phone, like `found`)
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
  if (id && ABY.LINK_IDS.filter(l => f['link_' + l] || (deduced && deduced[l] === 1)).length >= 5) out.push('detective');
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
  if (ABY.OPENINGS.indexOf(raw.open) >= 0) s.open = raw.open;
  if (ABY.HERO_IDS.indexOf(raw.hero) >= 0) s.hero = raw.hero;
  for (const k of ABY.STATS) if (Number.isInteger(raw[k])) s[k] = clamp(raw[k], 0, 5);
  if (Number.isInteger(raw.dread)) s.dread = clamp(raw.dread, 0, ABY.MAX_DREAD);
  if (Number.isInteger(raw.bat)) s.bat = clamp(raw.bat, 1, 100);
  if (raw.light === 1) s.light = 1;
  if (Number.isInteger(raw.tries)) s.tries = clamp(raw.tries, 0, ABY.MAX_SONG_TRIES);
  if (Number.isInteger(raw.choices)) s.choices = clamp(raw.choices, 0, 999);
  if (ok(raw.back) && !ABY.NODES[raw.back].ending && !ABY.NODES[raw.back].safe) s.back = raw.back;
  if (!ABY.NODES[s.node].safe) s.back = '';
  if (ABY.NODES[s.node].time && !s.back) s.node = ABY.START;                                  // a slip with nowhere to return to (a hand-edited save) starts over
  if (raw.flags && typeof raw.flags === 'object') {
    for (const k of ABY.FLAGS) if (raw.flags[k] === 1) s.flags[k] = 1;
    if (raw.flags.song === 'win' || raw.flags.song === 'fail') s.flags.song = raw.flags.song;
    for (const r of ABY.RITE_IDS) for (const k of ['rite_' + r, 'fail_' + r]) if (raw.flags[k] === 1) s.flags[k] = 1;
    for (const id of ABY.ENDING_IDS) { if (ABY.isFall(id) && raw.flags['scar_' + id] === 1) s.flags['scar_' + id] = 1; else if (!ABY.isFall(id) && raw.flags['echo_' + id] === 1) s.flags['echo_' + id] = 1; }
    for (const id of ABY.LINK_IDS) if (raw.flags['link_' + id] === 1) s.flags['link_' + id] = 1;
    for (const id of ABY.STORE.map(a => a.id)) if (raw.flags['app_' + id] === 1) s.flags['app_' + id] = 1;
  }
  if (Array.isArray(raw.notes)) for (const k of raw.notes) if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(ABY.NOTES, k) && s.notes.indexOf(k) < 0) s.notes.push(k);
  return s;
};
// every flag the story can set (a save may only carry these); the rite flags are set by songDone, not by a choice
ABY.FLAGS = (function () { const f = {}; for (const id in ABY.NODES) for (const c of (ABY.NODES[id].choices || [])) if (c.set) f[c.set] = 1; return Object.keys(f); })();

// the phone's App Store: a fictional shop, nothing is bought. A listing opens by how many endings she has found (`key: { found }`), by one ending
// (`{ end }`, a fall too) or by one deduction pinned in Notes (`{ link }`); a locked one shows only its `hint`. Its page is lore plus reviews, and a
// review with its own `key` is only readable once she has earned it, so the page knows what she has done. All of it reads the Gallery and the pinned
// deductions (kept on the phone, like `found`), never a journey's state: the App Store adds nothing to the story or to the graph walk.
ABY.STORE = [
  { id: 'lantern', name: 'Lantern', glyph: '☀', c: ['#ffe27a', '#e07a10'], tag: 'Light for dark rooms', key: { found: 0 }, blurb: 'A torch that remembers where you have been. Tap it twice before you go in.',
    lore: ['Installed by 4 people in your building.', 'It never asks for a permission. It knows which ones you would grant.'],
    reviews: [
      { who: 'nightshift_ana', stars: 5, text: 'It lit the hall. Then it lit the thing in the hall.' },
      { who: 'm.okafor', stars: 4, text: 'Bright, reliable, a little warm in the hand. Warmer than a phone should be.' },
      { who: 'you', stars: 1, text: 'It was on when the battery hit zero. It stayed on. I could see everything.', key: { end: 'blackout' } },
      { who: 'g.', stars: 5, text: '...I have stood in the dark for a hundred years... the gate was the first light... this is the second...', key: { end: 'dawn' } }] },
  { id: 'hush', name: 'Hush', glyph: '☾', c: ['#8fa0ff', '#3a2a8a'], tag: 'Silence, on demand', key: { found: 1 }, blurb: 'Mutes every call, every ring. Not the one that is already inside.',
    lore: ['Muting keeps the sound out. It does not keep the caller out.'],
    reviews: [
      { who: 'you', stars: 5, text: 'It played me a voicemail I never let it play. Two warnings, one voice. I have stopped muting it.', key: { helped: 'hush' } },
      { who: 'lightsleeper', stars: 2, text: 'Slept eight hours. Woke with my phone open to a voicemail I did not record.' },
      { who: 'quietgate', stars: 5, text: 'Perfect for when the gate opens and nothing follows. Very restful. Very, very restful.', key: { end: 'silence' } },
      { who: 'unknown', stars: 3, text: 'It is 3:07. It is always 3:07 on this app. I turned it off and on. It is 3:07.', key: { end: 'loop' } }] },
  { id: 'echo', name: 'Echo Map', glyph: '◎', c: ['#39e6ff', '#0a5a7a'], tag: 'Draws rooms by sound', key: { found: 2 }, blurb: 'Listens, then draws. Some rooms on the map are newer than the building.',
    lore: ['The map has one more door than the floor plan.'],
    reviews: [
      { who: 'stairwell_dan', stars: 3, text: 'Accurate until the third stair. Then it just says COME DOWN.' },
      { who: 'vey', stars: 5, text: 'It drew two gates. I have stood at both. I keep places. It keeps maps. We understand each other.', key: { end: 'echo' } },
      { who: 'choir', stars: 4, text: 'it drew the water. it drew us under the water. it drew one more of us than there used to be.', key: { end: 'drowned' } }] },
  { id: 'ledger', name: 'Ledger of Names', glyph: '†', c: ['#ff8a8a', '#7a1020'], tag: 'Who stayed, who left', key: { found: 3 }, blurb: 'Lists everyone who held this phone before you. The list is longer than you think.',
    lore: ['Your name is already on it, in your own handwriting.', 'It is sorted by who answered the last call.'],
    reviews: [
      { who: 'archivist', stars: 4, text: 'Thorough. Too thorough. It has my grandmother on it, and she never owned a phone.' },
      { who: 'the queen', stars: 5, text: 'You read every name, once. The ledger has not changed since. I check it every night.', key: { end: 'names' } },
      { who: 'wren', stars: 4, text: 'there is a name at the bottom that is not written yet. the cursor blinks there. it blinks like it is waiting for you.', key: { end: 'caller' } },
      { who: 'the queen', stars: 5, text: 'The first page is not a name. It is a crayon door. I know whose hand drew it. I had it on a fridge, in a kitchen I can no longer find.', key: { link: 'first_name' } },
      { who: 'corvin ash', stars: 5, text: '...every page, the same hand... mine... she asked, and I said yes... you are the first to ask me anything else...', key: { link: 'yes_man' } }] },
  { id: 'eye', name: 'The Eye', glyph: '◉', c: ['#ff4d5e', '#3a0008'], tag: 'It is watching you back', key: { found: 5 }, blurb: 'Not an app. It installed itself. This listing is only here so you can find it.',
    lore: ['There is no uninstall.', 'It rates you five stars. It rates everyone five stars.'],
    reviews: [
      { who: 'eye', stars: 5, text: 'five stars. five stars. five stars. five stars. five stars.' },
      { who: 'eye', stars: 5, text: 'you answered me once on the stairs. you are my favourite review.', key: { end: 'eye' } },
      { who: 'eye', stars: 5, text: 'you looked away. i did not mind. i liked watching you not look.', key: { end: 'watched' } },
      { who: 'eye', stars: 5, text: 'you worked out what i am. nobody has. please do not uninstall me. there is no uninstall. please anyway.', key: { link: 'watcher' } }] },
  { id: 'tide', name: 'Tide Tables', glyph: '≈', c: ['#5ad1c8', '#0b3a52'], tag: 'High water, low water, the hour between', key: { end: 'drowned' }, hint: 'Stay in the water a little too long.', blurb: 'Tells you when the water rises. In the stairwell, it rises at 3:07.',
    lore: ['Low tide is when you can hear the singing. High tide is when you can sing along.', 'The table has a column for your name. The water is in it.'],
    reviews: [
      { who: 'choir', stars: 5, text: 'we use it to know when to sing. we are always in time now. we are always under.' },
      { who: 'sailor_jo', stars: 1, text: 'Lives nowhere near the sea. Phone is wet every morning.' },
      { who: 'choir', stars: 5, text: 'you came back and said our names. the tide went out for a whole night. we were dry. it was strange. thank you.', key: { end: 'names' } }] },
  { id: 'redial', name: 'Redial', glyph: '☎', c: ['#7CFFb2', '#11573a'], tag: 'Call back anyone, ever', key: { end: 'nightline' }, hint: 'Stay on the line until morning.', blurb: 'Calls back the last number. Also the ones before that. All of them, if you let it.',
    lore: ['Recent calls go back further than you have owned the phone.', 'One of the numbers is this phone. It is engaged.'],
    reviews: [
      { who: 'wren', stars: 5, text: 'i called the night line back, the morning after. you picked up. you sounded so tired. you were so kind.' },
      { who: 'unknown', stars: 4, text: 'Called a number from 1987. A kid answered. She said it was her birthday.', key: { end: 'cradle' } },
      { who: 'sorrel', stars: 5, text: 'you warned everybody!! i got your call!! i didnt pick up but i KNEW it was you', key: { end: 'warned' } }] },
  { id: 'party', name: 'Party Hats', glyph: '❂', c: ['#ff9ad5', '#7a1a5a'], tag: 'Plan the perfect birthday', key: { end: 'cradle' }, hint: 'Go in, and stay for the paper hats.', blurb: 'Invitations, cake, paper hats. The party is already planned. You are on the list.',
    lore: ['Every invitation is for the same date. The date does not change.', 'There is a seat saved for you. It is the red hat.'],
    reviews: [
      { who: 'sorrel', stars: 5, text: 'you came! you brought the invitation! nobody ever brings the invitation.', key: { helped: 'party' } },
      { who: 'sorrel', stars: 5, text: 'BEST PARTY. you stayed!!! nobody stays. can it be my birthday again tomorrow? it is. it is always.' },
      { who: 'a parent', stars: 2, text: 'Planned a party for my son. The app keeps inviting a girl called Sorrel. We do not know a Sorrel.' },
      { who: 'sorrel', stars: 5, text: 'you gave her the key. the little one. the door is open now. i can go home after cake. i might stay for one more slice.', key: { end: 'lowdoor' } }] },
  { id: 'smile', name: 'Smile Filter', glyph: '☺', c: ['#ffd34d', '#7a5200'], tag: 'Your best face, every photo', key: { end: 'betrayal' }, hint: 'Trust someone after you have seen their mouth.', blurb: 'Gives everyone a lovely smile. It cannot be turned off. Some faces it improves.',
    lore: ['It found a face in your gallery you did not take.', 'Every smile it makes is the same smile.'],
    reviews: [
      { who: 'you', stars: 5, text: 'It found a hand in the dark holding out a key. The key fit. Five stars, and I have deleted it twice.', key: { helped: 'smile' } },
      { who: 'vey', stars: 5, text: 'Finally, an app that understands me.' },
      { who: 'k_photos', stars: 1, text: 'Turned it on for a selfie. Now everybody in my contacts has the same teeth.' },
      { who: 'vey', stars: 4, text: 'You worked out whose hand it was, in every photo, behind you. I took the filter off for one of them. It is the only photo of me without it.', key: { link: 'many_hands' } }] },
  { id: 'cast', name: 'Mirror Cast', glyph: '⦿', c: ['#c9d4ff', '#2b2f5e'], tag: 'Stream your screen to any glass', key: { end: 'mirror' }, hint: 'Take his place in the dark.', blurb: 'Casts to any mirror in range. The mirror casts back.',
    lore: ['Two devices found: this one, and you.', 'The mirror on the stairs is always available.'],
    reviews: [
      { who: 'the queen', stars: 5, text: 'It showed you my screen. I keep that night open on it. I did not know anyone could see it.', key: { helped: 'cast' } },
      { who: 'the other queen', stars: 5, text: 'I can see your room from mine. You keep it nicer than I do. I am taking notes.' },
      { who: 'r.lake', stars: 2, text: 'Cast to my bathroom mirror. It is still casting. I unplugged the phone.' },
      { who: 'the queen', stars: 3, text: 'She wears my face better than I do. I have asked her to stop. She smiles. I smile. We smile.', key: { end: 'throne' } }] },
  { id: 'saver', name: 'Battery Saver', glyph: '⚡', c: ['#b9ff6b', '#2c5200'], tag: 'Squeeze out the last 1%', key: { end: 'blackout' }, hint: 'Let it die in the dark.', blurb: 'Saves your battery by turning off what you do not need. It decides what you do not need.',
    lore: ['It turned off the torch. It turned off the screen. It is deciding about you.', 'At 0%, the phone still has 3 minutes and 7 seconds of something.'],
    reviews: [
      { who: 'you', stars: 1, text: 'It saved 1%. I was in the dark at the time. It did not save me.' },
      { who: 'the guardian', stars: 4, text: '...in the dark, a phone is the brightest thing... you held it up... I could see your face for a moment... I keep that moment...', key: { end: 'keeper' } }] },
  { id: 'pin', name: 'Pinboard', glyph: '⌖', c: ['#ffe9a8', '#6b4a10'], tag: 'Red string, sold separately', key: { link: 'two_warnings' }, hint: 'Pin two warnings together in Notes.', blurb: 'For people who connect things. It has already connected some of yours.',
    lore: ['There is a pin in the board already. It is through a photo of this phone.', 'The red string goes off the edge of the board. It goes downstairs.'],
    reviews: [
      { who: 'detective_m', stars: 5, text: 'Solved a case with it. Then it solved me.' },
      { who: 'you', stars: 5, text: 'Pinned the two warnings together. Same voice on both. Mine. I do not remember recording either.' },
      { who: 'the queen', stars: 4, text: 'You found who I locked away. I did not want it on a board. I am glad it is somewhere.', key: { link: 'what_she_gave' } }] },
];
ABY.STORE_KEYS = ['found', 'end', 'link', 'helped'];
// does what she has done (`m`: { found: { endingId: 1 }, deduced: { linkId: 1 }, helped: { appId: 1 } }, all kept on the phone) open this key?
// (`helped`: an installed app's clue was one of the two she pinned into a deduction, ABY.helpedBy)
ABY.storeHas = function (m, key) {
  const f = (m && m.found) || {}, d = (m && m.deduced) || {}, h = (m && m.helped) || {};
  if (!key) return true;
  if ('found' in key) return ABY.ENDING_IDS.filter(id => f[id]).length >= key.found;
  if ('end' in key) return !!f[key.end];
  if ('link' in key) return !!d[key.link];
  if ('helped' in key) return !!h[key.helped];
  return false;
};
ABY.storeOpen = function (m) { return ABY.STORE.filter(a => ABY.storeHas(m, a.key)).map(a => a.id); };
// the reviews she may read on a listing, and how many are still sealed
ABY.storeReviews = function (m, id) {
  const a = ABY.STORE.filter(x => x.id === id)[0]; if (!a) return { shown: [], sealed: 0 };
  const shown = a.reviews.filter(r => ABY.storeHas(m, r.key));
  return { shown, sealed: a.reviews.length - shown.length };
};
// APP WHISPERS: an app she installed (kept on the phone, `G.apps`) reaches into a later day. A journey starts with `app_<id>` for each installed app
// (`ABY.newState(..., apps)`, and an app installed mid-journey is added to the day she is in); the app then speaks once, as itself, on one scene of
// Day Two to Day Seven. Like an echo it is only a voice: no choice, no ending and no stat reads `app_` flags, so the story's branches and endings are the
// same with every app installed or none (graph `app-whispers`). A whisper sits on a scene she cannot come back to, or (Lantern) on a dark one with
// `noLight`, whose only way back is switching the flashlight on. `fx` is how it arrives: `flicker` (the torch stutters), `ring` (an old call), `glitch`.
// Four of them leave a clue in Notes (`a_<app>`), the other half of a deduction's `alt` pair (ABY.LINKS): the app she chose can open a deduction her
// journey would otherwise miss. The clue is filed like an overnight message's, so a journey without the app never holds it.
Object.assign(ABY.NOTES, {
  a_hush: { title: 'Hush: the muted voicemail', text: 'Hush kept the voicemail it muted. 3:07, from this phone, in a voice that is yours and hers at once: "Don\'t let her open the gate. It isn\'t him." Hush has filed it under: do not play again.' },
  a_smile: { title: 'Smile Filter: the face behind you', text: 'The filter kept the frame. The face in the dark behind you is smiling, and one of its far too many hands is held out to you with a brass key in it, much too small for any door. The caption it added: for later. very low down.' },
  a_party: { title: 'Party Hats: the invitation', text: 'An invitation Party Hats saved for you: "Sorrel is turning four! Come through the door. Bring a candle." The date is today. The date has been today for a very long time.' },
  a_cast: { title: 'Mirror Cast: what the Queen keeps on her screen', text: 'Before the cast cut out: a night long ago, a girl in a paper crown asleep on Vey\'s shoulder, and the Queen\'s own hand turning a very small key.' },
});
ABY.APP_WHISPERS = [
  ['hush', 'd2_vey', 'Hush muted 1 call while you slept. Caller: this phone. Length: 3:07. It left a voicemail anyway.'],
  ['echo', 'd3_corvin', 'Echo Map heard a lantern on an iron arm. It has added a room behind the door. The room is drawn with you already in it.'],
  ['smile', 'd3_vey3', 'Smile Filter: 1 face found in the dark behind you. Applying smile. It was already smiling.'],
  ['lantern', 'd4_contact', 'Lantern switched itself on. Low light detected. Someone is reading over your shoulder.', { noLight: 1 }, 'flicker'],
  ['ledger', 'd4_bottom', 'Ledger of Names: 1 entry added under yours. Name: (blank). Handwriting: yours.'],
  ['tide', 'd4_delete', 'Tide Tables: the water is rising in your contacts. Next high tide: now.'],
  ['redial', 'd5_hang', 'Redial is calling back the last number you hung up on: Wren. It is ringing on her side. She is not picking up. She is listening.', null, 'ring'],
  ['saver', 'd5_breathe', 'Battery Saver closed 1 app to save power: your voice. Her breathing is still running in the background.'],
  ['party', 'd6_who', 'Party Hats: Sorrel’s party is now. Guests: 214. Seats left: 1. Your hat: red.'],
  ['cast', 'd6_queen', 'Mirror Cast: the Queen’s screen is casting to yours. She has this same message open. She is reading it to you.'],
  ['eye', 'd7_eye', 'The Eye has updated. What’s new: it remembers you. Bug fixes: none. It does not believe in bugs.', null, 'glitch'],
  ['pin', 'd7_named', 'Pinboard: new string between “the Eye” and “a girl behind a door”. They are the same pin.'],
].map(([app, at, text, more, fx]) => ({ id: 'w_' + app, app, at, req: Object.assign({ flag: 'app_' + app }, more || {}), who: 'APP_' + app.toUpperCase(), text, fx: fx || '', note: ABY.NOTES['a_' + app] ? 'a_' + app : '' }));
ABY.APP_IDS = ABY.STORE.map(a => a.id);
// which app left this clue ('' for a clue the story files), and which app (if any) helped her pin clues a and b into a deduction. The credit is
// only shown (Notes, the ending card, a review on the app's page): nothing in the story reads it.
ABY.clueApp = function (note) { const w = ABY.APP_WHISPERS.filter(x => x.note && x.note === note)[0]; return w ? w.app : ''; };
ABY.helpedBy = function (a, b) { return ABY.linkOf(a, b) ? ABY.clueApp(a) || ABY.clueApp(b) : ''; };
ABY.CLUE_APPS = ABY.APP_WHISPERS.filter(x => x.note).map(x => x.app);
// each installed app speaks as itself: its own name and colour in the thread
for (const a of ABY.STORE) ABY.SPEAKERS['APP_' + a.id.toUpperCase()] = { color: a.c[0], focus: 'queen', app: a.id };

if (typeof module !== 'undefined') module.exports = ABY;
