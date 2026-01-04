export interface PolymarketMarket {
  id: string; // conditionId (0x...)
  gammaId: string; // numeric/string ID
  question: string;
  slug: string;
  endDate: string;
  volume: number;
  liquidity: number;
  outcomes: string[];
  outcomePrices: string[];
}

export interface Trade {
  id: string;
  marketId: string; // conditionId
  marketQuestion: string;
  outcomeIndex: number;
  outcomeLabel: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  timestamp: number;
  makerAddress: string;
  transactionHash: string;
}

export interface MarketStats {
  count: number;
  meanSize: number;
  m2Size: number; // For variance calculation (Welford's algorithm)
  lastUpdate: number;
}

export enum SuspicionLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

export interface SuspiciousActivity {
  id: string;
  trade: Trade;
  suspicionScore: number; // 0-100
  level: SuspicionLevel;
  reasoning: string;
  factors: string[];
  walletStats?: {
    totalTrades: number;
    winRate: number;
    accountAgeDays: number;
    isWhale?: boolean; // Is top holder
  };
}

export interface GeminiAnalysisResponse {
  suspicionScore: number;
  reasoning: string;
  factors: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}