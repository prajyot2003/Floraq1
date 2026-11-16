import React, { useState } from 'react';
import { SensorReading } from '../types.js';

interface ChartProps {
  readings: SensorReading[];
  parameterName: string;
  unit: string;
  targetValue?: number;
  toleranceMin?: number;
  toleranceMax?: number;
  color?: string;
  title: string;
}

export const InteractiveCharts: React.FC<ChartProps> = ({
  readings,
  parameterName,
  unit,
  targetValue,
  color = '#39805B',
  title,
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; val: number; ts: string } | null>(null);

  // Filter and sort ascending for chronologic chart line
  const filtered = readings
    .filter((r) => r.parameter_name === parameterName)
    .sort((a, b) => new Date(a.device_timestamp).getTime() - new Date(b.device_timestamp).getTime());

  if (filtered.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border border-[#E2EAE4] text-center text-sm text-[#718078] flex flex-col items-center justify-center min-h-[200px]">
        <p className="font-medium text-[#20352A]">No recorded {title} readings in selected timeframe</p>
        <p className="text-xs mt-1 text-[#718078]">Send telemetry via IoT Gateway or Hardware Test Bench.</p>
      </div>
    );
  }

  const values = filtered.map((r) => r.value);
  const minVal = Math.min(...values, targetValue !== undefined ? targetValue - 2 : values[0]);
  const maxVal = Math.max(...values, targetValue !== undefined ? targetValue + 2 : values[0]);
  const avgVal = parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1));

  // Range with padding
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;
  const paddingY = range * 0.15;
  const plotMin = minVal - paddingY;
  const plotMax = maxVal + paddingY;
  const plotRange = plotMax - plotMin;

  const width = 600;
  const height = 180;
  const paddingX = 40;
  const paddingBottom = 30;
  const paddingTop = 20;

  const getX = (idx: number) => {
    if (filtered.length === 1) return width / 2;
    return paddingX + (idx / (filtered.length - 1)) * (width - paddingX * 2);
  };

  const getY = (val: number) => {
    const norm = (val - plotMin) / plotRange;
    return height - paddingBottom - norm * (height - paddingTop - paddingBottom);
  };

  // Generate SVG path points
  const points = filtered.map((r, i) => `${getX(i)},${getY(r.value)}`).join(' ');

  // Target Y line
  const targetY = targetValue !== undefined ? getY(targetValue) : null;

  return (
    <div className="bg-white p-4 rounded-xl border border-[#E2EAE4] shadow-sm">
      {/* Header with Title and Min/Avg/Max Statistics */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#174D36]">{title}</h4>
          <span className="text-[11px] text-[#718078]">
            {filtered.length} samples · Range: [{Math.min(...values)} – {Math.max(...values)} {unit}]
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-2 py-0.5 rounded bg-[#F7FAF7] border border-[#E2EAE4] text-[11px] font-medium text-[#20352A]">
            Avg: <span className="font-bold text-[#174D36]">{avgVal} {unit}</span>
          </div>
          {targetValue !== undefined && (
            <div className="px-2 py-0.5 rounded bg-[#DCEFE2] border border-[#39805B]/30 text-[11px] font-semibold text-[#174D36]">
              Target: {targetValue} {unit}
            </div>
          )}
        </div>
      </div>

      {/* SVG Chart Surface */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {/* Background Grid Lines */}
          <line
            x1={paddingX}
            y1={getY(minVal)}
            x2={width - paddingX}
            y2={getY(minVal)}
            stroke="#E2EAE4"
            strokeDasharray="2 3"
          />
          <line
            x1={paddingX}
            y1={getY(avgVal)}
            x2={width - paddingX}
            y2={getY(avgVal)}
            stroke="#E2EAE4"
            strokeDasharray="2 3"
          />
          <line
            x1={paddingX}
            y1={getY(maxVal)}
            x2={width - paddingX}
            y2={getY(maxVal)}
            stroke="#E2EAE4"
            strokeDasharray="2 3"
          />

          {/* Target Reference Line */}
          {targetY !== null && (
            <g>
              <line
                x1={paddingX}
                y1={targetY}
                x2={width - paddingX}
                y2={targetY}
                stroke="#39805B"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.8"
              />
              <text x={width - paddingX + 4} y={targetY + 3} fill="#174D36" fontSize="9" fontWeight="600">
                Target
              </text>
            </g>
          )}

          {/* Area fill under curve */}
          <polygon
            points={`${paddingX},${height - paddingBottom} ${points} ${width - paddingX},${height - paddingBottom}`}
            fill={color}
            opacity="0.1"
          />

          {/* Main Telemetry Line */}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Interactive Hover Circles */}
          {filtered.map((r, i) => {
            const cx = getX(i);
            const cy = getY(r.value);
            return (
              <circle
                key={r.id}
                cx={cx}
                cy={cy}
                r="3.5"
                fill="white"
                stroke={color}
                strokeWidth="2"
                className="cursor-pointer transition hover:r-5"
                onMouseEnter={() =>
                  setHoveredPoint({
                    x: cx,
                    y: cy,
                    val: r.value,
                    ts: new Date(r.device_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  })
                }
              />
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="absolute pointer-events-none bg-[#174D36] text-white px-2 py-1 rounded text-xs shadow-lg transform -translate-x-1/2 -translate-y-full"
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
            }}
          >
            <div className="font-bold">
              {hoveredPoint.val} {unit}
            </div>
            <div className="text-[9px] text-[#DCEFE2]">{hoveredPoint.ts}</div>
          </div>
        )}
      </div>

      {/* Axis Footer */}
      <div className="flex justify-between items-center text-[10px] text-[#718078] mt-1 px-2 border-t border-[#E2EAE4] pt-1">
        <span>{new Date(filtered[0].device_timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
        <span className="text-[10px] text-[#39805B] font-medium">Continuous Telemetry Line</span>
        <span>{new Date(filtered[filtered.length - 1].device_timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
      </div>
    </div>
  );
};
