import { PolymarketMarket, Trade, MarketStats } from '../types';

const getProxyState = () => localStorage.getItem('ps_local_proxy') === 'true';

export const setLocalProxyMode = (enabled: boolean) => {
  console.log(`[PolySleuth] Local Proxy Mode set to: ${enabled}`);
  localStorage.setItem('ps_local_proxy', enabled.toString());
};

const getBaseUrls = () => {
  if (getProxyState()) {
    return {
      gamma: 'http://localhost:8011/proxy',
      data: 'http://localhost:8010/proxy'
    };
  }
  return {
    gamma: 'https://gamma-api.polymarket.com',
    data: 'https://data-api.polymarket.com'
  };
};

const safeParse = (input: any, fallback: any) => {
  if (!input) return fallback;
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') {
    try {
      const trimmed = input.trim();
      if (trimmed === '' || (trimmed[0] !== '[' && trimmed[0] !== '{')) return fallback;
      return JSON.parse(trimmed);
    } catch (e) { return fallback; }
  }
  return fallback;
};

const fetchWithCorsFallback = async (url: string) => {
  const isLocal = getProxyState();
  
  if (isLocal) {
    console.log(`[PolySleuth] Sending Request: ${url}`);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorBody = await response.text().catch(() => "No error body");
        console.error(`[PolySleuth] Proxy status ${response.status}:`, errorBody);
        throw new Error(`Proxy error ${response.status}: ${errorBody}`);
      }
      return response;
    } catch (e: any) {
      console.error(`[PolySleuth] Proxy Fetch Error: ${e.message}`);
      throw e;
    }
  }

  const PROXIES = [
    (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
  ];

  for (const proxyGen of PROXIES) {
    try {
      const proxyUrl = proxyGen(url);
      const response = await fetch(proxyUrl);
      if (response.ok) return response;
    } catch (e) { continue; }
  }
  throw new Error(`CORS Blocked`);
};

export const getTrendingMarkets = async (useSimulation: boolean): Promise<PolymarketMarket[]> => {
  if (useSimulation) return []; 
  const { gamma } = getBaseUrls();

  try {
    /** 
     * FIXED: The 422 error "order fields are not valid" is caused by 
     * the Gamma API rejecting the 'sort' and 'order' parameters 
     * in combination with 'active=true'. 
     * We use a simplified query that is guaranteed to return data.
     */
    const url = `${gamma}/markets?active=true&limit=50`;
    const response = await fetchWithCorsFallback(url);
    const data = await response.json();
    const markets: PolymarketMarket[] = [];

    if (Array.isArray(data)) {
      data.forEach((m: any) => {
        const cid = m.conditionId || m.id;
        if (!cid) return;
        markets.push({
          id: cid,
          gammaId: m.id,
          question: m.question,
          slug: m.slug,
          endDate: m.endDate,
          volume: Number(m.volume || 0),
          liquidity: Number(m.liquidity || 0),
          outcomes: safeParse(m.outcomes, ["Yes", "No"]),
          outcomePrices: safeParse(m.outcomePrices, ["0.5", "0.5"]),
        });
      });
    }
    console.log(`[PolySleuth] Market Data Success. Received ${markets.length} results.`);
    return markets;
  } catch (error: any) {
    console.error("[PolySleuth] Market Load Failed", error.message);
    return [];
  }
};

export const fetchRecentTrades = async (markets: PolymarketMarket[], useSimulation: boolean): Promise<Trade[]> => {
  if (markets.length === 0 || useSimulation) return [];
  
  const { data: dataUrl } = getBaseUrls();
  const trades: Trade[] = [];
  const now = Date.now();
  const WINDOW_MS = 86400000; // 24 hours

  try {
      // Use top 8 markets to keep query string safe and focused
      const targetMarkets = markets.slice(0, 8);
      const conditionIds = targetMarkets.map(m => m.id).join(',');
      
      // Removed takerOnly=true to capture all liquidity interactions
      const url = `${dataUrl}/trades?market=${conditionIds}&limit=100`;
      
      const response = await fetchWithCorsFallback(url);
      const realData = await response.json();
      
      if (Array.isArray(realData)) {
          console.log(`[PolySleuth] Trade API returned ${realData.length} raw records.`);
          realData.forEach((t: any) => {
              const ts = t.timestamp < 10000000000 ? t.timestamp * 1000 : t.timestamp;
              const market = targetMarkets.find(m => m.id === t.conditionId);
              
              if (market && ts > now - WINDOW_MS) {
                    trades.push({
                      id: `${t.transactionHash}-${t.outcomeIndex}-${t.timestamp}`,
                      marketId: market.id,
                      marketQuestion: market.question,
                      outcomeIndex: parseInt(t.outcomeIndex), 
                      outcomeLabel: t.outcome || "Outcome",
                      side: t.side || 'BUY',
                      price: parseFloat(t.price),
                      size: parseFloat(t.size),
                      timestamp: ts,
                      makerAddress: t.proxyWallet || t.maker_address,
                      transactionHash: t.transactionHash
                    });
              }
          });
      }
      console.log(`[PolySleuth] Scan Results: Found ${trades.length} valid trades within 24h window.`);
      return trades.sort((a, b) => b.timestamp - a.timestamp);
  } catch (e: any) { 
    console.error("[PolySleuth] Trade Fetch Failed", e.message);
    return []; 
  }
};

export const fetchWalletStats = async (address: string, useSimulation: boolean) => {
  if (useSimulation) return { totalTrades: 50, winRate: 0.65, accountAgeDays: 2 };
  const { data: dataUrl } = getBaseUrls();
  try {
    const url = `${dataUrl}/activity?user=${address}&limit=1&sortDirection=ASC`;
    const response = await fetchWithCorsFallback(url);
    if (response.ok) {
      const activity = await response.json();
      if (Array.isArray(activity) && activity.length > 0) {
        const firstSeen = activity[0].timestamp < 10000000000 ? activity[0].timestamp * 1000 : activity[0].timestamp;
        return { totalTrades: -1, winRate: 0, accountAgeDays: (Date.now() - firstSeen) / 86400000 };
      }
    }
  } catch (e) {}
  return undefined;
};

export const fetchMarketWhales = async (marketId: string, useSimulation: boolean): Promise<string[]> => {
  if (useSimulation) return [];
  const { data: dataUrl } = getBaseUrls();
  try {
    const url = `${dataUrl}/holders?market=${marketId}`;
    const response = await fetchWithCorsFallback(url);
    if (response.ok) {
      const holders = await response.json();
      if (Array.isArray(holders)) {
        return holders.slice(0, 10).map((h: any) => (h.proxyWallet || h.address || "").toLowerCase());
      }
    }
  } catch (e) {}
  return [];
};

export const generateBacktestScenario = (): Trade => ({
  id: "sim-maduro-whale",
  marketId: "0x4b7e56993f4e304602f90119109002231b67039031c6e10817094033324546",
  marketQuestion: "[DEMO] Venezuelan Election 2024 Winner?",
  outcomeIndex: 0,
  outcomeLabel: "Maduro",
  side: 'BUY',
  price: 0.12, 
  size: 35000, 
  timestamp: Date.now() - 14400000, 
  makerAddress: "0x31a56e9E690c621eD21De08Cb559e9524Cdb8eD9",
  transactionHash: "0xBacktestScenarioHash123"
});

export const calculateDynamicZScore = (size: number, stats?: MarketStats) => {
  if (!stats || stats.count < 5) return (size - 200) / 300;
  const stdDev = Math.sqrt(stats.m2Size / stats.count);
  return stdDev === 0 ? 0 : (size - stats.meanSize) / stdDev;
};

export const analyzeTradeHeuristics = (trade: Trade, market: PolymarketMarket, stats?: MarketStats, isWhale?: boolean) => {
  const factors: string[] = [];
  let baseScore = 0;
  const zScore = calculateDynamicZScore(trade.size, stats);
  if (zScore > 3) { baseScore += 35; factors.push(`High Size Z=${zScore.toFixed(1)}`); }
  if (market.liquidity > 0 && (trade.size / market.liquidity) > 0.01) { baseScore += 25; factors.push(`Significant Liquidity Impact`); }
  if (trade.price < 0.20 && trade.size > 200) { baseScore += 20; factors.push(`Speculative Accumulation`); }
  if (isWhale) { baseScore += 30; factors.push("Verified Whale Activity"); }
  if (trade.makerAddress.toLowerCase() === "0x31a56e9E690c621eD21De08Cb559e9524Cdb8eD9".toLowerCase()) { baseScore += 50; factors.push("Blacklisted/Known Insider"); }
  return { baseScore, factors };
};