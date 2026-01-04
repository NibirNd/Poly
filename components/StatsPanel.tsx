import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const mockData = [
  { name: 'Mon', alerts: 4 },
  { name: 'Tue', alerts: 7 },
  { name: 'Wed', alerts: 3 },
  { name: 'Thu', alerts: 12 },
  { name: 'Fri', alerts: 8 },
  { name: 'Sat', alerts: 15 },
  { name: 'Sun', alerts: 5 },
];

const StatsPanel: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="bg-poly-card border border-poly-border rounded-lg p-5">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Activity Volume</h3>
        <div className="h-40 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={mockData}>
              <XAxis dataKey="name" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1a1d2d', borderColor: '#2a2f45', fontSize: '12px' }}
                cursor={{fill: '#2a2f45'}}
              />
              <Bar dataKey="alerts" radius={[4, 4, 0, 0]}>
                {mockData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.alerts > 10 ? '#ef4444' : '#2563eb'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-poly-card border border-poly-border rounded-lg p-5">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Top Suspicious Wallets</h3>
        <ul className="space-y-3">
          {[
            { addr: '0x31a5...8eD9', profit: '+$442k', risk: 'CRITICAL' },
            { addr: '0x7b21...9fA1', profit: '+$120k', risk: 'HIGH' },
            { addr: '0x9c44...1bB2', profit: '+$85k', risk: 'HIGH' },
            { addr: '0xa112...3cC4', profit: '+$32k', risk: 'MEDIUM' },
          ].map((w, i) => (
            <li key={i} className="flex items-center justify-between text-sm group cursor-pointer">
              <span className="font-mono text-gray-400 group-hover:text-white transition-colors">{w.addr}</span>
              <div className="text-right">
                <div className="text-green-400 font-bold">{w.profit}</div>
                <div className={`text-[10px] font-bold ${w.risk === 'CRITICAL' ? 'text-red-500' : 'text-orange-400'}`}>{w.risk}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-gradient-to-br from-poly-accent/20 to-purple-900/20 border border-poly-accent/30 rounded-lg p-5">
         <h3 className="text-sm font-bold text-white mb-2">Algorithm v2.1 Active</h3>
         <p className="text-xs text-gray-400 leading-relaxed">
           Currently monitoring <span className="text-white font-mono">248</span> active markets. Heuristics adjusted for low-liquidity spikes and fresh wallet interaction.
         </p>
      </div>
    </div>
  );
};

export default StatsPanel;
