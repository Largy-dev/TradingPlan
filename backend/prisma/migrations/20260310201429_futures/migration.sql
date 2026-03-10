-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BotState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "strategy" TEXT NOT NULL DEFAULT 'EMA_RSI_VOLUME',
    "riskPercent" REAL NOT NULL DEFAULT 2.0,
    "takeProfitPct" REAL NOT NULL DEFAULT 3.0,
    "stopLossPct" REAL NOT NULL DEFAULT 1.5,
    "trailingStopPct" REAL NOT NULL DEFAULT 1.0,
    "maxOpenTrades" INTEGER NOT NULL DEFAULT 5,
    "leverage" INTEGER NOT NULL DEFAULT 10,
    "autoSelectPairs" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BotState" ("autoSelectPairs", "id", "isRunning", "maxOpenTrades", "riskPercent", "stopLossPct", "strategy", "takeProfitPct", "trailingStopPct", "updatedAt") SELECT "autoSelectPairs", "id", "isRunning", "maxOpenTrades", "riskPercent", "stopLossPct", "strategy", "takeProfitPct", "trailingStopPct", "updatedAt" FROM "BotState";
DROP TABLE "BotState";
ALTER TABLE "new_BotState" RENAME TO "BotState";
CREATE TABLE "new_Trade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "positionSide" TEXT NOT NULL DEFAULT 'LONG',
    "quantity" REAL NOT NULL,
    "entryPrice" REAL NOT NULL,
    "exitPrice" REAL,
    "pnl" REAL,
    "pnlPercent" REAL,
    "leverage" INTEGER NOT NULL DEFAULT 10,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "orderId" TEXT,
    "exitOrderId" TEXT,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME
);
INSERT INTO "new_Trade" ("closedAt", "entryPrice", "exitOrderId", "exitPrice", "id", "openedAt", "orderId", "pnl", "pnlPercent", "quantity", "side", "status", "symbol") SELECT "closedAt", "entryPrice", "exitOrderId", "exitPrice", "id", "openedAt", "orderId", "pnl", "pnlPercent", "quantity", "side", "status", "symbol" FROM "Trade";
DROP TABLE "Trade";
ALTER TABLE "new_Trade" RENAME TO "Trade";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
