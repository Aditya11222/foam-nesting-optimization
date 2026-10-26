import type { PlacedPart, RemnantOutput } from '../types';
import { snapTo16th } from './units';

/**
 * 3D Guillotine Slicing Tree (k-d tree structure).
 * Represents recursive orthogonal subdivisions of a foam block.
 * Guarantees by construction that all placed parts can be cut via through-edge guillotine saw passes.
 */
export class SlicingNode {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  parent: SlicingNode | null;
  nodeId: string;

  isLeaf: boolean = true;
  placedPart: PlacedPart | null = null;
  isRemnant: boolean = false;
  remnantInfo: RemnantOutput | null = null;

  cutAxis: 'X' | 'Y' | 'Z' | null = null;
  cutCoord: number | null = null;
  kerf: number = 0;
  leftChild: SlicingNode | null = null;
  rightChild: SlicingNode | null = null;

  constructor(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    parent: SlicingNode | null = null,
    nodeId?: string
  ) {
    this.x = x > 0 ? snapTo16th(x, 'node_x') : 0;
    this.y = y > 0 ? snapTo16th(y, 'node_y') : 0;
    this.z = z > 0 ? snapTo16th(z, 'node_z') : 0;
    this.dx = snapTo16th(dx, 'node_dx');
    this.dy = snapTo16th(dy, 'node_dy');
    this.dz = snapTo16th(dz, 'node_dz');
    this.parent = parent;
    this.nodeId = nodeId || `box_${Math.round(x)}_${Math.round(y)}_${Math.round(z)}`;
  }

  get volume(): number {
    return this.dx * this.dy * this.dz;
  }

  canFit(px: number, py: number, pz: number): boolean {
    if (!this.isLeaf || this.placedPart !== null) {
      return false;
    }
    return px <= this.dx + 1e-4 && py <= this.dy + 1e-4 && pz <= this.dz + 1e-4;
  }

  split(axis: 'X' | 'Y' | 'Z', cutPos: number, kerf: number): [SlicingNode, SlicingNode] {
    if (!this.isLeaf) {
      throw new Error('Cannot split an already split node.');
    }

    const snappedCutPos = snapTo16th(cutPos, `cut_pos_${axis}`);
    const snappedKerf = kerf > 0 ? snapTo16th(kerf, 'kerf') : 0;

    let left: SlicingNode;
    let right: SlicingNode;
    let absCoord: number;

    if (axis === 'X') {
      if (snappedCutPos + snappedKerf >= this.dx) {
        throw new Error(`Cut position ${snappedCutPos} + kerf ${snappedKerf} >= box length ${this.dx}`);
      }
      const remDx = snapTo16th(this.dx - snappedCutPos - snappedKerf, 'rem_dx');
      left = new SlicingNode(this.x, this.y, this.z, snappedCutPos, this.dy, this.dz, this);
      right = new SlicingNode(this.x + snappedCutPos + snappedKerf, this.y, this.z, remDx, this.dy, this.dz, this);
      absCoord = this.x + snappedCutPos;
    } else if (axis === 'Y') {
      if (snappedCutPos + snappedKerf >= this.dy) {
        throw new Error(`Cut position ${snappedCutPos} + kerf ${snappedKerf} >= box width ${this.dy}`);
      }
      const remDy = snapTo16th(this.dy - snappedCutPos - snappedKerf, 'rem_dy');
      left = new SlicingNode(this.x, this.y, this.z, this.dx, snappedCutPos, this.dz, this);
      right = new SlicingNode(this.x, this.y + snappedCutPos + snappedKerf, this.z, this.dx, remDy, this.dz, this);
      absCoord = this.y + snappedCutPos;
    } else {
      if (snappedCutPos + snappedKerf >= this.dz) {
        throw new Error(`Cut position ${snappedCutPos} + kerf ${snappedKerf} >= box height ${this.dz}`);
      }
      const remDz = snapTo16th(this.dz - snappedCutPos - snappedKerf, 'rem_dz');
      left = new SlicingNode(this.x, this.y, this.z, this.dx, this.dy, snappedCutPos, this);
      right = new SlicingNode(this.x, this.y, this.z + snappedCutPos + snappedKerf, this.dx, this.dy, remDz, this);
      absCoord = this.z + snappedCutPos;
    }

    this.isLeaf = false;
    this.cutAxis = axis;
    this.cutCoord = absCoord;
    this.kerf = snappedKerf;
    this.leftChild = left;
    this.rightChild = right;

    return [left, right];
  }

  getFreeLeaves(): SlicingNode[] {
    if (this.isLeaf) {
      if (this.placedPart === null && !this.isRemnant) {
        return [this];
      }
      return [];
    }
    const leaves: SlicingNode[] = [];
    if (this.leftChild) leaves.push(...this.leftChild.getFreeLeaves());
    if (this.rightChild) leaves.push(...this.rightChild.getFreeLeaves());
    return leaves;
  }

  getAllLeaves(): SlicingNode[] {
    if (this.isLeaf) {
      return [this];
    }
    const leaves: SlicingNode[] = [];
    if (this.leftChild) leaves.push(...this.leftChild.getAllLeaves());
    if (this.rightChild) leaves.push(...this.rightChild.getAllLeaves());
    return leaves;
  }
}
