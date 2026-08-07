-- Kudbee Voidrunner Wingman — optional D1 schema
-- Tracks milestone moments the agent can reference across runs (depth records,
-- boss clears, streak peaks). Apply once: `wrangler d1 execute DB --file=schema.sql`
CREATE TABLE IF NOT EXISTS pilot_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot  TEXT NOT NULL,          -- anonymous pilot id (client-generated)
  depth_km  REAL NOT NULL,
  best_combo INTEGER NOT NULL DEFAULT 0,
  boss_clears INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pilot_runs_pilot ON pilot_runs(pilot);
CREATE INDEX IF NOT EXISTS idx_pilot_runs_depth ON pilot_runs(depth_km);
