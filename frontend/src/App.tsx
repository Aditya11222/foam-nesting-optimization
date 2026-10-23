import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Layers,
  Touchpad,
  Clock,
  Globe,
  RotateCw,
  Box,
} from 'lucide-react';
import './i18n';
import type { OptimizationResult, PartItem, FoamGrade, MachineProfile } from './types';
import { fetchGrades, fetchMachines, optimizeJob } from './api';
import { PlannerView } from './components/PlannerView';
import { OperatorStationView } from './components/OperatorStationView';
import { RemnantInventoryView } from './components/RemnantInventoryView';

type ViewMode = 'planner' | 'operator' | 'remnants';

export default function App() {
  const { t, i18n } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>('planner');
  const [grades, setGrades] = useState<FoamGrade[]>([]);
  const [selectedGrade, setSelectedGrade] = useState('HR-40');
  const [machines, setMachines] = useState<MachineProfile[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState('saw-g2');
  const [selectedBlockIndex, setSelectedBlockIndex] = useState(0);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentResult, setCurrentResult] = useState<OptimizationResult | null>(null);

  // Default parts list matching Proposal Job #4821
  const [parts, setParts] = useState<PartItem[]>([
    {
      id: 'part-1',
      sku: 'Cushion A',
      name: 'Sofa Seat Cushion A',
      grade: 'HR-40',
      length: 24.0,
      width: 24.0,
      height: 6.0,
      quantity: 40,
      orientation_mode: 'rise-locked',
      color_hex: '#ef4444',
    },
    {
      id: 'part-2',
      sku: 'Bolster B',
      name: 'Cylindrical Core Bolster B',
      grade: 'HR-40',
      length: 36.0,
      width: 8.0,
      height: 8.0,
      quantity: 24,
      orientation_mode: 'free-in-plane',
      color_hex: '#06b6d4',
    },
    {
      id: 'part-3',
      sku: 'Cube C',
      name: 'Modular Corner Cube C',
      grade: 'HR-40',
      length: 12.0,
      width: 12.0,
      height: 12.0,
      quantity: 60,
      orientation_mode: 'any',
      color_hex: '#10b981',
    },
    {
      id: 'part-4',
      sku: 'Pad D',
      name: 'Support Base Pad D',
      grade: 'HR-40',
      length: 48.0,
      width: 20.0,
      height: 4.0,
      quantity: 18,
      orientation_mode: 'rise-locked',
      color_hex: '#f59e0b',
    },
    {
      id: 'part-5',
      sku: 'Wedge E',
      name: 'Inclined Back Wedge E',
      grade: 'HR-40',
      length: 30.0,
      width: 16.0,
      height: 10.0,
      quantity: 12,
      orientation_mode: 'rise-locked',
      color_hex: '#8b5cf6',
    },
  ]);

  // Initial load
  useEffect(() => {
    async function init() {
      try {
        const [gradeList, machineList] = await Promise.all([fetchGrades(), fetchMachines()]);
        setGrades(gradeList);
        setMachines(machineList);
      } catch (err) {
        console.warn('Backend unavailable, using default grades & machines');
        setGrades([
          { code: 'HR-40', name: 'High Resilience 40 ILD', density_pcf: 2.8, ild_firmness: 40, color_hex: '#3b82f6' },
          { code: 'HR-30', name: 'High Resilience 30 ILD', density_pcf: 2.4, ild_firmness: 30, color_hex: '#06b6d4' },
          { code: 'VE-50', name: 'Visco-Elastic Memory Foam 50', density_pcf: 3.5, ild_firmness: 14, color_hex: '#8b5cf6' },
        ]);
        setMachines([
          { id: 'saw-g2', name: 'Saw Station 2 — Vertical Slicer', cut_type: 'guillotine', max_cut_height: 52, kerf: 0.125, automation: 'rotating', preferred_direction: 'Z' },
          { id: 'saw-g1', name: 'Saw Station 1 — Horizontal Guillotine', cut_type: 'guillotine', max_cut_height: 48, kerf: 0.125, automation: 'CNC', preferred_direction: 'X' },
          { id: 'saw-wj', name: 'Saw Station 3 — Waterjet Profiler', cut_type: 'free', max_cut_height: 36, kerf: 0.0625, automation: 'CNC', preferred_direction: 'X' },
        ]);
      }
      runSolve(parts, selectedGrade, selectedMachineId);
    }
    init();
  }, []);

  const runSolve = async (activeParts: PartItem[], grade: string, machineId?: string) => {
    setIsOptimizing(true);
    const targetMachine = machineId || selectedMachineId || 'saw-g2';
    try {
      const payload = {
        job_id: 'JOB-4821',
        order_id: 'SO-10592',
        customer: 'Acme Bedding',
        grade: grade,
        machine_id: targetMachine,
        parts: activeParts.map((p) => ({ ...p, grade: grade })),
        prefer_remnants_first: true,
        skin_trim_per_face: 1.0,
      };
      const res = await optimizeJob(payload);
      setCurrentResult(res);
      setSelectedBlockIndex(0);
    } catch (err: any) {
      console.error('Optimization error:', err);
      alert(`Optimization Notice: ${err.message || err}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleToggleLang = () => {
    const nextLang = i18n.language === 'en' ? 'es' : 'en';
    i18n.changeLanguage(nextLang);
  };

  const handleAddPart = (newPart: PartItem) => {
    const updated = [newPart, ...parts];
    setParts(updated);
    runSolve(updated, selectedGrade);
  };

  const handleSelectGrade = (newGrade: string) => {
    setSelectedGrade(newGrade);
    const updated = parts.map((p) => ({ ...p, grade: newGrade }));
    setParts(updated);
    runSolve(updated, newGrade);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Global Application Header */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-6 flex items-center justify-between flex-shrink-0 z-30">
        <div className="flex items-center space-x-6">
          {/* Logo */}
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-sky-950">
              <Box className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-black text-base text-white tracking-wide">
                Tatras <span className="text-sky-400 font-extrabold">NestPro</span>
              </span>
              <span className="text-[10px] text-slate-400 ml-1.5 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
                3D Slicing MVP
              </span>
            </div>
          </div>

          {/* Navigation Views */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-850 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setViewMode('planner')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                viewMode === 'planner'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t('nav_planner')}</span>
            </button>

            <button
              onClick={() => setViewMode('operator')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                viewMode === 'operator'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Touchpad className="w-3.5 h-3.5" />
              <span>{t('nav_operator')}</span>
            </button>

            <button
              onClick={() => setViewMode('remnants')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                viewMode === 'remnants'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{t('nav_remnants')}</span>
            </button>
          </nav>
        </div>

        {/* Right side controls: Language toggle */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleToggleLang}
            className="flex items-center space-x-1.5 bg-slate-850 hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-bold text-slate-300 transition-all"
            title="Toggle English / Spanish"
          >
            <Globe className="w-3.5 h-3.5 text-sky-400" />
            <span>{i18n.language === 'en' ? 'EN' : 'ES'}</span>
            <span className="text-[10px] text-slate-500 font-normal">({t('switch_language')})</span>
          </button>
        </div>
      </header>

      {/* Main View Router */}
      <main className="flex-1 flex flex-col min-h-0 relative">
        {currentResult ? (
          <>
            {viewMode === 'planner' && (
              <PlannerView
                result={currentResult}
                selectedBlockIndex={selectedBlockIndex}
                onSelectBlock={setSelectedBlockIndex}
                onRunOptimization={() => runSolve(parts, selectedGrade, selectedMachineId)}
                isOptimizing={isOptimizing}
                onSendToSaw={() => setViewMode('operator')}
                grades={grades}
                selectedGrade={selectedGrade}
                onSelectGrade={handleSelectGrade}
                onAddPart={handleAddPart}
                machines={machines}
                selectedMachineId={selectedMachineId}
                onSelectMachine={(id) => {
                  setSelectedMachineId(id);
                  runSolve(parts, selectedGrade, id);
                }}
              />
            )}

            {viewMode === 'operator' && (
              <OperatorStationView
                result={currentResult}
                selectedBlockIndex={selectedBlockIndex}
                onSelectBlock={setSelectedBlockIndex}
                onBackToPlanner={() => setViewMode('planner')}
              />
            )}

            {viewMode === 'remnants' && <RemnantInventoryView />}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            <RotateCw className="w-5 h-5 animate-spin mr-2 text-sky-400" />
            Loading 3D Optimization Model...
          </div>
        )}
      </main>
    </div>
  );
}
