import { Fragment, useMemo } from 'react';
import { HEATMAP_THRESHOLDS, HEATMAP_COLORS } from '../../heatmapConfig.js';

/**
 * 7×24 activity heatmap (UTC): rows = calendar days, columns = hours 0–23.
 * Intensity: White (low) → Light Green → Dark Green (high).
 */

function defaultUtcRange7d() {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

/** Map "YYYY-MM-DD" -> row index 0..6 for the given ordered day list */
function buildGrid(dayKeys, cells) {
  const map = new Map();
  for (const c of cells) {
    const d = c.date;
    const h = Number(c.hour);
    const n = Number(c.total_events ?? c.total_unique_visitors) || 0;
    if (!d || Number.isNaN(h) || h < 0 || h > 23) continue;
    const key = `${d}|${h}`;
    map.set(key, (map.get(key) || 0) + n);
  }
  const matrix = dayKeys.map(() => Array.from({ length: 24 }, () => 0));
  dayKeys.forEach((day, row) => {
    for (let hour = 0; hour < 24; hour += 1) {
      matrix[row][hour] = map.get(`${day}|${hour}`) || 0;
    }
  });
  return matrix;
}

import { getDensityColor, getDensityLabel } from '../../utils/densityColorMapper';

function cellColor(intensity) {
  return getDensityColor(intensity);
}

function formatDayLabel(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function enumerateUtcDays(start, end) {
  const a = new Date(start);
  a.setUTCHours(0, 0, 0, 0);
  const b = new Date(end);
  b.setUTCHours(0, 0, 0, 0);
  const keys = [];
  for (let d = new Date(a); d.getTime() <= b.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

export default function Heatmap({
  cells = [],
  rangeStartIso,
  rangeEndIso,
  title = 'Bản đồ nhiệt hoạt động (UTC)',
  subtitle,
}) {
  const { start, end } = useMemo(() => {
    if (rangeStartIso && rangeEndIso) {
      return { start: new Date(rangeStartIso), end: new Date(rangeEndIso) };
    }
    return defaultUtcRange7d();
  }, [rangeStartIso, rangeEndIso]);

  const dayKeys = useMemo(() => enumerateUtcDays(start, end), [start, end]);

  const matrix = buildGrid(dayKeys, cells);
  const flatMax = Math.max(1, ...matrix.flat());

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-black text-slate-800">{title}</h2>
          {subtitle && <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          LIVE DATA
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white/50 p-6 backdrop-blur-sm shadow-inner group">
        <div className="inline-block min-w-[800px]">
          <div className="grid" style={{ gridTemplateColumns: '100px repeat(24, minmax(0, 1fr))' }}>
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="px-0.5 pb-2 text-center text-[10px] font-black text-slate-300 group-hover:text-slate-500 transition-colors">
                {h.toString().padStart(2, '0')}
              </div>
            ))}
            {dayKeys.map((day, row) => (
              <Fragment key={day}>
                <div className="flex items-center pr-4 text-[10px] font-black uppercase tracking-tight text-slate-400">
                  {formatDayLabel(day)}
                </div>
                {matrix[row].map((count, col) => {
                  const intensity = flatMax > 0 ? count / flatMax : 0;
                  return (
                    <div
                      key={`${day}-${col}`}
                      className="m-[1.5px] aspect-square min-h-[22px] rounded-[4px] shadow-sm transition-all hover:scale-125 hover:z-10 cursor-pointer"
                      style={{ 
                        backgroundColor: cellColor(intensity),
                        outline: count > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none'
                      }}
                      title={`${day} ${col}:00 UTC — ${count} events (${(intensity * 100).toFixed(0)}%)`}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="mt-8 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
            <span>Quiet</span>
            <div className="flex gap-1">
              <div className="h-3 w-3 rounded-sm border border-slate-200" style={{ backgroundColor: getDensityColor(0.0) }} />
              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: getDensityColor(0.25) }} />
              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: getDensityColor(0.5) }} />
              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: getDensityColor(0.75) }} />
              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: getDensityColor(1.0) }} />
            </div>
            <span>Busy</span>
          </div>
          <div className="text-[10px] font-bold text-slate-300">
            MAX BANDWIDTH: <span className="text-slate-800">{flatMax} EVENTS/HR</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export { defaultUtcRange7d };
