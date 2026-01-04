import React from 'react';
import { Radar, Search, Square } from 'lucide-react';

interface DashboardHeaderProps {
  onScan: () => void;
  isScanning: boolean;
}

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ onScan, isScanning }) => {
  return (
    <header className="border-b border-poly-border bg-poly-dark/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg shadow-[0_0_15px_rgba(37,99,235,0.5)]">
            <Radar className="text-white h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Poly<span className="text-poly-accent">Sleuth</span></h1>
            <p className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">Insider Activity Tracker</p>
          </div>
        </div>

        <div className="flex-1 max-w-md mx-8 hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 h-4 w-4" />
            <input 
              type="text" 
              placeholder="Search market, wallet or keyword..." 
              className="w-full bg-poly-card border border-poly-border rounded-full py-1.5 pl-10 pr-4 text-sm text-gray-300 focus:outline-none focus:border-poly-accent transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-poly-card border border-poly-border">
            <div className={`h-2 w-2 rounded-full ${isScanning ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
            <span className="text-xs font-mono text-gray-400">{isScanning ? 'LIVE FEED' : 'PAUSED'}</span>
          </div>
          
          <button 
            onClick={onScan}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all
              ${isScanning 
                ? 'bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white' 
                : 'bg-poly-accent hover:bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]'
              }
            `}
          >
            {isScanning ? (
              <>
                <Square size={14} fill="currentColor" /> Stop Scanning
              </>
            ) : (
              'Scan Markets'
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;