import React from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Sliders,
  Archive,
  FileText,
  HelpCircle,
} from 'lucide-react';
import type { NavRoute } from '../types';

interface IconRailProps {
  currentRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
}

export const IconRail: React.FC<IconRailProps> = ({ currentRoute, onNavigate }) => {
  return (
    <aside className="w-14 bg-white border-r border-slate-200 hidden md:flex flex-col items-center justify-between py-4 select-none shrink-0 z-20">
      {/* Top quick navigation items */}
      <div className="flex flex-col items-center space-y-3 w-full">
        {/* Dashboard */}
        <button
          type="button"
          onClick={() => onNavigate('/dashboard')}
          title="Dashboard Overview"
          className={`p-2.5 rounded-xl transition cursor-pointer ${
            currentRoute === '/dashboard'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
        </button>

        {/* Projects */}
        <button
          type="button"
          onClick={() => onNavigate('/projects')}
          title="Saved Projects & Jobs"
          className={`p-2.5 rounded-xl transition cursor-pointer ${
            currentRoute === '/projects'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          <FolderKanban className="w-5 h-5" />
        </button>

        {/* Optimization */}
        <button
          type="button"
          onClick={() => onNavigate('/optimization')}
          title="Nesting Optimization & Placement"
          className={`p-2.5 rounded-xl transition cursor-pointer ${
            currentRoute === '/optimization'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          <Sliders className="w-5 h-5" />
        </button>

        {/* Inventory */}
        <button
          type="button"
          onClick={() => onNavigate('/inventory')}
          title="Remnant & Bun Inventory Management"
          className={`p-2.5 rounded-xl transition cursor-pointer ${
            currentRoute === '/inventory'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          <Archive className="w-5 h-5" />
        </button>

        {/* Reports */}
        <button
          type="button"
          onClick={() => onNavigate('/reports')}
          title="Yield & Analytics Reports"
          className={`p-2.5 rounded-xl transition cursor-pointer ${
            currentRoute === '/reports'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom utility icons */}
      <div className="flex flex-col items-center space-y-3 w-full pt-4 border-t border-slate-100">
        {/* Help tooltip */}
        <button
          type="button"
          title="Tatras NestPro — 3D Foam Nesting Optimization"
          className="p-2.5 rounded-xl text-slate-400 hover:text-slate-600 transition cursor-help"
        >
          <HelpCircle className="w-5 h-5" />
        </button>

        {/* Operator status indicator */}
        <div className="relative cursor-pointer" title="Saw Operator online & active">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-[11px] font-bold text-slate-600">
            AR
          </div>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white"></span>
        </div>
      </div>
    </aside>
  );
};
