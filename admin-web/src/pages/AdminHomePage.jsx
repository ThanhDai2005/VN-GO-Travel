import { useCallback, useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { fetchPendingPois, fetchSystemOverview } from '../apiClient.js';

const Card = ({ children, className = "" }) => (
    <div className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 ${className}`}>
        {children}
    </div>
);

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
    refreshTimer.current = setInterval(() => {
      load(false);
    }, 30000);

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [load]);

  const stats = [
    { 
      label: 'ONLINE', 
      value: systemData?.onlineUsers ?? 0, 
      desc: 'Thiết bị đang hoạt động', 
      icon: (
        <div className="h-10 w-10 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
        </div>
      ),
      pulse: true
    },
    { 
      label: 'NGƯỜI DÙNG', 
      value: systemData?.totalUsers ?? 0, 
      desc: 'Tổng tài khoản đăng ký', 
      icon: (
        <div className="h-10 w-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        </div>
      )
    },
    { 
      label: 'ZONE PASS', 
      value: systemData?.totalZonePurchasers ?? 0, 
      desc: 'Người dùng đã mua zone', 
      icon: (
        <div className="h-10 w-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-10">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Bảng điều khiển</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Chào mừng trở lại! Dưới đây là tình trạng hệ thống hiện tại.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">
            <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            AUTO-REFRESH: 30s
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 font-medium">
          {err}
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {stats.map((stat, i) => (
          <Card key={i} className="relative overflow-hidden group hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{stat.label}</p>
                    <p className="text-4xl font-black text-slate-900 tracking-tight">
                        {loading ? '...' : stat.value.toLocaleString()}
                    </p>
                </div>
                {stat.icon}
            </div>
            <p className="mt-4 text-xs font-bold text-slate-500 flex items-center gap-1.5">
                {stat.desc}
            </p>
            {stat.pulse && stat.value > 0 && (
                <div className="absolute top-0 right-0 h-1 w-full bg-indigo-500/10">
                    <div className="h-full bg-indigo-500 animate-[shimmer_2s_infinite]" style={{ width: '30%' }}></div>
                </div>
            )}
          </Card>
        ))}
      </div>

      {/* Quick Actions / Important Areas */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Pending Card */}
        <Link to="/pending" className="group">
            <Card className="h-full border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-100">
                <div className="flex items-center justify-between mb-4">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-200 group-hover:scale-110 transition-transform">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    </div>
                    <span className="text-3xl font-black text-emerald-600 tracking-tighter">
                        {pendingCount === null ? '—' : pendingCount}
                    </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Duyệt địa điểm</h3>
                <p className="mt-1 text-xs font-bold text-slate-500 uppercase tracking-wide">Yêu cầu mới từ Owner</p>
                <div className="mt-4 flex items-center text-xs font-black text-emerald-600 group-hover:gap-2 transition-all">
                    <span>XỬ LÝ NGAY</span>
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                </div>
            </Card>
        </Link>

        {/* POI Management Card */}
        <Link to="/pois" className="group">
            <Card className="h-full hover:border-slate-300 hover:shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg shadow-slate-200 group-hover:scale-110 transition-transform">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                </div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Quản lý POI</h3>
                <p className="mt-1 text-xs font-bold text-slate-500 uppercase tracking-wide">Nội dung & Bản đồ</p>
                <p className="mt-3 text-xs text-slate-500 line-clamp-2">Điều chỉnh thông tin địa danh, tọa độ và quản lý mã QR bảo mật.</p>
            </Card>
        </Link>

        {/* User Card */}
        <Link to="/users" className="group">
            <Card className="h-full hover:border-slate-300 hover:shadow-lg">
                <div className="flex items-center justify-between mb-4">
                    <div className="h-12 w-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-100 group-hover:scale-110 transition-transform">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    </div>
                </div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">Người dùng</h3>
                <p className="mt-1 text-xs font-bold text-slate-500 uppercase tracking-wide">Premium & Phân quyền</p>
                <p className="mt-3 text-xs text-slate-500 line-clamp-2">Quản lý đặc quyền tài khoản, mở khóa zone pass và lịch sử quét.</p>
            </Card>
        </Link>
      </div>
    </div>
  );
}
