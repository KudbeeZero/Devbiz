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
  -- Kudbee Riff / Riff2 metrics
  score         INTEGER NOT NULL DEFAULT 0,
  bestCombo     INTEGER NOT NULL DEFAULT 0,
  accuracy      INTEGER NOT NULL DEFAULT 0,
  -- Kudbee Voidrunner metrics (score/bestCombo are reused above)
  dist          INTEGER NOT NULL DEFAULT 0,
  waveSurvived  INTEGER NOT NULL DEFAULT 0,
  bestTime      INTEGER NOT NULL DEFAULT 0,
  -- Kudbee Pinball metrics
  bestMultiball INTEGER NOT NULL DEFAULT 0,
  modesCompleted INTEGER NOT NULL DEFAULT 0,
  -- Kudbee Contra metrics (score/bestCombo reused)
  waves         INTEGER NOT NULL DEFAULT 0,
  kills         INTEGER NOT NULL DEFAULT 0,
  -- Kudbee Munch metrics
  level         INTEGER NOT NULL DEFAULT 0,
  chipsEaten    INTEGER NOT NULL DEFAULT 0,
  -- Kudbee Orbital metrics (score reused)
  wave          INTEGER NOT NULL DEFAULT 0,
  -- Kudbee Puzzles metrics
  boardsSolved  INTEGER NOT NULL DEFAULT 0,
  bestMoves     INTEGER NOT NULL DEFAULT 0,
  flawlessStreak INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game, user_id)
);

-- Leaderboard reads are ORDER BY <metric> DESC per game.
CREATE INDEX IF NOT EXISTS idx_scores_rating        ON scores (game, rating        DESC);
CREATE INDEX IF NOT EXISTS idx_scores_bestCheckout  ON scores (game, bestCheckout  DESC);
CREATE INDEX IF NOT EXISTS idx_scores_total180s     ON scores (game, total180s     DESC);
CREATE INDEX IF NOT EXISTS idx_scores_wins          ON scores (game, wins          DESC);
CREATE INDEX IF NOT EXISTS idx_scores_bestStreak    ON scores (game, bestStreak    DESC);
CREATE INDEX IF NOT EXISTS idx_scores_score         ON scores (game, score         DESC);
CREATE INDEX IF NOT EXISTS idx_scores_bestCombo     ON scores (game, bestCombo     DESC);
CREATE INDEX IF NOT EXISTS idx_scores_accuracy      ON scores (game, accuracy      DESC);
CREATE INDEX IF NOT EXISTS idx_scores_dist          ON scores (game, dist          DESC);
CREATE INDEX IF NOT EXISTS idx_scores_waveSurvived  ON scores (game, waveSurvived  DESC);
CREATE INDEX IF NOT EXISTS idx_scores_bestTime      ON scores (game, bestTime      DESC);
CREATE INDEX IF NOT EXISTS idx_scores_bestMultiball ON scores (game, bestMultiball DESC);
CREATE INDEX IF NOT EXISTS idx_scores_modesCompleted ON scores (game, modesCompleted DESC);
CREATE INDEX IF NOT EXISTS idx_scores_waves         ON scores (game, waves         DESC);
CREATE INDEX IF NOT EXISTS idx_scores_kills         ON scores (game, kills         DESC);
CREATE INDEX IF NOT EXISTS idx_scores_level         ON scores (game, level         DESC);
CREATE INDEX IF NOT EXISTS idx_scores_chipsEaten    ON scores (game, chipsEaten    DESC);
CREATE INDEX IF NOT EXISTS idx_scores_wave          ON scores (game, wave          DESC);
CREATE INDEX IF NOT EXISTS idx_scores_boardsSolved  ON scores (game, boardsSolved  DESC);
CREATE INDEX IF NOT EXISTS idx_scores_bestMoves     ON scores (game, bestMoves     ASC);  -- 'min' = lower is better
CREATE INDEX IF NOT EXISTS idx_scores_flawlessStreak ON scores (game, flawlessStreak DESC);

-- ── Migration for an ALREADY-DEPLOYED database (run ONCE; CREATE TABLE above
--    only applies to a fresh DB). D1/SQLite has no "ADD COLUMN IF NOT EXISTS",
--    so run these once on an existing `scores` table, then the indexes above
--    (which are idempotent). Safe to skip on a fresh install.
--      ALTER TABLE scores ADD COLUMN score         INTEGER NOT NULL DEFAULT 0;
--      ALTER TABLE scores ADD COLUMN bestCombo     INTEGER NOT NULL DEFAULT 0;
--      ALTER TABLE scores ADD COLUMN accuracy      INTEGER NOT NULL DEFAULT 0;
--      ALTER TABLE scores ADD COLUMN dist          INTEGER NOT NULL DEFAULT 0;  -- voidrunner
--      ALTER TABLE scores ADD COLUMN waveSurvived  INTEGER NOT NULL DEFAULT 0;  -- voidrunner
--      ALTER TABLE scores ADD COLUMN bestTime      INTEGER NOT NULL DEFAULT 0;  -- voidrunner
--      ALTER TABLE scores ADD COLUMN bestMultiball INTEGER NOT NULL DEFAULT 0;  -- pinball
--      ALTER TABLE scores ADD COLUMN modesCompleted INTEGER NOT NULL DEFAULT 0; -- pinball
--      ALTER TABLE scores ADD COLUMN waves         INTEGER NOT NULL DEFAULT 0;  -- contra
--      ALTER TABLE scores ADD COLUMN kills         INTEGER NOT NULL DEFAULT 0;  -- contra, orbital
--      ALTER TABLE scores ADD COLUMN level         INTEGER NOT NULL DEFAULT 0;  -- munch
--      ALTER TABLE scores ADD COLUMN chipsEaten    INTEGER NOT NULL DEFAULT 0;  -- munch
--      ALTER TABLE scores ADD COLUMN wave          INTEGER NOT NULL DEFAULT 0;  -- orbital
--      ALTER TABLE scores ADD COLUMN boardsSolved  INTEGER NOT NULL DEFAULT 0; -- puzzles
--      ALTER TABLE scores ADD COLUMN bestMoves     INTEGER NOT NULL DEFAULT 0;  -- puzzles (min)
--      ALTER TABLE scores ADD COLUMN flawlessStreak INTEGER NOT NULL DEFAULT 0; -- puzzles
