import { useCallback, useEffect, useState } from "react";
import { approvePoi, fetchPendingPois, rejectPoi } from "../apiClient.js";

function contentPreview(content) {
  if (!content || typeof content !== "object") return "—";
  return content.vi || content.en || "—";
}

function RejectModal({ open, onClose, onConfirm, poiCode }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    const r = reason.trim();
    if (!r) return;
    setBusy(true);
    try {
      await onConfirm(r);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">Từ chối địa điểm</h2>
        <p className="mt-1 text-sm text-slate-400">
          {poiCode ? `Mã: ${poiCode}. ` : ""}
          Vui lòng nhập lý do từ chối.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <textarea
            required
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do từ chối..."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-slate-500/50"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={busy || !reason.trim()}
              className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:opacity-50"
            >
              {busy ? "..." : "Xác nhận từ chối"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rejectFor, setRejectFor] = useState(null);
  const [actionId, setActionId] = useState(null);

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

  async function onRejectConfirm(reason) {
    if (!rejectFor) return;
    setActionId(rejectFor.id);
    setErr("");
    try {
      await rejectPoi(rejectFor.id, reason);
      await load();
    } catch (e) {
      setErr(e.message || "Từ chối thất bại");
    } finally {
      setActionId(null);
      setRejectFor(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Địa Điểm Chờ Duyệt</h1>
          <p className="text-sm text-slate-600">
            Trạng thái PENDING — duyệt hoặc từ chối (cần lý do từ chối).
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
        >
          Làm mới
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          {err}
        </div>
      )}

      {loading ? (
        <p className="text-slate-600">Đang tải...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-slate-600">
          Không có địa điểm chờ duyệt.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Mã</th>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Tên</th>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Tọa độ</th>
                <th className="bg-gray-800 px-4 py-3 text-left font-bold text-white">Người gửi</th>
                <th className="bg-gray-800 px-4 py-3 text-right font-bold text-white">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const id = String(row.id || row._id || "");
                const busy = actionId === id;
                const loc = row.location;
                const lat = loc != null ? Number(loc.lat) : NaN;
                const lng = loc != null ? Number(loc.lng) : NaN;
                const locStr =
                  loc && !Number.isNaN(lat) && !Number.isNaN(lng)
                    ? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                    : "—";
                return (
                  <tr key={id} className="odd:bg-gray-50 even:bg-white">
                    <td className="border-b border-gray-200 px-4 py-3 font-mono text-gray-900">
                      {row.code}
                    </td>
                    <td className="max-w-xs truncate border-b border-gray-200 px-4 py-3 text-gray-900">
                      {contentPreview(row.content)}
                    </td>
                    <td className="border-b border-gray-200 px-4 py-3 text-gray-900">{locStr}</td>
                    <td className="border-b border-gray-200 px-4 py-3 text-gray-900">
                      {row.submittedBy && typeof row.submittedBy === "object" && row.submittedBy.email
                        ? row.submittedBy.email
                        : typeof row.submittedBy === "string"
                          ? row.submittedBy
                          : "—"}
                    </td>
                    <td className="border-b border-gray-200 px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onApprove(id)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          Duyệt
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setRejectFor({ id, code: row.code })}
                          className="rounded-lg bg-slate-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-500 disabled:opacity-50"
                        >
                          Từ chối
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

      <RejectModal
        open={Boolean(rejectFor)}
        poiCode={rejectFor?.code}
        onClose={() => setRejectFor(null)}
        onConfirm={onRejectConfirm}
      />
    </div>
  );
}
