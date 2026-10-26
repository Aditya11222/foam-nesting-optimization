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
import { DATA_PALETTE, DEFAULT_COST_ASSUMPTIONS, type CostAssumptions } from './tokens';
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
  FileCode,
  Download,
} from 'lucide-react';

// Proposal Job #4821 Default Sample Parts (154 items total) using warm DATA_PALETTE
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
    color_hex: DATA_PALETTE[0],
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
    color_hex: DATA_PALETTE[1],
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
    color_hex: DATA_PALETTE[2],
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
    color_hex: DATA_PALETTE[3],
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
  { id: 2, label: '2. Algorithm Selection & Placement', description: 'Heuristic & CP-SAT solve' },
  { id: 3, label: '3. Cutting Plan & Visualization', description: '3D bun & saw sequence' },
  { id: 4, label: '4. Results & Execution', description: 'Cost, charts & traveler' },
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

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
          setActiveStep(parseInt(stepParam, 10) || 2);
        }
        const langParam = params.get('lang');
        if (langParam === 'es') {
          i18n.changeLanguage('es');
        }
        const autoRunParam = params.get('autorun');
        if (autoRunParam !== 'false') {
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
            algorithm_id: 'ortools_block_assignment',
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
    job_id: 'JOB-4821',
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
      console.error(`Optimization error: ${err.message}`);
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
      console.error(`Comparison error: ${err.message}`);
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
        name: `Foam Component ${prev.length + 1}`,
        grade: selectedGrade,
        length: 24.0,
        width: 24.0,
        height: 6.0,
        quantity: 10,
        orientation_mode: 'rise-locked',
        color_hex: DATA_PALETTE[prev.length % DATA_PALETTE.length],
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

  const handleExportCSV = (assumptions: CostAssumptions = DEFAULT_COST_ASSUMPTIONS) => {
    if (currentResult && !isStale) {
      exportJobCSV(currentResult, comparisonResults, assumptions);
    }
  };

  const handleToggleLang = () => {
    const nextLang = i18n.language === 'en' ? 'es' : 'en';
    i18n.changeLanguage(nextLang);
  };

  const currentResult: OptimizationResult | null = resultsByAlgo[selectedAlgorithmId] || null;
  const selectedMachine = machines.find((m) => m.id === selectedMachineId);
  const totalPartsCount = parts.reduce((acc, p) => acc + p.quantity, 0);
  const maxReachableStep = currentResult && !isStale ? 4 : 2;

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
    <div className="min-h-screen workbench-canvas flex flex-col text-ink antialiased">
      {/* 1.1 Top Navigation Bar */}
      <TopNavbar
        currentLang={i18n.language}
        onToggleLang={handleToggleLang}
      />

      {/* Main Layout Area: Slim 56px Icon Rail + Page Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* 1.2 Slim 56px Icon Rail */}
        <IconRail
          activeStep={activeStep}
          maxReachableStep={maxReachableStep}
          onSelectStep={handleStepClick}
        />

        {/* Scrollable Work Area */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {/* 1.3 Page Header Band */}
          <section className="header-band px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
            {/* Left: Job Title in Newsreader (28/36) & Metadata */}
            <div className="flex flex-col">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-[28px] leading-[36px] font-normal text-ink tracking-tight">
                  Nest: Job #4821
                </h1>
                <span className="px-2.5 py-0.5 text-[11.5px] font-mono font-medium rounded-control bg-cocoa-tint text-cocoa border border-cocoa/25">
                  Grade {selectedGrade}
                </span>
                <span className="text-[13px] text-secondary">
                  Acme Bedding SO-10592 • Oct 25, 2026
                </span>
              </div>
              <p className="text-[12px] text-secondary mt-1 flex flex-wrap items-center gap-2">
                <span>
                  Machine Profile: <strong className="text-ink font-medium">{selectedMachine?.name || 'Guillotine Saw Station 2'}</strong>
                </span>
                <span>•</span>
                <span>
                  Cut Mode: <strong className="text-ink font-medium">{selectedMachine?.cut_type === 'free' ? 'Free / Contour' : 'Guillotine Face-to-Face'}</strong>
                </span>
                <span>•</span>
                <span className="font-mono text-[11.5px] text-muted">
                  Trim {skinTrim}&quot; | Kerf {kerf}&quot;
                </span>
              </p>
            </div>

            {/* Right: Status Badge with Dot & Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Status Badge */}
              {isOptimizing ? (
                <div className="inline-flex items-center gap-2 h-9 px-3.5 rounded-control bg-cocoa-tint border border-cocoa/35 text-cocoa text-[12px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-cocoa animate-ping" />
                  <span className="font-mono tabular-nums">
                    Optimizing ({elapsedSeconds.toFixed(1)}s)
                  </span>
                </div>
              ) : isStale ? (
                <div className="inline-flex items-center gap-2 h-9 px-3.5 rounded-control bg-status-warning-bg border border-status-warning/40 text-status-warning text-[12px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-status-warning" />
                  <span>Stale (Inputs Modified)</span>
                </div>
              ) : currentResult ? (
                <div className="inline-flex items-center gap-2 h-9 px-3.5 rounded-control bg-status-success-bg border border-status-success/40 text-status-success text-[12px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-status-success" />
                  <span>Optimized</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 h-9 px-3.5 rounded-control bg-raised border border-strong text-secondary text-[12px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-muted" />
                  <span>Not optimized</span>
                </div>
              )}

              {/* Export CSV Action */}
              {currentResult && (
                <button
                  type="button"
                  disabled={isStale}
                  onClick={() => handleExportCSV(DEFAULT_COST_ASSUMPTIONS)}
                  className="btn-secondary h-10 px-3.5 rounded-control text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  title={
                    isStale
                      ? 'Re-run optimization to export updated CSV'
                      : 'Export complete placement & cut manifest to UTF-8 CSV'
                  }
                >
                  <Download className="w-4 h-4 stroke-[1.5] text-cocoa" />
                  <span>Export CSV</span>
                </button>
              )}

              {/* Disabled Generate G-Code Placeholder */}
              <button
                type="button"
                disabled
                title="planned, not yet available"
                className="h-10 px-4 rounded-control text-[13px] font-medium inline-flex items-center gap-2 bg-raised text-muted border border-strong opacity-75 cursor-not-allowed"
              >
                <FileCode className="w-4 h-4 stroke-[1.5]" />
                <span>Generate G-Code</span>
              </button>
            </div>
          </section>

          {/* 1.4 Chevron Stepper */}
          <ChevronStepper
            steps={WORKFLOW_STEPS}
            activeStep={activeStep}
            maxReachableStep={maxReachableStep}
            onStepClick={handleStepClick}
          />

          {/* Main 1440px Container with 24px Page Padding */}
          <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto">
            {activeStep === 1 ? (
              /* Step 1: Setup & Data Import */
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
              /* Steps 2-4 Workspace: 24px between major sections */
              <div className="space-y-6 w-full">
                {/* 1.5 Three-Card Workspace (30% / 40% / 30%, 16px gap) */}
                <div className="grid grid-cols-1 xl:grid-cols-10 gap-4 items-stretch w-full">
                  {/* Left Card: Algorithm Selection & Placement (30%) */}
                  <div className="xl:col-span-3 flex flex-col">
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
                      selectedMachine={selectedMachine}
                      totalPartsCount={totalPartsCount}
                      blockTypesCount={blocks.length}
                    />
                  </div>

                  {/* Center Card: Cutting Plan & Visualization (40%) */}
                  <div className="xl:col-span-4 flex flex-col">
                    <CuttingPlanCard
                      currentResult={currentResult}
                      selectedMachine={selectedMachine}
                      isStale={isStale}
                      is3DGenerated={is3DGenerated}
                      onGenerate3DPlan={() => setIs3DGenerated(true)}
                    />
                  </div>

                  {/* Right Card: Optimization Executive Summary (30%) */}
                  <div className="xl:col-span-3 flex flex-col">
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

                {/* 1.6 Step 4 Detailed Analytics & Execution Section (Full width below) */}
                <div id="step4-section" className="pt-2">
                  {currentResult ? (
                    <DashboardStep4
                      currentResult={currentResult}
                      comparisonResults={comparisonResults}
                      isStale={isStale}
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
