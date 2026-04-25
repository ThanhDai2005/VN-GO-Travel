import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPendingPois } from '../apiClient.js';

export default function AdminHomePage() {
  const [pendingCount, setPendingCount] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try {
      const res = await fetchPendingPois();
      const list = Array.isArray(res?.data) ? res.data : [];
      setPendingCount(list.length);
    } catch (e) {
      setErr(e.message || 'Không thể tải dữ liệu tổng quan');
      setPendingCount(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Bảng điều khiển</h1>
      <p className="mt-1 text-sm text-slate-600">Tổng quan nhanh các khu vực quản trị VNGo.</p>

      {err && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/pending"
          className="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm transition hover:border-emerald-300 hover:shadow"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Chờ duyệt</p>
          <p className="mt-2 text-3xl font-semibold text-emerald-600">
            {pendingCount === null ? '—' : pendingCount}
          </p>
          <p className="mt-2 text-sm text-slate-600">Xem và xử lý POI do Owner gửi</p>
        </Link>
        <Link
          to="/pois"
          className="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm transition hover:border-emerald-300 hover:shadow"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Danh sách POI</p>
          <p className="mt-2 text-sm font-medium text-slate-900">Quản lý địa điểm</p>
          <p className="mt-2 text-sm text-slate-600">Tạo, sửa, xóa, và xem QR bảo mật</p>
        </Link>
        <Link
          to="/users"
          className="rounded-xl border border-slate-200 bg-slate-50 p-5 shadow-sm transition hover:border-emerald-300 hover:shadow"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tài khoản</p>
          <p className="mt-2 text-sm font-medium text-slate-900">Quản lý premium</p>
          <p className="mt-2 text-sm text-slate-600">Phân vai trò và khóa/mở khóa tài khoản</p>
        </Link>
      </div>
    </div>
  );
}
