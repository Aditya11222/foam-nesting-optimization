import React from 'react';
import { useTranslation } from 'react-i18next';
import type { OptimizationResult, BlockLayout } from '../types';

interface PrintableCutSheetProps {
  result: OptimizationResult;
  block: BlockLayout;
}

export const PrintableCutSheet: React.FC<PrintableCutSheetProps> = ({ result, block }) => {
  const { i18n } = useTranslation();
  const isEs = i18n.language === 'es';

  return (
    <div className="hidden print:block p-8 bg-white text-black font-sans text-xs leading-normal">
      {/* Cut Sheet Header */}
      <div className="border-b-2 border-black pb-4 mb-4 flex justify-between items-start">
        <div>
          <div className="text-xl font-black uppercase tracking-wider">
            TATRAS NESTPRO — SAW CUT SHEET
          </div>
          <div className="text-sm font-bold text-gray-700 mt-1">
            Job #{result.job_id} · Order: SO-10592 · Customer: Acme Bedding
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            Date Generated: {new Date(result.timestamp).toLocaleString()} | Engine: 3D Guillotine Slicing Heuristic
          </div>
        </div>

        <div className="text-right">
          <div className="text-sm font-bold bg-gray-100 px-3 py-1 border border-gray-400 rounded">
            BLOCK {block.block_index} OF {result.blocks_used_count}
          </div>
          <div className="text-xs font-semibold mt-1">
            Grade: <span className="font-mono">{result.grade}</span> ({result.machine.name})
          </div>
        </div>
      </div>

      {/* Block & Material Specifications */}
      <div className="grid grid-cols-4 gap-3 p-3 bg-gray-50 border border-gray-300 rounded mb-4 text-[11px]">
        <div>
          <span className="font-bold block text-gray-600">Nominal Bun Dims:</span>
          <span className="font-mono font-bold">{block.nominal_length}" × {block.nominal_width}" × {block.nominal_height}"</span>
        </div>
        <div>
          <span className="font-bold block text-gray-600">Usable (Post-Trim):</span>
          <span className="font-mono font-bold text-blue-700">{block.usable_length}" × {block.usable_width}" × {block.usable_height}"</span>
        </div>
        <div>
          <span className="font-bold block text-gray-600">Skin Trim / Kerf:</span>
          <span>1.0" per face / {result.machine.kerf}" (1/8")</span>
        </div>
        <div>
          <span className="font-bold block text-gray-600">Net Usable Yield:</span>
          <span className="font-mono font-bold text-green-700">{block.net_utilization_pct}% (Gross: {block.gross_utilization_pct}%)</span>
        </div>
      </div>

      {/* Yield & Volume Accounting Table */}
      <div className="mb-4">
        <h4 className="font-bold uppercase tracking-wider text-gray-700 border-b border-gray-300 pb-1 mb-2">
          Material Volume Accounting (Inches³)
        </h4>
        <table className="w-full text-left border border-gray-300 text-[10px]">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-1.5 border border-gray-300">Gross Bun Vol</th>
              <th className="p-1.5 border border-gray-300">Skin Trim Loss</th>
              <th className="p-1.5 border border-gray-300">Usable Volume</th>
              <th className="p-1.5 border border-gray-300">Parts Volume</th>
              <th className="p-1.5 border border-gray-300">Kerf Saw Loss</th>
              <th className="p-1.5 border border-gray-300">Usable Remnants</th>
              <th className="p-1.5 border border-gray-300">Unrecoverable Scrap</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-1.5 border border-gray-300 font-mono">{block.gross_volume.toLocaleString()} in³</td>
              <td className="p-1.5 border border-gray-300 font-mono">{block.skin_trim_loss_volume.toLocaleString()} in³</td>
              <td className="p-1.5 border border-gray-300 font-mono">{block.usable_volume.toLocaleString()} in³</td>
              <td className="p-1.5 border border-gray-300 font-mono font-bold text-blue-700">{block.parts_volume.toLocaleString()} in³</td>
              <td className="p-1.5 border border-gray-300 font-mono">{block.kerf_loss_volume.toLocaleString()} in³</td>
              <td className="p-1.5 border border-gray-300 font-mono font-bold text-green-700">{block.usable_remnants.reduce((a, b) => a + b.volume, 0).toLocaleString()} in³</td>
              <td className="p-1.5 border border-gray-300 font-mono text-red-700">{block.unrecoverable_scrap_volume.toLocaleString()} in³</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Step-by-Step Operator Cut Instructions Table */}
      <div className="mb-6">
        <h4 className="font-bold uppercase tracking-wider text-gray-700 border-b border-gray-300 pb-1 mb-2">
          Ordered Saw Cut Sequence (Total Steps: {block.cuts.length})
        </h4>
        <table className="w-full text-left border border-gray-300 text-[10px]">
          <thead className="bg-gray-100 uppercase tracking-wider">
            <tr>
              <th className="p-1.5 border border-gray-300 w-10 text-center">Step</th>
              <th className="p-1.5 border border-gray-300 w-12 text-center">Stage</th>
              <th className="p-1.5 border border-gray-300 w-28">Cut Type</th>
              <th className="p-1.5 border border-gray-300 w-12 text-center">Axis</th>
              <th className="p-1.5 border border-gray-300 w-24">Fence / Elevation</th>
              <th className="p-1.5 border border-gray-300">Operation & Produces</th>
              <th className="p-1.5 border border-gray-300 w-44">Remnant Prompt</th>
              <th className="p-1.5 border border-gray-300 w-12 text-center">Done</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300">
            {block.cuts.map((c) => (
              <tr key={c.step_number} className="hover:bg-gray-50">
                <td className="p-1.5 border border-gray-300 text-center font-bold font-mono">
                  {c.step_number}
                </td>
                <td className="p-1.5 border border-gray-300 text-center">
                  Stage {c.stage}
                </td>
                <td className="p-1.5 border border-gray-300 font-semibold uppercase text-[9px]">
                  {c.cut_type.replace('_', ' ')}
                </td>
                <td className="p-1.5 border border-gray-300 text-center font-mono font-bold text-blue-700">
                  {c.axis}
                </td>
                <td className="p-1.5 border border-gray-300 font-mono font-bold">
                  {c.position_display} ({c.position_in}")
                </td>
                <td className="p-1.5 border border-gray-300">
                  <div>{isEs ? c.produces_description_es : c.produces_description_en}</div>
                  <div className="text-[9px] text-gray-500 font-mono">
                    Target: {c.target_piece_dims[0]}"×{c.target_piece_dims[1]}"×{c.target_piece_dims[2]}" | Kerf: {c.kerf_in}"
                  </div>
                </td>
                <td className="p-1.5 border border-gray-300 text-amber-800 font-semibold text-[9px]">
                  {(isEs ? c.remnant_prompt_es : c.remnant_prompt_en) || '—'}
                </td>
                <td className="p-1.5 border border-gray-300 text-center">
                  [ &nbsp; ]
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Operator & QA Sign-off Section */}
      <div className="border border-gray-400 p-3 rounded grid grid-cols-3 gap-4 text-[10px]">
        <div>
          <span className="font-bold block text-gray-600">Saw Operator:</span>
          <div className="border-b border-gray-400 mt-4 pb-0.5 text-gray-400">Sign & Badge #</div>
        </div>
        <div>
          <span className="font-bold block text-gray-600">Quality Inspection (QA):</span>
          <div className="border-b border-gray-400 mt-4 pb-0.5 text-gray-400">Tolerance verified ±1/16"</div>
        </div>
        <div>
          <span className="font-bold block text-gray-600">Completed Date / Shift:</span>
          <div className="border-b border-gray-400 mt-4 pb-0.5 text-gray-400">___ / ___ / 2026 · Shift: [ 1 / 2 ]</div>
        </div>
      </div>
    </div>
  );
};
