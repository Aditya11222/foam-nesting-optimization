import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Edges } from '@react-three/drei';
import * as THREE from 'three';
import type { BlockLayout, PlacedPart, RemnantOutput, CutStep } from '../types';

interface ThreeBlockViewProps {
  layout: BlockLayout;
  highlightedCut?: CutStep | null;
  showTrim?: boolean;
  showParts?: boolean;
  showRemnants?: boolean;
  showCutPlane?: boolean;
}

// Subcomponent for an individual placed part
function PartMesh({
  part,
  isHighlighted = false,
}: {
  part: PlacedPart;
  isHighlighted?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  // Position: Three.js box origin is at its center, so offset by half-dimensions
  // Mapping Foam axes to Three.js: X -> X (Length), Z -> Y (Vertical Height/Rise), Y -> Z (Width)
  const cx = part.x + part.length / 2;
  const cy = part.y + part.width / 2;
  const cz = part.z + part.height / 2;

  return (
    <mesh
      position={[cx, cz, cy]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[part.length, part.height, part.width]} />
      <meshStandardMaterial
        color={isHighlighted ? '#ec4899' : hovered ? '#60A5FA' : (part.color_hex || '#2563EB')}
        emissive={isHighlighted ? '#be185d' : '#000000'}
        emissiveIntensity={isHighlighted ? 0.6 : 0.0}
        roughness={0.35}
        metalness={0.08}
        transparent={false}
      />
      <Edges color={isHighlighted ? '#f43f5e' : hovered ? '#1D4ED8' : '#334155'} threshold={15} />

      {hovered && (
        <Html distanceFactor={110} position={[0, part.height / 2, 0]}>
          <div className="bg-slate-900/95 text-white px-3 py-1.5 rounded-lg shadow-xl border border-slate-700 text-xs pointer-events-none whitespace-nowrap z-50">
            <div className="font-bold text-blue-400">{part.sku}</div>
            <div className="text-slate-300">
              {part.length}" × {part.width}" × {part.height}" ({part.grade})
            </div>
            <div className="text-slate-400 text-[10px] font-mono">
              Pos: ({part.x}", {part.y}", {part.z}")
            </div>
          </div>
        </Html>
      )}
    </mesh>
  );
}

// Subcomponent for reusable remnants (light grey/green translucent box)
function RemnantMesh({ remnant }: { remnant: RemnantOutput }) {
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
      }}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[remnant.length, remnant.height, remnant.width]} />
      <meshStandardMaterial
        color={hovered ? '#34D399' : '#10B981'}
        transparent={true}
        opacity={hovered ? 0.45 : 0.28}
        roughness={0.6}
      />
      <Edges color={hovered ? '#059669' : '#10B981'} threshold={15} />

      {hovered && (
        <Html distanceFactor={120} position={[0, remnant.height / 2, 0]}>
          <div className="bg-slate-900/95 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-emerald-500 shadow-xl pointer-events-none whitespace-nowrap z-50">
            <div className="font-bold text-emerald-400">{remnant.code}</div>
            <div className="text-slate-300">
              {remnant.length}" × {remnant.width}" × {remnant.height}"
            </div>
            <div className="text-emerald-300 text-[10px]">
              Usable Vol: {Math.round(remnant.volume)} cu in (Score: {remnant.usability_score})
            </div>
          </div>
        </Html>
      )}
    </mesh>
  );
}

// Subcomponent for the active guillotine cut plane
function CutPlaneMesh({ cut, usableDims }: { cut: CutStep; usableDims: [number, number, number] }) {
  const [ux, uy, uz] = usableDims;
  const pos = cut.position_in;

  if (cut.cut_type === 'skin_trim') {
    return null;
  }

  let planeArgs: [number, number];
  let planePos: [number, number, number];
  let planeRot: [number, number, number];

  if (cut.axis === 'Z') {
    // Horizontal cut plane (perpendicular to Z / height)
    planeArgs = [ux, uy];
    planePos = [ux / 2, pos, uy / 2];
    planeRot = [-Math.PI / 2, 0, 0];
  } else if (cut.axis === 'X') {
    // Vertical rip cut (perpendicular to X / length)
    planeArgs = [uy, uz];
    planePos = [pos, uz / 2, uy / 2];
    planeRot = [0, -Math.PI / 2, 0];
  } else {
    // Crosscut (perpendicular to Y / width)
    planeArgs = [ux, uz];
    planePos = [ux / 2, uz / 2, pos];
    planeRot = [0, 0, 0];
  }

  return (
    <group>
      <mesh position={planePos} rotation={planeRot}>
        <planeGeometry args={planeArgs} />
        <meshStandardMaterial
          color="#F43F5E"
          transparent={true}
          opacity={0.55}
          side={THREE.DoubleSide}
          roughness={0.2}
          metalness={0.1}
        />
      </mesh>
      {/* Wireframe outline of cut plane */}
      <mesh position={planePos} rotation={planeRot}>
        <planeGeometry args={planeArgs} />
        <meshBasicMaterial color="#E11D48" wireframe={true} />
      </mesh>
    </group>
  );
}

// Outer bun bounding wireframe representing nominal block and skin trim layer
function OuterBunFrame({
  nominal,
  usable,
  showTrim,
}: {
  nominal: [number, number, number];
  usable: [number, number, number];
  showTrim: boolean;
}) {
  const [nx, ny, nz] = nominal;
  const [ux, uy, uz] = usable;

  return (
    <group>
      {/* Usable interior space translucent shell */}
      <mesh position={[ux / 2, uz / 2, uy / 2]}>
        <boxGeometry args={[ux, uz, uy]} />
        <meshStandardMaterial color="#38BDF8" transparent opacity={0.05} roughness={0.9} />
        <Edges color="#0284C7" threshold={15} />
      </mesh>

      {/* Outer nominal bun boundary with skin trim layer */}
      {showTrim && (
        <mesh position={[ux / 2, uz / 2, uy / 2]}>
          <boxGeometry args={[nx, nz, ny]} />
          <meshStandardMaterial color="#94A3B8" transparent opacity={0.1} roughness={0.8} />
          <Edges color="#94A3B8" threshold={15} />
        </mesh>
      )}
    </group>
  );
}

export const ThreeBlockView: React.FC<ThreeBlockViewProps> = ({
  layout,
  highlightedCut,
  showTrim = true,
  showParts = true,
  showRemnants = true,
  showCutPlane = true,
}) => {
  const nominalDims: [number, number, number] = [
    layout.nominal_length,
    layout.nominal_width,
    layout.nominal_height,
  ];
  const usableDims: [number, number, number] = [
    layout.usable_length,
    layout.usable_width,
    layout.usable_height,
  ];

  const centerTarget: [number, number, number] = [
    usableDims[0] / 2,
    usableDims[2] / 2,
    usableDims[1] / 2,
  ];

  const maxDim = Math.max(...nominalDims);
  const cameraDistance = maxDim * 1.6;

  return (
    <div className="w-full h-[420px] relative rounded-xl overflow-hidden bg-slate-50 border border-slate-200 shadow-inner">
      <Canvas
        camera={{
          position: [
            centerTarget[0] + cameraDistance * 0.8,
            centerTarget[1] + cameraDistance * 0.7,
            centerTarget[2] + cameraDistance * 0.9,
          ],
          fov: 40,
        }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={['#F8FAFC']} />
        <ambientLight intensity={0.9} />
        <hemisphereLight args={['#FFFFFF', '#E2E8F0', 0.6]} />
        <directionalLight position={[100, 150, 100]} intensity={0.7} />
        <directionalLight position={[-80, 50, -80]} intensity={0.3} />

        <group>
          {/* Outer Bun & Usable Bounds */}
          <OuterBunFrame nominal={nominalDims} usable={usableDims} showTrim={showTrim} />

          {/* Placed Parts */}
          {showParts &&
            layout.placed_parts.map((p, idx) => {
              const isContour =
                highlightedCut &&
                highlightedCut.cut_type === 'contour_path' &&
                highlightedCut.target_part_id === p.part_id;
              return (
                <PartMesh
                  key={`${p.part_id}-${idx}`}
                  part={p}
                  isHighlighted={Boolean(isContour)}
                />
              );
            })}

          {/* Usable Remnants */}
          {showRemnants &&
            layout.usable_remnants.map((r, idx) => (
              <RemnantMesh key={`${r.id}-${idx}`} remnant={r} />
            ))}

          {/* Highlighted Cut: Only show guillotine plane if not contour cut */}
          {showCutPlane && highlightedCut && highlightedCut.cut_type !== 'contour_path' && (
            <CutPlaneMesh cut={highlightedCut} usableDims={usableDims} />
          )}

          {/* Ground grid floor */}
          <gridHelper
            args={[maxDim * 2.2, 20, '#CBD5E1', '#E2E8F0']}
            position={[centerTarget[0], 0, centerTarget[2]]}
          />
        </group>

        <OrbitControls target={centerTarget} makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>

      {/* 3D overlay controls / helper hint */}
      <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-md border border-slate-200 shadow-xs text-[11px] text-slate-500 flex items-center space-x-2">
        <span className="font-semibold text-slate-800">3D Light Scene</span>
        <span className="text-slate-300">|</span>
        <span>Drag to rotate • Right-click to pan • Scroll to zoom</span>
      </div>

      <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-md border border-slate-200 shadow-xs text-[11px] flex items-center space-x-3">
        {showParts && (
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded bg-blue-600 inline-block"></span>
            <span className="text-slate-700 font-medium">{layout.placed_parts.length} parts</span>
          </div>
        )}
        {showRemnants && (
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span>
            <span className="text-slate-700 font-medium">{layout.usable_remnants.length} remnants</span>
          </div>
        )}
        {showCutPlane && highlightedCut && (
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block animate-pulse"></span>
            <span className="text-rose-600 font-bold">
              {highlightedCut.cut_type === 'contour_path'
                ? `Contour Cut #${highlightedCut.step_number} (Mesh Highlight)`
                : `Cut #{highlightedCut.step_number} Active`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
