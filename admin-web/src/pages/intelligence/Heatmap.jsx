import { Fragment, useMemo } from 'react';

/**
 * 7×24 activity heatmap (UTC): rows = calendar days, columns = hours 0–23.
 * Intensity: green (low) → yellow → red (high).
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
    const n = Number(c.total_events) || 0;
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

function cellColor(count, max) {
  if (max <= 0 || count <= 0) {
    return 'hsl(125, 55%, 32%)';
  }
  const t = Math.min(1, count / max);
  const hue = 125 * (1 - t);
  const light = 28 + 22 * (1 - t * 0.65);
  const sat = 72 + 18 * t;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
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
    <section>
      <h2 className="text-lg font-medium text-slate-800">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <div className="inline-block min-w-[720px]">
          <div className="grid" style={{ gridTemplateColumns: '88px repeat(24, minmax(0, 1fr))' }}>
            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="px-0.5 text-center text-[10px] font-medium text-slate-500">
                {h}
              </div>
            ))}
            {dayKeys.map((day, row) => (
              <Fragment key={day}>
                <div className="flex items-center pr-2 text-xs text-slate-600">{formatDayLabel(day)}</div>
                {matrix[row].map((count, col) => (
                  <div
                    key={`${day}-${col}`}
                    className="m-0.5 aspect-square min-h-[18px] rounded-sm border border-slate-200/80"
                    style={{ backgroundColor: cellColor(count, flatMax) }}
                    title={`${day} ${col}:00 UTC — ${count} events`}
                  />
                ))}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-600">
          <span>Thấp</span>
          <div className="h-3 w-40 rounded bg-gradient-to-r from-green-700 via-yellow-400 to-red-600" />
          <span>Cao</span>
          <span className="text-slate-500">(max trong cửa sổ: {flatMax})</span>
        </div>
      </div>
    </section>
  );
}

export { defaultUtcRange7d };
