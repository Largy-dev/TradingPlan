-- Migration: Switch to Pullback Scalping defaults
-- Updates existing BotState records AND recreates the table with new column defaults.

-- Step 1: Update any existing records to recommended Pullback Scalping values
UPDATE "BotState" SET
  "strategy"        = 'PULLBACK_SCALPING',
  "riskPercent"     = 2.0,
  "takeProfitPct"   = 0.8,
  "stopLossPct"     = 0.4,
  "trailingStopPct" = 0.2,
  "maxOpenTrades"   = 3,
  "leverage"        = 10,
  "updatedAt"       = datetime('now');

-- Step 2: Recreate table with new column defaults
-- (SQLite does not support ALTER COLUMN, so drop-and-recreate is required)
CREATE TABLE "new_BotState" (
  "id"              INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "isRunning"       BOOLEAN NOT NULL DEFAULT false,
  "strategy"        TEXT    NOT NULL DEFAULT 'PULLBACK_SCALPING',
  "riskPercent"     REAL    NOT NULL DEFAULT 2.0,
  "takeProfitPct"   REAL    NOT NULL DEFAULT 0.8,
  "stopLossPct"     REAL    NOT NULL DEFAULT 0.4,
  "trailingStopPct" REAL    NOT NULL DEFAULT 0.2,
  "maxOpenTrades"   INTEGER NOT NULL DEFAULT 3,
  "leverage"        INTEGER NOT NULL DEFAULT 10,
  "updatedAt"       DATETIME NOT NULL
);

INSERT INTO "new_BotState" SELECT * FROM "BotState";
DROP TABLE "BotState";
ALTER TABLE "new_BotState" RENAME TO "BotState";
