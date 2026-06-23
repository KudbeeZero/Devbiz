-- Kudbee Leaderboard — D1 schema
-- One row per (game, user_id). Metric columns mirror shared/core.js GAMES;
-- if you add a rankable metric there, add a column here and a migration.
CREATE TABLE IF NOT EXISTS scores (
  game          TEXT    NOT NULL,
  user_id       TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  updated_at    INTEGER NOT NULL,
  rating        INTEGER NOT NULL DEFAULT 0,
  bestCheckout  INTEGER NOT NULL DEFAULT 0,
  total180s     INTEGER NOT NULL DEFAULT 0,
  wins          INTEGER NOT NULL DEFAULT 0,
  bestStreak    INTEGER NOT NULL DEFAULT 0,
  -- Kudbee Riff metrics
  score         INTEGER NOT NULL DEFAULT 0,
  bestCombo     INTEGER NOT NULL DEFAULT 0,
  accuracy      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game, user_id)
);

-- Leaderboard reads are ORDER BY <metric> DESC per game.
CREATE INDEX IF NOT EXISTS idx_scores_rating       ON scores (game, rating       DESC);
CREATE INDEX IF NOT EXISTS idx_scores_bestCheckout ON scores (game, bestCheckout DESC);
CREATE INDEX IF NOT EXISTS idx_scores_total180s    ON scores (game, total180s    DESC);
CREATE INDEX IF NOT EXISTS idx_scores_wins         ON scores (game, wins         DESC);
CREATE INDEX IF NOT EXISTS idx_scores_bestStreak   ON scores (game, bestStreak   DESC);
CREATE INDEX IF NOT EXISTS idx_scores_score        ON scores (game, score        DESC);
CREATE INDEX IF NOT EXISTS idx_scores_bestCombo    ON scores (game, bestCombo    DESC);
CREATE INDEX IF NOT EXISTS idx_scores_accuracy     ON scores (game, accuracy     DESC);

-- ── Migration for an ALREADY-DEPLOYED database (run ONCE; CREATE TABLE above
--    only applies to a fresh DB). D1/SQLite has no "ADD COLUMN IF NOT EXISTS",
--    so run these three once on an existing `scores` table, then the indexes
--    above (which are idempotent). Safe to skip on a fresh install.
--      ALTER TABLE scores ADD COLUMN score     INTEGER NOT NULL DEFAULT 0;
--      ALTER TABLE scores ADD COLUMN bestCombo INTEGER NOT NULL DEFAULT 0;
--      ALTER TABLE scores ADD COLUMN accuracy  INTEGER NOT NULL DEFAULT 0;
