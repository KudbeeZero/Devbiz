# Kudbee Shared Engine

Single source of truth for the engine primitives every Kudbee title reuses.
Zero-build, no bundler — plain classic scripts that attach to a
`window.KudbeeEngine` namespace. This is the base layer of the reusable
"Fable Five" game workflow.

## What lives here

| File | Exposes | Purpose |
| --- | --- | --- |
| `loop.js` | `KudbeeEngine.Loop` | Fixed-timestep (1/60s) game loop with a separate render pass and rolling FPS readout. Deterministic regardless of display refresh. |
| `core-util.js` | `KudbeeEngine.coreUtil` | Game-agnostic helpers: `clamp`, `lerp`, `rand`, `randInt`, `pick`, `sign`, `dist`, `approach`, and `ObjectPool` (GC-quiet entity pooling). |

Only genuinely game-agnostic code belongs here. Anything with one game's
concerns (input schemes, particle looks, audio banks, cameras) stays in that
game's own `src/engine/`.

## How a game consumes it

Load the shared scripts **before** the game's own engine scripts in
`index.html`:

```html
<script src="../shared/engine/core-util.js"></script>
<script src="../shared/engine/loop.js"></script>
<script src="src/engine/util.js"></script>   <!-- game shim: spreads coreUtil + extras -->
<script src="src/engine/loop.js"></script>   <!-- game shim: aliases KudbeeEngine.Loop -->
```

Each game keeps its own namespace (`KD` for Darts, `KC` for Contra) via a thin
shim so existing game code is untouched:

```js
// src/engine/loop.js  — alias the shared loop
(function (KD, E) { 'use strict'; KD.Loop = E.Loop; })(
  window.KD = window.KD || {}, window.KudbeeEngine = window.KudbeeEngine || {});

// src/engine/util.js  — shared core + game-specific extras
(function (KD, E) {
  'use strict';
  const Util = Object.assign({}, E.coreUtil, {
    /* game-only helpers here, e.g. gaussian(), aabb() */
  });
  KD.Util = Util;
})(window.KD = window.KD || {}, window.KudbeeEngine = window.KudbeeEngine || {});
```

## Adding a new title

1. Load the two shared scripts first (as above).
2. Add a `util.js`/`loop.js` shim under your game's `src/engine/`.
3. Put game-specific helpers in the shim's extras object, not here.
4. A fix to the loop or a core helper propagates to every title at once.
