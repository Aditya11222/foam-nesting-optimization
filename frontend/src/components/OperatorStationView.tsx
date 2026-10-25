import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  ChevronLeft,
  AlertTriangle,
} from 'lucide-react';
import type { OptimizationResult, CutStep, BlockLayout } from '../types';
import { ThreeBlockView } from './ThreeBlockView';

interface OperatorStationViewProps {
  result: OptimizationResult;
  selectedBlockIndex: number;
  onSelectBlock: (index: number) => void;
  onBackToPlanner: () => void;
}

export const OperatorStationView: React.FC<OperatorStationViewProps> = ({
  result,
  selectedBlockIndex,
  onSelectBlock,
  onBackToPlanner,
}) => {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;

  const activeBlock: BlockLayout = result.blocks[selectedBlockIndex] || result.blocks[0];
  const cuts = activeBlock?.cuts || [];

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const activeCut: CutStep | undefined = cuts[currentStepIndex];

  const totalSteps = cuts.length;
  const progressPct = totalSteps > 0 ? ((currentStepIndex + 1) / totalSteps) * 100 : 0;

  const handleNext = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const getCutTitle = (cut?: CutStep) => {
    if (!cut) return '';
    switch (cut.cut_type) {
      case 'skin_trim':
        return t('skin_trim');
      case 'horizontal_slab':
        return t('horizontal_slab');
      case 'vertical_rip':
        return t('vertical_rip');
      case 'crosscut':
        return t('crosscut');
      default:
        return cut.cut_type;
    }
  };

  const getCutDirectionText = (cut?: CutStep) => {
    if (!cut) return '';
    if (cut.axis === 'Z') return t('lengthwise_x');
    if (cut.axis === 'X') return t('widthwise_y');
    return t('heightwise_z');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F8FAFC] text-[#0F172A]">
      {/* Saw Station Top Bar */}
      <div className="px-6 py-3 bg-white border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-4 shadow-soft">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-base font-bold text-[#2563EB]">Saw Station 2</span>
            <span className="text-[#CBD5E1]">—</span>
            <span className="text-sm font-semibold text-[#0F172A]">Job #{result.job_id}</span>
          </div>

          <span className="px-2.5 py-1 rounded-lg bg-[#EFF6FF] text-xs font-semibold text-[#1D4ED8] border border-[#BFDBFE]">
            {t('grade')} {result.grade}
          </span>

          <span className="hidden sm:inline-block px-2.5 py-1 rounded-lg bg-[#F1F5F9] text-xs font-medium text-[#475569] border border-[#E2E8F0]">
            {t('block')} {activeBlock.nominal_length}×{activeBlock.nominal_width}×{activeBlock.nominal_height} in
          </span>
        </div>

        <div className="flex items-center space-x-3">
          {/* Block switcher if multi-block */}
          {result.blocks.length > 1 && (
            <div className="flex items-center space-x-1.5 bg-[#F1F5F9] p-1 rounded-lg border border-[#E2E8F0] text-xs">
              <span className="text-[#64748B] px-1 font-medium">Block:</span>
              {result.blocks.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onSelectBlock(i);
                    setCurrentStepIndex(0);
                  }}
                  className={`w-6 h-6 rounded-md text-xs font-bold transition-all ${
                    i === selectedBlockIndex
                      ? 'bg-[#2563EB] text-white shadow-soft'
                      : 'text-[#475569] hover:bg-white'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={onBackToPlanner}
            className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#F8FAFC] text-xs font-semibold text-[#475569] hover:text-[#0F172A] border border-[#CBD5E1] shadow-soft transition-all"
          >
            ← {t('nav_planner')}
          </button>
        </div>
      </div>

      {/* Progress Strip */}
      <div className="px-6 py-2.5 bg-white border-b border-[#E2E8F0] flex items-center justify-between shadow-soft">
        <div className="flex items-center space-x-3">
          <span className="text-sm font-bold text-[#0F172A] tracking-wide">
            {t('step_counter', { current: currentStepIndex + 1, total: totalSteps })}
          </span>
          <span className="text-xs text-[#64748B] hidden sm:inline-block">
            {activeCut ? (currentLang === 'es' ? activeCut.produces_description_es : activeCut.produces_description_en) : ''}
          </span>
        </div>

        <div className="w-48 bg-[#E2E8F0] rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-[#2563EB] h-full transition-all duration-300 rounded-full"
            style={{ width: `${progressPct}%` }}
          ></div>
        </div>
      </div>

      {/* Main Touchscreen Body: Left 3D View, Right Instruction Controls */}
      <div className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0 overflow-y-auto lg:overflow-hidden bg-[#F8FAFC]">
        {/* Left Side: 3D Visualization with Highlighted Cut Plane (7 cols) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col min-h-[380px]">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-bold tracking-wider uppercase text-[#DC2626] flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-[#DC2626] animate-ping"></span>
              <span>{t('current_cut_plane')}</span>
            </span>
            <span className="text-xs text-[#64748B] font-mono">
              Axis: <strong className="text-[#2563EB]">{activeCut?.axis}</strong> @{' '}
              <strong className="text-[#D97706]">{activeCut?.position_display}</strong>
            </span>
          </div>

          <div className="flex-1 relative rounded-xl overflow-hidden border border-[#E2E8F0] shadow-soft bg-white">
            {activeBlock && (
              <ThreeBlockView
                layout={activeBlock}
                highlightedCut={activeCut}
              />
            )}
          </div>
        </div>

        {/* Right Side: Large Touchscreen Dimensioned Instruction Card (5 cols) */}
        <div className="col-span-12 lg:col-span-5 flex flex-col justify-between bg-white rounded-2xl border border-[#E2E8F0] p-6 shadow-soft">
          <div className="space-y-4">
            {/* Cut Title Header */}
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-[#2563EB]">
                Stage {activeCut?.stage || 1}
              </span>
              <h2 className="text-2xl font-black text-[#0F172A] mt-0.5">
                {getCutTitle(activeCut)}
              </h2>
            </div>

            {/* Parameter Grid with large touchscreen readable numbers */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0]">
                <div className="text-xs text-[#64748B] font-medium">{t('cut_height_base')}</div>
                <div className="text-3xl font-extrabold text-[#D97706] font-mono mt-1">
                  {activeCut?.position_display || '--'}
                </div>
              </div>

              <div className="bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0]">
                <div className="text-xs text-[#64748B] font-medium">{t('cut_direction')}</div>
                <div className="text-lg font-bold text-[#0F172A] mt-2">
                  {getCutDirectionText(activeCut)}
                </div>
              </div>

              <div className="bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0]">
                <div className="text-xs text-[#64748B] font-medium">{t('produces')}</div>
                <div className="text-sm font-semibold text-[#2563EB] mt-1">
                  {activeCut ? `${activeCut.target_piece_dims[0]}"×${activeCut.target_piece_dims[1]}"×${activeCut.target_piece_dims[2]}"` : '--'}
                </div>
              </div>

              <div className="bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0]">
                <div className="text-xs text-[#64748B] font-medium">{t('kerf_allowance')}</div>
                <div className="text-sm font-mono font-bold text-[#0F172A] mt-1">
                  {activeCut?.kerf_in || 0.125}" (1/8")
                </div>
              </div>
            </div>

            {/* Instruction description */}
            <div className="p-3.5 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-xs text-[#475569] leading-relaxed">
              {activeCut ? (currentLang === 'es' ? activeCut.produces_description_es : activeCut.produces_description_en) : ''}
            </div>

            {/* Keep Offcut Alert (if remnant produced) */}
            {(activeCut?.remnant_prompt_en || activeCut?.remnant_prompt_es) && (
              <div className="p-3.5 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl flex items-start space-x-3 text-[#D97706] text-xs shadow-soft">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-[#D97706]" />
                <div className="font-semibold leading-relaxed">
                  {currentLang === 'es' ? activeCut.remnant_prompt_es : activeCut.remnant_prompt_en}
                </div>
              </div>
            )}
          </div>

          {/* Large Touch Navigation Buttons (56px+ min-height) */}
          <div className="grid grid-cols-12 gap-3 pt-6 border-t border-[#E2E8F0]">
            <button
              onClick={handlePrev}
              disabled={currentStepIndex === 0}
              className="col-span-4 min-h-[56px] py-4 px-4 rounded-xl bg-white hover:bg-[#F8FAFC] disabled:opacity-40 text-[#475569] hover:text-[#0F172A] font-bold text-sm flex items-center justify-center space-x-2 border border-[#CBD5E1] shadow-soft active:scale-95 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>{t('previous_step')}</span>
            </button>

            <button
              onClick={handleNext}
              disabled={currentStepIndex >= totalSteps - 1}
              className="col-span-8 min-h-[56px] py-4 px-6 rounded-xl bg-[#16A34A] hover:bg-[#15803D] disabled:bg-[#CBD5E1] disabled:opacity-50 text-white font-extrabold text-base flex items-center justify-center space-x-2 shadow-soft active:scale-95 transition-all"
            >
              <CheckCircle2 className="w-6 h-6" />
              <span>{t('confirm_cut')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Sequence Strip: 1✓, 2✓, 3 (active), 4... */}
      <div className="px-6 py-3 bg-white border-t border-[#E2E8F0] flex items-center space-x-3 overflow-x-auto shadow-soft">
        <span className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider flex-shrink-0">
          {t('cut_sequence')}:
        </span>

        <div className="flex items-center space-x-2 flex-nowrap">
          {cuts.map((cut, idx) => {
            const isCompleted = idx < currentStepIndex;
            const isActive = idx === currentStepIndex;

            return (
              <button
                key={idx}
                onClick={() => setCurrentStepIndex(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center space-x-1.5 flex-shrink-0 transition-all ${
                  isActive
                    ? 'bg-[#2563EB] text-white ring-2 ring-blue-300 shadow-soft scale-105'
                    : isCompleted
                    ? 'bg-[#F0FDF4] text-[#16A34A] border border-[#BBF7D0]'
                    : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0] border border-[#E2E8F0]'
                }`}
              >
                <span>{cut.step_number}</span>
                {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-[#16A34A]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
