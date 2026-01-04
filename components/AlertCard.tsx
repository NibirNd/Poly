import React from 'react';
import { SuspiciousActivity, SuspicionLevel } from '../types';
import { AlertTriangle, TrendingUp, Wallet, ArrowRight, Activity, ShieldAlert } from 'lucide-react';

interface AlertCardProps {
  alert: SuspiciousActivity;
}

const AlertCard: React.FC<AlertCardProps> = ({ alert }) => {
  const { trade, suspicionScore, level, reasoning, factors, walletStats } = alert;

  const getLevelColor = (lvl: SuspicionLevel) => {
    switch (lvl) {
      case SuspicionLevel.CRITICAL: return 'border-red-500 bg-red-950/20 text-red-500';
      case SuspicionLevel.HIGH: return 'border-orange-500 bg-orange-950/20 text-orange-500';
      case SuspicionLevel.MEDIUM: return 'border-yellow-500 bg-yellow-950/20 text-yellow-500';
      default: return 'border-blue-500 bg-blue-950/20 text-blue-500';
    }
  };

  const scoreColor = suspicionScore > 80 ? 'text-red-400' : suspicionScore > 50 ? 'text-yellow-400' : 'text-blue-400';

  return (
    <div className={`relative border-l-4 rounded-r-lg p-5 mb-4 bg-poly-card transition-all hover:bg-[#23273a] group ${getLevelColor(level).split(' ')[0]}`}>
      
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-sm font-mono text-gray-400 mb-1">{trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString() : 'Just now'}</h3>
          <h2 className="text-lg font-bold text-white leading-tight hover:text-poly-accent cursor-pointer transition-colors">
            {trade.marketQuestion}
          </h2>
        </div>
        <div className={`flex flex-col items-end ${scoreColor}`}>
          <div className="text-2xl font-black font-mono">{suspicionScore}<span className="text-sm font-normal text-gray-500">/100</span></div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${getLevelColor(level)}`}>{level}</span>
        </div>
      </div>

      {/* Trade Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-poly-dark p-2 rounded border border-poly-border">
          <div className="text-xs text-gray-500 mb-1">Outcome</div>
          <div className="font-bold text-white flex items-center gap-2">
            <span className={trade.outcomeLabel === 'Yes' ? 'text-green-400' : 'text-red-400'}>{trade.outcomeLabel}</span>
            <span className="text-xs text-gray-400 font-mono">@ {(trade.price * 100).toFixed(1)}¢</span>
          </div>
        </div>
        <div className="bg-poly-dark p-2 rounded border border-poly-border">
          <div className="text-xs text-gray-500 mb-1">Size</div>
          <div className="font-bold text-white font-mono">${trade.size.toLocaleString()}</div>
        </div>
        <div className="bg-poly-dark p-2 rounded border border-poly-border col-span-2">
          <div className="text-xs text-gray-500 mb-1">Wallet</div>
          <div className="font-mono text-xs text-poly-accent truncate flex items-center gap-2">
            <Wallet size={12} />
            <a 
              href={`https://polymarket.com/profile/${trade.makerAddress}`} 
              target="_blank" 
              rel="noreferrer"
              className="hover:underline"
            >
              {trade.makerAddress}
            </a>
            {walletStats && walletStats.accountAgeDays < 7 && (
               <span className="bg-purple-900 text-purple-300 text-[10px] px-1 rounded ml-auto">NEW</span>
            )}
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      <div className="bg-black/30 p-3 rounded border border-poly-border mb-3">
        <div className="flex items-center gap-2 mb-2 text-poly-accent">
          <Activity size={16} />
          <span className="text-xs font-bold uppercase tracking-wider">Gemini Forensic Analysis</span>
        </div>
        <p className="text-sm text-gray-300 italic mb-2">"{reasoning}"</p>
        <div className="flex flex-wrap gap-2">
          {factors.map((f, i) => (
            <span key={i} className="text-xs bg-poly-border text-gray-300 px-2 py-1 rounded flex items-center gap-1">
              <ShieldAlert size={10} /> {f}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
        <button className="text-xs bg-poly-dark hover:bg-poly-border text-white px-3 py-1.5 rounded transition-colors flex items-center gap-1">
          Backtest Wallet <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
};

export default AlertCard;
