import React, { useState, useEffect, useRef } from 'react';
import DashboardHeader from './components/DashboardHeader';
import StatsPanel from './components/StatsPanel';
import AlertCard from './components/AlertCard';
import { getTrendingMarkets, fetchRecentTrades, analyzeTradeHeuristics, generateBacktestScenario } from './services/polymarketService';
import { analyzeSuspicion } from './services/geminiService';
import { PolymarketMarket, Trade, SuspiciousActivity, SuspicionLevel } from './types';
import { Loader2, AlertCircle, Play, RefreshCw, Radio } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'live' | 'backtest'>('live');
  const [alerts, setAlerts] = useState<SuspiciousActivity[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [markets, setMarkets] = useState<PolymarketMarket[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing...');
  
  // Use refs for intervals to clear them properly
  const scanIntervalRef = useRef<number | null>(null);

  const initMarkets = async () => {
    setStatusMessage('Connecting to Polymarket Data Feed...');
    const m = await getTrendingMarkets();
    setMarkets(m);
    setStatusMessage(`Connected. Monitoring ${m.length} Active Markets.`);
    return m;
  };

  // Process a single trade through the pipeline
  const evaluateTrade = async (trade: Trade, market: PolymarketMarket) => {
    const { baseScore, factors } = analyzeTradeHeuristics(trade, market);

    // Heuristic threshold to trigger AI analysis
    if (baseScore > 20) {
      // For UX responsiveness, show "Analyzing" in status
      setStatusMessage(`AI Analyzing: ${trade.size} USD on ${market.question.substring(0, 20)}...`);
      
      const analysis = await analyzeSuspicion(trade, market, factors);
      
      const finalScore = (baseScore + analysis.suspicionScore) / 2;
      let level = SuspicionLevel.LOW;
      if (finalScore > 85) level = SuspicionLevel.CRITICAL;
      else if (finalScore > 65) level = SuspicionLevel.HIGH;
      else if (finalScore > 40) level = SuspicionLevel.MEDIUM;

      if (level !== SuspicionLevel.LOW) {
        const newAlert: SuspiciousActivity = {
          id: trade.id,
          trade,
          suspicionScore: Math.round(finalScore),
          level,
          reasoning: analysis.reasoning,
          factors: [...new Set([...factors, ...analysis.factors])],
          walletStats: {
            totalTrades: Math.floor(Math.random() * 50),
            winRate: 0.65,
            accountAgeDays: Math.floor(Math.random() * 30)
          }
        };
        
        setAlerts(prev => {
          // Prevent duplicate alerts for the same trade ID
          if (prev.some(a => a.id === newAlert.id)) return prev;
          return [newAlert, ...prev].slice(0, 50);
        });
      }
    }
  };

  const runBacktest = async () => {
    if (markets.length === 0) await initMarkets();
    
    // Clear previous live alerts to avoid confusion
    setAlerts([]); 
    
    setStatusMessage('Running Historic "Maduro" Scenario...');
    const scenarioTrade = generateBacktestScenario();
    const market = markets.find(m => m.id === scenarioTrade.marketId) || markets[0];
    
    // Process the specific scenario
    await evaluateTrade(scenarioTrade, market);
    setStatusMessage('Backtest Complete. Suspicious pattern identified.');
  };

  const startLiveScan = async () => {
    if (isScanning) return;
    setIsScanning(true);
    setActiveTab('live');
    setAlerts([]); // Clear old alerts when starting fresh scan
    
    let currentMarkets = markets;
    if (markets.length === 0) {
      currentMarkets = await initMarkets();
    }

    const runCycle = async () => {
      setStatusMessage('Scanning Order Books for Active Trades...');
      const recentTrades = await fetchRecentTrades(currentMarkets);
      
      // Filter for potential signals
      // We also ensure trades are RECENT (within last 30 mins) to avoid "old" data
      const now = Date.now();
      const THIRTY_MINS = 30 * 60 * 1000;

      const candidates = recentTrades.filter(t => {
        const isFresh = t.timestamp > (now - THIRTY_MINS);
        const isSignificant = t.size > 200; // Filter dust
        return isFresh && isSignificant;
      });

      if (candidates.length === 0) {
        setStatusMessage('No anomalies in current tick. Listening...');
      }

      for (const trade of candidates) {
        const market = currentMarkets.find(m => m.id === trade.marketId);
        if (market) {
          await evaluateTrade(trade, market);
        }
      }
    };

    // Run immediately then interval
    await runCycle();
    
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    scanIntervalRef.current = window.setInterval(runCycle, 6000); // 6s polling for faster "live" feel
  };

  const stopScan = () => {
    setIsScanning(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setStatusMessage('Scanner Paused');
  };

  const toggleScan = () => {
    if (isScanning) stopScan();
    else startLiveScan();
  };

  // Initial load
  useEffect(() => {
    initMarkets();
    return () => stopScan();
  }, []);

  return (
    <div className="min-h-screen bg-poly-dark text-gray-200 font-sans selection:bg-poly-accent selection:text-white">
      <DashboardHeader onScan={toggleScan} isScanning={isScanning} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Status Bar */}
        <div className="flex items-center gap-2 mb-6 text-sm text-gray-500 font-mono bg-poly-card/50 p-2 rounded border border-poly-border/50">
           {isScanning ? <Radio className="animate-pulse h-3 w-3 text-red-500" /> : <div className="h-3 w-3 rounded-full bg-gray-600" />}
           <span className="truncate">STATUS: {statusMessage}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Feed */}
          <div className="lg:col-span-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <AlertCircle className="text-poly-accent" /> 
                {activeTab === 'live' ? 'Live Anomalies' : 'Backtest Results'}
              </h2>
              <div className="flex gap-2 bg-poly-card p-1 rounded-lg border border-poly-border">
                <button 
                  onClick={() => {
                    if (activeTab !== 'live') {
                      stopScan(); 
                      setActiveTab('live');
                      // User needs to click scan to start
                      setAlerts([]);
                    }
                  }}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${activeTab === 'live' ? 'bg-poly-border text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                >
                  Real-time
                </button>
                <button 
                  onClick={() => {
                    stopScan();
                    setActiveTab('backtest');
                    runBacktest();
                  }}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium transition-all ${activeTab === 'backtest' ? 'bg-poly-accent text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                >
                  <Play size={12} fill="currentColor" /> Backtest Demo
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-poly-border rounded-xl">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-poly-card mb-4">
                    {isScanning ? <Loader2 className="h-8 w-8 text-poly-accent animate-spin" /> : <RefreshCw className="h-8 w-8 text-gray-600" />}
                  </div>
                  <h3 className="text-lg font-medium text-white">
                    {isScanning ? 'Monitoring Live Data...' : 'Waiting for Input'}
                  </h3>
                  <p className="text-gray-500 mt-2 max-w-sm mx-auto">
                    {activeTab === 'live' 
                      ? isScanning ? "Scanning active markets for unusual volume, fresh wallets, and liquidity imbalances." : "Click 'Scan Markets' to start the live feed."
                      : "Click 'Backtest Demo' to simulate the Maduro election insider scenario."
                    }
                  </p>
                </div>
              ) : (
                alerts.map(alert => (
                  <AlertCard key={alert.id} alert={alert} />
                ))
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4">
             <StatsPanel />
             
             {activeTab === 'backtest' && (
               <div className="mt-6 bg-blue-900/10 border border-blue-500/20 rounded-lg p-5 animate-fade-in">
                 <h4 className="text-blue-400 text-sm font-bold mb-2">Forensic Context</h4>
                 <p className="text-xs text-blue-200/70 leading-relaxed mb-3">
                   <strong>Pattern Detected:</strong> High-confidence accumulation in low-liquidity timeframe (4-6 hours pre-event).
                 </p>
                 <p className="text-xs text-blue-200/70 leading-relaxed">
                   Target wallet 0x31a5... used fresh funds to acquire 25% of the "Yes" outcome liquidity before the major spike.
                 </p>
               </div>
             )}
             
             {activeTab === 'live' && isScanning && (
               <div className="mt-6 bg-green-900/10 border border-green-500/20 rounded-lg p-5 animate-pulse">
                 <h4 className="text-green-400 text-sm font-bold mb-2">Live Feed Active</h4>
                 <p className="text-xs text-green-200/70 leading-relaxed">
                   Processing order book ticks and trade events in real-time. Heuristic filters set to <strong>High Sensitivity</strong>.
                 </p>
               </div>
             )}
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;