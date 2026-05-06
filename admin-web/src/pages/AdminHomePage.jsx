import { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fetchPendingPois, fetchSystemOverview } from '../apiClient.js';

export default function AdminHomePage() {
  const [pendingCount, setPendingCount] = useState(null);
  const [systemData, setSystemData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  
  const refreshTimer = useRef(null);

  const load = useCallback(async (isInitial = true) => {
    if (isInitial) setErr('');
    try {
      const [pending, system] = await Promise.all([
        fetchPendingPois(),
        fetchSystemOverview()
      ]);
      
      const list = Array.isArray(pending?.data) ? pending.data : [];
      setPendingCount(list.length);
      setSystemData(system);
    } catch (e) {
      if (isInitial) setErr(e.message || 'Không thể tải dữ liệu tổng quan');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    
    // Auto-refresh online status every 5 seconds
    refreshTimer.current = setInterval(() => {
      load(false);
    }, 5000);

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [load]);

  const stats = [
    { 
      label: 'NGƯỜI DÙNG ONLINE', 
      value: systemData?.onlineUsers ?? '—', 
      desc: 'Thiết bị đang hoạt động', 
      color: 'text-indigo-600', 
      bg: 'bg-indigo-50', 
      border: 'hover:border-indigo-300',
      isPulse: (systemData?.onlineUsers > 0)
    },
    { 
      label: 'TỔNG NGƯỜI DÙNG', 
      value: systemData?.totalUsers ?? '—', 
      desc: 'Tài khoản đã đăng ký', 
      color: 'text-slate-900', 
      bg: 'bg-slate-50', 
      border: 'hover:border-slate-300' 
    },
    { 
      label: 'TÀI KHOẢN PREMIUM', 
      value: systemData?.totalPremiumUsers ?? '—', 
      desc: 'Người dùng trả phí', 
      color: 'text-amber-600', 
      bg: 'bg-amber-50', 
      border: 'hover:border-amber-300' 
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Bảng <span className="text-emerald-600">điều khiển</span></h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Tổng quan nhanh các khu vực quản trị và chỉ số hệ thống VNGo.</p>
      </div>

      {err && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 animate-in fade-in slide-in-from-top-2">{err}</div>
      )}

      {/* 🚀 NEW: SYSTEM OVERVIEW STATS */}
      <div className="grid gap-6 md:grid-cols-3">
        {stats.map((stat, i) => (
          <div 
            key={i} 
            className={`group relative overflow-hidden rounded-2xl border border-slate-200 ${stat.bg} p-6 shadow-sm transition-all hover:-translate-y-1 ${stat.border} hover:shadow-md`}
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{stat.label}</p>
              {stat.isPulse && (
                <span className="flex h-2 w-2">
                  <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500"></span>
                </span>
              )}
            </div>
            <p className={`mt-3 text-4xl font-black ${stat.color}`}>
              {stat.value.toLocaleString()}
            </p>
            <p className="mt-2 text-xs font-medium text-slate-500">{stat.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/pending"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
             <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">CHỜ DUYỆT</p>
             <div className="rounded-full bg-emerald-100 p-1.5 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
             </div>
          </div>
          <p className="mt-3 text-4xl font-black text-emerald-600">
            {pendingCount === null ? '—' : pendingCount}
          </p>
          <p className="mt-2 text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">Duyệt POI mới</p>
          <p className="mt-1 text-xs text-slate-500">Xem và xử lý địa điểm do Owner gửi lên hệ thống.</p>
        </Link>

        <Link
          to="/pois"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
             <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">QUẢN LÝ POI</p>
             <div className="rounded-full bg-indigo-100 p-1.5 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
             </div>
          </div>
          <p className="mt-3 text-sm font-black text-slate-900 group-hover:text-indigo-700 transition-colors uppercase tracking-tight">Danh sách địa điểm</p>
          <p className="mt-2 text-xs text-slate-500">Quản lý nội dung, vị trí và QR Code bảo mật cho từng điểm đến.</p>
        </Link>

        <Link
          to="/users"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-amber-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
             <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">NGƯỜI DÙNG</p>
             <div className="rounded-full bg-amber-100 p-1.5 text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
             </div>
          </div>
          <p className="mt-3 text-sm font-black text-slate-900 group-hover:text-amber-700 transition-colors uppercase tracking-tight">Phân quyền & Premium</p>
          <p className="mt-2 text-xs text-slate-500">Quản lý vai trò (Admin/Owner), cấp quyền Premium và khóa tài khoản.</p>
        </Link>
      </div>
    </div>
  );
}
