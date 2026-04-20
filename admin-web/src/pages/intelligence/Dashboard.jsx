import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchMasterPois,
  fetchIntelligenceEventsByAuthState,
  fetchIntelligenceEventsByFamily,
  fetchIntelligenceGeoHeatmap,
  fetchIntelligenceHeatmap,
  fetchIntelligenceTimeline,
} from '../../apiClient.js';
import Heatmap, { defaultUtcRange7d } from './Heatmap.jsx';
import GeoHeatmapMap from './GeoHeatmapMap.jsx';

const PIE_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#64748b'];

function defaultRange() {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 14);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

function utcDateInputValue(d) {
  const x = d instanceof Date ? d : new Date(d);
  return x.toISOString().slice(0, 10);
}

function toIso(d) {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function mapFamilyLabel(family) {
  const x = String(family || '').trim();
  if (x === 'LocationEvent') return 'Sự kiện vị trí';
  if (x === 'UserInteractionEvent') return 'Sự kiện tương tác người dùng';
  if (x === 'NavigationEvent') return 'Sự kiện điều hướng';
  if (x === 'ObservabilityEvent') return 'Sự kiện quan sát hệ thống';
  return x || 'Không xác định';
}

function mapAuthLabel(auth) {
  const x = String(auth || '').trim().toLowerCase();
  if (x === 'guest') return 'Khách';
  if (x === 'logged_in') return 'Đã đăng nhập';
  if (x === 'premium') return 'Premium';
  return auth || 'Không xác định';
}

export default function IntelligenceDashboard() {
  const [{ start, end }, setRange] = useState(() => defaultRange());
  const [granularity, setGranularity] = useState('daily');
  const [timeline, setTimeline] = useState([]);
  const [byFamily, setByFamily] = useState([]);
  const [byAuth, setByAuth] = useState([]);
  const [geoHeatmapRows, setGeoHeatmapRows] = useState([]);
  const [geoFallbackRows, setGeoFallbackRows] = useState([]);
  const [heatmapCells, setHeatmapCells] = useState([]);
  const [heatmapRange, setHeatmapRange] = useState(() => {
    const { start, end } = defaultUtcRange7d();
    return { startIso: start.toISOString(), endIso: end.toISOString() };
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const startIso = useMemo(() => toIso(start), [start]);
  const endIso = useMemo(() => toIso(end), [end]);

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const { start: hmStart, end: hmEnd } = defaultUtcRange7d();
      const hmStartIso = hmStart.toISOString();
      const hmEndIso = hmEnd.toISOString();
      setHeatmapRange({ startIso: hmStartIso, endIso: hmEndIso });

      const [tl, fam, auth, geo, hm, masterPois] = await Promise.all([
        fetchIntelligenceTimeline(startIso, endIso, granularity),
        fetchIntelligenceEventsByFamily(startIso, endIso, granularity),
        fetchIntelligenceEventsByAuthState(startIso, endIso, granularity),
        fetchIntelligenceGeoHeatmap(startIso, endIso),
        fetchIntelligenceHeatmap(hmStartIso, hmEndIso),
        fetchMasterPois(1, 200),
      ]);
      setTimeline(Array.isArray(tl) ? tl : []);
      setByFamily(Array.isArray(fam) ? fam : []);
      setByAuth(Array.isArray(auth) ? auth : []);
      setGeoHeatmapRows(Array.isArray(geo) ? geo : []);
      setHeatmapCells(Array.isArray(hm) ? hm : []);
      const masterPoiRows = Array.isArray(masterPois?.data)
        ? masterPois.data
        : Array.isArray(masterPois?.items)
          ? masterPois.items
          : [];

      const fallback = masterPoiRows.length > 0
        ? masterPoiRows
            .filter((p) => p?.status === 'APPROVED' && p?.location)
            .map((p) => ({
              lat: Number(
                Array.isArray(p.location?.coordinates) ? p.location.coordinates[1] : p.location?.lat,
              ),
              lng: Number(
                Array.isArray(p.location?.coordinates) ? p.location.coordinates[0] : p.location?.lng,
              ),
              total_events: Math.max(1, Number(p.priority) || 1),
            }))
            .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lng))
        : [];
      setGeoFallbackRows(fallback);
    } catch (e) {
      setErr(e.message || 'Không thể tải số liệu Intelligence');
      setTimeline([]);
      setByFamily([]);
      setByAuth([]);
      setGeoHeatmapRows([]);
      setGeoFallbackRows([]);
      setHeatmapCells([]);
    } finally {
      setLoading(false);
    }
  }, [startIso, endIso, granularity]);

  useEffect(() => {
    load();
  }, [load]);

  const timelineChartData = useMemo(
    () =>
      timeline.map((row) => ({
        ...row,
        label:
          row.bucket_start != null
            ? new Date(row.bucket_start).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                ...(granularity === 'hourly' ? { hour: '2-digit' } : {}),
              })
            : '',
      })),
    [timeline, granularity],
  );

  const familyBarData = useMemo(
    () =>
      byFamily.map((r) => ({
        name: mapFamilyLabel(r.event_family),
        total_events: Number(r.total_events) || 0,
      })),
    [byFamily],
  );

  const authPieData = useMemo(
    () =>
      byAuth.map((r) => ({
        name: mapAuthLabel(r.auth_state),
        value: Number(r.total_events) || 0,
      })),
    [byAuth],
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Bảng điều khiển Intelligence</h1>
      <p className="mt-1 text-sm text-slate-600">
        Số liệu lấy từ rollup (giờ/ngày) — không truy vấn trực tiếp dữ liệu sự kiện thô.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Từ ngày (UTC)
          <input
            type="date"
            className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            value={utcDateInputValue(start)}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const d = new Date(`${v}T00:00:00.000Z`);
              setRange((prev) => ({ ...prev, start: d }));
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Đến ngày (UTC)
          <input
            type="date"
            className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            value={utcDateInputValue(end)}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const d = new Date(`${v}T23:59:59.999Z`);
              setRange((prev) => ({ ...prev, end: d }));
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          Độ chi tiết
          <select
            className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value)}
          >
            <option value="daily">Rollup theo ngày</option>
            <option value="hourly">Rollup theo giờ</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => load()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Tải lại
        </button>
      </div>

      {err && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div>
      )}

      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Đang tải biểu đồ…</p>
      ) : (
        <div className="mt-8 space-y-10">
          <section>
            <h2 className="text-lg font-medium text-slate-800">Heatmap vị trí khách theo POI</h2>
            <div className="mt-3">
              <GeoHeatmapMap rows={geoHeatmapRows} fallbackRows={geoFallbackRows} />
            </div>
          </section>

          <Heatmap
            cells={heatmapCells}
            rangeStartIso={heatmapRange.startIso}
            rangeEndIso={heatmapRange.endIso}
            subtitle="Nguồn: uis_events_raw (7 ngày UTC gần nhất), không dùng rollup."
          />

          <section>
            <h2 className="text-lg font-medium text-slate-800">Dòng thời gian (tổng sự kiện)</h2>
            <div className="mt-3 h-80 w-full rounded-xl border border-slate-200 bg-white p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="total_events" name="Sự kiện" stroke="#059669" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            <section>
              <h2 className="text-lg font-medium text-slate-800">Theo loại sự kiện</h2>
              <div className="mt-3 h-72 w-full rounded-xl border border-slate-200 bg-white p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={familyBarData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" angle={-28} textAnchor="end" interval={0} height={56} tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="total_events" name="Số sự kiện" fill="#0d9488" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-medium text-slate-800">Theo trạng thái đăng nhập</h2>
              <div className="mt-3 h-72 w-full rounded-xl border border-slate-200 bg-white p-4">
                {authPieData.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-slate-500">Không có dữ liệu</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={authPieData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) =>
                          `${name} ${percent != null ? (percent * 100).toFixed(0) : 0}%`
                        }
                      >
                        {authPieData.map((_, i) => (
                          <Cell key={String(i)} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
