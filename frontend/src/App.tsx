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
  NavRoute,
  SavedJob,
  RemnantInventoryItem,
  ActivityLogItem,
  OptimizationObjective,
  StrategyRecommendationResult,
} from './types';
import {
  recommendMachine,
  recommendObjective,
  recommendStrategy,
  evaluateBestMeasuredStrategy,
  validateScreen1Inputs,
  ALGORITHM_DISPLAY_NAMES,
} from './services/recommender';
import {
  fetchGrades,
  fetchMachines,
  fetchAlgorithms,
  optimizeJob,
  compareAlgorithms,
} from './api';
import {
  getStorageData,
  saveJob,
  deleteJob,
  saveInventoryBlocks,
  addRemnants,
  logActivity,
  clearDemoStorage,
} from './utils/storage';
import { TopNavbar } from './components/TopNavbar';
import { IconRail } from './components/IconRail';
import { JobHeader } from './components/JobHeader';
import { ChevronStepper, type StepItem } from './components/ChevronStepper';
import { SidebarInputs } from './components/SidebarInputs';
import { AlgorithmPlacementCard } from './components/AlgorithmPlacementCard';
import { CuttingPlanCard } from './components/CuttingPlanCard';
import { ExecutiveSummaryCard } from './components/ExecutiveSummaryCard';
import { DashboardStep4 } from './components/DashboardStep4';
import { Step4Placeholder } from './components/HelperComponents';
import { StickyActionBar } from './components/StickyActionBar';
import { exportJobCSV } from './utils/csvExport';

// Pages
import { DashboardPage } from './components/pages/DashboardPage';
import { ProjectsPage } from './components/pages/ProjectsPage';
import { InventoryPage } from './components/pages/InventoryPage';
import { ReportsPage } from './components/pages/ReportsPage';

// Default Sample Parts for Sample Job #4821 (154 items total)
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
  const { t, i18n } = useTranslation();

  // Client-side Navigation Router
  const getInitialRoute = (): NavRoute => {
    const path = window.location.pathname;
    const validRoutes: NavRoute[] = ['/dashboard', '/projects', '/optimization', '/inventory', '/reports'];
    return validRoutes.includes(path as NavRoute) ? (path as NavRoute) : '/optimization';
  };

  const [currentRoute, setCurrentRoute] = useState<NavRoute>(getInitialRoute);

  const navigateTo = (route: NavRoute) => {
    setCurrentRoute(route);
    if (window.location.pathname !== route) {
      window.history.pushState({}, '', route);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const validRoutes: NavRoute[] = ['/dashboard', '/projects', '/optimization', '/inventory', '/reports'];
      if (validRoutes.includes(path as NavRoute)) {
        setCurrentRoute(path as NavRoute);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Shared Persistence Store State (from localStorage)
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [inventoryBlocks, setInventoryBlocks] = useState<BlockInput[]>(DEFAULT_BLOCKS);
  const [remnants, setRemnants] = useState<RemnantInventoryItem[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([]);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Active Job Metadata
  const [jobName, setJobName] = useState<string>('Untitled job');
  const [currentJobId, setCurrentJobId] = useState<string>(() => `JOB-${Date.now().toString().slice(-6)}`);
  const [customerRef, setCustomerRef] = useState<string>('');
  const [createdAt, setCreatedAt] = useState<string>(() => new Date().toISOString());
  const [lastOptimizedAt, setLastOptimizedAt] = useState<string | undefined>(undefined);

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
  const [isMachineAuto, setIsMachineAuto] = useState<boolean>(true);
  const [objective, setObjective] = useState<OptimizationObjective>('balanced');
  const [isObjectiveAuto, setIsObjectiveAuto] = useState<boolean>(true);
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

  // Strategy Recommender & Workflow States
  const [isStrategyAuto, setIsStrategyAuto] = useState<boolean>(true);
  const [strategyRec, setStrategyRec] = useState<StrategyRecommendationResult | null>(null);
  const [runningAlgorithmName, setRunningAlgorithmName] = useState<string>('');
  const [screen1Error, setScreen1Error] = useState<string | null>(null);
  const lastAutoRunFingerprintRef = useRef<string>('');

  // Output States
  const [resultsByAlgo, setResultsByAlgo] = useState<Record<string, OptimizationResult>>({});
  const [comparisonResults, setComparisonResults] = useState<OptimizationResult[]>([]);

  const timerRef = useRef<any>(null);

  // Load persistence data and metadata on initial mount
  useEffect(() => {
    async function init() {
      // 1. Load LocalStorage
      const stored = getStorageData();
      setSavedJobs(stored.jobs);
      setInventoryBlocks(stored.inventoryBlocks);
      setRemnants(stored.remnants);
      setActivityLog(stored.activity);

      // 2. Load API Metadata
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
          setJobName('Sample job #4821');
          setCurrentJobId('JOB-4821');
          const autoReq: OptimizationRequest = {
            job_id: 'JOB-4821',
            customer: customerRef || undefined,
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
            setLastOptimizedAt(new Date().toISOString());
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
    setIsMachineAuto(false);
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

  const handleSelectObjective = (newObj: OptimizationObjective) => {
    setObjective(newObj);
    setIsObjectiveAuto(false);
    const legacy =
      newObj === 'maximize_yield'
        ? 'best_yield'
        : newObj === 'minimize_time'
        ? 'lowest_time'
        : 'lowest_cost';
    setMachineObjective(legacy);
    handleInputModified();
  };

  // Auto-recommend Machine and Objective when inputs mutate (if in Auto mode)
  useEffect(() => {
    if (machines.length === 0) return;

    let activeObj = objective;
    if (isObjectiveAuto) {
      const currentM = machines.find((m) => m.id === selectedMachineId);
      const objRec = recommendObjective(blocks, parts, skinTrim, selectedGrade, currentM);
      activeObj = objRec.recommendedObjective;
      setObjective(activeObj);
      setMachineObjective(
        activeObj === 'maximize_yield'
          ? 'best_yield'
          : activeObj === 'minimize_time'
          ? 'lowest_time'
          : 'lowest_cost'
      );
    }

    if (isMachineAuto) {
      const machRec = recommendMachine(machines, blocks, parts, skinTrim, activeObj, selectedGrade);
      if (machRec.recommendedMachine && machRec.recommendedMachine.id !== selectedMachineId) {
        setSelectedMachineId(machRec.recommendedMachine.id);
        setKerf(machRec.recommendedMachine.kerf);
      }
    }
  }, [blocks, parts, skinTrim, selectedGrade, isMachineAuto, isObjectiveAuto, machines]);

  // Flag input changes as stale
  const handleInputModified = () => {
    setIsStale(true);
    setIs3DGenerated(false);
    setScreen1Error(null);
  };

  // Merge duplicate blocks handler
  const handleMergeBlocks = (targetIdx: number, sourceIdx: number) => {
    setBlocks((prev) => {
      if (!prev[targetIdx] || !prev[sourceIdx]) return prev;
      const sourceQty = prev[sourceIdx].quantity;
      const updated = prev.map((b, i) =>
        i === targetIdx ? { ...b, quantity: b.quantity + sourceQty } : b
      );
      return updated.filter((_, i) => i !== sourceIdx);
    });
    handleInputModified();
  };

  // Screen 1: Validate and Continue to Step 2
  const handleContinueToOptimization = () => {
    const selectedM = machines.find((m) => m.id === selectedMachineId);
    const val = validateScreen1Inputs(blocks, parts, skinTrim, selectedM);
    if (!val.isValid) {
      setScreen1Error(val.errorMessage || 'Invalid inputs. Please correct the highlighted issues.');
      return;
    }
    setScreen1Error(null);
    setActiveStep(2);
  };

  // Auto-run on Step 2 Arrival (or input mutation when on Step 2)
  useEffect(() => {
    if (activeStep !== 2) return;
    if (machines.length === 0 || algorithms.length === 0) return;
    if (blocks.length === 0 || parts.length === 0) return;

    const activeMach = machines.find((m) => m.id === selectedMachineId);
    const val = validateScreen1Inputs(blocks, parts, skinTrim, activeMach);
    if (!val.isValid) return;

    const currentFingerprint = `${selectedMachineId}|${objective}|${selectedGrade}|${skinTrim}|${kerf}|${JSON.stringify(blocks)}|${JSON.stringify(parts)}`;
    if (currentFingerprint === lastAutoRunFingerprintRef.current && resultsByAlgo[selectedAlgorithmId]) {
      return;
    }

    let isMounted = true;

    const executeAutoRun = async () => {
      const ruleRec = recommendStrategy(blocks, parts, activeMach, objective);
      const initialAlgoId = isStrategyAuto ? ruleRec.ruleStrategyId : selectedAlgorithmId;
      if (isStrategyAuto && selectedAlgorithmId !== ruleRec.ruleStrategyId) {
        setSelectedAlgorithmId(ruleRec.ruleStrategyId);
      }

      setStrategyRec({
        ruleStrategyId: ruleRec.ruleStrategyId,
        ruleStrategyName: ruleRec.ruleStrategyName,
        ruleReason: ruleRec.ruleReason,
        finalStrategyId: initialAlgoId,
        finalStrategyName: ALGORITHM_DISPLAY_NAMES[initialAlgoId] || initialAlgoId,
        isSwitchedFromRule: false,
        wordingDisclaimer: 'Best among the tested heuristics for this input and objective. Not proven optimal.',
      });

      setIsOptimizing(true);
      setRunningAlgorithmName(ALGORITHM_DISPLAY_NAMES[initialAlgoId] || initialAlgoId);
      startTimer();
      lastAutoRunFingerprintRef.current = currentFingerprint;

      try {
        const payload: OptimizationRequest = {
          job_id: currentJobId,
          customer: customerRef || undefined,
          grade: selectedGrade,
          machine_id: selectedMachineId,
          machine_objective: machineObjective,
          skin_trim_per_face: skinTrim,
          kerf: kerf,
          parts: parts,
          available_blocks: blocks,
          algorithm_id: initialAlgoId,
          seed: 42,
          time_budget_seconds: 10.0,
        };

        const initialResult = await optimizeJob(payload);
        if (!isMounted) return;

        setResultsByAlgo((prev) => ({
          ...prev,
          [initialAlgoId]: initialResult,
        }));
        setIsStale(false);
        setIs3DGenerated(true);
        const now = new Date().toISOString();
        setLastOptimizedAt(now);

        // Background comparative benchmark of all algorithms
        try {
          const compResults = await compareAlgorithms(payload);
          if (!isMounted) return;

          setComparisonResults(compResults);
          setResultsByAlgo((prev) => {
            const updated = { ...prev };
            compResults.forEach((r) => {
              updated[r.algorithm_id] = r;
            });
            return updated;
          });

          const evaluated = evaluateBestMeasuredStrategy(
            compResults,
            objective,
            ruleRec.ruleStrategyId,
            ruleRec.ruleReason
          );

          if (isStrategyAuto) {
            if (evaluated.finalStrategyId !== initialAlgoId) {
              setSelectedAlgorithmId(evaluated.finalStrategyId);
            }
            setStrategyRec(evaluated);
          } else {
            setStrategyRec({
              ...evaluated,
              finalStrategyId: initialAlgoId,
              finalStrategyName: ALGORITHM_DISPLAY_NAMES[initialAlgoId] || initialAlgoId,
              isSwitchedFromRule: false,
              switchedNotice: undefined,
            });
          }
        } catch (compErr) {
          console.warn('Background comparative benchmark error:', compErr);
        }
      } catch (err: any) {
        console.error('Auto-run optimization error:', err);
      } finally {
        if (isMounted) {
          stopTimer();
          setIsOptimizing(false);
          setRunningAlgorithmName('');
        }
      }
    };

    executeAutoRun();

    return () => {
      isMounted = false;
    };
  }, [
    activeStep,
    blocks,
    parts,
    skinTrim,
    kerf,
    selectedGrade,
    selectedMachineId,
    objective,
    isStrategyAuto,
    machines,
    algorithms,
  ]);

  // Build current payload helper
  const buildPayload = (algoId: string): OptimizationRequest => ({
    job_id: currentJobId,
    customer: customerRef || undefined,
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
    const algoName = ALGORITHM_DISPLAY_NAMES[selectedAlgorithmId] || selectedAlgorithmId;
    setRunningAlgorithmName(algoName);
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
      const now = new Date().toISOString();
      setLastOptimizedAt(now);
      setActiveStep(2);

      const activeMach = machines.find((m) => m.id === selectedMachineId);
      const ruleRec = recommendStrategy(blocks, parts, activeMach, objective);
      const evaluated = evaluateBestMeasuredStrategy(
        [result, ...comparisonResults.filter((r) => r.algorithm_id !== selectedAlgorithmId)],
        objective,
        ruleRec.ruleStrategyId,
        ruleRec.ruleReason
      );
      if (!isStrategyAuto) {
        setStrategyRec({
          ...evaluated,
          finalStrategyId: selectedAlgorithmId,
          finalStrategyName: algoName,
          isSwitchedFromRule: false,
          switchedNotice: undefined,
        });
      } else {
        setStrategyRec(evaluated);
      }

      // Log activity
      logActivity('run', `Optimized: ${jobName}`, currentJobId, jobName, result.net_utilization_pct);
      setActivityLog(getStorageData().activity);
    } catch (err: any) {
      alert(`Optimization error: ${err.message}`);
    } finally {
      stopTimer();
      setIsOptimizing(false);
      setRunningAlgorithmName('');
    }
  };

  // Action: Compare All Algorithms
  const handleCompareAll = async () => {
    setIsOptimizing(true);
    setRunningAlgorithmName('Running Comparative Benchmark (All 6 Algorithms)...');
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

      const activeMach = machines.find((m) => m.id === selectedMachineId);
      const ruleRec = recommendStrategy(blocks, parts, activeMach, objective);
      const evaluated = evaluateBestMeasuredStrategy(
        results,
        objective,
        ruleRec.ruleStrategyId,
        ruleRec.ruleReason
      );

      if (isStrategyAuto) {
        setSelectedAlgorithmId(evaluated.finalStrategyId);
        setStrategyRec(evaluated);
      } else {
        setStrategyRec({
          ...evaluated,
          finalStrategyId: selectedAlgorithmId,
          finalStrategyName: ALGORITHM_DISPLAY_NAMES[selectedAlgorithmId] || selectedAlgorithmId,
          isSwitchedFromRule: false,
          switchedNotice: undefined,
        });
      }

      setIsStale(false);
      setIs3DGenerated(true);
      const now = new Date().toISOString();
      setLastOptimizedAt(now);
      setActiveStep(2);

      // Log activity
      const winner = results.find((r) => r.is_best);
      const bestYield = winner ? winner.net_utilization_pct : undefined;
      logActivity('run', `Compared all algorithms: ${jobName}`, currentJobId, jobName, bestYield);
      setActivityLog(getStorageData().activity);
    } catch (err: any) {
      alert(`Comparison error: ${err.message}`);
    } finally {
      stopTimer();
      setIsOptimizing(false);
      setRunningAlgorithmName('');
    }
  };

  const handleSelectAlgorithm = (id: string) => {
    setSelectedAlgorithmId(id);
    setIsStrategyAuto(false);
  };

  const handleSelectResultFromTable = (algoId: string) => {
    setSelectedAlgorithmId(algoId);
    setIsStrategyAuto(false);
  };

  // Load Sample Job #4821
  const handleLoadSample = () => {
    setSelectedGrade('HR-40');
    setSkinTrim(1.0);
    setKerf(0.125);
    setBlocks(DEFAULT_BLOCKS);
    setParts(SAMPLE_JOB_PARTS);
    setJobName(t('sample_job_name') || 'Sample job #4821');
    setCurrentJobId('JOB-4821');
    setCustomerRef('');
    setCreatedAt(new Date().toISOString());
    setLastOptimizedAt(undefined);
    setIsStrategyAuto(true);
    setScreen1Error(null);
    lastAutoRunFingerprintRef.current = '';
    handleInputModified();
    navigateTo('/optimization');
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

  // Job Save Action (Header & Projects)
  const handleSaveJob = () => {
    const jobToSave: SavedJob = {
      id: currentJobId,
      job_id: currentJobId,
      name: jobName.trim() || t('untitled_job'),
      customer_ref: customerRef,
      grade: selectedGrade,
      machine_id: selectedMachineId,
      algorithm_id: selectedAlgorithmId,
      parts: parts,
      blocks: blocks,
      skin_trim: skinTrim,
      kerf: kerf,
      machine_objective: machineObjective,
      allow_mixed_grades: allowMixedGrades,
      is_machine_auto: isMachineAuto,
      is_objective_auto: isObjectiveAuto,
      is_strategy_auto: isStrategyAuto,
      objective: objective,
      strategy_rec: strategyRec || undefined,
      created_at: createdAt,
      updated_at: new Date().toISOString(),
      last_optimized_at: lastOptimizedAt,
      status: isStale ? 'Stale' : currentResult ? 'Optimized' : 'Not optimized',
      yield_pct: currentResult ? currentResult.net_utilization_pct : undefined,
      parts_placed_count: currentResult ? currentResult.total_parts_placed : undefined,
      parts_demanded_count: currentResult ? currentResult.total_parts_demanded : undefined,
      latest_result: currentResult,
      comparison_results: comparisonResults,
    };

    const updated = saveJob(jobToSave);
    setSavedJobs(updated);
    setActivityLog(getStorageData().activity);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  // Projects Page Actions
  const handleOpenJob = (job: SavedJob) => {
    setCurrentJobId(job.job_id);
    setJobName(job.name);
    setCustomerRef(job.customer_ref || '');
    setSelectedGrade(job.grade);
    setSelectedMachineId(job.machine_id);
    setSelectedAlgorithmId(job.algorithm_id);
    setParts(job.parts);
    setBlocks(job.blocks);
    setSkinTrim(job.skin_trim);
    setKerf(job.kerf);
    setMachineObjective(job.machine_objective || 'lowest_cost');
    setAllowMixedGrades(job.allow_mixed_grades || false);
    setIsMachineAuto(job.is_machine_auto ?? true);
    setIsObjectiveAuto(job.is_objective_auto ?? true);
    setIsStrategyAuto(job.is_strategy_auto ?? true);
    setObjective(job.objective || 'balanced');
    if (job.strategy_rec) {
      setStrategyRec(job.strategy_rec);
    } else {
      setStrategyRec(null);
    }
    setCreatedAt(job.created_at);
    setLastOptimizedAt(job.last_optimized_at);
    setIsStale(job.status === 'Stale');
    lastAutoRunFingerprintRef.current = '';

    if (job.latest_result) {
      setResultsByAlgo({ [job.algorithm_id]: job.latest_result });
      setIs3DGenerated(true);
    } else {
      setResultsByAlgo({});
      setIs3DGenerated(false);
    }

    if (job.comparison_results) {
      setComparisonResults(job.comparison_results);
    }

    navigateTo('/optimization');
    setActiveStep(2);
  };

  const handleNewJob = () => {
    const newId = `JOB-${Date.now().toString().slice(-6)}`;
    setCurrentJobId(newId);
    setJobName(t('untitled_job') || 'Untitled job');
    setCustomerRef('');
    setCreatedAt(new Date().toISOString());
    setLastOptimizedAt(undefined);
    setBlocks(DEFAULT_BLOCKS);
    setParts([]);
    setResultsByAlgo({});
    setComparisonResults([]);
    setIsStale(false);
    setIs3DGenerated(false);
    setIsStrategyAuto(true);
    setStrategyRec(null);
    setScreen1Error(null);
    lastAutoRunFingerprintRef.current = '';
    setActiveStep(1);
    navigateTo('/optimization');
  };

  const handleDuplicateJob = (job: SavedJob) => {
    const newId = `JOB-${Date.now().toString().slice(-6)}`;
    const duplicated: SavedJob = {
      ...job,
      id: newId,
      job_id: newId,
      name: `Copy of ${job.name}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const updated = saveJob(duplicated);
    setSavedJobs(updated);
    setActivityLog(getStorageData().activity);
  };

  const handleRenameSavedJob = (jobId: string, newName: string) => {
    const target = savedJobs.find((j) => j.id === jobId);
    if (target) {
      const updated = saveJob({ ...target, name: newName });
      setSavedJobs(updated);
      if (currentJobId === target.job_id) {
        setJobName(newName);
      }
    }
  };

  const handleDeleteJob = (id: string) => {
    const updated = deleteJob(id);
    setSavedJobs(updated);
    setActivityLog(getStorageData().activity);
  };

  // Inventory Page Actions
  const handleAddInventoryBlock = (newBlock: BlockInput) => {
    const updated = [...inventoryBlocks, newBlock];
    setInventoryBlocks(updated);
    saveInventoryBlocks(updated);
  };

  const handleUpdateInventoryBlock = (idx: number, updatedBlock: Partial<BlockInput>) => {
    const updated = inventoryBlocks.map((b, i) => (i === idx ? { ...b, ...updatedBlock } : b));
    setInventoryBlocks(updated);
    saveInventoryBlocks(updated);
  };

  const handleRemoveInventoryBlock = (idx: number) => {
    const updated = inventoryBlocks.filter((_, i) => i !== idx);
    setInventoryBlocks(updated);
    saveInventoryBlocks(updated);
  };

  const handleRemoveRemnant = (id: string) => {
    const updated = remnants.filter((r) => r.id !== id);
    setRemnants(updated);
    const data = getStorageData();
    data.remnants = updated;
    localStorage.setItem('tatras_nestpro_demo_v1', JSON.stringify(data));
  };

  const handleUseGradeInOptimization = (grade: string, gradeBlocks: BlockInput[]) => {
    setSelectedGrade(grade);
    setBlocks(gradeBlocks);
    handleInputModified();
    navigateTo('/optimization');
    setActiveStep(1);
  };

  const handleAddRemnantToInventory = (remItem: RemnantInventoryItem) => {
    const updated = addRemnants([remItem]);
    setRemnants(updated);
    setActivityLog(getStorageData().activity);
  };

  const handleAddAllRemnantsToInventory = (remItems: RemnantInventoryItem[]) => {
    const updated = addRemnants(remItems);
    setRemnants(updated);
    setActivityLog(getStorageData().activity);
  };

  const handleClearDemoData = () => {
    clearDemoStorage();
    const stored = getStorageData();
    setSavedJobs(stored.jobs);
    setInventoryBlocks(stored.inventoryBlocks);
    setRemnants(stored.remnants);
    setActivityLog(stored.activity);
    setResultsByAlgo({});
    setComparisonResults([]);
    setIsStale(false);
    setIs3DGenerated(false);
    setIsStrategyAuto(true);
    setStrategyRec(null);
    setScreen1Error(null);
    lastAutoRunFingerprintRef.current = '';
  };

  const currentResult: OptimizationResult | null = resultsByAlgo[selectedAlgorithmId] || null;
  const selectedMachine = machines.find((m) => m.id === selectedMachineId);
  const selectedAlgorithm = algorithms.find((a) => a.id === selectedAlgorithmId);

  // Workflow step click handler
  const handleStepClick = (stepId: number) => {
    if (stepId > 1) {
      const selectedM = machines.find((m) => m.id === selectedMachineId);
      const val = validateScreen1Inputs(blocks, parts, skinTrim, selectedM);
      if (!val.isValid) {
        setScreen1Error(val.errorMessage || 'Invalid inputs. Please correct before proceeding.');
        setActiveStep(1);
        return;
      }
    }
    setScreen1Error(null);
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
      {/* 1.1 Top Navigation Bar (5 Real Client-Side Pages) */}
      <TopNavbar
        currentRoute={currentRoute}
        onNavigate={navigateTo}
        currentLang={i18n.language}
        onToggleLang={handleToggleLang}
        savedJobsCount={savedJobs.length}
      />

      {/* Main Layout Area: Slim Icon Rail + Page Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* 1.2 Slim Icon Rail (Synchronized with currentRoute) */}
        <IconRail
          currentRoute={currentRoute}
          onNavigate={navigateTo}
        />

        {/* Dynamic Route View Switcher (Page state survives switching tabs) */}
        {currentRoute === '/dashboard' ? (
          <DashboardPage
            savedJobs={savedJobs}
            currentJobName={jobName}
            currentResult={currentResult}
            onNavigateOptimization={(job) => {
              if (job) handleOpenJob(job);
              else navigateTo('/optimization');
            }}
            onLoadSample={handleLoadSample}
            onClearDemoData={handleClearDemoData}
            activityLog={activityLog}
            retainedRemnantsCount={remnants.length}
          />
        ) : currentRoute === '/projects' ? (
          <ProjectsPage
            savedJobs={savedJobs}
            currentJobId={currentJobId}
            onOpenJob={handleOpenJob}
            onNewJob={handleNewJob}
            onDuplicateJob={handleDuplicateJob}
            onRenameJob={handleRenameSavedJob}
            onDeleteJob={handleDeleteJob}
          />
        ) : currentRoute === '/inventory' ? (
          <InventoryPage
            blocks={inventoryBlocks}
            remnants={remnants}
            onAddBlock={handleAddInventoryBlock}
            onUpdateBlock={handleUpdateInventoryBlock}
            onRemoveBlock={handleRemoveInventoryBlock}
            onRemoveRemnant={handleRemoveRemnant}
            onUseGradeInOptimization={handleUseGradeInOptimization}
          />
        ) : currentRoute === '/reports' ? (
          <ReportsPage
            currentJobName={jobName}
            currentResult={currentResult}
            savedJobs={savedJobs}
            isStale={isStale}
            onExportCSV={handleExportCSV}
          />
        ) : (
          /* Default: Optimization Workspace */
          <div className="flex-1 flex flex-col overflow-y-auto">
            {/* 1.3 Fix: Dynamic Editable Job Header Row */}
            <JobHeader
              jobName={jobName}
              onRenameJob={setJobName}
              jobId={currentJobId}
              customerRef={customerRef}
              grade={selectedGrade}
              machineName={selectedMachine?.name || 'Saw Station 2'}
              cutType={selectedMachine?.cut_type === 'free' ? 'Free / Contour' : 'Guillotine Rotating'}
              algorithmName={selectedAlgorithm?.name}
              createdAt={createdAt}
              lastOptimizedAt={lastOptimizedAt}
              isOptimizing={isOptimizing}
              elapsedSeconds={elapsedSeconds}
              isStale={isStale}
              hasValidResult={currentResult != null}
              onSaveJob={handleSaveJob}
              onExportCSV={handleExportCSV}
              isSaved={isSaved}
            />

            {/* 1.4 Chevron Stepper */}
            <ChevronStepper
              steps={WORKFLOW_STEPS}
              activeStep={activeStep}
              maxReachableStep={currentResult ? 4 : 2}
              onStepClick={handleStepClick}
            />

            {/* Main View Area */}
            <main className="flex-1 p-4 lg:p-6 pb-20">
              {activeStep === 1 ? (
                /* Step 1: Clean Centered Card Form */
                <SidebarInputs
                  mode="card"
                  customerRef={customerRef}
                  onChangeCustomerRef={setCustomerRef}
                  onContinueToOptimization={handleContinueToOptimization}
                  validationError={screen1Error}
                  grades={grades}
                  selectedGrade={selectedGrade}
                  onSelectGrade={handleSelectGrade}
                  allowMixedGrades={allowMixedGrades}
                  onToggleMixedGrades={handleToggleMixedGrades}
                  machines={machines}
                  selectedMachineId={selectedMachineId}
                  onSelectMachine={handleSelectMachine}
                  isMachineAuto={isMachineAuto}
                  onToggleMachineAuto={setIsMachineAuto}
                  objective={objective}
                  onSelectObjective={handleSelectObjective}
                  isObjectiveAuto={isObjectiveAuto}
                  onToggleObjectiveAuto={setIsObjectiveAuto}
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
                  onMergeBlocks={handleMergeBlocks}
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
                        isStrategyAuto={isStrategyAuto}
                        onToggleStrategyAuto={setIsStrategyAuto}
                        strategyRec={strategyRec}
                        onRestoreRecommendedStrategy={() => {
                          setIsStrategyAuto(true);
                          if (strategyRec?.finalStrategyId) {
                            setSelectedAlgorithmId(strategyRec.finalStrategyId);
                          }
                        }}
                        runningAlgorithmName={runningAlgorithmName}
                      />
                    </div>

                    {/* Center Card: Cutting Plan & Visualization (40% width) */}
                    <div className={`lg:col-span-4 flex flex-col ${activeStep === 3 ? 'ring-2 ring-emerald-500 rounded-xl shadow-md transition-all duration-300' : ''}`}>
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
                        onAddRemnantToInventory={handleAddRemnantToInventory}
                        onAddAllRemnantsToInventory={handleAddAllRemnantsToInventory}
                      />
                    ) : (
                      <Step4Placeholder />
                    )}
                  </div>
                </div>
              )}
            </main>

            {/* 1.7 Sticky Action Bar at the bottom of Screen 2 and Screen 3 */}
            {activeStep === 2 ? (
              <StickyActionBar
                mode="step2"
                currentResult={currentResult}
                isOptimizing={isOptimizing}
                isStale={isStale}
                algorithmName={selectedAlgorithm?.name}
                onGenerate3DPlan={() => {
                  setIs3DGenerated(true);
                  setActiveStep(3);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onBackToInputs={() => {
                  setActiveStep(1);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            ) : activeStep === 3 ? (
              <StickyActionBar
                mode="step3"
                currentResult={currentResult}
                isOptimizing={isOptimizing}
                isStale={isStale}
                algorithmName={selectedAlgorithm?.name}
                onGenerate3DPlan={() => {
                  setActiveStep(4);
                  const el = document.getElementById('step4-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                onBackToInputs={() => {
                  setActiveStep(2);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
