import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Edges } from '@react-three/drei';
import * as THREE from 'three';
import type { BlockLayout, PlacedPart, RemnantOutput, CutStep } from '../types';

interface ThreeBlockViewProps {
  layout: BlockLayout;
  highlightedCut?: CutStep | null;
  interactive?: boolean;
}

// Subcomponent for an individual placed part
function PartMesh({ part }: { part: PlacedPart }) {
  const [hovered, setHovered] = useState(false);

  // Position: Three.js box origin is at its center, so offset by half-dimensions
  const cx = part.x + part.length / 2;
  const cy = part.y + part.width / 2;
  const cz = part.z + part.height / 2;

  return (
    <mesh
      position={[cx, cz, cy]} // Swap Z and Y so Z is vertical in Three.js (standard Y up -> map Z to Y)
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[part.length, part.height, part.width]} />
      <meshStandardMaterial
        color={hovered ? '#ffffff' : (part.color_hex || '#3b82f6')}
        roughness={0.4}
        metalness={0.1}
        transparent={false}
      />
      <Edges color={hovered ? '#fbbf24' : '#1e293b'} threshold={15} />

      {hovered && (
        <Html distanceFactor={120}>
          <div className="bg-slate-900/95 text-white px-3 py-1.5 rounded-md shadow-xl border border-sky-500/50 text-xs pointer-events-none whitespace-nowrap z-50">
            <div className="font-bold text-sky-400">{part.sku}</div>
            <div className="text-slate-300">
              {part.length}" × {part.width}" × {part.height}"
            </div>
            <div className="text-slate-400 text-[10px]">
              Pos: ({part.x}", {part.y}", {part.z}")
            </div>
          </div>
        </Html>
      )}
    </mesh>
  );
}

// Subcomponent for reusable remnants
function RemnantMesh({ remnant }: { remnant: RemnantOutput }) {
  const cx = remnant.x + remnant.length / 2;
  const cy = remnant.y + remnant.width / 2;
  const cz = remnant.z + remnant.height / 2;

  return (
    <mesh position={[cx, cz, cy]}>
      <boxGeometry args={[remnant.length, remnant.height, remnant.width]} />
      <meshStandardMaterial
        color="#10b981"
        transparent={true}
        opacity={0.35}
        roughness={0.6}
      />
      <Edges color="#059669" threshold={15} />
      <Html distanceFactor={140}>
        <div className="bg-emerald-950/90 text-emerald-300 px-2 py-1 rounded text-[10px] border border-emerald-500/40 pointer-events-none whitespace-nowrap">
          {remnant.code} ({remnant.length}"×{remnant.width}"×{remnant.height}")
        </div>
      </Html>
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
          color="#f43f5e"
          transparent={true}
          opacity={0.55}
          side={THREE.DoubleSide}
          roughness={0.1}
          metalness={0.2}
        />
      </mesh>
      {/* Wireframe outline of cut plane */}
      <mesh position={planePos} rotation={planeRot}>
        <planeGeometry args={planeArgs} />
        <meshBasicMaterial color="#fb7185" wireframe={true} />
      </mesh>
    </group>
  );
}

// Outer bun bounding wireframe representing nominal block and skin trim
function OuterBunFrame({
  nominal,
  usable,
}: {
  nominal: [number, number, number];
  usable: [number, number, number];
}) {
  const [nx, ny, nz] = nominal;
  const [ux, uy, uz] = usable;

  return (
    <group>
      {/* Usable interior space wireframe */}
      <mesh position={[ux / 2, uz / 2, uy / 2]}>
        <boxGeometry args={[ux, uz, uy]} />
        <meshBasicMaterial color="#38bdf8" wireframe={true} transparent opacity={0.3} />
      </mesh>

      {/* Outer nominal bun boundary with skin trim indicator */}
      <mesh position={[ux / 2, uz / 2, uy / 2]}>
        <boxGeometry args={[nx, nz, ny]} />
        <meshBasicMaterial color="#94a3b8" wireframe={true} transparent opacity={0.15} />
      </mesh>
    </group>
  );
}

export const ThreeBlockView: React.FC<ThreeBlockViewProps> = ({
  layout,
  highlightedCut,
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

  // Center camera target on block center
  const centerTarget: [number, number, number] = [
    usableDims[0] / 2,
    usableDims[2] / 2,
    usableDims[1] / 2,
  ];

  const maxDim = Math.max(...nominalDims);
  const cameraDistance = maxDim * 1.6;

  return (
    <div className="w-full h-full relative rounded-xl overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border border-slate-800 shadow-inner">
      <Canvas
        camera={{
          position: [
            centerTarget[0] + cameraDistance * 0.8,
            centerTarget[1] + cameraDistance * 0.7,
            centerTarget[2] + cameraDistance * 0.9,
          ],
          fov: 40,
        }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[100, 150, 100]} intensity={1.2} castShadow />
        <directionalLight position={[-80, 50, -80]} intensity={0.4} />

        <group>
          {/* Outer Bun & Usable Bounds */}
          <OuterBunFrame nominal={nominalDims} usable={usableDims} />

          {/* Placed Parts */}
          {layout.placed_parts.map((p, idx) => (
            <PartMesh key={`${p.part_id}-${idx}`} part={p} />
          ))}

          {/* Usable Remnants */}
          {layout.usable_remnants.map((r, idx) => (
            <RemnantMesh key={`${r.id}-${idx}`} remnant={r} />
          ))}

          {/* Highlighted Guillotine Cut Plane (if step active) */}
          {highlightedCut && (
            <CutPlaneMesh cut={highlightedCut} usableDims={usableDims} />
          )}

          {/* Ground grid */}
          <gridHelper
            args={[maxDim * 2.2, 20, '#334155', '#1e293b']}
            position={[centerTarget[0], 0, centerTarget[2]]}
          />
        </group>

        <OrbitControls target={centerTarget} makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>

      {/* 3D overlay controls / badges */}
      <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs flex items-center space-x-3 text-slate-300">
        <span className="flex items-center space-x-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block animate-pulse"></span>
          <span className="font-medium text-slate-200">Interactive 3D View</span>
        </span>
        <span className="text-slate-500">|</span>
        <span className="text-[11px] text-slate-400">Drag to rotate · Scroll to zoom</span>
      </div>

      <div className="absolute bottom-3 right-3 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs text-slate-300 flex items-center space-x-3">
        <div className="flex items-center space-x-1">
          <span className="w-3 h-3 rounded bg-blue-500 inline-block"></span>
          <span>Parts ({layout.placed_parts.length})</span>
        </div>
        <div className="flex items-center space-x-1">
          <span className="w-3 h-3 rounded bg-emerald-500/60 inline-block"></span>
          <span>Remnants ({layout.usable_remnants.length})</span>
        </div>
        {highlightedCut && (
          <div className="flex items-center space-x-1">
            <span className="w-3 h-3 rounded bg-rose-500 inline-block animate-pulse"></span>
            <span className="text-rose-400 font-semibold">Active Cut Plane</span>
          </div>
        )}
      </div>
    </div>
  );
};
