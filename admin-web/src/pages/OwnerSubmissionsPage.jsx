import { useCallback, useEffect, useState } from 'react';
import {
  fetchOwnerIntelligenceHeatmap,
  fetchOwnerSubmissions,
  requestOwnerPoiUpdate,
  requestOwnerPoiDelete,
} from '../apiClient.js';
import ContributionHeatmap from '../components/ContributionHeatmap.jsx';

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
  const [heatmapRows, setHeatmapRows] = useState([]);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [heatmapErr, setHeatmapErr] = useState('');
  const [selectedPoiId, setSelectedPoiId] = useState('');

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
      const result = await fetchOwnerIntelligenceHeatmap(startIso, endIso, selectedPoiId || undefined);
      setHeatmapRows(Array.isArray(result) ? result : []);
    } catch (e) {
      setHeatmapErr(e.message || 'Không thể tải heatmap hoạt động POI của bạn');
      setHeatmapRows([]);
    } finally {
      setHeatmapLoading(false);
    }
  }, [startIso, endIso, selectedPoiId]);

  useEffect(() => {
    loadHeatmap();
  }, [loadHeatmap]);

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

      <section className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Heatmap lượt khách tại POI của tôi</h2>
            <p className="mt-1 text-sm text-slate-600">
              Chỉ tính các POI đã được duyệt do bạn quản lý. Owner khác sẽ có biểu đồ khác.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-600">
              POI
              <select
                className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                value={selectedPoiId}
                onChange={(e) => setSelectedPoiId(e.target.value)}
              >
                <option value="">Tất cả POI đã duyệt của tôi</option>
                {approvedOptions.map((poi) => (
                  <option key={String(poi.id)} value={String(poi.id)}>
                    {poi.name || poi.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-slate-600">
              Từ ngày
              <input
                type="date"
                className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                value={toDateValue(range.start)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const d = new Date(`${v}T00:00:00.000Z`);
                  setRange((prev) => ({ ...prev, start: d }));
                }}
              />
            </label>
            <label className="text-xs text-slate-600">
              Đến ngày
              <input
                type="date"
                className="mt-1 block rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                value={toDateValue(range.end)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const d = new Date(`${v}T23:59:59.999Z`);
                  setRange((prev) => ({ ...prev, end: d }));
                }}
              />
            </label>
            <button
              type="button"
              onClick={loadHeatmap}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Tải lại heatmap
            </button>
          </div>
        </div>

        {heatmapErr ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {heatmapErr}
          </div>
        ) : null}

        {heatmapLoading ? (
          <p className="mt-4 text-sm text-slate-600">Đang tải heatmap...</p>
        ) : (
          <div className="mt-4">
            <ContributionHeatmap
              rows={heatmapRows}
              startIso={startIso}
              endIso={endIso}
              title="Lịch sử lượt khách theo ngày"
              subtitle={
                selectedPoiId
                  ? 'Nguồn: events của POI đã chọn (đã duyệt, thuộc owner hiện tại).'
                  : 'Nguồn: events vào tất cả POI đã duyệt của owner hiện tại.'
              }
            />
          </div>
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
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium">Mã</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Nội dung</th>
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
        </div>
      )}

      {/* Edit Modal */}
      {editModalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-2xl my-8">
            <h2 className="text-xl font-bold text-slate-900 mb-6">Chỉnh sửa địa điểm</h2>
            
            <form onSubmit={handleEditSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700">Mã địa điểm (duy nhất)</label>
                <input
                  type="text"
                  required
                  disabled
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500 cursor-not-allowed"
                  value={editFormData.code}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Tên địa điểm</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:ring-emerald-500"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Tóm tắt</label>
                <input
                  type="text"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:ring-emerald-500"
                  value={editFormData.summary}
                  onChange={(e) => setEditFormData({ ...editFormData, summary: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Văn bản ngắn</label>
                <input
                  type="text"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:ring-emerald-500"
                  value={editFormData.narrationShort}
                  onChange={(e) => setEditFormData({ ...editFormData, narrationShort: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Văn bản dài (premium)</label>
                <textarea
                  rows="4"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:ring-emerald-500"
                  value={editFormData.narrationLong}
                  onChange={(e) => setEditFormData({ ...editFormData, narrationLong: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Vĩ độ</label>
                  <input
                    type="number"
                    step="any"
                    required
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:ring-emerald-500"
                    value={editFormData.lat}
                    onChange={(e) => setEditFormData({ ...editFormData, lat: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Kinh độ</label>
                  <input
                    type="number"
                    step="any"
                    required
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:ring-emerald-500"
                    value={editFormData.lng}
                    onChange={(e) => setEditFormData({ ...editFormData, lng: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Bán kính (mét)</label>
                  <input
                    type="number"
                    required
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:ring-emerald-500"
                    value={editFormData.radius}
                    onChange={(e) => setEditFormData({ ...editFormData, radius: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Priority</label>
                  <input
                    type="number"
                    required
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:ring-emerald-500"
                    value={editFormData.priority}
                    onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalRow(null)}
                  className="rounded-lg border border-slate-300 px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  disabled={editLoading}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                  disabled={editLoading}
                >
                  {editLoading ? 'Đang gửi...' : 'Gửi yêu cầu phê duyệt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
