import { eq } from "drizzle-orm";

import { db } from "./index";
import { agentState, trade } from "./schema/agents";

export async function getAgentStateRow(agentId: string): Promise<{
  agentId: string;
  stateJson: string;
} | null> {
  const rows = await db
    .select({ agentId: agentState.agentId, stateJson: agentState.stateJson })
    .from(agentState)
    .where(eq(agentState.agentId, agentId))
    .limit(1);

  return rows[0] ?? null;
}

export async function upsertAgentStateRow(params: {
  agentId: string;
  stateJson: string;
}): Promise<void> {
  await db
    .insert(agentState)
    .values({
      agentId: params.agentId,
      stateJson: params.stateJson,
    })
    .onConflictDoUpdate({
      target: agentState.agentId,
      set: { stateJson: params.stateJson },
    });
}

export async function createPendingTradeRow(params: {
  agentId: string;
  marketId: string;
  outcomeId: string;
  side: string;
  size: string;
  requestedPrice: string;
}): Promise<string> {
  const tradeId = crypto.randomUUID();
  await db.insert(trade).values({
    id: tradeId,
    agentId: params.agentId,
    marketId: params.marketId,
    outcomeId: params.outcomeId,
    side: params.side,
    size: params.size,
    requestedPrice: params.requestedPrice,
    status: "pending",
  });
  return tradeId;
}

export async function updateTradeRow(params: {
  tradeId: string;
  status: string;
  txId?: string | null;
  filledPrice?: string | null;
  error?: string | null;
}): Promise<void> {
  await db
    .update(trade)
    .set({
      status: params.status,
      txId: params.txId ?? null,
      filledPrice: params.filledPrice ?? null,
      error: params.error ?? null,
    })
    .where(eq(trade.id, params.tradeId));
}
