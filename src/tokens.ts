/**
 * Centralized Design Token System for Tatras NestPro
 * Warm paper, oat, and cocoa workbench palette.
 * All components, Recharts visualizations, and Three.js materials import tokens from here.
 */

export const COLORS = {
  // Neutrals (warm, brownish-light)
  canvas: 'var(--bg-canvas)',
  surface: 'var(--bg-surface)',
  raised: 'var(--bg-raised)',
  hoverRow: 'var(--bg-row-hover)',
  borderHairline: 'var(--border-hairline)',
  borderStrong: 'var(--border-strong)',
  ink: 'var(--text-ink)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',

  // Brand Cocoa
  cocoa: 'var(--brand-cocoa)',
  cocoaHover: 'var(--brand-cocoa-hover)',
  cocoaPressed: 'var(--brand-cocoa-pressed)',
  cocoaTint: 'var(--brand-cocoa-tint)',
  cocoaFocus: 'var(--brand-cocoa-focus)',

  // Accent Terracotta (single highlight per view)
  terracotta: 'var(--accent-terracotta)',
  terracottaTint: 'var(--accent-terracotta-tint)',

  // Support Sage
  sage: 'var(--support-sage)',
  sageTint: 'var(--support-sage-tint)',

  // Semantic Status
  success: 'var(--status-success)',
  successTint: 'var(--status-success-tint)',
  warning: 'var(--status-warning)',
  warningTint: 'var(--status-warning-tint)',
  error: 'var(--status-error)',
  errorTint: 'var(--status-error-tint)',

  // Chart Grid
  chartGrid: 'var(--chart-grid)',
} as const;

/**
 * Raw token hex values for Three.js WebGL materials and SVG attributes
 * where CSS custom properties are not parsed by WebGL shaders.
 */
export const SCENE_TOKENS = {
  sceneBg: '#F3EDE4',
  hemiSky: '#FFF6EA',
  hemiGround: '#E4D6C3',
  dirLight: '#FFFDF9',
  bunShell: '#FFFDF9',
  bunEdge: '#B8A794',
  skinTrimFill: '#E2D3BF',
  skinTrimEdge: '#A99680',
  partEdge: '#4A3828',
  partHoverEdge: '#2B2118',
  remnantFill: '#7D8F7A',
  remnantEdge: '#5A6B57',
  scrapFill: '#B8ACA0',
  scrapHatch: '#8F8275',
  cutPlaneFill: '#C07A55',
  cutPlaneEdge: '#9E5E3B',
  contactShadow: '#3C2814',
} as const;

/**
 * Muted, distinct, colorblind-aware SKU & Chart Data Palette
 * Always paired with labels or patterns, never color alone.
 */
export const DATA_PALETTE = [
  '#7A5C45', // Cocoa
  '#C07A55', // Terracotta
  '#7D8F7A', // Sage
  '#C9A55C', // Warm Ochre
  '#5F8A8B', // Mineral Teal
  '#8A7F9E', // Muted Slate Plum
] as const;

export const PART_PATTERN_LABELS = [
  'Solid',
  'Diagonal',
  'Cross',
  'Dots',
  'Horizontal',
  'Vertical',
] as const;

export const TYPOGRAPHY_SCALE = {
  pageTitle: 'text-[28px] leading-[36px] font-display font-normal tabular-nums',
  cardTitle: 'text-[16px] leading-[24px] font-sans font-semibold',
  kpiHero: 'text-[40px] leading-[44px] font-display font-normal tabular-nums',
  kpiSecondary: 'text-[24px] leading-[32px] font-display font-normal tabular-nums',
  body: 'text-[14px] leading-[22px] font-sans font-normal',
  table: 'text-[13px] leading-[20px] font-sans',
  monoData: 'text-[12.5px] leading-[20px] font-mono tabular-nums',
  labelUppercase:
    'text-[11.5px] leading-[16px] font-sans font-medium uppercase tracking-[0.06em] text-secondary',
} as const;

export const SPACING_SCALE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export interface CostAssumptions {
  gradeCostPerCuFt: Record<string, number>;
  sawHourlyRate: number;
  secondsPerCut: number;
  remnantReuseCreditPct: number;
  baselineYieldPct: number;
}

export const DEFAULT_COST_ASSUMPTIONS: CostAssumptions = {
  gradeCostPerCuFt: {
    'HR-40': 4.85,
    'HR-30': 4.10,
    'VE-50': 6.40,
    'CM-28': 3.25,
    'FT-35': 3.90,
  },
  sawHourlyRate: 58.0,
  secondsPerCut: 28,
  remnantReuseCreditPct: 65,
  baselineYieldPct: 62.5,
};

