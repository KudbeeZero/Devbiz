# Pinball Ball Physics — Fluidity Issue

**Issue:** Ball sticking and not rolling fluidly during normal play.

## Symptoms
- Ball doesn't roll smoothly across surfaces
- Friction appears excessive in some areas
- Movement feels jerky or stops abruptly
- May relate to velocity damping or collision resolution

## Areas to Investigate

### 1. Damping & Velocity Loss
- Line 1377: `b.vx *= 0.99975; b.vy *= 0.99975;` — 0.025% per-frame damping
- Cumulative effect over 300 Hz physics: may compound into visible sluggishness

### 2. Friction Model
- Lines 377-379: friction can shed >85% velocity in a single 1/300s step when hitting surfaces
- Multiple contact iterations (3 × 2 surfaces per step) compound friction losses
- May need tuning or different application strategy

### 3. Collision Resolution
- `resolveAll()` runs 3 iterations per physics step
- High iteration count + friction term per iteration could over-dampen

### 4. Ball Movement Substrate
- Verify ball is stepping smoothly across geometry
- Check if getting wedged in corners or between surfaces

## Next Steps
1. Profile damping accumulation across substeps
2. Test friction coefficient variations
3. Compare velocity loss per collision
4. Monitor ball trajectory smoothness during play
