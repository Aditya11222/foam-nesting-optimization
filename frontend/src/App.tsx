import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import './i18n';
import type {
  FoamGrade,
  MachineProfile,
  AlgorithmInfo,
  PartItem,
  BlockInput,
  OptimizationResult,
  OptimizationRequest,
} from './types';
import {
  fetchGrades,
  fetchMachines,
  fetchAlgorithms,
  optimizeJob,
  compareAlgorithms,
} from './api';
import { TopNavbar } from './components/TopNavbar';
import { IconRail } from './components/IconRail';
import { ChevronStepper, type StepItem } from './components/ChevronStepper';
import { SidebarInputs } from './components/SidebarInputs';
import { AlgorithmPlacementCard } from './components/AlgorithmPlacementCard';
import { CuttingPlanCard } from './components/CuttingPlanCard';
import { ExecutiveSummaryCard } from './components/ExecutiveSummaryCard';
import { DashboardStep4 } from './components/DashboardStep4';
import { Step4Placeholder } from './components/HelperComponents';
import { exportJobCSV } from './utils/csvExport';
import {
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Download,
  Loader2,
  Clock,
} from 'lucide-react';

// Proposal Job #4821 Default Sample Parts (154 items total)
const SAMPLE_JOB_PARTS: PartItem[] = [
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
    sku: 'Wedge D',
    name: 'Lumbar Support Wedge D',
    grade: 'HR-40',
    length: 18.0,
    width: 14.0,
    height: 10.0,
    quantity: 30,
    orientation_mode: 'free-in-plane',
    color_hex: '#f59e0b',
  },
];

const DEFAULT_BLOCKS: BlockInput[] = [
  {
    id: 'bun-1',
    nominal_length: 108.0,
    nominal_width: 82.0,
    nominal_height: 40.0,
    grade: 'HR-40',
    quantity: 6,
  },
];

const WORKFLOW_STEPS: StepItem[] = [
  { id: 1, label: '1. Setup & Data Import', description: 'Raw bun & part specs' },
  { id: 2, label: '2. Algorithm & Placement', description: 'Engine selection & solve' },
  { id: 3, label: '3. Cutting Plan & Visualization', description: 'Interactive cut visualizer' },
  { id: 4, label: '4. Results & Execution', description: 'Yield, scrap & cut sheets' },
];

export function App() {
  const { i18n } = useTranslation();

  // Active workflow step: 1 (Setup), 2 (Algorithm & Placement), 3 (3D Plan), 4 (Results)
  const [activeStep, setActiveStep] = useState<number>(2);

  // Core Data States
  const [grades, setGrades] = useState<FoamGrade[]>([]);
  const [machines, setMachines] = useState<MachineProfile[]>([]);
  const [algorithms, setAlgorithms] = useState<AlgorithmInfo[]>([]);

  // Configuration States
  const [selectedGrade, setSelectedGrade] = useState<string>('HR-40');
  const [allowMixedGrades, setAllowMixedGrades] = useState<boolean>(false);
  const [selectedMachineId, setSelectedMachineId] = useState<string>('saw-g2');
  const [machineObjective, setMachineObjective] = useState<'lowest_cost' | 'best_yield' | 'lowest_time'>('lowest_cost');
  const [skinTrim, setSkinTrim] = useState<number>(1.0);
  const [kerf, setKerf] = useState<number>(0.125);
  const [blocks, setBlocks] = useState<BlockInput[]>(DEFAULT_BLOCKS);
  const [parts, setParts] = useState<PartItem[]>(SAMPLE_JOB_PARTS);

  // Engine States
  const [selectedAlgorithmId, setSelectedAlgorithmId] = useState<string>('ortools_block_assignment');
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [is3DGenerated, setIs3DGenerated] = useState<boolean>(false);

  // Output States
  const [resultsByAlgo, setResultsByAlgo] = useState<Record<string, OptimizationResult>>({});
  const [comparisonResults, setComparisonResults] = useState<OptimizationResult[]>([]);

  const timerRef = useRef<any>(null);

  // Initial Data Fetch
  useEffect(() => {
    async function init() {
      try {
        const [g, m, a] = await Promise.all([
          fetchGrades(),
          fetchMachines(),
          fetchAlgorithms(),
        ]);
        setGrades(g);
        setMachines(m);
        setAlgorithms(a);

        let activeMachId = selectedMachineId;
        if (m.length > 0 && !selectedMachineId) {
          activeMachId = m[0].id;
          setSelectedMachineId(m[0].id);
          setKerf(m[0].kerf);
        }

        const params = new URLSearchParams(window.location.search);
        const stepParam = params.get('step');
        if (stepParam) {
          setActiveStep(parseInt(stepParam) || 2);
        }
        const langParam = params.get('lang');
        if (langParam === 'es') {
          i18n.changeLanguage('es');
        }
        const autoRunParam = params.get('autorun');
        if (autoRunParam === 'true') {
          const autoReq: OptimizationRequest = {
            job_id: 'JOB-4821',
            customer: 'Acme Bedding SO-10592',
            grade: 'HR-40',
            machine_id: activeMachId || 'saw-g2',
            machine_objective: 'lowest_cost',
            skin_trim_per_face: 1.0,
            kerf: 0.125,
            parts: SAMPLE_JOB_PARTS,
            available_blocks: DEFAULT_BLOCKS,
            algorithm_id: 'best_fit_decreasing',
            seed: 42,
            time_budget_seconds: 10.0,
          };
          try {
            const res = await optimizeJob(autoReq);
            setResultsByAlgo({ ortools_block_assignment: res, best_fit_decreasing: res });
            setIs3DGenerated(true);
            setIsStale(false);
          } catch (e) {
            console.error('Autorun optimize failed:', e);
          }
        }
      } catch (err) {
        console.error('Failed to load initial metadata:', err);
      }
    }
    init();
  }, []);

  // Timer helpers
  const startTimer = () => {
    setElapsedSeconds(0);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Number(((Date.now() - start) / 1000).toFixed(1)));
    }, 100);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Grade synchronization
  const handleSelectGrade = (newGrade: string) => {
    setSelectedGrade(newGrade);
    if (!allowMixedGrades) {
      setBlocks((prev) => prev.map((b) => ({ ...b, grade: newGrade })));
      setParts((prev) => prev.map((p) => ({ ...p, grade: newGrade })));
    }
    handleInputModified();
  };

  const handleToggleMixedGrades = (allowed: boolean) => {
    setAllowMixedGrades(allowed);
    if (!allowed) {
      setBlocks((prev) => prev.map((b) => ({ ...b, grade: selectedGrade })));
      setParts((prev) => prev.map((p) => ({ ...p, grade: selectedGrade })));
      handleInputModified();
    }
  };

  const handleSelectMachine = (newMachineId: string) => {
    setSelectedMachineId(newMachineId);
    const m = machines.find((mach) => mach.id === newMachineId);
    if (m) {
      setKerf(m.kerf);
      if (m.cut_type === 'free') {
        setSelectedAlgorithmId('free_nesting_heuristic');
      } else if (selectedAlgorithmId === 'free_nesting_heuristic') {
        setSelectedAlgorithmId('best_fit_decreasing');
      }
    }
    handleInputModified();
  };

  // Flag input changes as stale
  const handleInputModified = () => {
    setIsStale(true);
    setIs3DGenerated(false);
  };

  // Build current payload helper
  const buildPayload = (algoId: string): OptimizationRequest => ({
    job_id: `JOB-${Date.now().toString().slice(-6)}`,
    customer: 'Acme Bedding SO-10592',
    grade: selectedGrade,
    machine_id: selectedMachineId,
    machine_objective: machineObjective,
    skin_trim_per_face: skinTrim,
    kerf: kerf,
    parts: parts,
    available_blocks: blocks,
    algorithm_id: algoId,
    seed: 42,
    time_budget_seconds: 10.0,
  });

  // Action: Run Selected Algorithm
  const handleRunOptimization = async () => {
    setIsOptimizing(true);
    startTimer();
    try {
      const payload = buildPayload(selectedAlgorithmId);
      const result = await optimizeJob(payload);

      setResultsByAlgo((prev) => ({
        ...prev,
        [selectedAlgorithmId]: result,
      }));
      setIsStale(false);
      setIs3DGenerated(true);
      setActiveStep(2);
    } catch (err: any) {
      alert(`Optimization error: ${err.message}`);
    } finally {
      stopTimer();
      setIsOptimizing(false);
    }
  };

  // Action: Compare All Algorithms
  const handleCompareAll = async () => {
    setIsOptimizing(true);
    startTimer();
    try {
      const payload = buildPayload(selectedAlgorithmId);
      const results = await compareAlgorithms(payload);

      setComparisonResults(results);

      const updatedMap = { ...resultsByAlgo };
      results.forEach((r) => {
        updatedMap[r.algorithm_id] = r;
      });
      setResultsByAlgo(updatedMap);

      const winner = results.find((r) => r.is_best);
      if (winner) {
        setSelectedAlgorithmId(winner.algorithm_id);
      }

      setIsStale(false);
      setIs3DGenerated(true);
      setActiveStep(2);
    } catch (err: any) {
      alert(`Comparison error: ${err.message}`);
    } finally {
      stopTimer();
      setIsOptimizing(false);
    }
  };

  const handleSelectAlgorithm = (id: string) => {
    setSelectedAlgorithmId(id);
  };

  const handleSelectResultFromTable = (algoId: string) => {
    setSelectedAlgorithmId(algoId);
  };

  const handleLoadSample = () => {
    setSelectedGrade('HR-40');
    setSkinTrim(1.0);
    setKerf(0.125);
    setBlocks(DEFAULT_BLOCKS);
    setParts(SAMPLE_JOB_PARTS);
    handleInputModified();
  };

  const handleAddBlock = () => {
    setBlocks((prev) => [
      ...prev,
      {
        id: `bun-${Date.now().toString().slice(-4)}`,
        nominal_length: 108.0,
        nominal_width: 82.0,
        nominal_height: 40.0,
        grade: selectedGrade,
        quantity: 1,
      },
    ]);
  };

  const handleRemoveBlock = (idx: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateBlock = (idx: number, updated: Partial<BlockInput>) => {
    setBlocks((prev) =>
      prev.map((b, i) => (i === idx ? { ...b, ...updated } : b))
    );
  };

  const handleAddPart = () => {
    setParts((prev) => [
      ...prev,
      {
        id: `part-${Date.now().toString().slice(-4)}`,
        sku: `Part ${prev.length + 1}`,
        name: `Part ${prev.length + 1}`,
        grade: selectedGrade,
        length: 24.0,
        width: 24.0,
        height: 6.0,
        quantity: 10,
        orientation_mode: 'rise-locked',
        color_hex: '#3b82f6',
      },
    ]);
  };

  const handleRemovePart = (idx: number) => {
    setParts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdatePart = (idx: number, updated: Partial<PartItem>) => {
    setParts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, ...updated } : p))
    );
  };

  const handleExportCSV = () => {
    if (currentResult) {
      exportJobCSV(currentResult, comparisonResults);
    }
  };

  const handleToggleLang = () => {
    const nextLang = i18n.language === 'en' ? 'es' : 'en';
    i18n.changeLanguage(nextLang);
  };

  const currentResult: OptimizationResult | null = resultsByAlgo[selectedAlgorithmId] || null;
  const selectedMachine = machines.find((m) => m.id === selectedMachineId);

  // Workflow step click handler
  const handleStepClick = (stepId: number) => {
    setActiveStep(stepId);
    if (stepId === 3 && currentResult) {
      setIs3DGenerated(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (stepId === 4 && currentResult) {
      const el = document.getElementById('step4-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-800 antialiased">
      {/* 1.1 Top Navigation Bar */}
      <TopNavbar
        currentLang={i18n.language}
        onToggleLang={handleToggleLang}
      />

      {/* Main Layout Area: Slim Icon Rail + Page Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* 1.2 Slim Icon Rail */}
        <IconRail
          activeTab={activeStep === 1 ? 'home' : 'optimization'}
          onNavigateHome={() => setActiveStep(1)}
        />

        {/* Scrollable Work Area */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* 1.3 Page Header Row */}
          <section className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 shadow-2xs">
            {/* Left: Project / Batch title & Metadata */}
            <div className="flex flex-col">
              <div className="flex items-center space-x-2.5">
                <h1 className="text-lg lg:text-xl font-bold text-slate-900 tracking-tight">
                  Nest: Acme Bedding SO-10592 — Batch #4821
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                  Grade {selectedGrade}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center space-x-2">
                <span>Created Oct 25, 2026</span>
                <span>•</span>
                <span>
                  Cut Type: <strong>{selectedMachine?.cut_type === 'free' ? 'Free / Contour' : 'Guillotine Rotating'}</strong>
                </span>
                <span>•</span>
                <span>
                  Machine: <strong>{selectedMachine?.name || 'Saw Station 2'}</strong>
                </span>
              </p>
            </div>

            {/* Right: Real-time Status Badge & Action Buttons */}
            <div className="flex items-center space-x-3">
              {/* Real-time Status Badge */}
              {isOptimizing ? (
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Optimizing ({elapsedSeconds}s)...</span>
                </div>
              ) : isStale ? (
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-xs font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Inputs Modified (Stale)</span>
                </div>
              ) : currentResult ? (
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Project Status: Optimized</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-600 text-xs font-semibold">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span>Ready to Optimize</span>
                </div>
              )}

              {/* Action Button: Export CSV */}
              {currentResult && (
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition cursor-pointer"
                  title="Export complete placement & cut manifest to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>Export CSV</span>
                </button>
              )}

              {/* Action Button: Generate G-Code (Disabled) */}
              <button
                type="button"
                disabled
                title="G-code export is planned, not yet available"
                className="inline-flex items-center space-x-2 px-4 py-2 text-xs font-bold text-white bg-slate-900 rounded-lg opacity-70 cursor-not-allowed shadow-2xs transition"
              >
                <FileCode className="w-4 h-4 text-slate-300" />
                <span>Generate G-Code</span>
              </button>
            </div>
          </section>

          {/* 1.4 Chevron Stepper */}
          <ChevronStepper
            steps={WORKFLOW_STEPS}
            activeStep={activeStep}
            maxReachableStep={currentResult ? 4 : 2}
            onStepClick={handleStepClick}
          />

          {/* Main View Area */}
          <main className="flex-1 p-4 lg:p-6">
            {activeStep === 1 ? (
              /* Step 1: Clean Centered Card Form */
              <SidebarInputs
                mode="card"
                onContinueToOptimization={() => setActiveStep(2)}
                grades={grades}
                selectedGrade={selectedGrade}
                onSelectGrade={handleSelectGrade}
                allowMixedGrades={allowMixedGrades}
                onToggleMixedGrades={handleToggleMixedGrades}
                machines={machines}
                selectedMachineId={selectedMachineId}
                onSelectMachine={handleSelectMachine}
                machineObjective={machineObjective}
                onSelectMachineObjective={setMachineObjective}
                skinTrim={skinTrim}
                onChangeSkinTrim={setSkinTrim}
                kerf={kerf}
                onChangeKerf={setKerf}
                blocks={blocks}
                onAddBlock={handleAddBlock}
                onRemoveBlock={handleRemoveBlock}
                onUpdateBlock={handleUpdateBlock}
                parts={parts}
                onAddPart={handleAddPart}
                onRemovePart={handleRemovePart}
                onUpdatePart={handleUpdatePart}
                onLoadSample={handleLoadSample}
                onInputModified={handleInputModified}
              />
            ) : (
              /* Steps 2-4 Workspace */
              <div className="space-y-6 max-w-7xl mx-auto w-full">
                {/* 1.5 Three-Card Workspace: Equal Height Side-by-Side (30% / 40% / 30%) */}
                <div className="grid grid-cols-1 lg:grid-cols-10 gap-5 items-stretch w-full">
                  {/* Left Card: Algorithm & Placement (30% width) */}
                  <div className="lg:col-span-3 flex flex-col">
                    <AlgorithmPlacementCard
                      algorithms={algorithms}
                      selectedAlgorithmId={selectedAlgorithmId}
                      onSelectAlgorithm={handleSelectAlgorithm}
                      onRunOptimization={handleRunOptimization}
                      onCompareAll={handleCompareAll}
                      isOptimizing={isOptimizing}
                      elapsedSeconds={elapsedSeconds}
                      isStale={isStale}
                      currentResult={currentResult}
                      comparisonResults={comparisonResults}
                      onSelectResultFromTable={handleSelectResultFromTable}
                    />
                  </div>

                  {/* Center Card: Cutting Plan & Visualization (40% width) */}
                  <div className="lg:col-span-4 flex flex-col">
                    <CuttingPlanCard
                      currentResult={currentResult}
                      selectedMachine={selectedMachine}
                      isStale={isStale}
                      is3DGenerated={is3DGenerated}
                      onGenerate3DPlan={() => setIs3DGenerated(true)}
                    />
                  </div>

                  {/* Right Card: Optimization Executive Summary (30% width) */}
                  <div className="lg:col-span-3 flex flex-col">
                    <ExecutiveSummaryCard
                      currentResult={currentResult}
                      totalAvailableBlocks={blocks.reduce((acc, b) => acc + b.quantity, 0)}
                      onGoToStep4={() => {
                        setActiveStep(4);
                        const el = document.getElementById('step4-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                    />
                  </div>
                </div>

                {/* 1.6 Step 4 Detailed Analytics Section (Full width below the cards) */}
                <div id="step4-section" className="pt-2">
                  {currentResult ? (
                    <DashboardStep4
                      currentResult={currentResult}
                      comparisonResults={comparisonResults}
                      onGoToCutSteps={() => {
                        setActiveStep(3);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      onExportCSV={handleExportCSV}
                    />
                  ) : (
                    <Step4Placeholder />
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
