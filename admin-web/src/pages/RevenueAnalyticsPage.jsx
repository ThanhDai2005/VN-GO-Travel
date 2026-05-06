import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { fetchRevenueAnalytics } from '../apiClient';

function defaultRange() {
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 30); // Default to 30 days for revenue
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

function toIso(d) {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { 
      day: '2-digit', 
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return dateStr;
  }
}

export default function RevenueAnalyticsPage() {
  const [{ start, end }, setRange] = useState(() => defaultRange());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Local filters for table
  const [tableSearch, setTableSearch] = useState('');
  const [tableZoneFilter, setTableZoneFilter] = useState('ALL');

  const startIso = useMemo(() => toIso(start), [start]);
  const endIso = useMemo(() => toIso(end), [end]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchRevenueAnalytics(startIso, endIso);
      setData(res);
    } catch (err) {
      console.error('Failed to fetch revenue analytics:', err);
      setError(err.message || 'Không thể tải dữ liệu doanh thu');
    } finally {
      setLoading(false);
    }
  }, [startIso, endIso]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    return data.transactions.filter(t => {
      const matchesSearch = 
        t.userName.toLowerCase().includes(tableSearch.toLowerCase()) ||
        t.userEmail.toLowerCase().includes(tableSearch.toLowerCase());
      const matchesZone = tableZoneFilter === 'ALL' || t.zoneCode === tableZoneFilter;
      return matchesSearch && matchesZone;
    });
  }, [data, tableSearch, tableZoneFilter]);

  const uniqueZones = useMemo(() => {
    if (!data?.transactions) return [];
    const zones = new Set(data.transactions.map(t => t.zoneCode));
    return Array.from(zones).sort();
  }, [data]);

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
          <h2 className="font-bold">Lỗi tải dữ liệu</h2>
          <p>{error}</p>
          <button 
            onClick={loadData}
            className="mt-2 rounded bg-red-600 px-4 py-1 text-white hover:bg-red-700"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-1 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Thống kê <span className="text-indigo-600">Doanh thu</span></h1>
          <p className="text-sm font-medium text-slate-500">Phân tích hiệu quả kinh doanh và lịch sử giao dịch Zone Pass.</p>
        </div>
        
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="flex items-center gap-2 px-2">
             <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Thời gian:</span>
             <input
                type="date"
                className="bg-transparent text-xs font-bold text-slate-700 outline-none"
                value={startIso.split('T')[0]}
                onChange={(e) => setRange(r => ({ ...r, start: new Date(e.target.value) }))}
              />
              <span className="text-slate-300">→</span>
              <input
                type="date"
                className="bg-transparent text-xs font-bold text-slate-700 outline-none"
                value={endIso.split('T')[0]}
                onChange={(e) => setRange(r => ({ ...r, end: new Date(e.target.value) }))}
              />
          </div>
          <button 
            onClick={loadData}
            disabled={loading}
            className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? '...' : 'CẬP NHẬT'}
          </button>
        </div>
      </div>

      {/* 🧱 TASK 3 — CORE METRICS */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Tổng doanh thu', value: `$${data?.summary?.totalRevenue?.toLocaleString() || 0}`, icon: '💰', color: 'indigo' },
          { label: 'Tổng lượt mua', value: data?.summary?.totalPurchases || 0, icon: '🎫', color: 'emerald' },
          { label: 'Zones đã bán', value: data?.summary?.uniqueZonesSold || 0, icon: '🗺️', color: 'amber' },
          { label: 'Bán chạy nhất', value: data?.summary?.bestSeller || 'N/A', icon: '🏆', color: 'rose' },
        ].map((stat, i) => (
          <div key={i} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md">
            <div className={`absolute -right-4 -top-4 text-6xl opacity-5 transition-transform group-hover:scale-125`}>{stat.icon}</div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-black text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* 🧱 TASK 5 — CHART 1: Top Zones */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-slate-600">Top Zones Bán Chạy Nhất</h3>
          <div className="h-[300px] w-full">
            {data?.topZones?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topZones} layout="vertical" margin={{ left: 40, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={100} 
                    axisLine={false} 
                    tickLine={false}
                    style={{ fontSize: '10px', fontWeight: 700, fill: '#64748b' }}
                  />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20}>
                    {data.topZones.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#4f46e5' : '#818cf8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">Chưa có dữ liệu</div>
            )}
          </div>
        </div>

        {/* 🧱 TASK 6 — CHART 2: Timeline */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-sm font-bold uppercase tracking-widest text-slate-600">Biến động Doanh thu & Lượt Mua</h3>
          <div className="h-[300px] w-full">
            {data?.timeline?.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.timeline}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false}
                    style={{ fontSize: '10px', fontWeight: 600, fill: '#94a3b8' }}
                  />
                  <YAxis 
                    yAxisId="left"
                    axisLine={false} 
                    tickLine={false}
                    style={{ fontSize: '10px', fontWeight: 600, fill: '#94a3b8' }}
                  />
                   <YAxis 
                    yAxisId="right"
                    orientation="right"
                    axisLine={false} 
                    tickLine={false}
                    style={{ fontSize: '10px', fontWeight: 600, fill: '#94a3b8' }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" />
                  <Line yAxisId="left" type="monotone" dataKey="revenue" name="Doanh thu ($)" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1' }} activeDot={{ r: 6 }} />
                  <Line yAxisId="right" type="monotone" dataKey="count" name="Lượt mua" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400">Chưa có dữ liệu</div>
            )}
          </div>
        </div>
      </div>

      {/* 🧱 TASK 7 — TRANSACTION LOG TABLE */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between border-b border-slate-100 bg-slate-50/50 p-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-700">Log Giao Dịch</h3>
          
          <div className="flex items-center gap-4">
            <input 
              type="text"
              placeholder="Tìm user..."
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              value={tableSearch}
              onChange={(e) => setTableSearch(e.target.value)}
            />
            <select 
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500"
              value={tableZoneFilter}
              onChange={(e) => setTableZoneFilter(e.target.value)}
            >
              <option value="ALL">Tất cả Zone</option>
              {uniqueZones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-4">Thời gian</th>
                <th className="px-6 py-4">Khách hàng</th>
                <th className="px-6 py-4">Zone</th>
                <th className="px-6 py-4">Số tiền</th>
                <th className="px-6 py-4">Nguồn</th>
                <th className="px-6 py-4">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="px-6 py-4 font-medium text-slate-500">{formatDate(t.purchasedAt)}</td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{t.userName}</div>
                      <div className="text-[10px] text-slate-400">{t.userEmail}</div>
                    </td>
                    <td className="px-6 py-4 font-black text-indigo-600">{t.zoneCode}</td>
                    <td className="px-6 py-4 font-black text-slate-900">${t.amount}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        t.source === 'QR' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {t.source}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {t.serverVerified ? (
                        <span className="flex items-center gap-1 font-bold text-emerald-600">
                          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                          Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-bold text-amber-500">
                          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-400">Không tìm thấy giao dịch nào</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
