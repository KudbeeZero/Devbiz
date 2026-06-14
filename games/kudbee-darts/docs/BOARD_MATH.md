# Dartboard Geometry & Hit-Test

All geometry lives in **one place** — `src/world/board.js` — so the polar hit-test and the
procedural renderer derive from the same constants. The board is baked to an offscreen
canvas once and blitted; because both the drawn pixels and `hitTest` read the same radii and
angles, **what you see is exactly what scores**.

## Wedge order

Standard clockwise order, with **20 centered straight up**:

```
[20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
```

Each wedge spans `18°` (`2π / 20`).

## Radii (normalized to the double-ring outer edge = 1.0)

From real-board millimetres divided by 170 mm:

| Ring          | Inner r | Outer r | Score          |
|---------------|---------|---------|----------------|
| Inner bull    | —       | 0.0374  | 50             |
| Outer bull    | 0.0374  | 0.0935  | 25             |
| Inner single  | 0.0935  | 0.582   | face value ×1  |
| Treble        | 0.582   | 0.629   | face value ×3  |
| Outer single  | 0.629   | 0.953   | face value ×1  |
| Double        | 0.953   | 1.000   | face value ×2  |
| (off board)   | > 1.000 | —       | 0 (miss)       |

Multiply by the pixel radius `Rpx` (≈232 in-game) about the board centre `(cx, cy)`.

## Hit-test

```
dx = px - cx ;  dy = py - cy
r  = hypot(dx, dy) / Rpx
if r > 1.0          -> MISS (0)
if r <= 0.0374      -> BULL (50)
if r <= 0.0935      -> 25
# wedge from a clockwise-from-top angle (canvas y points DOWN):
a   = atan2(dx, -dy)              # 0 at top, increases clockwise; wrap to [0, 2π)
idx = floor((a + 9°) / 18°) mod 20   # +half-wedge so wedge 20 is centred up
n   = WEDGES[idx]
# ring by radius:
r >= 0.953                 -> double (×2)
0.582 <= r <= 0.629        -> treble (×3)
otherwise                  -> single (×1)
score = n × mult
```

The key trick is `a = atan2(dx, -dy)`: it yields a clockwise-from-top angle that matches the
visual layout regardless of the canvas y-down convention.

## Cardinal-point verification

These are asserted in the project's headless test (`hitTest` with centre at origin):

| Point (from centre) | Expected |
|---------------------|----------|
| centre              | BULL 50  |
| straight up         | 20       |
| right               | 6        |
| straight down       | 3        |
| left                | 11       |
| up @ r≈0.605        | T20 (60) |
| up @ r≈0.976        | D20 (40) |
| up @ r≈0.06         | 25       |
| beyond r = 1.0      | MISS (0) |

## Inverse: `targetPoint(label)`

Given an aim label (`'T20'`, `'D16'`, `'BULL'`, `'25'`, `'20'`) the board returns the ideal
pixel — the wedge-centre angle at the ring's mid-radius. The AI uses this to convert a
strategic choice into an aim point, then throws through the same `Dart → hitTest` pipeline as
the player. Round-tripping a label through `targetPoint` → `hitTest` returns the same label
(also asserted in tests).
