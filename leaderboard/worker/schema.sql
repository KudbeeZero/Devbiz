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
  PRIMARY KEY (game, user_id)
);

-- Leaderboard reads are ORDER BY <metric> DESC per game.
CREATE INDEX IF NOT EXISTS idx_scores_rating       ON scores (game, rating       DESC);
CREATE INDEX IF NOT EXISTS idx_scores_bestCheckout ON scores (game, bestCheckout DESC);
CREATE INDEX IF NOT EXISTS idx_scores_total180s    ON scores (game, total180s    DESC);
CREATE INDEX IF NOT EXISTS idx_scores_wins         ON scores (game, wins         DESC);
CREATE INDEX IF NOT EXISTS idx_scores_bestStreak   ON scores (game, bestStreak   DESC);
