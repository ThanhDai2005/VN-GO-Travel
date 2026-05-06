import { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  fetchOwnerGeoHeatmap,
  fetchOwnerIntelligenceHeatmap,
  fetchOwnerIntelligenceTimeline,
  fetchOwnerSubmissions,
  requestOwnerPoiUpdate,
  requestOwnerPoiDelete,
} from '../apiClient.js';
import TableScrollWrapper from '../components/TableScrollWrapper.jsx';
import Heatmap, { defaultUtcRange7d } from './intelligence/Heatmap.jsx';
import GeoHeatmapMap from './intelligence/GeoHeatmapMap.jsx';

function contentPreview(content) {
  if (!content || typeof content !== 'object') return '—';
  return content.vi || content.en || '—';
}

function statusBadge(status) {
  const s = status || '—';
  const cls =
    s === 'APPROVED'
      ? 'bg-emerald-100 text-emerald-800'
      : s === 'PENDING'
        ? 'bg-amber-100 text-amber-900'
        : s === 'REJECTED'
          ? 'bg-red-100 text-red-800'
          : 'bg-slate-100 text-slate-700';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{s}</span>;
}

export default function OwnerSubmissionsPage() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [selectedPoiId, setSelectedPoiId] = useState('');
  const [geoRows, setGeoRows] = useState([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [timelineRows, setTimelineRows] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [fixedHeatmapRows, setFixedHeatmapRows] = useState([]);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [heatmapErr, setHeatmapErr] = useState('');

  const [range, setRange] = useState(() => {
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 364);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end };
  });

  const [editModalRow, setEditModalRow] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', descriptionEn: '', descriptionVi: '' });
  const [editLoading, setEditLoading] = useState(false);

  const startIso = range.start.toISOString();
  const endIso = range.end.toISOString();

  const load = useCallback(async (page = 1) => {
    setErr('');
    setLoading(true);
    try {
      const res = await fetchOwnerSubmissions(page, pagination.limit);
      setRows(Array.isArray(res?.data) ? res.data : []);
      if (res?.pagination) setPagination((p) => ({ ...p, ...res.pagination }));
    } catch (e) {
      setErr(e.message || 'Không thể tải danh sách địa điểm đã gửi');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.limit]);

  useEffect(() => {
    load(1);
  }, []);

  const loadHeatmap = useCallback(async () => {
    setHeatmapErr('');
    setHeatmapLoading(true);
    try {
      // Fixed 7-day range for calendar heatmap per user request
      const { start: fStart, end: fEnd } = defaultUtcRange7d();
      const result = await fetchOwnerIntelligenceHeatmap(fStart.toISOString(), fEnd.toISOString(), selectedPoiId || undefined);
      setFixedHeatmapRows(Array.isArray(result) ? result : []);
    } catch (e) {
      setHeatmapErr(e.message || 'Không thể tải heatmap hoạt động POI của bạn');
      setFixedHeatmapRows([]);
    } finally {
      setHeatmapLoading(false);
    }
  }, [selectedPoiId]);

  const loadTimeline = useCallback(async () => {
    setTimelineLoading(true);
    try {
      const res = await fetchOwnerIntelligenceTimeline(startIso, endIso, 'daily');
      setTimelineRows(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error("Failed to load timeline", e);
    } finally {
      setTimelineLoading(false);
    }
  }, [startIso, endIso, selectedPoiId]);

  const loadGeoHeatmap = useCallback(async () => {
    setGeoLoading(true);
    try {
      const res = await fetchOwnerGeoHeatmap(startIso, endIso, selectedPoiId || undefined);
      setGeoRows(Array.isArray(res) ? res : []);
    } catch (e) {
      console.error("Failed to load owner geo heatmap", e);
    } finally {
      setGeoLoading(false);
    }
  }, [startIso, endIso, selectedPoiId]);

  useEffect(() => {
    loadHeatmap();
    loadGeoHeatmap();
    loadTimeline();
  }, [loadHeatmap, loadGeoHeatmap, loadTimeline]);

  const toDateValue = (d) => d.toISOString().slice(0, 10);
  const approvedOptions = rows.filter((x) => x?.status === 'APPROVED');

  function openEditModal(row) {
    setEditModalRow(row);
    setEditFormData({
      code: row.code || '',
      name: row.name || '',
      summary: row.summary || '',
      narrationShort: row.narrationShort || '',
      narrationLong: row.narrationLong || '',
      lat: row.location?.lat || '',
      lng: row.location?.lng || '',
      radius: row.radius || 50,
      priority: row.priority || 0,
    });
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editModalRow) return;
    setEditLoading(true);
    try {
      const payload = {
        code: editFormData.code,
        name: editFormData.name,
        summary: editFormData.summary,
        narrationShort: editFormData.narrationShort,
        narrationLong: editFormData.narrationLong,
        location: {
          lat: Number(editFormData.lat),
          lng: Number(editFormData.lng),
        },
        radius: Number(editFormData.radius),
        priority: Number(editFormData.priority),
      };
      await requestOwnerPoiUpdate(editModalRow.id || editModalRow._id, payload);
      alert('Yêu cầu chỉnh sửa đã được gửi tới Admin phê duyệt.');
      setEditModalRow(null);
    } catch (e) {
      alert('Lỗi: ' + e.message);
    } finally {
      setEditLoading(false);
    }
  }

  async function requestDelete(id) {
    if (!window.confirm('Bạn có chắc chắn muốn yêu cầu XÓA địa điểm này? Yêu cầu sẽ được gửi tới Admin phê duyệt.')) return;
    try {
      await requestOwnerPoiDelete(id);
      alert('Yêu cầu xóa đã được gửi. POI sẽ biến mất sau khi Admin chấp thuận.');
    } catch (e) {
      alert('Lỗi: ' + e.message);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">POI của tôi</h1>
          <p className="text-sm text-slate-600">Danh sách địa điểm bạn đã gửi, chờ quản trị viên xử lý.</p>
        </div>
        <button
          type="button"
          onClick={() => load(pagination.page || 1)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
        >
          Làm mới
        </button>
      </div>

      {/* Intelligence Section - New Premium Design matching Admin Hub */}
      <section className="mb-10 animate-in fade-in slide-in-from-bottom-2 duration-700">
        <div className="flex flex-col gap-1 mb-6">
          <h2 className="text-3xl font-black tracking-tight text-slate-900">
            Intelligence <span className="text-emerald-600">Owner Hub</span>
          </h2>
          <p className="text-sm font-medium text-slate-500">
            Phân tích lưu lượng khách tại các địa danh bạn quản lý.
          </p>
        </div>

        {/* Filters Bar */}
        <div className="mb-8 flex flex-wrap items-center gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            {/* POI Selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Địa danh (POI)</span>
              <select
                className="rounded-xl bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 outline-none focus:ring-emerald-500"
                value={selectedPoiId}
                onChange={(e) => setSelectedPoiId(e.target.value)}
              >
                <option value="">Tất cả POI đã duyệt của tôi</option>
                {approvedOptions.map((poi) => (
                  <option key={String(poi.id || poi._id)} value={String(poi.id || poi._id)}>
                    {poi.name || poi.code}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Tùy chỉnh thời gian</span>
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-1.5 ring-1 ring-slate-200">
                <input
                  type="date"
                  className="bg-transparent px-2 py-1 text-xs font-bold text-slate-700 outline-none"
                  value={toDateValue(range.start)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const d = new Date(`${v}T00:00:00.000Z`);
                    setRange((prev) => ({ ...prev, start: d }));
                  }}
                />
                <span className="text-slate-300">/</span>
                <input
                  type="date"
                  className="bg-transparent px-2 py-1 text-xs font-bold text-slate-700 outline-none"
                  value={toDateValue(range.end)}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    const d = new Date(`${v}T23:59:59.999Z`);
                    setRange((prev) => ({ ...prev, end: d }));
                  }}
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { loadHeatmap(); loadGeoHeatmap(); }}
            disabled={heatmapLoading || geoLoading}
            className="ml-auto flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-bold text-white transition-all hover:bg-emerald-600 disabled:opacity-50"
          >
            {heatmapLoading || geoLoading ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" fill="none" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" className="opacity-75" fill="none" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            )}
            REFRESH HEATMAP
          </button>
        </div>

        {/* Heatmap Visualizations */}
        <div className="space-y-10">
          <section>
            <h3 className="text-lg font-medium text-slate-800 mb-4">Heatmap vị trí khách tại POI của tôi</h3>
            <GeoHeatmapMap 
              rows={geoRows} 
              fallbackRows={approvedOptions
                .filter(p => p.location)
                .map(p => ({
                  lat: Number(p.location.lat),
                  lng: Number(p.location.lng),
                  total_events: 0,
                  poi_id: String(p.id || p._id),
                  name: p.name || p.code
                }))
              }
              isLoading={geoLoading} 
            />
          </section>

          {/* Timeline Chart - Affected by global filters */}
          <section className="rounded-[2.5rem] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="mb-6">
              <h3 className="text-xl font-black text-slate-800">Xu hướng lưu lượng khách</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                Dữ liệu dựa trên bộ lọc thời gian và địa danh phía trên
              </p>
            </div>
            <div className="h-[300px] w-full">
              {timelineLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400 italic">Đang tải biểu đồ...</div>
              ) : timelineRows.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400 italic">Không có dữ liệu xu hướng cho khoảng thời gian này</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineRows}>
                    <defs>
                      <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="bucket_start" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                      tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                    />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      labelFormatter={(val) => new Date(val).toLocaleDateString(undefined, { dateStyle: 'full' })}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="total_events" 
                      stroke="#10b981" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorVisits)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section>
            <Heatmap
              cells={fixedHeatmapRows}
              rangeStartIso={defaultUtcRange7d().start.toISOString()}
              rangeEndIso={defaultUtcRange7d().end.toISOString()}
              title="Bản đồ nhiệt hoạt động (UTC)"
              subtitle={
                selectedPoiId
                  ? 'Cố định 7 ngày gần nhất • Nguồn: events của POI đã chọn.'
                  : 'Cố định 7 ngày gần nhất • Nguồn: events vào tất cả POI đã duyệt.'
              }
            />
          </section>
        </div>

        {heatmapErr && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{heatmapErr}</div>
        )}
      </section>

      {err && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</div>
      )}

      {loading ? (
        <p className="text-slate-600">Đang tải...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-slate-600">
          Bạn chưa gửi POI nào. Hãy dùng mục <strong>Gửi POI mới</strong> trong thanh bên.
        </p>
      ) : (
        <TableScrollWrapper>
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Mã</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Nội dung</th>
                <th className="px-4 py-3 font-medium">Zone</th>
                <th className="px-4 py-3 font-medium">Tọa độ</th>
                <th className="px-4 py-3 font-medium">Hành động</th>
                <th className="px-4 py-3 font-medium">Cập nhật</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {rows.map((row) => {
                const id = String(row.id || row._id || '');
                const loc = row.location;
                const lat = loc != null ? Number(loc.lat) : NaN;
                const lng = loc != null ? Number(loc.lng) : NaN;
                const locStr =
                  loc && !Number.isNaN(lat) && !Number.isNaN(lng)
                    ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                    : '—';
                return (
                  <tr key={id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-emerald-700">{row.code}</td>
                    <td className="px-4 py-3">{statusBadge(row.status)}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-800">{contentPreview(row.content)}</td>
                    <td className="px-4 py-3">
                      {row.zone ? (
                        <span className="font-medium text-slate-900">{row.zone.name}</span>
                      ) : (
                        <span className="text-slate-400 italic text-xs">Chưa thuộc zone</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{locStr}</td>
                    <td className="px-4 py-3">
                      {row.status === 'APPROVED' && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(row)}
                            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-100"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDelete(id)}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100"
                          >
                            Xóa
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScrollWrapper>
      )}

      {/* Edit Modal */}
      {editModalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 z-10">
              <h2 className="text-lg font-bold text-slate-900">Chỉnh sửa địa điểm</h2>
              <p className="text-xs text-slate-500 mt-1">Yêu cầu sẽ được gửi tới Admin phê duyệt</p>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Mã địa điểm */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Mã địa điểm</label>
                  <input
                    type="text"
                    disabled
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
                    value={editFormData.code}
                  />
                </div>

                {/* Zone */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Zone hiện tại</label>
                  <div className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {editModalRow.zone ? (
                      <span className="font-medium text-slate-900">{editModalRow.zone.name}</span>
                    ) : (
                      <span className="text-slate-400 italic text-xs">Chưa thuộc zone</span>
                    )}
                  </div>
                </div>

                {/* Tên địa điểm */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tên địa điểm</label>
                  <input
                    type="text"
                    required
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  />
                </div>

                {/* Tóm tắt */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tóm tắt</label>
                  <input
                    type="text"
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={editFormData.summary}
                    onChange={(e) => setEditFormData({ ...editFormData, summary: e.target.value })}
                  />
                </div>

                {/* Văn bản ngắn */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Văn bản ngắn</label>
                  <textarea
                    rows="2"
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={editFormData.narrationShort}
                    onChange={(e) => setEditFormData({ ...editFormData, narrationShort: e.target.value })}
                  />
                </div>

                {/* Văn bản dài */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Văn bản dài (premium)</label>
                  <textarea
                    rows="3"
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={editFormData.narrationLong}
                    onChange={(e) => setEditFormData({ ...editFormData, narrationLong: e.target.value })}
                  />
                </div>

                {/* Vĩ độ */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Vĩ độ</label>
                  <input
                    type="number"
                    step="any"
                    required
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={editFormData.lat}
                    onChange={(e) => setEditFormData({ ...editFormData, lat: e.target.value })}
                  />
                </div>

                {/* Kinh độ */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kinh độ</label>
                  <input
                    type="number"
                    step="any"
                    required
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={editFormData.lng}
                    onChange={(e) => setEditFormData({ ...editFormData, lng: e.target.value })}
                  />
                </div>

                {/* Bán kính */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Bán kính (mét)</label>
                  <input
                    type="number"
                    required
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={editFormData.radius}
                    onChange={(e) => setEditFormData({ ...editFormData, radius: e.target.value })}
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Priority</label>
                  <input
                    type="number"
                    required
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    value={editFormData.priority}
                    onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value })}
                  />
                </div>
              </div>

              {/* Footer buttons */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalRow(null)}
                  className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  disabled={editLoading}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                  disabled={editLoading}
                >
                  {editLoading ? 'Đang gửi...' : 'Gửi yêu cầu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
