import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  FolderKanban,
  Sliders,
  Archive,
  FileText,
  Globe,
  Database
} from 'lucide-react';
import type { NavRoute } from '../types';

interface TopNavbarProps {
  currentRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  currentLang: string;
  onToggleLang: () => void;
  savedJobsCount?: number;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  currentRoute,
  onNavigate,
  currentLang,
  onToggleLang,
  savedJobsCount = 0,
}) => {
  const { t } = useTranslation();

  const navItems: { route: NavRoute; labelKey: string; icon: React.ReactNode }[] = [
    {
      route: '/dashboard',
      labelKey: 'nav_dashboard',
      icon: <LayoutDashboard className="w-3.5 h-3.5" />,
    },
    {
      route: '/projects',
      labelKey: 'nav_projects',
      icon: <FolderKanban className="w-3.5 h-3.5" />,
    },
    {
      route: '/optimization',
      labelKey: 'nav_optimization',
      icon: <Sliders className="w-3.5 h-3.5" />,
    },
    {
      route: '/inventory',
      labelKey: 'nav_inventory',
      icon: <Archive className="w-3.5 h-3.5" />,
    },
    {
      route: '/reports',
      labelKey: 'nav_reports',
      icon: <FileText className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <header className="w-full bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between sticky top-0 z-40 shadow-xs select-none">
      {/* Left: Brand Logo & Title */}
      <div
        className="flex items-center space-x-3 cursor-pointer"
        onClick={() => onNavigate('/dashboard')}
        title="Tatras NestPro — Go to Dashboard"
      >
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
      <nav className="hidden md:flex items-center space-x-1 lg:space-x-1.5">
        {navItems.map((item) => {
          const isActive = currentRoute === item.route;
          return (
            <button
              key={item.route}
              type="button"
              onClick={() => onNavigate(item.route)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                isActive
                  ? 'text-blue-700 bg-blue-50/90 border border-blue-200 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span className={isActive ? 'text-blue-600' : 'text-slate-500'}>
                {item.icon}
              </span>
              <span>{t(item.labelKey)}</span>
              {item.route === '/projects' && savedJobsCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700 font-bold">
                  {savedJobsCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Right: Controls, Demo indicator & User Profile */}
      <div className="flex items-center space-x-3">
        {/* Local Demo Indicator Badge */}
        <div
          className="hidden xl:flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium"
          title={t('saved_in_browser_demo')}
        >
          <Database className="w-3 h-3 text-amber-600" />
          <span>{t('saved_in_browser_demo')}</span>
        </div>

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

        {/* User Chip Placeholder */}
        <div
          className="flex items-center space-x-2 pl-2 border-l border-slate-200 select-none"
          title="Operator Station: Alexander R. (Admin)"
        >
          <div className="w-7 h-7 rounded-full bg-linear-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-2xs">
            AR
          </div>
          <div className="hidden sm:flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-800 leading-tight">Alexander R.</span>
            <span className="text-[10px] text-slate-400 font-medium leading-none">Saw Operator</span>
          </div>
        </div>
      </div>
    </header>
  );
};
