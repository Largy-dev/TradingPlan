/*
  Warnings:

  - You are about to drop the column `autoSelectPairs` on the `BotState` table. All the data in the column will be lost.
  - You are about to drop the column `isManual` on the `TradingPair` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BotState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "strategy" TEXT NOT NULL DEFAULT 'EMA_RSI_VOLUME',
    "riskPercent" REAL NOT NULL DEFAULT 5.0,
    "takeProfitPct" REAL NOT NULL DEFAULT 2.0,
    "stopLossPct" REAL NOT NULL DEFAULT 1.0,
    "trailingStopPct" REAL NOT NULL DEFAULT 0.5,
    "maxOpenTrades" INTEGER NOT NULL DEFAULT 4,
    "leverage" INTEGER NOT NULL DEFAULT 20,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BotState" ("id", "isRunning", "leverage", "maxOpenTrades", "riskPercent", "stopLossPct", "strategy", "takeProfitPct", "trailingStopPct", "updatedAt") SELECT "id", "isRunning", "leverage", "maxOpenTrades", "riskPercent", "stopLossPct", "strategy", "takeProfitPct", "trailingStopPct", "updatedAt" FROM "BotState";
DROP TABLE "BotState";
ALTER TABLE "new_BotState" RENAME TO "BotState";
CREATE TABLE "new_TradingPair" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_TradingPair" ("createdAt", "id", "isActive", "symbol") SELECT "createdAt", "id", "isActive", "symbol" FROM "TradingPair";
DROP TABLE "TradingPair";
ALTER TABLE "new_TradingPair" RENAME TO "TradingPair";
CREATE UNIQUE INDEX "TradingPair_symbol_key" ON "TradingPair"("symbol");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
