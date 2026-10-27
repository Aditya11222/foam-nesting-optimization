import type { SavedJob, RemnantInventoryItem, ActivityLogItem, BlockInput } from '../types';

const STORAGE_KEY = 'tatras_nestpro_demo_v1';

export interface DemoStorageData {
  jobs: SavedJob[];
  inventoryBlocks: BlockInput[];
  remnants: RemnantInventoryItem[];
  activity: ActivityLogItem[];
}

const DEFAULT_INVENTORY_BLOCKS: BlockInput[] = [
  { id: 'bun-hr40-1', nominal_length: 108.0, nominal_width: 82.0, nominal_height: 40.0, grade: 'HR-40', quantity: 6 },
  { id: 'bun-hr30-1', nominal_length: 108.0, nominal_width: 82.0, nominal_height: 38.0, grade: 'HR-30', quantity: 4 },
  { id: 'bun-ve50-1', nominal_length: 96.0, nominal_width: 76.0, nominal_height: 36.0, grade: 'VE-50', quantity: 3 },
];

let inMemoryFallback: DemoStorageData = {
  jobs: [],
  inventoryBlocks: DEFAULT_INVENTORY_BLOCKS,
  remnants: [],
  activity: [
    {
      id: 'act-init',
      type: 'create',
      title: 'Session initialized',
      timestamp: new Date().toISOString(),
    },
  ],
};

export function getStorageData(): DemoStorageData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return inMemoryFallback;
    const parsed = JSON.parse(raw);
    return {
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      inventoryBlocks: Array.isArray(parsed.inventoryBlocks) && parsed.inventoryBlocks.length > 0 ? parsed.inventoryBlocks : DEFAULT_INVENTORY_BLOCKS,
      remnants: Array.isArray(parsed.remnants) ? parsed.remnants : [],
      activity: Array.isArray(parsed.activity) ? parsed.activity : [],
    };
  } catch (err) {
    console.warn('localStorage read failed, falling back to in-memory state:', err);
    return inMemoryFallback;
  }
}

export function saveStorageData(data: DemoStorageData): void {
  inMemoryFallback = data;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('localStorage write failed, using in-memory state:', err);
  }
}

export function getSavedJobs(): SavedJob[] {
  return getStorageData().jobs;
}

export function saveJob(job: SavedJob): SavedJob[] {
  const data = getStorageData();
  const existingIdx = data.jobs.findIndex((j) => j.id === job.id);
  let updatedJobs: SavedJob[];
  if (existingIdx >= 0) {
    updatedJobs = data.jobs.map((j, i) => (i === existingIdx ? { ...job, updated_at: new Date().toISOString() } : j));
  } else {
    updatedJobs = [job, ...data.jobs];
  }

  // Also log activity
  const newActivity: ActivityLogItem = {
    id: `act-${Date.now().toString().slice(-6)}`,
    type: 'save',
    title: `Saved job: ${job.name}`,
    job_id: job.job_id,
    job_name: job.name,
    timestamp: new Date().toISOString(),
    yield_pct: job.yield_pct,
  };

  saveStorageData({
    ...data,
    jobs: updatedJobs,
    activity: [newActivity, ...data.activity].slice(0, 30),
  });

  return updatedJobs;
}

export function deleteJob(id: string): SavedJob[] {
  const data = getStorageData();
  const deleted = data.jobs.find((j) => j.id === id);
  const updatedJobs = data.jobs.filter((j) => j.id !== id);

  const newActivity: ActivityLogItem = {
    id: `act-${Date.now().toString().slice(-6)}`,
    type: 'create',
    title: `Deleted job: ${deleted?.name || id}`,
    job_id: deleted?.job_id,
    job_name: deleted?.name,
    timestamp: new Date().toISOString(),
  };

  saveStorageData({
    ...data,
    jobs: updatedJobs,
    activity: [newActivity, ...data.activity].slice(0, 30),
  });

  return updatedJobs;
}

export function getInventoryBlocks(): BlockInput[] {
  return getStorageData().inventoryBlocks;
}

export function saveInventoryBlocks(blocks: BlockInput[]): void {
  const data = getStorageData();
  saveStorageData({
    ...data,
    inventoryBlocks: blocks,
  });
}

export function getRemnants(): RemnantInventoryItem[] {
  return getStorageData().remnants;
}

export function addRemnants(newRemnants: RemnantInventoryItem[]): RemnantInventoryItem[] {
  const data = getStorageData();
  const combined = [...newRemnants, ...data.remnants];

  const newActivity: ActivityLogItem = {
    id: `act-${Date.now().toString().slice(-6)}`,
    type: 'inventory',
    title: `Added ${newRemnants.length} remnant(s) to stock`,
    timestamp: new Date().toISOString(),
  };

  saveStorageData({
    ...data,
    remnants: combined,
    activity: [newActivity, ...data.activity].slice(0, 30),
  });

  return combined;
}

export function getActivityLog(): ActivityLogItem[] {
  return getStorageData().activity;
}

export function logActivity(type: 'run' | 'save' | 'create' | 'inventory', title: string, jobId?: string, jobName?: string, yieldPct?: number): void {
  const data = getStorageData();
  const newActivity: ActivityLogItem = {
    id: `act-${Date.now().toString().slice(-6)}`,
    type,
    title,
    job_id: jobId,
    job_name: jobName,
    timestamp: new Date().toISOString(),
    yield_pct: yieldPct,
  };
  saveStorageData({
    ...data,
    activity: [newActivity, ...data.activity].slice(0, 30),
  });
}

export function clearDemoStorage(): void {
  inMemoryFallback = {
    jobs: [],
    inventoryBlocks: DEFAULT_INVENTORY_BLOCKS,
    remnants: [],
    activity: [
      {
        id: `act-${Date.now().toString().slice(-6)}`,
        type: 'create',
        title: 'Demo storage cleared',
        timestamp: new Date().toISOString(),
      },
    ],
  };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('localStorage clear failed:', err);
  }
}
