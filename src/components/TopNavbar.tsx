import React from 'react';
import { Box, Globe } from 'lucide-react';

interface TopNavbarProps {
  currentLang: string;
  onToggleLang: () => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', labelEn: 'Dashboard', labelEs: 'Tablero', active: false },
  { id: 'projects', labelEn: 'Projects', labelEs: 'Proyectos', active: false },
  { id: 'optimization', labelEn: 'Optimization', labelEs: 'Optimización', active: true },
  { id: 'inventory', labelEn: 'Inventory', labelEs: 'Inventario', active: false },
  { id: 'reports', labelEn: 'Reports', labelEs: 'Reportes', active: false },
];

export const TopNavbar: React.FC<TopNavbarProps> = ({
  currentLang,
  onToggleLang,
}) => {
  const isEs = currentLang === 'es';

  return (
    <header className="h-14 header-band px-6 flex items-center justify-between gap-8 text-ink shrink-0 z-30 no-print">
      {/* Left: Brand Wordmark + Adapter Indicator */}
      <div className="flex items-center space-x-3 shrink-0">
        <div className="w-8 h-8 rounded-control bg-cocoa text-surface flex items-center justify-center">
          <Box className="w-4 h-4 stroke-[1.5]" />
        </div>
        <span className="font-display text-[20px] leading-[24px] font-normal tracking-tight text-ink whitespace-nowrap">
          Tatras NestPro
        </span>
        <span
          title="Running deterministic client-side mock adapter"
          className="text-[11.5px] leading-[16px] font-mono text-secondary bg-raised px-2 py-0.5 rounded-sm border border-hairline whitespace-nowrap"
        >
          {isEs ? 'Datos demo' : 'Demo data'}
        </span>
      </div>

      {/* Center: Global Navigation (Optimization active; others disabled with tooltip) */}
      <nav
        aria-label="Primary Navigation"
        className="hidden md:flex items-center space-x-6 shrink-0"
      >
        {NAV_ITEMS.map((item) => {
          const label = isEs ? item.labelEs : item.labelEn;
          if (item.active) {
            return (
              <span
                key={item.id}
                aria-current="page"
                className="text-[14px] leading-[22px] font-semibold text-cocoa border-b-2 border-cocoa py-4 whitespace-nowrap"
              >
                {label}
              </span>
            );
          }
          return (
            <button
              key={item.id}
              type="button"
              disabled
              title="Planned, not yet available"
              className="text-[14px] leading-[22px] font-normal text-secondary opacity-40 cursor-not-allowed whitespace-nowrap"
            >
              {label}
            </button>
          );
        })}
      </nav>

      {/* Right: Language Switch + Operator Chip */}
      <div className="flex items-center space-x-3 shrink-0">
        <button
          type="button"
          onClick={onToggleLang}
          aria-label="Toggle language between English and Spanish"
          className="btn-secondary !h-8 !px-3 inline-flex items-center space-x-2 text-[13px] cursor-pointer whitespace-nowrap"
          title={
            isEs
              ? 'Spanish translations marked for SME review — Click for English'
              : 'Switch to Español (SME review pending)'
          }
        >
          <Globe className="w-4 h-4 stroke-[1.5] text-cocoa" />
          <span className="font-mono font-medium">
            {isEs ? 'ES (revisión)' : 'EN / ES'}
          </span>
        </button>

        <div
          className="hidden sm:flex items-center space-x-2 pl-3 border-l border-hairline text-[13px] text-secondary whitespace-nowrap"
          title="Saw Planner Workbench Session"
        >
          <span className="w-6 h-6 rounded-control bg-cocoa-tint text-cocoa font-mono text-[11.5px] font-medium flex items-center justify-center border border-strong">
            AT
          </span>
          <span className="font-medium text-ink">A. Thite</span>
        </div>
      </div>
    </header>
  );
};
