import type {
  ApiMarket,
  ApiMarketsResponse,
  ApiOrder,
  ApiOrderBookResponse,
  ApiOrdersResponse,
  ApiTradesResponse,
} from "../types";

/**
 * Type guard to check if response is an error
 */
export function isApiError(response: unknown): response is { error: string } {
  return (
    typeof response === "object" &&
    response !== null &&
    "error" in response &&
    typeof (response as { error: unknown }).error === "string"
  );
}

/**
 * Type guard for ApiMarketsResponse
 */
export function isApiMarketsResponse(
  response: unknown
): response is ApiMarketsResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    "markets" in response &&
    Array.isArray((response as { markets: unknown }).markets)
  );
}

/**
 * Type guard for ApiMarket
 */
export function isApiMarket(market: unknown): market is ApiMarket {
  if (typeof market !== "object" || market === null) {
    return false;
  }

  const m = market as Record<string, unknown>;

  return (
    typeof m.id === "string" &&
    typeof m.question === "string" &&
    typeof m.description === "string" &&
    typeof m.category === "string" &&
    typeof m.endDate === "string" &&
    typeof m.liquidity === "string" &&
    typeof m.volume === "string" &&
    Array.isArray(m.outcomes) &&
    typeof m.bestBid === "string" &&
    typeof m.bestAsk === "string" &&
    typeof m.spread === "string" &&
    (m.status === "active" || m.status === "closed" || m.status === "resolved")
  );
}

/**
 * Type guard for ApiOrderBookResponse
 */
export function isApiOrderBookResponse(
  response: unknown
): response is ApiOrderBookResponse {
  if (typeof response !== "object" || response === null) {
    return false;
  }

  const r = response as Record<string, unknown>;

  return (
    Array.isArray(r.bids) &&
    Array.isArray(r.asks) &&
    typeof r.lastUpdated === "string"
  );
}

/**
 * Type guard for ApiTradesResponse
 */
export function isApiTradesResponse(
  response: unknown
): response is ApiTradesResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    "trades" in response &&
    Array.isArray((response as { trades: unknown }).trades)
  );
}

/**
 * Type guard for ApiOrdersResponse
 */
export function isApiOrdersResponse(
  response: unknown
): response is ApiOrdersResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    "orders" in response &&
    Array.isArray((response as { orders: unknown }).orders)
  );
}

/**
 * Type guard for ApiOrder
 */
export function isApiOrder(order: unknown): order is ApiOrder {
  if (typeof order !== "object" || order === null) {
    return false;
  }

  const o = order as Record<string, unknown>;

  return (
    typeof o.id === "string" &&
    typeof o.marketId === "string" &&
    typeof o.outcomeId === "string" &&
    (o.side === "buy" || o.side === "sell") &&
    typeof o.size === "string" &&
    typeof o.price === "string" &&
    (o.status === "pending" ||
      o.status === "filled" ||
      o.status === "cancelled" ||
      o.status === "expired") &&
    typeof o.createdAt === "string" &&
    typeof o.fees === "string"
  );
}
