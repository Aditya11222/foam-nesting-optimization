import React from 'react';
import {
  Home,
  Layers,
  Archive,
  BarChart2,
  Sliders,
  HelpCircle,
} from 'lucide-react';

interface IconRailProps {
  activeTab?: string;
  onNavigateHome?: () => void;
}

export const IconRail: React.FC<IconRailProps> = ({ activeTab = 'optimization', onNavigateHome }) => {
  return (
    <aside className="w-14 bg-white border-r border-slate-200 hidden md:flex flex-col items-center justify-between py-4 select-none shrink-0 z-20">
      {/* Top quick navigation items */}
      <div className="flex flex-col items-center space-y-3 w-full">
        {/* Home / Overview */}
        <button
          type="button"
          onClick={onNavigateHome}
          title="Overview / Job Setup"
          className={`p-2.5 rounded-xl transition ${
            activeTab === 'home'
              ? 'bg-blue-50 text-blue-700 shadow-2xs ring-1 ring-blue-200'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          <Home className="w-5 h-5" />
        </button>

        {/* Nesting / Optimization (Active) */}
        <button
          type="button"
          title="Nesting Optimization & Placement"
          className={`p-2.5 rounded-xl transition ${
            activeTab === 'optimization'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-5 h-5" />
        </button>

        {/* Inventory (Placeholder) */}
        <button
          type="button"
          disabled
          title="Remnant & Bun Inventory Management (Coming Soon)"
          className="p-2.5 rounded-xl text-slate-400 hover:text-slate-400 cursor-not-allowed opacity-60 transition"
        >
          <Archive className="w-5 h-5" />
        </button>

        {/* Analytics / Reports (Placeholder) */}
        <button
          type="button"
          disabled
          title="Yield & Scrap Analytics Reports (Coming Soon)"
          className="p-2.5 rounded-xl text-slate-400 hover:text-slate-400 cursor-not-allowed opacity-60 transition"
        >
          <BarChart2 className="w-5 h-5" />
        </button>

        {/* Machine Profiles / Settings (Placeholder) */}
        <button
          type="button"
          disabled
          title="Machine Station Profiles & Cut Constraints (Coming Soon)"
          className="p-2.5 rounded-xl text-slate-400 hover:text-slate-400 cursor-not-allowed opacity-60 transition"
        >
          <Sliders className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom utility icons */}
      <div className="flex flex-col items-center space-y-3 w-full pt-4 border-t border-slate-100">
        {/* Help & Documentation */}
        <button
          type="button"
          disabled
          title="Tatras NestPro v2.4 Documentation & Help"
          className="p-2.5 rounded-xl text-slate-400 hover:text-slate-600 cursor-not-allowed transition"
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        {/* Operator status indicator */}
        <div className="relative cursor-pointer" title="Operator online & connected">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-[11px] font-bold text-slate-600">
            AR
          </div>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white"></span>
        </div>
      </div>
    </aside>
  );
};
