import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Edges, ContactShadows, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { BlockLayout, PlacedPart, RemnantOutput, CutStep } from '../types';
import { SCENE_TOKENS, DATA_PALETTE } from '../tokens';

export type CameraPreset = 'isometric' | 'top' | 'front' | 'side';

interface ThreeBlockViewProps {
  layout: BlockLayout;
  highlightedCut?: CutStep | null;
  showTrim?: boolean;
  showParts?: boolean;
  showRemnants?: boolean;
  showScrap?: boolean;
  showCutPlane?: boolean;
  cameraPreset?: CameraPreset;
  cameraResetTrigger?: number;
  isFreeNesting?: boolean;
}

interface HoveredTooltipData {
  kind: 'part' | 'remnant';
  title: string;
  dims: string;
  subtitle: string;
  worldPos: [number, number, number];
}

/**
 Projects 3D world coordinates (inside the centered block group) to 2D screen pixel coordinates
 and updates DOM overlay elements via refs at 60fps without creating secondary ReactDOM roots.
 */
function ScreenOverlayProjector({
  centerOffset,
  cutWorldPos,
  cutLabelRef,
  hoverWorldPos,
  hoverTooltipRef,
}: {
  centerOffset: [number, number, number];
  cutWorldPos: [number, number, number] | null;
  cutLabelRef: React.RefObject<HTMLDivElement | null>;
  hoverWorldPos: [number, number, number] | null;
  hoverTooltipRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { camera, size } = useThree();
  const tempVec = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (cutWorldPos && cutLabelRef.current) {
      tempVec.set(
        cutWorldPos[0] + centerOffset[0],
        cutWorldPos[1] + centerOffset[1] + 1.5,
        cutWorldPos[2] + centerOffset[2]
      );
      tempVec.project(camera);
      const x = (tempVec.x * 0.5 + 0.5) * size.width;
      const y = (-(tempVec.y * 0.5) + 0.5) * size.height;
      if (tempVec.z > 1) {
        cutLabelRef.current.style.opacity = '0';
      } else {
        cutLabelRef.current.style.opacity = '1';
        cutLabelRef.current.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
      }
    }

    if (hoverWorldPos && hoverTooltipRef.current) {
      tempVec.set(
        hoverWorldPos[0] + centerOffset[0],
        hoverWorldPos[1] + centerOffset[1],
        hoverWorldPos[2] + centerOffset[2]
      );
      tempVec.project(camera);
      const x = (tempVec.x * 0.5 + 0.5) * size.width;
      const y = (-(tempVec.y * 0.5) + 0.5) * size.height;
      if (tempVec.z > 1) {
        hoverTooltipRef.current.style.opacity = '0';
      } else {
        hoverTooltipRef.current.style.opacity = '1';
        hoverTooltipRef.current.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -100%)`;
      }
    }
  });

  return null;
}

/**
 * Generates a subtle procedural diagonal hatch CanvasTexture for unrecoverable scrap boxes
 */
function createDiagonalHatchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = SCENE_TOKENS.scrapFill;
    ctx.fillRect(0, 0, 32, 32);
    ctx.strokeStyle = SCENE_TOKENS.scrapHatch;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.lineTo(32, 0);
    ctx.moveTo(-16, 16);
    ctx.lineTo(16, -16);
    ctx.moveTo(16, 48);
    ctx.lineTo(48, 16);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

/**
 * Computes representative unrecoverable scrap bounding boxes in unoccupied usable volume
 */
function computeScrapBoxes(
  layout: BlockLayout
): { id: string; x: number; y: number; z: number; l: number; w: number; h: number }[] {
  if (layout.unrecoverable_scrap_volume <= 10) return [];
  const ux = layout.usable_length;
  const uy = layout.usable_width;
  const uz = layout.usable_height;

  // Find max occupied bounds
  let maxPartZ = 0;
  let maxPartY = 0;
  for (const p of layout.placed_parts) {
    maxPartZ = Math.max(maxPartZ, p.z + p.height);
    maxPartY = Math.max(maxPartY, p.y + p.width);
  }
  for (const r of layout.usable_remnants) {
    maxPartZ = Math.max(maxPartZ, r.z + r.height);
    maxPartY = Math.max(maxPartY, r.y + r.width);
  }

  const boxes: { id: string; x: number; y: number; z: number; l: number; w: number; h: number }[] = [];
  const topGap = uz - maxPartZ;
  if (topGap >= 0.5) {
    boxes.push({
      id: 'scrap-top-slab',
      x: 0,
      y: 0,
      z: maxPartZ,
      l: ux,
      w: uy,
      h: topGap,
    });
  } else if (uy - maxPartY >= 0.5) {
    boxes.push({
      id: 'scrap-side-strip',
      x: 0,
      y: maxPartY,
      z: 0,
      l: ux,
      w: uy - maxPartY,
      h: uz,
    });
  } else {
    // Representative kerf/offcut strip at trailing edge
    const eqThick = Math.min(4, Math.max(0.75, layout.unrecoverable_scrap_volume / (ux * uy)));
    boxes.push({
      id: 'scrap-trailing',
      x: 0,
      y: 0,
      z: Math.max(0, uz - eqThick),
      l: ux,
      w: uy,
      h: eqThick,
    });
  }
  return boxes;
}

/**
 * Camera Rig controller supporting preset views and smooth 450ms interpolation
 */
function CameraRig({
  ux,
  uy,
  uz,
  preset,
  resetTrigger,
}: {
  ux: number;
  uy: number;
  uz: number;
  preset: CameraPreset;
  resetTrigger: number;
}) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(ux * 1.15, uz * 1.35, uy * 1.3));
  const isAnimating = useRef(false);

  useEffect(() => {
    const maxDim = Math.max(ux, uy, uz) * 1.65;
    if (preset === 'top') {
      targetPos.current.set(0, maxDim * 1.25, 0.01);
    } else if (preset === 'front') {
      targetPos.current.set(0, 0, maxDim * 1.25);
    } else if (preset === 'side') {
      targetPos.current.set(maxDim * 1.25, 0, 0);
    } else {
      targetPos.current.set(ux * 1.1, uz * 1.35, uy * 1.25);
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      camera.position.copy(targetPos.current);
      camera.lookAt(0, 0, 0);
      isAnimating.current = false;
    } else {
      isAnimating.current = true;
    }
  }, [preset, resetTrigger, ux, uy, uz, camera]);

  useFrame((_, delta) => {
    if (!isAnimating.current) return;
    camera.position.lerp(targetPos.current, Math.min(1, delta * 7));
    if (camera.position.distanceTo(targetPos.current) < 0.5) {
      isAnimating.current = false;
    }
  });

  return null;
}

/**
 * Individual Placed Part Mesh (matte roughness 0.85, metalness 0, 0.12 in inset for visual separation)
 */
function PartMesh({
  part,
  index,
  isHighlighted = false,
  onHoverChange,
}: {
  part: PlacedPart;
  index: number;
  isHighlighted?: boolean;
  onHoverChange: (info: HoveredTooltipData | null) => void;
}) {
  const [hovered, setHovered] = useState(false);

  // Slight inset (0.12 in) so adjacent parts read clearly as separate blocks
  const inset = 0.12;
  const effL = Math.max(0.5, part.length - inset);
  const effH = Math.max(0.5, part.height - inset);
  const effW = Math.max(0.5, part.width - inset);

  const cx = part.x + part.length / 2;
  const cy = part.y + part.width / 2;
  const cz = part.z + part.height / 2;

  const baseColor = part.color_hex || DATA_PALETTE[index % DATA_PALETTE.length];

  return (
    <mesh
      position={[cx, cz, cy]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        onHoverChange({
          kind: 'part',
          title: part.sku,
          dims: `${part.length.toFixed(2)} in × ${part.width.toFixed(2)} in × ${part.height.toFixed(2)} in (${part.grade})`,
          subtitle: `Origin: (${part.x.toFixed(1)}, ${part.y.toFixed(1)}, ${part.z.toFixed(1)}) in`,
          worldPos: [cx, cz + part.height / 2 + 1, cy],
        });
      }}
      onPointerOut={() => {
        setHovered(false);
        onHoverChange(null);
      }}
    >
      <boxGeometry args={[effL, effH, effW]} />
      <meshStandardMaterial
        color={baseColor}
        emissive={isHighlighted ? SCENE_TOKENS.cutPlaneFill : hovered ? baseColor : '#000000'}
        emissiveIntensity={isHighlighted ? 0.28 : hovered ? 0.14 : 0}
        roughness={0.85}
        metalness={0}
      />
      <Edges
        color={
          isHighlighted
            ? SCENE_TOKENS.cutPlaneFill
            : hovered
            ? SCENE_TOKENS.partHoverEdge
            : SCENE_TOKENS.partEdge
        }
        threshold={15}
      />
    </mesh>
  );
}

/**
 * Soft Translucent Sage-Grey Remnant Box
 */
function RemnantMesh({
  remnant,
  onHoverChange,
}: {
  remnant: RemnantOutput;
  onHoverChange: (info: HoveredTooltipData | null) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const cx = remnant.x + remnant.length / 2;
  const cy = remnant.y + remnant.width / 2;
  const cz = remnant.z + remnant.height / 2;

  return (
    <mesh
      position={[cx, cz, cy]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        onHoverChange({
          kind: 'remnant',
          title: remnant.code,
          dims: `${remnant.length.toFixed(1)} in × ${remnant.width.toFixed(1)} in × ${remnant.height.toFixed(1)} in`,
          subtitle: remnant.storage_location,
          worldPos: [cx, cz + remnant.height / 2 + 1, cy],
        });
      }}
      onPointerOut={() => {
        setHovered(false);
        onHoverChange(null);
      }}
    >
      <boxGeometry args={[remnant.length - 0.1, remnant.height - 0.1, remnant.width - 0.1]} />
      <meshStandardMaterial
        color={SCENE_TOKENS.remnantFill}
        transparent
        opacity={hovered ? 0.42 : 0.26}
        roughness={0.85}
        metalness={0}
      />
      <Edges color={SCENE_TOKENS.remnantEdge} threshold={15} />
    </mesh>
  );
}

/**
 * Unrecoverable Scrap Box with Diagonal Hatch Texture
 */
function ScrapMesh({
  box,
  texture,
}: {
  box: { x: number; y: number; z: number; l: number; w: number; h: number };
  texture: THREE.CanvasTexture;
}) {
  const cx = box.x + box.l / 2;
  const cy = box.y + box.w / 2;
  const cz = box.z + box.h / 2;

  return (
    <mesh position={[cx, cz, cy]}>
      <boxGeometry args={[box.l - 0.15, box.h - 0.15, box.w - 0.15]} />
      <meshStandardMaterial
        map={texture}
        color={SCENE_TOKENS.scrapFill}
        transparent
        opacity={0.32}
        roughness={0.9}
        metalness={0}
      />
      <Edges color={SCENE_TOKENS.scrapHatch} threshold={15} />
    </mesh>
  );
}

/**
 * Animated Terracotta Cut Plane (opacity 0.22, 450ms smooth transition)
 */
function AnimatedCutPlane({
  cut,
  usableLength,
  usableWidth,
  usableHeight,
}: {
  cut: CutStep;
  usableLength: number;
  usableWidth: number;
  usableHeight: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const targetVec = useMemo(() => {
    if (cut.axis === 'Z') {
      return new THREE.Vector3(usableLength / 2, cut.position_in, usableWidth / 2);
    } else if (cut.axis === 'X') {
      return new THREE.Vector3(cut.position_in, usableHeight / 2, usableWidth / 2);
    } else {
      return new THREE.Vector3(usableLength / 2, usableHeight / 2, cut.position_in);
    }
  }, [cut.axis, cut.position_in, usableLength, usableWidth, usableHeight]);

  const args: [number, number, number] = useMemo(() => {
    if (cut.axis === 'Z') {
      return [usableLength + 3, 0.2, usableWidth + 3];
    } else if (cut.axis === 'X') {
      return [0.2, usableHeight + 3, usableWidth + 3];
    } else {
      return [usableLength + 3, usableHeight + 3, 0.2];
    }
  }, [cut.axis, usableLength, usableWidth, usableHeight]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      groupRef.current.position.copy(targetVec);
    } else {
      // ~450ms smooth ease-in-out
      groupRef.current.position.lerp(targetVec, Math.min(1, delta * 6.5));
    }
  });

  return (
    <group ref={groupRef} position={targetVec.toArray()}>
      <mesh>
        <boxGeometry args={args} />
        <meshStandardMaterial
          color={SCENE_TOKENS.cutPlaneFill}
          transparent
          opacity={0.22}
          roughness={0.6}
          metalness={0}
          depthWrite={false}
        />
        <Edges color={SCENE_TOKENS.cutPlaneEdge} />
      </mesh>
    </group>
  );
}

/**
 * Dashed Inner Outline for Usable Interior Boundary (Skin-Trim Layer Boundary)
 */
function DashedBoxOutline({ ux, uy, uz }: { ux: number; uy: number; uz: number }) {
  const points = useMemo(() => {
    const p: [number, number, number][] = [
      [0, 0, 0],
      [ux, 0, 0],
      [ux, 0, uy],
      [0, 0, uy],
      [0, 0, 0],
      [0, uz, 0],
      [ux, uz, 0],
      [ux, uz, uy],
      [0, uz, uy],
      [0, uz, 0],
    ];
    return p;
  }, [ux, uy, uz]);

  return (
    <Line
      points={points}
      color={SCENE_TOKENS.skinTrimEdge}
      lineWidth={1}
      dashed
      dashSize={2}
      gapSize={1.5}
    />
  );
}

export const ThreeBlockView: React.FC<ThreeBlockViewProps> = ({
  layout,
  highlightedCut = null,
  showTrim = true,
  showParts = true,
  showRemnants = true,
  showScrap = false,
  showCutPlane = true,
  cameraPreset = 'isometric',
  cameraResetTrigger = 0,
  isFreeNesting = false,
}) => {
  const [hoveredInfo, setHoveredInfo] = useState<HoveredTooltipData | null>(null);
  const cutLabelRef = useRef<HTMLDivElement | null>(null);
  const hoverTooltipRef = useRef<HTMLDivElement | null>(null);

  const {
    nominal_length: nx,
    nominal_width: ny,
    nominal_height: nz,
    usable_length: ux,
    usable_width: uy,
    usable_height: uz,
  } = layout;

  const centerOffset: [number, number, number] = useMemo(
    () => [-ux / 2, -uz / 2, -uy / 2],
    [ux, uy, uz]
  );

  const hatchTexture = useMemo(() => createDiagonalHatchTexture(), []);
  const scrapBoxes = useMemo(() => computeScrapBoxes(layout), [layout]);

  const highlightedPartSku = useMemo(() => {
    if (!isFreeNesting || !highlightedCut) return null;
    const idx = (highlightedCut.step_number - 1) % Math.max(1, layout.placed_parts.length);
    return layout.placed_parts[idx]?.sku || null;
  }, [isFreeNesting, highlightedCut, layout.placed_parts]);

  const cutWorldPos: [number, number, number] | null = useMemo(() => {
    if (!showCutPlane || isFreeNesting || !highlightedCut) return null;
    if (highlightedCut.axis === 'Z') {
      return [ux / 2, highlightedCut.position_in, uy / 2];
    } else if (highlightedCut.axis === 'X') {
      return [highlightedCut.position_in, uz / 2, uy / 2];
    } else {
      return [ux / 2, uz / 2, highlightedCut.position_in];
    }
  }, [showCutPlane, isFreeNesting, highlightedCut, ux, uy, uz]);

  return (
    <div
      className="relative w-full h-full min-h-[360px] overflow-hidden"
      style={{ backgroundColor: SCENE_TOKENS.sceneBg }}
      role="region"
      aria-label="Interactive 3D Foam Cutting Plan Viewport"
    >
      <Canvas
        dpr={[1, 2]}
        camera={{
          position: [ux * 1.1, uz * 1.35, uy * 1.25],
          fov: 40,
          near: 0.1,
          far: 2000,
        }}
      >
        <color attach="background" args={[SCENE_TOKENS.sceneBg]} />

        {/* Warm Hemisphere Light (Sky #FFF6EA, Ground #E4D6C3) + Soft Directional Key Light */}
        <hemisphereLight
          args={[SCENE_TOKENS.hemiSky, SCENE_TOKENS.hemiGround, 0.95]}
          position={[0, 120, 0]}
        />
        <directionalLight
          color={SCENE_TOKENS.dirLight}
          position={[140, 190, 110]}
          intensity={0.75}
        />

        <CameraRig
          ux={ux}
          uy={uy}
          uz={uz}
          preset={cameraPreset}
          resetTrigger={cameraResetTrigger}
        />

        <ScreenOverlayProjector
          centerOffset={centerOffset}
          cutWorldPos={cutWorldPos}
          cutLabelRef={cutLabelRef}
          hoverWorldPos={hoveredInfo ? hoveredInfo.worldPos : null}
          hoverTooltipRef={hoverTooltipRef}
        />

        <group position={centerOffset}>
          {/* Outer Foam Block Cream Shell (opacity 0.18) with #B8A794 edges */}
          <mesh position={[ux / 2, uz / 2, uy / 2]}>
            <boxGeometry args={[nx, nz, ny]} />
            <meshStandardMaterial
              color={SCENE_TOKENS.bunShell}
              transparent
              opacity={0.18}
              roughness={0.9}
              metalness={0}
              depthWrite={false}
            />
            <Edges color={SCENE_TOKENS.bunEdge} />
          </mesh>

          {/* Skin-Trim Layer (#E2D3BF tint + dashed inner usable outline) */}
          {showTrim && (
            <group>
              <mesh position={[ux / 2, uz / 2, uy / 2]}>
                <boxGeometry args={[ux, uz, uy]} />
                <meshStandardMaterial
                  color={SCENE_TOKENS.skinTrimFill}
                  transparent
                  opacity={0.12}
                  roughness={0.9}
                  metalness={0}
                  depthWrite={false}
                />
              </mesh>
              <DashedBoxOutline ux={ux} uy={uy} uz={uz} />
            </group>
          )}

          {/* Placed Parts */}
          {showParts &&
            layout.placed_parts.map((p, idx) => (
              <PartMesh
                key={`${p.part_id}-${idx}`}
                part={p}
                index={idx}
                isHighlighted={isFreeNesting && highlightedPartSku === p.sku}
                onHoverChange={setHoveredInfo}
              />
            ))}

          {/* Usable Remnants */}
          {showRemnants &&
            layout.usable_remnants.map((r) => (
              <RemnantMesh key={r.id} remnant={r} onHoverChange={setHoveredInfo} />
            ))}

          {/* Unrecoverable Scrap Regions (Toggleable layer with diagonal hatch) */}
          {showScrap &&
            scrapBoxes.map((b) => (
              <ScrapMesh key={b.id} box={b} texture={hatchTexture} />
            ))}

          {/* Animated Terracotta Cut Plane (for Guillotine Saws) */}
          {showCutPlane && !isFreeNesting && highlightedCut && (
            <AnimatedCutPlane
              cut={highlightedCut}
              usableLength={ux}
              usableWidth={uy}
              usableHeight={uz}
            />
          )}
        </group>

        {/* Soft Baked Contact Shadow Under the Block */}
        <ContactShadows
          position={[0, -uz / 2 - 1.5, 0]}
          opacity={0.22}
          scale={Math.max(nx, ny) * 1.8}
          blur={2.4}
          far={60}
          color={SCENE_TOKENS.contactShadow}
        />

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={35}
          maxDistance={380}
        />
      </Canvas>

      {/* Pure React DOM Projected Cut Plane Tag (No secondary ReactDOM root) */}
      {showCutPlane && !isFreeNesting && highlightedCut && (
        <div
          ref={cutLabelRef}
          style={{ left: 0, top: 0, transform: 'translate3d(-9999px, -9999px, 0)' }}
          className="absolute bg-surface text-ink px-2 py-0.5 rounded-sm border border-strong shadow-card font-mono text-[11.5px] font-medium tabular-nums whitespace-nowrap pointer-events-none z-20 transition-opacity duration-150"
        >
          {highlightedCut.axis} = {highlightedCut.position_in.toFixed(3)} in ({highlightedCut.position_display})
        </div>
      )}

      {/* Pure React DOM Projected Part/Remnant Hover Tooltip (No secondary ReactDOM root) */}
      {hoveredInfo && (
        <div
          ref={hoverTooltipRef}
          style={{ left: 0, top: 0, transform: 'translate3d(-9999px, -9999px, 0)' }}
          className="absolute bg-surface text-ink px-3 py-2 rounded-control shadow-card border border-hairline text-[12px] pointer-events-none whitespace-nowrap z-30"
        >
          <div
            className={`font-semibold ${
              hoveredInfo.kind === 'remnant' ? 'font-mono text-sage' : 'font-sans text-ink'
            }`}
          >
            {hoveredInfo.title}
          </div>
          <div className="font-mono text-[11.5px] text-secondary tabular-nums mt-0.5">
            {hoveredInfo.dims}
          </div>
          <div className="font-mono text-[11px] text-muted tabular-nums">
            {hoveredInfo.subtitle}
          </div>
        </div>
      )}
    </div>
  );
};
