import { useCallback, useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  fetchZones,
  createZone,
  updateZone,
  deleteZone,
  updateZonePois,
  fetchMasterPois,
  fetchZoneQrToken,
} from '../apiClient.js';
import TableScrollWrapper from '../components/TableScrollWrapper.jsx';

const Badge = ({ children, variant = "default" }) => {
    const styles = {
        default: "bg-slate-100 text-slate-700 border-slate-200",
        emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
        blue: "bg-blue-100 text-blue-800 border-blue-200",
        amber: "bg-amber-100 text-amber-800 border-amber-200"
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tight border ${styles[variant] || styles.default}`}>
            {children}
        </span>
    );
};

export default function ZonesManagementPage() {
  const [zones, setZones] = useState([]);
  const [allPois, setAllPois] = useState([]);
  const [loading, setLoading] = useState(true);
  const [poisLoading, setPoisLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyZoneId, setBusyZoneId] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editZone, setEditZone] = useState(null);
  const [deleteZoneTarget, setDeleteZoneTarget] = useState(null);
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
  }, [loadZones, loadPois]);

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
    if (!name) { setErr('Tên Zone là bắt buộc'); return; }
    if (Number.isNaN(price) || price < 0) { setErr('Giá phải là số hợp lệ >= 0'); return; }
    setErr('');
    setBusyZoneId('__create__');
    try {
      await createZone({ name, description: form.description.trim(), price });
      setCreateOpen(false);
      await loadZones();
    } catch (e) { setErr(e.message || 'Tạo Zone thất bại'); } finally { setBusyZoneId(null); }
  }

  async function submitEdit(e) {
    e.preventDefault();
    const zId = editZone?._id || editZone?.id;
    if (!zId) return;
    const name = form.name.trim();
    const price = Number(form.price);
    if (!name) { setErr('Tên Zone là bắt buộc'); return; }
    if (Number.isNaN(price) || price < 0) { setErr('Giá phải là số hợp lệ >= 0'); return; }
    setErr('');
    setBusyZoneId(zId);
    try {
      await updateZone(zId, { name, description: form.description.trim(), price });
      setEditZone(null);
      await loadZones();
    } catch (e) { setErr(e.message || 'Cập nhật Zone thất bại'); } finally { setBusyZoneId(null); }
  }

  async function confirmDelete() {
    const zId = deleteZoneTarget?._id || deleteZoneTarget?.id;
    if (!zId) return;
    setBusyZoneId(zId);
    setErr('');
    try {
      await deleteZone(zId);
      setDeleteZoneTarget(null);
      await loadZones();
    } catch (e) { setErr(e.message || 'Xóa Zone thất bại'); } finally { setBusyZoneId(null); }
  }

  function openManagePois(zone) {
    setManagePoiZone(zone);
    const codes = zone.poiCodes || zone.pois || [];
    setSelectedPoiIds(codes);
    setPoiSearchTerm('');
  }

  function handlePoiToggle(poiCode) {
    setSelectedPoiIds((prev) => prev.includes(poiCode) ? prev.filter((code) => code !== poiCode) : [...prev, poiCode]);
  }

  async function savePoiChanges() {
    const zId = managePoiZone?._id || managePoiZone?.id;
    if (!zId) return;
    setSavingPois(true);
    setErr('');
    try {
      await updateZonePois(zId, selectedPoiIds);
      const refreshedZones = await loadZones();
      const updatedZone = refreshedZones.find((z) => (z._id || z.id) === zId);
      if (updatedZone) {
        setManagePoiZone(updatedZone);
        setSelectedPoiIds(updatedZone.poiCodes || updatedZone.pois || []);
      }
      setErr('');
    } catch (e) { setErr(e.message || 'Cập nhật POI thất bại'); } finally { setSavingPois(false); }
  }

  async function openQrModal(zone) {
    const zId = zone?._id || zone?.id;
    setQrZone(zone);
    setQrData(null);
    setLoadingQr(true);
    setErr('');
    try {
      const json = await fetchZoneQrToken(zId);
      if (json?.success && json?.data) setQrData(json.data);
      else throw new Error('Không thể tạo QR token');
    } catch (e) { setErr(e.message || 'Không thể tạo QR token'); } finally { setLoadingQr(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Quản lý <span className="text-emerald-600">Zone</span></h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Tạo khu vực tham quan và gán danh sách các địa điểm POI.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadZones}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-all active:scale-95"
          >
            Làm mới
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-200 hover:bg-emerald-500 hover:-translate-y-0.5 transition-all active:scale-95"
          >
            + THÊM ZONE
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 font-bold">{err}</div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
            <div className="py-20 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-r-transparent"></div>
                <p className="mt-4 text-sm font-bold text-slate-400">Đang tải danh sách Zone...</p>
            </div>
        ) : zones.length === 0 ? (
            <div className="py-20 text-center">
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Không có Zone nào</p>
            </div>
        ) : (
          <TableScrollWrapper>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Tên Zone</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Mô tả</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Giá</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Số lượng POI</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {zones.map((zone) => {
                  const zId = zone._id || zone.id;
                  const busy = busyZoneId === zId;
                  const poiCount = Array.isArray(zone.poiCodes) ? zone.poiCodes.length : (Array.isArray(zone.pois) ? zone.pois.length : 0);
                  return (
                    <tr key={String(zId)} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-900">{zone.name}</td>
                      <td className="px-6 py-4">
                        <p className="max-w-[250px] truncate text-slate-500">{zone.description || '—'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="amber">{zone.price?.toLocaleString() || 0} Credits</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="blue">{poiCount} POIs</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openQrModal(zone)}
                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition-all disabled:opacity-50"
                          >
                            Generate QR
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openManagePois(zone)}
                            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 transition-all disabled:opacity-50"
                          >
                            Quản lý POI
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openEdit(zone)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-400 transition-all disabled:opacity-50"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setDeleteZoneTarget(zone)}
                            className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition-all disabled:opacity-50"
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
          </TableScrollWrapper>
        )}
      </div>

      {/* CREATE/EDIT MODAL */}
      {(createOpen || editZone) && (
        <Modal 
            title={createOpen ? "Thêm Zone mới" : "Sửa Zone"} 
            onClose={() => { setCreateOpen(false); setEditZone(null); }}
            onSubmit={createOpen ? submitCreate : submitEdit}
            busy={busyZoneId !== null}
        >
            <Field label="Tên Zone" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
            <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Mô tả chi tiết</span>
                <textarea
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Nhập mô tả về khu vực..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                    rows={3}
                />
            </label>
            <Field label="Giá niêm yết (Credits)" type="number" value={form.price} onChange={(v) => setForm((f) => ({ ...f, price: v }))} required />
        </Modal>
      )}

      {/* MANAGE POIS MODAL */}
      {managePoiZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black tracking-tight text-slate-900">Quản lý POI</h2>
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">{managePoiZone.name}</p>
                    </div>
                    <button onClick={() => setManagePoiZone(null)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="p-4 border-b border-slate-100">
                    <input
                        type="text"
                        placeholder="Tìm kiếm POI nhanh..."
                        value={poiSearchTerm}
                        onChange={(e) => setPoiSearchTerm(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                    />
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {allPois.filter(poi => {
                        const term = poiSearchTerm.toLowerCase();
                        return (poi.code || "").toLowerCase().includes(term) || (poi.name || poi.localizedContent?.vi?.name || "").toLowerCase().includes(term);
                    }).map(poi => (
                        <label key={poi.code} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${selectedPoiIds.includes(poi.code) ? 'bg-emerald-50 border-emerald-200 ring-2 ring-emerald-500/10' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                            <input
                                type="checkbox"
                                checked={selectedPoiIds.includes(poi.code)}
                                onChange={() => handlePoiToggle(poi.code)}
                                className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <div className="flex-1">
                                <p className="font-mono text-xs font-black text-slate-400 uppercase tracking-widest">{poi.code}</p>
                                <p className="text-sm font-bold text-slate-900">{poi.name || poi.localizedContent?.vi?.name || '—'}</p>
                            </div>
                            <Badge variant={poi.status === 'APPROVED' ? 'emerald' : 'default'}>{poi.status}</Badge>
                        </label>
                    ))}
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50/30 flex gap-3">
                    <button onClick={() => setManagePoiZone(null)} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-500 hover:bg-slate-50 transition-all">HỦY</button>
                    <button onClick={savePoiChanges} disabled={savingPois} className="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all disabled:opacity-50">
                        {savingPois ? "ĐANG LƯU..." : `LƯU THAY ĐỔI (${selectedPoiIds.length})`}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* QR MODAL */}
      {qrZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="p-6 text-center">
                    <div className="flex items-center justify-between mb-6">
                        <div className="text-left">
                            <h2 className="text-xl font-black text-white tracking-tight">QR Access</h2>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">{qrZone.name}</p>
                        </div>
                        <button onClick={() => setQrZone(null)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-800 transition-colors">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {loadingQr ? (
                        <div className="py-12 flex flex-col items-center">
                             <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-r-transparent"></div>
                             <p className="mt-4 text-xs font-black text-slate-500 tracking-widest uppercase">Generating Secure Token...</p>
                        </div>
                    ) : qrData ? (
                        <div className="space-y-6">
                            <div className="mx-auto flex h-60 w-60 items-center justify-center rounded-3xl bg-white p-4 shadow-2xl shadow-emerald-950/50">
                                <QRCodeCanvas value={qrData.scanUrl} size={220} level="H" />
                            </div>
                            <div className="space-y-2">
                                <div className="rounded-2xl bg-slate-950 border border-slate-800 p-3 text-left">
                                    <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest mb-1">Expiration</p>
                                    <p className="text-xs font-bold text-slate-300">{new Date(qrData.expiresAt).toLocaleString()}</p>
                                </div>
                                <div className="rounded-2xl bg-slate-950 border border-slate-800 p-3 text-left flex justify-between items-center">
                                    <div>
                                        <p className="text-[9px] font-black uppercase text-slate-600 tracking-widest mb-1">Security ID</p>
                                        <p className="text-xs font-mono font-bold text-emerald-500">{qrData.jti?.slice(-12).toUpperCase()}</p>
                                    </div>
                                    <Badge variant="blue">SECURE</Badge>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="py-12 text-red-400 text-sm font-bold">Lỗi tạo mã QR. Vui lòng thử lại.</div>
                    )}

                    <button onClick={() => setQrZone(null)} className="mt-8 w-full rounded-2xl bg-white py-4 text-sm font-black text-slate-900 shadow-xl hover:bg-slate-100 transition-all">ĐÓNG</button>
                </div>
            </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {deleteZoneTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-sm:max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-300 p-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
                     <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </div>
                <h2 className="text-xl font-black tracking-tight text-slate-900">Xóa Zone?</h2>
                <p className="mt-2 text-sm font-medium text-slate-500">
                    Hệ thống sẽ gỡ bỏ khu vực <span className="font-bold text-red-600 uppercase">{deleteZoneTarget.name}</span>. Hành động này không thể hoàn tác.
                </p>
                <div className="mt-6 flex gap-3">
                    <button onClick={() => setDeleteZoneTarget(null)} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-500 hover:bg-slate-50 transition-all">HỦY</button>
                    <button onClick={confirmDelete} disabled={busyZoneId !== null} className="flex-1 rounded-2xl bg-red-600 py-3 text-sm font-black text-white shadow-lg shadow-red-200 hover:bg-red-500 transition-all disabled:opacity-50">XÓA NGAY</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

// ── Shared UI Components ──
function Modal({ title, children, onClose, onSubmit, busy }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
                    <h2 className="text-xl font-black tracking-tight text-slate-900">{title}</h2>
                    <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 transition-colors">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <form onSubmit={onSubmit} className="p-6 space-y-4">
                    {children}
                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-500 hover:bg-slate-50 transition-all">HỦY</button>
                        <button type="submit" disabled={busy} className="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all disabled:opacity-50">XÁC NHẬN</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, required, type = 'text' }) {
    return (
        <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">{label}</span>
            <input
                type={type}
                required={required}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
            />
        </label>
    );
}
