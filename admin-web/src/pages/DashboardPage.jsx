import { useCallback, useEffect, useState } from "react";
import { approvePoi, fetchPendingPois, rejectPoi } from "../apiClient.js";
import TableScrollWrapper from "../components/TableScrollWrapper.jsx";

const Modal = ({ title, children, onClose, onSubmit, busy }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                <h2 className="text-xl font-black tracking-tight text-white">{title}</h2>
                <button onClick={onClose} className="rounded-full p-1 text-slate-500 hover:bg-slate-800 transition-colors">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
            <form onSubmit={onSubmit} className="p-6 space-y-4">
                {children}
                <div className="flex gap-3 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 rounded-2xl border border-slate-700 bg-transparent py-3 text-sm font-black text-slate-400 hover:bg-slate-800 transition-all"
                    >
                        HỦY
                    </button>
                    <button
                        type="submit"
                        disabled={busy}
                        className="flex-1 rounded-2xl bg-red-600 py-3 text-sm font-black text-white shadow-lg shadow-red-900/20 hover:bg-red-500 transition-all disabled:opacity-50"
                    >
                        {busy ? "ĐANG XỬ LÝ..." : "XÁC NHẬN"}
                    </button>
                </div>
            </form>
        </div>
    </div>
);

function contentPreview(content) {
  if (!content || typeof content !== "object") return "—";
  return content.vi || content.en || "—";
}

export default function DashboardPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rejectFor, setRejectFor] = useState(null);
  const [actionId, setActionId] = useState(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await fetchPendingPois();
      const list = Array.isArray(res?.data) ? res.data : [];
      setRows(list);
    } catch (e) {
      setErr(e.message || "Không thể tải danh sách POI chờ duyệt");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onApprove(id) {
    setActionId(id);
    setErr("");
    try {
      await approvePoi(id);
      await load();
    } catch (e) {
      setErr(e.message || "Duyệt thất bại");
    } finally {
      setActionId(null);
    }
  }

  async function onRejectSubmit(e) {
    e.preventDefault();
    if (!rejectFor || !reason.trim()) return;
    setActionId(rejectFor.id);
    setErr("");
    try {
      await rejectPoi(rejectFor.id, reason.trim());
      setRejectFor(null);
      setReason("");
      await load();
    } catch (e) {
      setErr(e.message || "Từ chối thất bại");
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Địa Điểm Chờ Duyệt</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Kiểm duyệt các địa điểm mới do Owner gửi lên hệ thống.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-all active:scale-95"
        >
          Làm mới
        </button>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 font-bold">
          {err}
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
            <div className="py-20 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-r-transparent"></div>
                <p className="mt-4 text-sm font-bold text-slate-400">Đang tải danh sách...</p>
            </div>
        ) : rows.length === 0 ? (
            <div className="py-20 text-center">
                <div className="mx-auto h-16 w-16 text-slate-200">
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <p className="mt-4 text-sm font-bold text-slate-400 uppercase tracking-widest">Không có địa điểm chờ duyệt</p>
            </div>
        ) : (
            <TableScrollWrapper>
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-400">
                  <tr>
                    <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Mã POI</th>
                    <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Tên địa điểm</th>
                    <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Tọa độ</th>
                    <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Người gửi</th>
                    <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-right">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => {
                    const id = String(row.id || row._id || "");
                    const busy = actionId === id;
                    const loc = row.location;
                    const lat = loc != null ? Number(loc.lat) : NaN;
                    const lng = loc != null ? Number(loc.lng) : NaN;
                    const locStr = loc && !Number.isNaN(lat) && !Number.isNaN(lng) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : "—";
                    
                    return (
                      <tr key={id} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-bold text-slate-900">{row.code}</td>
                        <td className="px-6 py-4">
                            <p className="max-w-xs truncate font-bold text-slate-900">{contentPreview(row.content)}</p>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-500">{locStr}</td>
                        <td className="px-6 py-4">
                            <span className="text-xs font-bold text-slate-400">
                                {row.submittedBy?.email || row.submittedBy || "—"}
                            </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onApprove(id)}
                              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-lg shadow-emerald-100 hover:bg-emerald-500 transition-all disabled:opacity-50"
                            >
                              DUYỆT
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setRejectFor({ id, code: row.code });
                                setReason("");
                              }}
                              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800 transition-all disabled:opacity-50"
                            >
                              TỪ CHỐI
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

      {rejectFor && (
        <Modal 
            title="Từ chối địa điểm" 
            onClose={() => setRejectFor(null)} 
            onSubmit={onRejectSubmit}
            busy={actionId === rejectFor.id}
        >
            <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-1">Mã địa điểm</p>
                <p className="font-mono text-sm text-white">{rejectFor.code}</p>
            </div>
            <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">Lý do từ chối</span>
                <textarea
                    required
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Nhập lý do chi tiết..."
                    className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                />
            </label>
        </Modal>
      )}
    </div>
  );
}
