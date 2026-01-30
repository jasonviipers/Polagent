import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const agentState = pgTable(
  "agent_state",
  {
    agentId: text("agent_id").primaryKey(),
    stateJson: text("state_json").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("agent_state_updatedAt_idx").on(table.updatedAt)]
);

export const trade = pgTable(
  "trade",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    marketId: text("market_id").notNull(),
    outcomeId: text("outcome_id").notNull(),
    side: text("side").notNull(),
    size: integer("size").notNull(),
    requestedPrice: text("requested_price").notNull(),
    status: text("status").notNull(),
    txId: text("tx_id"),
    filledPrice: text("filled_price"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("trade_agentId_createdAt_idx").on(table.agentId, table.createdAt),
    index("trade_marketId_createdAt_idx").on(table.marketId, table.createdAt),
  ]
);
