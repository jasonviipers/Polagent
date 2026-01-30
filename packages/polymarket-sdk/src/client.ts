import "dotenv/config";
import { env } from "@polagent/env/server";
import { ethers } from "ethers";
import winston from "winston";
import type {
  ApiMarket,
  ApiMarketsResponse,
  ApiOrder,
  ApiOrderBookLevel,
  ApiOrderBookResponse,
  ApiOrdersResponse,
  ApiTradesResponse,
  CreateOrderRequest,
  MarketData,
  NewsAPIResponse,
  NewsArticle,
  OrderBook,
  PolymarketApiConfig,
  PolymarketMarket,
  PolymarketOrder,
  PolymarketTrade,
} from "./types";
import {
  isApiMarket,
  isApiMarketsResponse,
  isApiOrder,
  isApiOrderBookResponse,
  isApiOrdersResponse,
  isApiTradesResponse,
} from "./utils/type-guards";

interface IERC20 {
  balanceOf(address: string): Promise<ethers.BigNumberish>;
  decimals(): Promise<number>;
}

const SPLIT_REGEX = /\s+/;

export class PolymarketClient {
  private readonly config: PolymarketApiConfig;
  private readonly provider: ethers.Provider;
  private readonly wallet: ethers.Wallet;
  private readonly logger: winston.Logger;
  private readonly baseUrl: string;
  private readonly gammaUrl: string;

  constructor(config: PolymarketApiConfig, walletPrivateKey?: string) {
    this.config = config;
    this.baseUrl = config.baseUrl;
    this.gammaUrl = config.gammaUrl || "https://gamma-api.polymarket.com";
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    if (walletPrivateKey) {
      try {
        this.wallet = new ethers.Wallet(walletPrivateKey, this.provider);
      } catch (error) {
        console.warn(
          "PolymarketClient: Invalid private key provided, falling back to random wallet (read-only mode). Error:",
          error
        );
        this.wallet = ethers.Wallet.createRandom(this.provider);
      }
    } else {
      this.wallet = ethers.Wallet.createRandom(this.provider);
      console.warn(
        "PolymarketClient: No private key provided, using random wallet (read-only mode for trading)"
      );
    }

    this.logger = winston.createLogger({
      level: "info",
      format: winston.format.json(),
      defaultMeta: { service: "polymarket-client" },
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: "logs/polymarket-client.log" }),
      ],
    });
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.error("API request failed", { endpoint, error });
      throw error;
    }
  }

  private async makeGammaRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.gammaUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new Error(
          `Gamma API HTTP ${response.status}: ${response.statusText}`
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.error("Gamma API request failed", { endpoint, error });
      throw error;
    }
  }

  async getMarkets(
    status: "active" | "closed" | "all" = "active",
    options: RequestInit = {}
  ): Promise<PolymarketMarket[]> {
    this.logger.info("Fetching markets", { status });

    try {
      const activeParam =
        status === "all" ? "" : `&active=${status === "active"}`;
      const data = await this.makeGammaRequest<
        ApiMarketsResponse | ApiMarket[]
      >(`/markets?limit=100${activeParam}`, options);

      if (!isApiMarketsResponse(data)) {
        throw new Error("Invalid API response format for markets");
      }

      const marketsArray = Array.isArray(data) ? data : data.markets;

      return marketsArray.filter(isApiMarket).map((market: ApiMarket) => ({
        id: market.id,
        question: market.question,
        description: market.description,
        category: market.category,
        endDate: new Date(market.endDate),
        liquidity: Number.parseFloat(market.liquidity || "0"),
        volume: Number.parseFloat(market.volume || "0"),
        outcomes: market.outcomes.map((outcome) => ({
          id: outcome.id,
          name: outcome.name,
          price: Number.parseFloat(outcome.price || "0"),
          probability: Number.parseFloat(outcome.probability || "0"),
        })),
        bestBid: Number.parseFloat(market.bestBid || "0"),
        bestAsk: Number.parseFloat(market.bestAsk || "0"),
        spread: Number.parseFloat(market.spread || "0"),
        status: market.status,
      }));
    } catch (error) {
      this.logger.error("Failed to fetch markets", { error });
      throw error;
    }
  }

  async getMarketById(
    marketId: string,
    options: RequestInit = {}
  ): Promise<PolymarketMarket | null> {
    this.logger.info("Fetching market by ID", { marketId });

    try {
      const data = await this.makeGammaRequest<ApiMarket>(
        `/markets/${marketId}`,
        options
      );

      if (!isApiMarket(data)) {
        throw new Error("Invalid market data format");
      }

      return {
        id: data.id,
        question: data.question,
        description: data.description,
        category: data.category,
        endDate: new Date(data.endDate),
        liquidity: Number.parseFloat(data.liquidity || "0"),
        volume: Number.parseFloat(data.volume || "0"),
        outcomes: data.outcomes.map((outcome) => ({
          id: outcome.id,
          name: outcome.name,
          price: Number.parseFloat(outcome.price || "0"),
          probability: Number.parseFloat(outcome.probability || "0"),
        })),
        bestBid: Number.parseFloat(data.bestBid || "0"),
        bestAsk: Number.parseFloat(data.bestAsk || "0"),
        spread: Number.parseFloat(data.spread || "0"),
        status: data.status,
      };
    } catch (error) {
      this.logger.error("Failed to fetch market", { marketId, error });
      return null;
    }
  }

  async getMarketData(
    marketId: string,
    options: RequestInit = {}
  ): Promise<MarketData> {
    this.logger.info("Fetching market data", { marketId });

    try {
      const [marketResponse, orderBook, trades] = await Promise.all([
        this.makeGammaRequest<ApiMarket>(`/markets/${marketId}`, options),
        this.getOrderBook(marketId, options),
        this.getRecentTrades(marketId, 100, options),
      ]);

      if (!isApiMarket(marketResponse)) {
        throw new Error("Invalid market data format");
      }

      return {
        market: {
          id: marketResponse.id,
          question: marketResponse.question,
          description: marketResponse.description,
          category: marketResponse.category,
          endDate: new Date(marketResponse.endDate),
          liquidity: Number.parseFloat(marketResponse.liquidity || "0"),
          volume: Number.parseFloat(marketResponse.volume || "0"),
          outcomes: marketResponse.outcomes.map((outcome) => ({
            id: outcome.id,
            name: outcome.name,
            price: Number.parseFloat(outcome.price || "0"),
            probability: Number.parseFloat(outcome.probability || "0"),
          })),
          bestBid: Number.parseFloat(marketResponse.bestBid || "0"),
          bestAsk: Number.parseFloat(marketResponse.bestAsk || "0"),
          spread: Number.parseFloat(marketResponse.spread || "0"),
          status: marketResponse.status,
        },
        orderBook,
        recentTrades: trades,
        volume24h: Number.parseFloat(marketResponse.volume24h || "0"),
        priceChange24h: Number.parseFloat(marketResponse.priceChange24h || "0"),
      };
    } catch (error) {
      this.logger.error("Failed to fetch market data", { marketId, error });
      throw error;
    }
  }

  async getOrderBook(
    marketId: string,
    options: RequestInit = {}
  ): Promise<OrderBook> {
    this.logger.info("Fetching order book", { marketId });

    try {
      const data = await this.makeRequest<ApiOrderBookResponse>(
        `/markets/${marketId}/orderbook`,
        options
      );

      if (!isApiOrderBookResponse(data)) {
        throw new Error("Invalid order book response format");
      }

      return {
        marketId,
        bids: data.bids.map((bid: ApiOrderBookLevel) => ({
          price: Number.parseFloat(bid.price),
          size: Number.parseFloat(bid.size),
        })),
        asks: data.asks.map((ask: ApiOrderBookLevel) => ({
          price: Number.parseFloat(ask.price),
          size: Number.parseFloat(ask.size),
        })),
        lastUpdated: new Date(data.lastUpdated),
      };
    } catch (error) {
      this.logger.error("Failed to fetch order book", { marketId, error });
      throw error;
    }
  }

  async getRecentTrades(
    marketId: string,
    limit = 100,
    options: RequestInit = {}
  ): Promise<PolymarketTrade[]> {
    this.logger.info("Fetching recent trades", { marketId, limit });

    try {
      const data = await this.makeRequest<ApiTradesResponse>(
        `/markets/${marketId}/trades?limit=${limit}`,
        options
      );

      if (!isApiTradesResponse(data)) {
        throw new Error("Invalid trades response format");
      }

      return data.trades.map((trade) => ({
        id: trade.id,
        marketId: trade.marketId,
        outcomeId: trade.outcomeId,
        side: trade.side,
        size: Number.parseFloat(trade.size),
        price: Number.parseFloat(trade.price),
        timestamp: new Date(trade.timestamp),
        fees: Number.parseFloat(trade.fees),
      }));
    } catch (error) {
      this.logger.error("Failed to fetch recent trades", { marketId, error });
      throw error;
    }
  }

  async createOrder(order: CreateOrderRequest): Promise<PolymarketOrder> {
    this.logger.info("Creating order", { order });

    try {
      // Sign the order with wallet
      const orderHash = this.hashOrder(order);
      const signature = await this.wallet.signMessage(orderHash);

      const data = await this.makeRequest<ApiOrder>("/orders", {
        method: "POST",
        body: JSON.stringify({
          ...order,
          signature,
          walletAddress: this.wallet.address,
        }),
      });

      if (!isApiOrder(data)) {
        throw new Error("Invalid order response format");
      }

      return {
        id: data.id,
        marketId: data.marketId,
        outcomeId: data.outcomeId,
        side: data.side,
        size: Number.parseFloat(data.size),
        price: Number.parseFloat(data.price),
        status: data.status,
        createdAt: new Date(data.createdAt),
        fees: Number.parseFloat(data.fees),
      };
    } catch (error) {
      this.logger.error("Failed to create order", { order, error });
      throw error;
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    this.logger.info("Cancelling order", { orderId });

    try {
      await this.makeRequest<{ success: boolean }>(`/orders/${orderId}`, {
        method: "DELETE",
      });

      return true;
    } catch (error) {
      this.logger.error("Failed to cancel order", { orderId, error });
      return false;
    }
  }

  async getOrder(orderId: string): Promise<PolymarketOrder> {
    this.logger.info("Fetching order", { orderId });

    try {
      const data = await this.makeRequest<ApiOrder>(`/orders/${orderId}`);

      if (!isApiOrder(data)) {
        throw new Error("Invalid order response format");
      }

      return {
        id: data.id,
        marketId: data.marketId,
        outcomeId: data.outcomeId,
        side: data.side,
        size: Number.parseFloat(data.size),
        price: Number.parseFloat(data.price),
        status: data.status,
        createdAt: new Date(data.createdAt),
        filledAt: data.filledAt ? new Date(data.filledAt) : undefined,
        filledSize: data.filledSize
          ? Number.parseFloat(data.filledSize)
          : undefined,
        fees: Number.parseFloat(data.fees),
      };
    } catch (error) {
      this.logger.error("Failed to fetch order", { orderId, error });
      throw error;
    }
  }
  async getOpenOrders(marketId?: string): Promise<PolymarketOrder[]> {
    this.logger.info("Fetching open orders", { marketId });

    try {
      const endpoint = marketId
        ? `/orders?marketId=${marketId}&status=open`
        : "/orders?status=open";

      const data = await this.makeRequest<ApiOrdersResponse>(endpoint);

      if (!isApiOrdersResponse(data)) {
        throw new Error("Invalid orders response format");
      }

      return data.orders.filter(isApiOrder).map((order) => ({
        id: order.id,
        marketId: order.marketId,
        outcomeId: order.outcomeId,
        side: order.side,
        size: Number.parseFloat(order.size),
        price: Number.parseFloat(order.price),
        status: order.status,
        createdAt: new Date(order.createdAt),
        filledAt: order.filledAt ? new Date(order.filledAt) : undefined,
        filledSize: order.filledSize
          ? Number.parseFloat(order.filledSize)
          : undefined,
        fees: Number.parseFloat(order.fees),
      }));
    } catch (error) {
      this.logger.error("Failed to fetch open orders", { marketId, error });
      throw error;
    }
  }

  private hashOrder(order: CreateOrderRequest): string {
    const orderData = `${order.marketId}-${order.outcomeId}-${order.side}-${order.size}-${order.price}-${Date.now()}`;
    return ethers.keccak256(ethers.toUtf8Bytes(orderData));
  }

  getWalletAddress(): string {
    return this.wallet.address;
  }

  async getBalance(): Promise<string> {
    const balance = await this.provider.getBalance(this.wallet.address);
    return ethers.formatEther(balance);
  }

  async getWalletBalance(
    walletAddress: string,
    _options?: { signal?: AbortSignal }
  ): Promise<{
    usdc: number;
    native: number;
    walletAddress: string;
    chainId: number;
  }> {
    try {
      const provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      const USDC_ADDRESS = env.POLYMARKET_USDC_ADDRESS;

      // ERC20 ABI for balanceOf
      const erc20Abi = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)",
      ];

      const usdcContract = new ethers.Contract(
        USDC_ADDRESS,
        erc20Abi,
        provider
      ) as ethers.Contract & IERC20;

      const [usdcBalance, decimals] = await Promise.all([
        usdcContract.balanceOf(walletAddress),
        usdcContract.decimals(),
      ]);

      const usdcFormatted = Number(ethers.formatUnits(usdcBalance, decimals));

      const nativeBalance = await provider.getBalance(walletAddress);
      const nativeFormatted = Number(ethers.formatEther(nativeBalance));

      return {
        usdc: usdcFormatted,
        native: nativeFormatted,
        walletAddress,
        chainId: this.config.chainId,
      };
    } catch (error) {
      this.logger.error("Failed to fetch wallet balance", {
        walletAddress,
        error,
      });
      throw error;
    }
  }

  async getMarketNews(
    marketId: string,
    options?: {
      lookbackHours?: number;
      maxArticles?: number;
      sources?: string[];
      signal?: AbortSignal;
    }
  ): Promise<{
    articles: Array<{
      title: string;
      summary: string;
      sentiment: number;
      source: string;
      url: string;
      timestamp: Date;
      topics: string[];
    }>;
    market: {
      id: string;
      question: string;
      category: string;
    };
  }> {
    const {
      lookbackHours = 24,
      maxArticles = 20,
      sources = [],
      signal,
    } = options || {};

    try {
      // First, get market details
      const marketData = await this.getMarketData(marketId, { signal });

      if (!marketData?.market) {
        throw new Error("Market not found");
      }

      const marketQuestion = marketData.market.question;
      const category = marketData.market.category;

      const fromDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
      const toDate = new Date();

      const queryParams = new URLSearchParams({
        q: marketQuestion,
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        sortBy: "publishedAt",
        pageSize: Math.min(maxArticles, 100).toString(),
        language: "en",
      });

      if (sources.length > 0) {
        queryParams.append("sources", sources.join(","));
      }

      // Fetch from NewsAPI
      const newsApiBaseUrl = env.NEWS_API_BASE_URL;
      const newsApiUrl = `${newsApiBaseUrl}/newsapi`;
      const response = await fetch(`${newsApiUrl}?${queryParams.toString()}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.NEWS_API_KEY}`,
        },
        signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(
          `NewsAPI request failed: ${response.status} ${response.statusText}. ${errorText}`
        );
      }

      const newsData = (await response.json()) as NewsAPIResponse;

      if (!(newsData && Array.isArray(newsData.articles))) {
        this.logger.warn("Invalid NewsAPI response structure", {
          marketId,
          hasData: !!newsData,
          hasArticles: newsData && "articles" in newsData,
        });

        return {
          articles: [],
          market: {
            id: marketId,
            question: marketQuestion,
            category,
          },
        };
      }

      const processedArticles = await Promise.all(
        newsData.articles
          .filter(
            (article: NewsArticle) =>
              article?.title && article.url && article.publishedAt
          )
          .slice(0, maxArticles)
          .map((article: NewsArticle) => {
            try {
              // Extract topics from content
              const topics = this.extractTopics(
                article.title,
                article.description || "",
                category
              );

              // Calculate sentiment (simplified - in production, use NLP service)
              const sentiment = this.calculateSentiment(
                article.title,
                article.description || ""
              );

              return {
                title: article.title.trim(),
                summary: (article.description || article.title).trim(),
                sentiment,
                source: article.source?.name || new URL(article.url).hostname,
                url: article.url,
                timestamp: new Date(article.publishedAt),
                topics,
              };
            } catch (err) {
              this.logger.warn("Failed to process article", {
                articleUrl: article.url,
                error: err,
              });
              return null;
            }
          })
      );

      // Filter out any null articles that failed processing
      const validArticles = processedArticles.filter(
        (
          article
        ): article is {
          title: string;
          summary: string;
          sentiment: number;
          source: string;
          url: string;
          timestamp: Date;
          topics: string[];
        } => article !== null
      );

      this.logger.info("Successfully fetched market news", {
        marketId,
        articlesFound: validArticles.length,
        lookbackHours,
      });

      return {
        articles: validArticles,
        market: {
          id: marketId,
          question: marketQuestion,
          category,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error("Failed to fetch market news", {
          marketId,
          error: error.message,
          stack: error.stack,
          lookbackHours,
          maxArticles,
        });
      } else {
        this.logger.error("Failed to fetch market news with unknown error", {
          marketId,
          error,
        });
      }
      throw error;
    }
  }

  private extractTopics(
    title: string,
    description: string,
    category: string
  ): string[] {
    const topics: Set<string> = new Set([category]);
    const content = `${title} ${description}`.toLowerCase();

    // Common topic keywords (expand based on your domain)
    const topicKeywords: Record<string, string[]> = {
      politics: [
        "election",
        "vote",
        "candidate",
        "poll",
        "campaign",
        "senate",
        "congress",
      ],
      economics: [
        "market",
        "stock",
        "economy",
        "trade",
        "inflation",
        "gdp",
        "fed",
      ],
      sports: ["game", "team", "player", "championship", "season", "score"],
      technology: ["ai", "tech", "software", "crypto", "blockchain", "startup"],
      health: [
        "health",
        "medical",
        "disease",
        "vaccine",
        "hospital",
        "treatment",
      ],
      climate: ["climate", "weather", "temperature", "environment", "carbon"],
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      if (keywords.some((keyword) => content.includes(keyword))) {
        topics.add(topic);
      }
    }

    return Array.from(topics).slice(0, 5);
  }

  /**
   * Calculate sentiment score from text
   * Returns value between -1 (negative) and 1 (positive)
   * Note: This is a simplified implementation. For production, use a proper NLP service.
   */
  private calculateSentiment(title: string, description: string): number {
    const content = `${title} ${description}`.toLowerCase();

    const positiveWords = [
      "win",
      "success",
      "gain",
      "up",
      "rise",
      "increase",
      "good",
      "positive",
      "growth",
      "profit",
      "victory",
      "improve",
      "better",
      "strong",
    ];

    const negativeWords = [
      "lose",
      "fail",
      "loss",
      "down",
      "fall",
      "decrease",
      "bad",
      "negative",
      "decline",
      "crisis",
      "defeat",
      "worse",
      "weak",
      "drop",
    ];

    let score = 0;
    const words = content.split(SPLIT_REGEX);

    for (const word of words) {
      if (positiveWords.some((pw) => word.includes(pw))) {
        score += 1;
      }
      if (negativeWords.some((nw) => word.includes(nw))) {
        score -= 1;
      }
    }

    // Normalize to -1 to 1 range
    const maxScore = Math.max(Math.abs(score), 10);
    return Math.max(-1, Math.min(1, score / maxScore));
  }
}
