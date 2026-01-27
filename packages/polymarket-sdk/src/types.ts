export interface PolymarketMarket {
  id: string;
  question: string;
  description: string;
  category: string;
  endDate: Date;
  liquidity: number;
  volume: number;
  outcomes: PolymarketOutcome[];
  bestBid: number;
  bestAsk: number;
  spread: number;
  status: "active" | "closed" | "resolved";
}

export interface PolymarketOutcome {
  id: string;
  name: string;
  price: number;
  probability: number;
}

export interface PolymarketOrder {
  id: string;
  marketId: string;
  outcomeId: string;
  side: "buy" | "sell";
  size: number;
  price: number;
  status: "pending" | "filled" | "cancelled" | "expired";
  createdAt: Date;
  filledAt?: Date;
  filledSize?: number;
  fees: number;
}

export interface PolymarketTrade {
  id: string;
  marketId: string;
  outcomeId: string;
  side: "buy" | "sell";
  size: number;
  price: number;
  timestamp: Date;
  fees: number;
}

export interface OrderBook {
  marketId: string;
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  lastUpdated: Date;
}

export interface MarketData {
  market: PolymarketMarket;
  orderBook: OrderBook;
  recentTrades: PolymarketTrade[];
  volume24h: number;
  priceChange24h: number;
}

export interface CreateOrderRequest {
  marketId: string;
  outcomeId: string;
  side: "buy" | "sell";
  size: number;
  price: number;
  type: "limit" | "market";
}

export interface CancelOrderRequest {
  orderId: string;
}

export interface PolymarketApiConfig {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  chainId: number;
  rpcUrl: string;
}

// News API types
export interface NewsArticle {
  title: string;
  description?: string;
  url: string;
  publishedAt: string;
  source?: {
    name?: string;
  };
}

export interface NewsAPIResponse {
  articles: NewsArticle[];
  status?: string;
  totalResults?: number;
}

/**
 * Raw API response types - these match the actual API responses
 */

export interface ApiOutcome {
  id: string;
  name: string;
  price: string;
  probability: string;
}

export interface ApiMarket {
  id: string;
  question: string;
  description: string;
  category: string;
  endDate: string;
  liquidity: string;
  volume: string;
  volume24h?: string;
  priceChange24h?: string;
  outcomes: ApiOutcome[];
  bestBid: string;
  bestAsk: string;
  spread: string;
  status: "active" | "closed" | "resolved";
}

export interface ApiMarketsResponse {
  markets: ApiMarket[];
  total?: number;
  page?: number;
}

export interface ApiOrderBookLevel {
  price: string;
  size: string;
}

export interface ApiOrderBookResponse {
  bids: ApiOrderBookLevel[];
  asks: ApiOrderBookLevel[];
  lastUpdated: string;
}

export interface ApiTrade {
  id: string;
  marketId: string;
  outcomeId: string;
  side: "buy" | "sell";
  size: string;
  price: string;
  timestamp: string;
  fees: string;
}

export interface ApiTradesResponse {
  trades: ApiTrade[];
  total?: number;
}

export interface ApiOrder {
  id: string;
  marketId: string;
  outcomeId: string;
  side: "buy" | "sell";
  size: string;
  price: string;
  status: "pending" | "filled" | "cancelled" | "expired";
  createdAt: string;
  filledAt?: string;
  filledSize?: string;
  fees: string;
}

export interface ApiOrderResponse {
  id: string;
  marketId: string;
  outcomeId: string;
  side: "buy" | "sell";
  size: string;
  price: string;
  status: "pending" | "filled" | "cancelled" | "expired";
  createdAt: string;
  fees: string;
}

export interface ApiOrdersResponse {
  orders: ApiOrder[];
  total?: number;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
}
