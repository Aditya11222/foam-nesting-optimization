/**
 * Units and snapping module for foam cutting optimization.
 * Units: inches.
 * All dimensions snap to 1/16 inch (0.0625 in).
 */

export const SIXTEENTH_INCH = 0.0625; // 1/16 in

export function snapTo16th(val: number, fieldName: string = 'Dimension'): number {
  if (val === null || val === undefined || isNaN(val) || !isFinite(val)) {
    throw new Error(`${fieldName} must be a valid numeric value in inches.`);
  }
  if (val <= 0) {
    throw new Error(`${fieldName} must be strictly greater than 0 inches (got ${val}).`);
  }
  const snapped = Math.round(val * 16.0) / 16.0;
  if (snapped < SIXTEENTH_INCH) {
    throw new Error(
      `${fieldName} must be at least 1/16 in (0.0625 in), got ${val} which snapped to ${snapped}.`
    );
  }
  return snapped;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function formatFraction16th(val: number): string {
  const snapped = Math.round(val * 16.0) / 16.0;
  const whole = Math.floor(snapped);
  const sixteenths = Math.round((snapped - whole) * 16);

  if (sixteenths === 0) {
    return `${whole}"`;
  }

  const d = gcd(sixteenths, 16);
  const num = sixteenths / d;
  const den = 16 / d;

  if (whole === 0) {
    return `${num}/${den}"`;
  }
  return `${whole} ${num}/${den}"`;
}
