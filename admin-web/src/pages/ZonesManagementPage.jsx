import { useCallback, useEffect, useState } from 'react';
import {
  fetchZones,
  createZone,
  updateZone,
  deleteZone,
  updateZonePois,
  fetchMasterPois,
  fetchZoneQrToken,
} from '../apiClient.js';

function statusBadge(status) {
  const s = status || '—';
  const cls =
    s === 'APPROVED'
      ? 'bg-emerald-100 text-emerald-800'
      : s === 'PENDING'
        ? 'bg-amber-100 text-amber-800'
        : s === 'REJECTED'
          ? 'bg-red-100 text-red-800'
          : 'bg-slate-100 text-slate-700';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{s}</span>;
}

export default function ZonesManagementPage() {
  const [zones, setZones] = useState([]);
  const [allPois, setAllPois] = useState([]);
  const [loading, setLoading] = useState(true);
  const [poisLoading, setPoisLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyZoneId, setBusyZoneId] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editZone, setEditZone] = useState(null);
  const [deleteZone, setDeleteZone] = useState(null);
  const [managePoiZone, setManagePoiZone] = useState(null);
  const [selectedPoiIds, setSelectedPoiIds] = useState([]);
  const [savingPois, setSavingPois] = useState(false);
  const [poiSearchTerm, setPoiSearchTerm] = useState('');
  const [qrZone, setQrZone] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);

  const [form, setForm] = useState({ name: '', description: '', price: '' });

  const loadZones = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const res = await fetchZones(1, 100);
      const nextZones = Array.isArray(res?.data) ? res.data : [];
      setZones(nextZones);
      return nextZones;
    } catch (e) {
      setErr(e.message || 'Không thể tải danh sách Zone');
      setZones([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPois = useCallback(async () => {
    setPoisLoading(true);
    try {
      const res = await fetchMasterPois(1, 500);
      setAllPois(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      console.error('Failed to load POIs:', e);
      setAllPois([]);
    } finally {
      setPoisLoading(false);
    }
  }, []);

  useEffect(() => {
    loadZones();
    loadPois();
  }, []);

  function openCreate() {
    setForm({ name: '', description: '', price: '' });
    setCreateOpen(true);
  }

  function openEdit(zone) {
    setForm({
      name: zone.name || '',
      description: zone.description || '',
      price: zone.price != null ? String(zone.price) : '',
    });
    setEditZone(zone);
  }

  async function submitCreate(e) {
    e.preventDefault();
    const name = form.name.trim();
    const price = Number(form.price);
    if (!name) {
      setErr('Tên Zone là bắt buộc');
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      setErr('Giá phải là số hợp lệ >= 0');
      return;
    }
    setErr('');
    setBusyZoneId('__create__');
    try {
      await createZone({
        name,
        description: form.description.trim(),
        price,
      });
      setCreateOpen(false);
      await loadZones();
    } catch (e) {
      setErr(e.message || 'Tạo Zone thất bại');
    } finally {
      setBusyZoneId(null);
    }
  }

  async function submitEdit(e) {
    e.preventDefault();
    if (!editZone?.id) return;
    const name = form.name.trim();
    const price = Number(form.price);
    if (!name) {
      setErr('Tên Zone là bắt buộc');
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      setErr('Giá phải là số hợp lệ >= 0');
      return;
    }
    setErr('');
    setBusyZoneId(editZone.id);
    try {
      await updateZone(editZone.id, {
        name,
        description: form.description.trim(),
        price,
      });
      setEditZone(null);
      await loadZones();
    } catch (e) {
      setErr(e.message || 'Cập nhật Zone thất bại');
    } finally {
      setBusyZoneId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteZone?.id) return;
    setBusyZoneId(deleteZone.id);
    setErr('');
    try {
      await deleteZone(deleteZone.id);
      setDeleteZone(null);
      await loadZones();
    } catch (e) {
      setErr(e.message || 'Xóa Zone thất bại');
    } finally {
      setBusyZoneId(null);
    }
  }

  function openManagePois(zone) {
    setManagePoiZone(zone);
    // FIX: Use poiCodes instead of pois
    const reopenedSelectedPoiIds = zone.pois || zone.poiCodes || [];
    setSelectedPoiIds(reopenedSelectedPoiIds);
    console.log('AFTER REOPEN: selectedPoiIds =', reopenedSelectedPoiIds);
    setPoiSearchTerm('');
  }

  function handlePoiToggle(poiId) {
    setSelectedPoiIds((prev) => {
      // FIX: Work with POI codes, not IDs
      const poi = allPois.find(p => p.id === poiId);
      const poiCode = poi ? poi.code : poiId;

      if (prev.includes(poiCode)) {
        return prev.filter((code) => code !== poiCode);
      } else {
        return [...prev, poiCode];
      }
    });
  }

  async function savePoiChanges() {
    if (!managePoiZone?.id) return;
    console.log('CLICK SAVE BUTTON', selectedPoiIds);
    console.log('API PAYLOAD', selectedPoiIds);
    setSavingPois(true);
    setErr('');
    try {
      // FIX: Send POI codes, not IDs
      const poiCodesToSend = selectedPoiIds.map(id => {
        const poi = allPois.find(p => p.id === id);
        return poi ? poi.code : id;
      });
      console.log('Sending POI codes:', poiCodesToSend);
      await updateZonePois(managePoiZone.id, poiCodesToSend);
      const refreshedZones = await loadZones();
      const updatedZone = refreshedZones.find((z) => z.id === managePoiZone.id);
      if (updatedZone) {
        setManagePoiZone(updatedZone);
        setSelectedPoiIds(updatedZone.pois || updatedZone.poiCodes || []);
      }
      setErr('');
    } catch (e) {
      console.error('Save POI error:', e);
      setErr(e.message || 'Cập nhật POI thất bại');
    } finally {
      setSavingPois(false);
    }
  }

  function cancelPoiChanges() {
    setSelectedPoiIds(managePoiZone?.poiCodes || managePoiZone?.pois || []);
    setManagePoiZone(null);
    setPoiSearchTerm('');
  }

  async function openQrModal(zone) {
    setQrZone(zone);
    setQrData(null);
    setLoadingQr(true);
    setErr('');
    try {
      const json = await fetchZoneQrToken(zone.id);
      if (json?.success && json?.data) {
        setQrData(json.data);
      } else {
        setErr('Không thể tạo QR token');
      }
    } catch (e) {
      console.error('QR generation error:', e);
      setErr(e.message || 'Không thể tạo QR token');
    } finally {
      setLoadingQr(false);
    }
  }

  function closeQrModal() {
    setQrZone(null);
    setQrData(null);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Quản lý Zone</h1>
          <p className="text-sm text-slate-600">
            Tạo và quản lý các Zone (khu vực) để gán POI và tạo QR code.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadZones}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
          >
            Làm mới
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Thêm Zone
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          {err}
        </div>
      )}

      {loading ? (
        <p className="text-slate-600">Đang tải...</p>
      ) : zones.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-slate-600">
          Chưa có Zone nào. Hãy tạo Zone đầu tiên.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Tên Zone</th>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Mô tả</th>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Giá (credits)</th>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Số POI</th>
                <th className="bg-gray-800 px-4 py-3 text-right font-bold text-white">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => {
                const busy = busyZoneId === zone.id;
                // FIX: Use poiCodes instead of pois
                const poiCount = Array.isArray(zone.poiCodes) ? zone.poiCodes.length : (Array.isArray(zone.pois) ? zone.pois.length : 0);
                return (
                  <tr key={String(zone.id)} className="odd:bg-gray-50 even:bg-white">
                    <td className="border-b border-gray-200 px-4 py-3 font-medium text-gray-900">
                      {zone.name}
                    </td>
                    <td className="max-w-[300px] truncate border-b border-gray-200 px-4 py-3 text-gray-700">
                      {zone.description || '—'}
                    </td>
                    <td className="border-b border-gray-200 px-4 py-3 text-gray-900">
                      {zone.price != null ? zone.price : '—'}
                    </td>
                    <td className="border-b border-gray-200 px-4 py-3 text-gray-900">{poiCount}</td>
                    <td className="border-b border-gray-200 px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openQrModal(zone)}
                          className="rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs text-green-700 hover:bg-green-100 disabled:opacity-50"
                        >
                          Generate QR
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openManagePois(zone)}
                          className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                        >
                          Quản lý POI
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => openEdit(zone)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900 hover:bg-gray-100 disabled:opacity-50"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setDeleteZone(zone)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Thêm Zone</h2>
            <form onSubmit={submitCreate} className="mt-4 space-y-3">
              <Field
                label="Tên Zone"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                required
              />
              <Field
                label="Mô tả"
                value={form.description}
                onChange={(v) => setForm((f) => ({ ...f, description: v }))}
              />
              <Field
                label="Giá (credits)"
                value={form.price}
                onChange={(v) => setForm((f) => ({ ...f, price: v }))}
                required
                type="number"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busyZoneId === '__create__'}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busyZoneId === '__create__' ? '...' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Sửa Zone</h2>
            <p className="mt-1 text-sm text-emerald-300">{editZone.name}</p>
            <form onSubmit={submitEdit} className="mt-4 space-y-3">
              <Field
                label="Tên Zone"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                required
              />
              <Field
                label="Mô tả"
                value={form.description}
                onChange={(v) => setForm((f) => ({ ...f, description: v }))}
              />
              <Field
                label="Giá (credits)"
                value={form.price}
                onChange={(v) => setForm((f) => ({ ...f, price: v }))}
                required
                type="number"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditZone(null)}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busyZoneId === editZone.id}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busyZoneId === editZone.id ? '...' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Xóa Zone?</h2>
            <p className="mt-2 text-sm text-slate-400">
              Xóa vĩnh viễn <span className="font-medium text-emerald-300">{deleteZone.name}</span>.
              Hành động này không thể hoàn tác.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteZone(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busyZoneId === deleteZone.id}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-50"
              >
                {busyZoneId === deleteZone.id ? '...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage POIs modal */}
      {managePoiZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">Quản lý POI cho Zone</h2>
            <p className="mt-1 text-sm text-emerald-300">{managePoiZone.name}</p>
            <p className="mt-2 text-xs text-slate-400">
              Chọn POI để thêm vào Zone. Nhấn "Lưu thay đổi" để cập nhật.
            </p>

            {/* Search box */}
            <div className="mt-4">
              <input
                type="text"
                placeholder="Tìm kiếm POI theo mã hoặc tên..."
                value={poiSearchTerm}
                onChange={(e) => setPoiSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>

            {/* POI count indicator */}
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>Đã chọn: {selectedPoiIds.length} POI</span>
              {selectedPoiIds.length !== (managePoiZone.poiCodes || managePoiZone.pois || []).length && (
                <span className="text-amber-400">Có thay đổi chưa lưu</span>
              )}
            </div>

            {poisLoading ? (
              <p className="mt-4 text-sm text-slate-400">Đang tải danh sách POI...</p>
            ) : allPois.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">Không có POI nào trong hệ thống.</p>
            ) : (
              <div className="mt-4 max-h-[400px] space-y-2 overflow-y-auto">
                {allPois
                  .filter((poi) => poi.status === 'APPROVED')
                  .filter((poi) => {
                    if (!poiSearchTerm.trim()) return true;
                    const term = poiSearchTerm.toLowerCase();
                    const code = (poi.code || '').toLowerCase();
                    const name = (poi.name || poi.localizedContent?.vi?.name || '').toLowerCase();
                    return code.includes(term) || name.includes(term);
                  })
                  .map((poi) => {
                    // FIX: Check if POI code is selected
                    const isSelected = selectedPoiIds.includes(poi.code);
                    return (
                      <label
                        key={String(poi.id)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 hover:bg-slate-750"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handlePoiToggle(poi.id)}
                          disabled={savingPois}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-emerald-600 focus:ring-2 focus:ring-emerald-500"
                        />
                        <div className="flex-1">
                          <p className="font-mono text-sm font-medium text-white">{poi.code}</p>
                          <p className="text-xs text-slate-400">
                            {poi.name || poi.localizedContent?.vi?.name || '—'}
                          </p>
                        </div>
                        {statusBadge(poi.status)}
                      </label>
                    );
                  })}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelPoiChanges}
                disabled={savingPois}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={savePoiChanges}
                disabled={savingPois}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {savingPois ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {qrZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-white">QR Code cho Zone</h2>
            <p className="mt-1 text-sm text-emerald-300">{qrZone.name}</p>

            {loadingQr ? (
              <p className="mt-4 text-sm text-slate-400">Đang tạo QR token...</p>
            ) : qrData ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                  <p className="text-xs text-slate-400">Scan URL:</p>
                  <p className="mt-1 break-all font-mono text-xs text-white">{qrData.scanUrl}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                  <p className="text-xs text-slate-400">Hết hạn:</p>
                  <p className="mt-1 text-sm text-white">{new Date(qrData.expiresAt).toLocaleString('vi-VN')}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
                  <p className="text-xs text-slate-400">Token ID (JTI):</p>
                  <p className="mt-1 break-all font-mono text-xs text-white">{qrData.jti}</p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-red-400">Không thể tạo QR token</p>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={closeQrModal}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, required, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-400">{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-emerald-500/50"
      />
    </label>
  );
}
