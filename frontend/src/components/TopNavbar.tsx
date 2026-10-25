import React from 'react';
import {
  LayoutDashboard,
  FolderKanban,
  Sliders,
  Archive,
  FileText,
  Bell,
  Globe
} from 'lucide-react';

interface TopNavbarProps {
  currentLang: string;
  onToggleLang: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({ currentLang, onToggleLang }) => {
  return (
    <header className="w-full bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between sticky top-0 z-40 shadow-xs select-none">
      {/* Left: Brand Logo & Title */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-blue-700 flex items-center justify-center text-white font-black text-base shadow-sm ring-2 ring-blue-500/20">
          <span>T</span>
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 text-base tracking-tight leading-none">
            Tatras NestPro
          </span>
          <span className="text-[10px] text-slate-500 font-medium mt-0.5 tracking-wide">
            3D Foam Nesting Optimizer
          </span>
        </div>
      </div>

      {/* Center: Main Navigation Tabs */}
      <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
        {/* Disabled Placeholder: Dashboard */}
        <button
          type="button"
          disabled
          title="Dashboard overview is planned - coming soon"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-400 cursor-not-allowed opacity-70 transition"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Dashboard</span>
        </button>

        {/* Disabled Placeholder: Projects */}
        <button
          type="button"
          disabled
          title="Project batch management is planned - coming soon"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-400 cursor-not-allowed opacity-70 transition"
        >
          <FolderKanban className="w-3.5 h-3.5" />
          <span>Projects</span>
        </button>

        {/* Active Tab: Optimization */}
        <div className="relative flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold text-blue-700 bg-blue-50/90 border-b-2 border-blue-600 shadow-2xs">
          <Sliders className="w-3.5 h-3.5 text-blue-600" />
          <span>Optimization</span>
        </div>

        {/* Disabled Placeholder: Inventory */}
        <button
          type="button"
          disabled
          title="Remnant and bun warehouse inventory management - coming soon"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-400 cursor-not-allowed opacity-70 transition"
        >
          <Archive className="w-3.5 h-3.5" />
          <span>Inventory</span>
        </button>

        {/* Disabled Placeholder: Reports */}
        <button
          type="button"
          disabled
          title="Enterprise reporting and analytics - coming soon"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-400 cursor-not-allowed opacity-70 transition"
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Reports</span>
        </button>
      </nav>

      {/* Right: Controls & User Profile */}
      <div className="flex items-center space-x-3">
        {/* Language Toggle (EN/ES) */}
        <button
          type="button"
          onClick={onToggleLang}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer shadow-2xs"
          title="Switch language between English and Spanish"
        >
          <Globe className="w-3.5 h-3.5 text-slate-500" />
          <span>{currentLang === 'es' ? 'ES' : 'EN'}</span>
        </button>

        {/* Notification Bell (Placeholder) */}
        <button
          type="button"
          disabled
          title="Notifications - no unread notifications"
          className="relative p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-not-allowed transition"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white"></span>
        </button>

        {/* User Chip Placeholder (Static Demo Placeholder) */}
        <div
          className="flex items-center space-x-2 pl-2 border-l border-slate-200 select-none"
          title="Demo Operator Profile: Alexander R. (Admin)"
        >
          <div className="w-7 h-7 rounded-full bg-linear-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-2xs">
            AR
          </div>
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-800 leading-tight">Alexander R.</span>
            <span className="text-[10px] text-slate-400 font-medium leading-none">Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
};
