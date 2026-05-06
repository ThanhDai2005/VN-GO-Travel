import { useCallback, useEffect, useState } from 'react';
import { fetchAudits } from '../apiClient.js';
import TableScrollWrapper from '../components/TableScrollWrapper.jsx';

const Badge = ({ children, variant = "default" }) => {
    const styles = {
        default: "bg-slate-100 text-slate-700 border-slate-200",
        emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
        red: "bg-red-100 text-red-800 border-red-200",
        blue: "bg-blue-100 text-blue-800 border-blue-200"
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tight border ${styles[variant] || styles.default}`}>
            {children}
        </span>
    );
};

export default function AuditsPage() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async (p) => {
    setErr('');
    setLoading(true);
    try {
      const res = await fetchAudits(p, 20);
      setItems(Array.isArray(res?.data) ? res.data : []);
      setPagination(res?.pagination || null);
    } catch (e) {
      setErr(e.message || 'Không thể tải nhật ký kiểm duyệt');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [page, load]);

  const totalPages = pagination?.totalPages ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Audit <span className="text-emerald-600">Logs</span></h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Lịch sử phê duyệt và các hoạt động thay đổi trạng thái địa điểm.</p>
        </div>
        <button
          onClick={() => load(page)}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-all active:scale-95"
        >
          Làm mới
        </button>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 font-bold">{err}</div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
            <div className="py-20 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-r-transparent"></div>
                <p className="mt-4 text-sm font-bold text-slate-400">Đang tải nhật ký...</p>
            </div>
        ) : items.length === 0 ? (
            <div className="py-20 text-center">
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Chưa có bản ghi nhật ký</p>
            </div>
        ) : (
          <TableScrollWrapper>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Thời gian</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Quản trị viên</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Hành động</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">POI</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Trạng thái</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Lý do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => (
                  <tr key={String(row.id)} className="group hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-slate-900 font-medium">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString('vi-VN') : '—'}
                    </td>
                    <td className="px-6 py-4">
                        <span className="text-xs font-bold text-slate-400">{row.admin?.email || '—'}</span>
                    </td>
                    <td className="px-6 py-4">
                        <Badge variant={row.action === 'APPROVE' ? 'emerald' : row.action === 'REJECT' ? 'red' : 'default'}>
                            {row.action}
                        </Badge>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">
                      {row.poi?.code || '—'}
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 font-bold text-slate-500">
                            <span className="text-[10px]">{row.previousStatus}</span>
                            <svg className="h-3 w-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                            <span className="text-[10px] text-slate-900">{row.newStatus}</span>
                        </div>
                    </td>
                    <td className="px-6 py-4 max-w-xs">
                      <p className="truncate text-slate-500 italic" title={row.reason || ''}>
                        {row.reason || '—'}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScrollWrapper>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Trang <span className="text-slate-900">{page}</span> / {totalPages}</p>
            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 transition-all disabled:opacity-30"
                >
                    TRƯỚC
                </button>
                <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 transition-all disabled:opacity-30"
                >
                    TIẾP THEO
                </button>
            </div>
        </div>
      )}
    </div>
  );
}
