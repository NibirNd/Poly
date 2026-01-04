import React, { useState, useEffect, useRef } from 'react';
import DashboardHeader from './components/DashboardHeader';
import StatsPanel from './components/StatsPanel';
import AlertCard from './components/AlertCard';
import { 
  getTrendingMarkets, 
  fetchRecentTrades, 
  analyzeTradeHeuristics, 
  generateBacktestScenario, 
  fetchWalletStats,
  fetchMarketWhales,
  setLocalProxyMode
} from './services/polymarketService';
import { analyzeSuspicion } from './services/geminiService';
import { PolymarketMarket, Trade, SuspiciousActivity, SuspicionLevel, MarketStats } from './types';
import { Loader2, AlertCircle, Play, RefreshCw, Radio, ServerOff, Terminal, ExternalLink, Settings } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'live' | 'backtest'>('live');
  const [alerts, setAlerts] = useState<SuspiciousActivity[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [markets, setMarkets] = useState<PolymarketMarket[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing...');
  const [simulationMode, setSimulationMode] = useState(false);
  const [localProxyEnabled, setLocalProxyEnabled] = useState(localStorage.getItem('ps_local_proxy') === 'true');
  const [dataFeedError, setDataFeedError] = useState(false);
  const [showProxyInfo, setShowProxyInfo] = useState(false);
  
  const scanIntervalRef = useRef<number | null>(null);
  const cycleRunningRef = useRef<boolean>(false);
  const processedTradeIds = useRef<Set<string>>(new Set());
  const marketStatsRef = useRef<Map<string, MarketStats>>(new Map());

  const updateMarketStats = (marketId: string, size: number) => {
    const stats = marketStatsRef.current.get(marketId) || { count: 0, meanSize: 0, m2Size: 0, lastUpdate: Date.now() };
    const count = stats.count + 1;
    const delta = size - stats.meanSize;
    const meanSize = stats.meanSize + delta / count;
    const m2Size = stats.m2Size + delta * (size - meanSize);
    const newStats = { count, meanSize, m2Size, lastUpdate: Date.now() };
    marketStatsRef.current.set(marketId, newStats);
    return newStats;
  };

  const initMarkets = async (useSim: boolean) => {
    setStatusMessage(useSim ? 'Initializing Demo Mode...' : 'Connecting to Polymarket...');
    const m = await getTrendingMarkets(useSim);
    if (m.length === 0 && !useSim) {
      setDataFeedError(true);
      setStatusMessage('Data Feed Error: Local Proxy required.');
    } else {
      setDataFeedError(false);
      setMarkets(m);
      setStatusMessage(`Connected. Monitoring ${m.length} Active Markets.`);
    }
    return m;
  };

  const toggleSimulation = () => {
    const newMode = !simulationMode;
    setSimulationMode(newMode);
    stopScan();
    setAlerts([]);
    initMarkets(newMode);
  };

  const toggleLocalProxy = () => {
    const newVal = !localProxyEnabled;
    setLocalProxyEnabled(newVal);
    setLocalProxyMode(newVal);
    stopScan();
    initMarkets(simulationMode);
  };

  const processQueue = async <T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> => {
    const results: R[] = [];
    const queue = [...items];
    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) {
          try {
            const result = await fn(item);
            if (result) results.push(result);
          } catch (e) { console.error(e); }
        }
      }
    };
    await Promise.all(Array(Math.min(items.length, concurrency)).fill(null).map(() => worker()));
    return results;
  };

  const evaluateTrade = async (trade: Trade, market: PolymarketMarket): Promise<SuspiciousActivity | null> => {
    if (processedTradeIds.current.has(trade.id)) return null;
    processedTradeIds.current.add(trade.id);
    const stats = updateMarketStats(market.id, trade.size);
    let isWhale = false;
    if (!simulationMode) {
       const whales = await fetchMarketWhales(market.id, simulationMode);
       isWhale = whales.includes(trade.makerAddress.toLowerCase());
    }
    const { baseScore, factors } = analyzeTradeHeuristics(trade, market, stats, isWhale);
    
    // Reduced threshold to show more data in early runs
    if (baseScore > 10) { 
      const realWalletStats = await fetchWalletStats(trade.makerAddress, simulationMode);
      const analysis = await analyzeSuspicion(trade, market, factors, realWalletStats);
      const finalScore = (baseScore + analysis.suspicionScore) / 2;
      let level = SuspicionLevel.LOW;
      if (finalScore > 85) level = SuspicionLevel.CRITICAL;
      else if (finalScore > 65) level = SuspicionLevel.HIGH;
      else if (finalScore > 40) level = SuspicionLevel.MEDIUM;
      
      return {
        id: trade.id,
        trade,
        suspicionScore: Math.round(finalScore),
        level,
        reasoning: analysis.reasoning,
        factors: Array.from(new Set([...factors, ...analysis.factors])),
        walletStats: realWalletStats ? { ...realWalletStats, isWhale } : undefined
      };
    }
    return null;
  };

  const startLiveScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setActiveTab('live');
    setAlerts([]); 
    let currentMarkets = markets;
    if (markets.length === 0) currentMarkets = await initMarkets(simulationMode);
    
    const runCycle = async () => {
      if (cycleRunningRef.current) return;
      cycleRunningRef.current = true;
      try {
        setStatusMessage('Scanning Trade Feed...');
        const recentTrades = await fetchRecentTrades(currentMarkets, simulationMode);
        
        // Relaxed filtering: Look for trades > $20 in the last 24h
        const candidates = recentTrades.filter(t => t.size > 20);
        
        if (candidates.length === 0) {
          setStatusMessage('No matching activity found yet...');
        } else {
            setStatusMessage(`Analyzing ${candidates.length} active signals...`);
            const validAlerts = await processQueue(candidates, async (trade) => {
              const market = currentMarkets.find(m => m.id === trade.marketId);
              return market ? await evaluateTrade(trade, market) : null;
            }, 3);
            
            if (validAlerts.length > 0) {
                setAlerts(prev => {
                    const next = [...validAlerts, ...prev];
                    const unique = Array.from(new Map(next.map(item => [item.id, item])).values());
                    // Sort by suspicion score then by timestamp
                    return unique.sort((a, b) => b.suspicionScore - a.suspicionScore || b.trade.timestamp - a.trade.timestamp).slice(0, 50);
                });
            }
        }
      } catch (err) { 
        console.error("Scan cycle error", err);
        setStatusMessage("Scan interrupted."); 
      }
      finally { cycleRunningRef.current = false; }
    };
    await runCycle();
    scanIntervalRef.current = window.setInterval(runCycle, 15000); 
  };

  const stopScan = () => {
    setIsScanning(false);
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    cycleRunningRef.current = false;
    setStatusMessage('System Idle');
  };

  useEffect(() => {
    initMarkets(simulationMode);
    return () => stopScan();
  }, []);

  return (
    <div className="min-h-screen bg-poly-dark text-gray-200 font-sans">
      <DashboardHeader onScan={() => isScanning ? stopScan() : startLiveScan()} isScanning={isScanning} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Status Bar */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 text-sm text-gray-500 font-mono bg-poly-card/50 p-2 rounded border border-poly-border/50 flex-1">
            {isScanning ? <Radio className="animate-pulse h-3 w-3 text-red-500" /> : <div className="h-3 w-3 rounded-full bg-gray-600" />}
            <span className="truncate uppercase">SYSTEM: {statusMessage}</span>
          </div>

          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2">
               <span className="text-[10px] text-gray-500 font-bold uppercase">Local Proxy</span>
               <button onClick={toggleLocalProxy} className={`w-10 h-5 rounded-full p-1 transition-colors ${localProxyEnabled ? 'bg-poly-accent' : 'bg-gray-700'}`}>
                 <div className={`w-3 h-3 rounded-full bg-white transform transition-transform ${localProxyEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
               </button>
             </div>
             <div className="flex items-center gap-2">
               <span className={`text-xs font-mono uppercase ${simulationMode ? 'text-poly-warning' : 'text-poly-success'}`}>{simulationMode ? 'Demo' : 'Live'}</span>
               <button onClick={toggleSimulation} className={`w-12 h-6 rounded-full p-1 transition-colors ${simulationMode ? 'bg-poly-warning' : 'bg-gray-700'}`}>
                 <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${simulationMode ? 'translate-x-6' : 'translate-x-0'}`} />
               </button>
             </div>
          </div>
        </div>

        {(dataFeedError || showProxyInfo) && !simulationMode && (
           <div className={`mb-6 rounded-lg overflow-hidden transition-all ${dataFeedError ? 'bg-red-900/20 border border-red-500/50' : 'bg-poly-card border border-poly-border'}`}>
             <div className="p-4 flex items-center gap-3 text-gray-200">
               <ServerOff className="h-5 w-5 text-red-500" />
               <div className="text-sm flex-1">
                 {dataFeedError ? <strong>CORS Connectivity Failure.</strong> : <strong>Proxy Configuration</strong>} Data is being blocked. Ensure local-cors-proxy is running on Ports 8010 and 8011.
               </div>
               <button onClick={() => setShowProxyInfo(!showProxyInfo)} className="px-3 py-1 bg-poly-border text-white text-xs font-bold rounded hover:bg-gray-700 transition-colors">
                 {showProxyInfo ? 'Close' : 'Setup Help'}
               </button>
             </div>
             
             {showProxyInfo && (
               <div className="bg-black/40 p-5 border-t border-poly-border font-mono text-xs space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="space-y-2">
                     <p className="font-bold text-poly-accent uppercase flex items-center gap-2"><Terminal size={14}/> 1. Start Trade Proxy</p>
                     <code className="block bg-black p-2 rounded text-blue-300">npx local-cors-proxy --proxyUrl https://data-api.polymarket.com --port 8010</code>
                   </div>
                   <div className="space-y-2">
                     <p className="font-bold text-poly-accent uppercase flex items-center gap-2"><Terminal size={14}/> 2. Start Market Proxy</p>
                     <code className="block bg-black p-2 rounded text-blue-300">npx local-cors-proxy --proxyUrl https://gamma-api.polymarket.com --port 8011</code>
                   </div>
                 </div>
                 <div className="bg-poly-accent/10 p-3 rounded border border-poly-accent/30 text-poly-accent">
                   <strong>3. Verify:</strong> After starting both terminals, toggle the <strong>Local Proxy</strong> switch above and click <strong>Scan Markets</strong>.
                 </div>
                 <div className="flex gap-4 pt-2">
                    <button onClick={() => initMarkets(false)} className="underline text-white font-bold">Refresh Data Feed</button>
                    <button onClick={toggleSimulation} className="underline text-poly-warning font-bold">Enter Sandbox Mode</button>
                 </div>
               </div>
             )}
           </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <AlertCircle className="text-poly-accent" /> {activeTab === 'live' ? 'Anomalies Detected' : 'Backtest Results'}
              </h2>
              <div className="flex gap-2 bg-poly-card p-1 rounded-lg border border-poly-border">
                <button onClick={() => { stopScan(); setActiveTab('live'); setAlerts([]); }} className={`px-4 py-1.5 rounded text-sm font-medium ${activeTab === 'live' ? 'bg-poly-border text-white' : 'text-gray-400'}`}>Live Data</button>
                <button onClick={() => { stopScan(); setActiveTab('backtest'); setAlerts([]); setTimeout(async () => {
                  const trade = generateBacktestScenario();
                  const market = markets[0] || (await getTrendingMarkets(true))[0];
                  const res = await evaluateTrade(trade, market);
                  if (res) setAlerts([res]);
                }, 100); }} className={`px-4 py-1.5 rounded text-sm font-medium ${activeTab === 'backtest' ? 'bg-poly-accent text-white' : 'text-gray-400'}`}>Demo Simulation</button>
              </div>
            </div>

            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-poly-border rounded-xl bg-poly-card/20">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-poly-card mb-4">
                    {isScanning ? <Loader2 className="h-8 w-8 text-poly-accent animate-spin" /> : <RefreshCw className="h-8 w-8 text-gray-600" />}
                  </div>
                  <h3 className="text-lg font-medium text-white">{isScanning ? 'Scouring Blockchain...' : 'Awaiting Signals'}</h3>
                  <p className="text-gray-500 mt-2 max-w-sm mx-auto">Scanning top {markets.length || '30'} trending markets across a 24-hour window for suspicious volume spikes.</p>
                </div>
              ) : (
                alerts.map(alert => <AlertCard key={alert.id} alert={alert} />)
              )}
            </div>
          </div>
          <div className="lg:col-span-4"><StatsPanel /></div>
        </div>
      </main>
    </div>
  );
};

export default App;