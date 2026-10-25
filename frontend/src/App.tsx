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
import { ProgressHeader, Step4Placeholder } from './components/HelperComponents';
import { SidebarInputs } from './components/SidebarInputs';
import { OptimizationSection } from './components/OptimizationSection';
import { Step3GenerateSection } from './components/Step3GenerateSection';
import { CuttingPlan3DView } from './components/CuttingPlan3DView';
import { DashboardStep4 } from './components/DashboardStep4';
import { exportJobCSV } from './utils/csvExport';

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

export default function App() {
  const { i18n } = useTranslation();

  // Inputs state
  const [grades, setGrades] = useState<FoamGrade[]>([]);
  const [selectedGrade, setSelectedGrade] = useState('HR-40');
  const [allowMixedGrades, setAllowMixedGrades] = useState(false);
  const [machines, setMachines] = useState<MachineProfile[]>([]);
  const [selectedMachineId, setSelectedMachineId] = useState('saw-g2');
  const [skinTrim, setSkinTrim] = useState(1.0);
  const [kerf, setKerf] = useState(0.125);
  const [blocks, setBlocks] = useState<BlockInput[]>(DEFAULT_BLOCKS);
  const [parts, setParts] = useState<PartItem[]>(SAMPLE_JOB_PARTS);

  // Algorithms & Results state
  const [algorithms, setAlgorithms] = useState<AlgorithmInfo[]>([]);
  const [selectedAlgorithmId, setSelectedAlgorithmId] = useState('best_fit_decreasing');
  const [resultsByAlgo, setResultsByAlgo] = useState<Record<string, OptimizationResult>>({});
  const [comparisonResults, setComparisonResults] = useState<OptimizationResult[] | null>(null);

  // Status flags
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isStale, setIsStale] = useState(false);
  const [is3DGenerated, setIs3DGenerated] = useState(false);

  // Timer interval ref
  const timerRef = useRef<number | null>(null);

  // Initial fetch of grades, machines, algorithms
  useEffect(() => {
    async function init() {
      try {
        const [gradeList, machineList, algoList] = await Promise.all([
          fetchGrades(),
          fetchMachines(),
          fetchAlgorithms(),
        ]);
        setGrades(gradeList);
        setMachines(machineList);
        setAlgorithms(algoList);
        if (algoList.length > 0) {
          setSelectedAlgorithmId(algoList[0].id);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }
    init();
  }, []);

  // Timer runner for optimization loading
  const startTimer = () => {
    setElapsedSeconds(0);
    const start = Date.now();
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((Date.now() - start) / 1000);
    }, 100);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Grade as Single Source of Truth
  const handleSelectGrade = (newGrade: string) => {
    setSelectedGrade(newGrade);
    setBlocks((prev) => prev.map((b) => ({ ...b, grade: newGrade })));
    setParts((prev) => prev.map((p) => ({ ...p, grade: newGrade })));
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
      setIs3DGenerated(false); // User must explicitly click "Generate 3D Cutting Plan"
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

      // Cache all results in client state
      const updatedMap = { ...resultsByAlgo };
      results.forEach((r) => {
        updatedMap[r.algorithm_id] = r;
      });
      setResultsByAlgo(updatedMap);

      // If winner found, select it
      const winner = results.find((r) => r.is_best);
      if (winner) {
        setSelectedAlgorithmId(winner.algorithm_id);
      }

      setIsStale(false);
      setIs3DGenerated(false);
    } catch (err: any) {
      alert(`Comparison error: ${err.message}`);
    } finally {
      stopTimer();
      setIsOptimizing(false);
    }
  };

  // Select algorithm from dropdown (does NOT invalidate results)
  const handleSelectAlgorithm = (id: string) => {
    setSelectedAlgorithmId(id);
  };

  // Select algorithm from comparison table row click
  const handleSelectResultFromTable = (algoId: string) => {
    setSelectedAlgorithmId(algoId);
  };

  // Action: Load Proposal Sample
  const handleLoadSample = () => {
    setSelectedGrade('HR-40');
    setSkinTrim(1.0);
    setKerf(0.125);
    setBlocks(DEFAULT_BLOCKS);
    setParts(SAMPLE_JOB_PARTS);
    handleInputModified();
  };

  // Block management
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

  // Part management
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

  // Action: Export CSV
  const handleExportCSV = () => {
    if (currentResult) {
      exportJobCSV(currentResult, comparisonResults);
    }
  };

  // Toggle Language
  const handleToggleLang = () => {
    const nextLang = i18n.language === 'en' ? 'es' : 'en';
    i18n.changeLanguage(nextLang);
  };

  const currentResult: OptimizationResult | null = resultsByAlgo[selectedAlgorithmId] || null;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-800">
      {/* Top Header with Progress Stepper */}
      <ProgressHeader
        currentStep={is3DGenerated ? 3 : currentResult ? 2 : 1}
        isStale={isStale}
        hasResult={Boolean(currentResult)}
        is3DGenerated={is3DGenerated}
        onToggleLang={handleToggleLang}
      />

      {/* Main Single-Page Worker Layout: Left Sidebar + Main Pane */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Step 1: Input (Left Sidebar) */}
        <SidebarInputs
          grades={grades}
          selectedGrade={selectedGrade}
          onSelectGrade={handleSelectGrade}
          allowMixedGrades={allowMixedGrades}
          onToggleMixedGrades={handleToggleMixedGrades}
          machines={machines}
          selectedMachineId={selectedMachineId}
          onSelectMachine={handleSelectMachine}
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

        {/* Main Panel: Step 2 Optimize & Step 3 3D Plan */}
        <main className="flex-1 p-5 overflow-y-auto space-y-5">
          {/* Step 2: Optimize & Benchmark */}
          <OptimizationSection
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
            selectedMachine={machines.find((m) => m.id === selectedMachineId)}
          />

          {/* Step 3: Generate 3D Cutting Plan */}
          <Step3GenerateSection
            currentResult={currentResult}
            isStale={isStale}
            is3DGenerated={is3DGenerated}
            onGenerate3DPlan={() => setIs3DGenerated(true)}
          >
            {currentResult && <CuttingPlan3DView result={currentResult} />}
          </Step3GenerateSection>

          {/* Step 4: Execute & Track Dashboard */}
          {currentResult ? (
            <DashboardStep4
              currentResult={currentResult}
              comparisonResults={comparisonResults}
              onGoToCutSteps={() => {
                setIs3DGenerated(true);
                const el = document.getElementById('step3-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              onExportCSV={handleExportCSV}
            />
          ) : (
            <Step4Placeholder />
          )}
        </main>
      </div>
    </div>
  );
}
