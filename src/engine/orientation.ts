import type { OrientationMode } from '../types';

/**
 * Returns unique axis-aligned 3D bounding orientations [dx, dy, dz] allowed for a part.
 * - RISE_LOCKED: Height remains aligned with Z (rise direction). Can rotate 0 or 90 deg in XY plane.
 * - FREE_IN_PLANE: Rotate about vertical Z axis only (same as rise-locked).
 * - ANY: Free 3D rotation across all 6 axis-aligned permutations.
 */
export function getPermittedOrientations(
  length: number,
  width: number,
  height: number,
  mode: OrientationMode = 'rise-locked'
): [number, number, number][] {
  const candidates: [number, number, number][] = [];

  if (mode === 'rise-locked' || mode === 'free-in-plane') {
    // Height is locked to Z
    candidates.push([length, width, height]);
    candidates.push([width, length, height]);
  } else if (mode === 'any') {
    // All 6 permutations
    const dims = [length, width, height];
    candidates.push([dims[0], dims[1], dims[2]]);
    candidates.push([dims[0], dims[2], dims[1]]);
    candidates.push([dims[1], dims[0], dims[2]]);
    candidates.push([dims[1], dims[2], dims[0]]);
    candidates.push([dims[2], dims[0], dims[1]]);
    candidates.push([dims[2], dims[1], dims[0]]);
  } else {
    candidates.push([length, width, height]);
  }

  // Deduplicate orientations
  const unique: [number, number, number][] = [];
  const seen = new Set<string>();

  for (const [x, y, z] of candidates) {
    const key = `${Math.round(x * 10000) / 10000}_${Math.round(y * 10000) / 10000}_${Math.round(z * 10000) / 10000}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push([x, y, z]);
    }
  }

  return unique;
}
