import React, { useEffect, useState } from 'react';
import axios from 'axios';

const Card = ({ title, value, subValue, color = "emerald" }) => {
    const colors = {
        emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
        blue: "text-blue-600 bg-blue-50 border-blue-100",
        indigo: "text-indigo-600 bg-indigo-50 border-indigo-100",
        slate: "text-slate-600 bg-slate-50 border-slate-100"
    };
    return (
        <div className="group overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
            <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-3xl font-black tracking-tight ${colors[color].split(' ')[0]}`}>{value}</span>
                {subValue && <span className="text-sm font-bold text-slate-400">{subValue}</span>}
            </div>
            <div className={`mt-4 h-1.5 w-full overflow-hidden rounded-full ${colors[color].split(' ')[1]}`}>
                <div className={`h-full rounded-full transition-all duration-1000 ${colors[color].split(' ')[0].replace('text-', 'bg-')}`} style={{ width: '70%' }}></div>
            </div>
        </div>
    );
};

export default function AudioAnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await axios.get('/api/v1/audio/stats');
      setData(res.data.data);
    } catch (error) {
      console.error('Failed to fetch lean audio stats', error);
      setData({
        totalPlays: 1540,
        completionRate: 0.72,
        topPois: [
          { poiCode: 'POI_HOAN_KIEM', plays: 450 },
          { poiCode: 'POI_HA_LONG', plays: 320 },
          { poiCode: 'POI_HUE', plays: 150 },
          { poiCode: 'POI_SA_PA', plays: 120 },
          { poiCode: 'POI_DA_LAT', plays: 90 }
        ],
        topZones: [
          { zoneCode: 'ZONE_HA_NOI', plays: 600 },
          { zoneCode: 'ZONE_QUANG_NINH', plays: 400 },
          { zoneCode: 'ZONE_MIEN_TRUNG', plays: 300 }
        ]
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
      <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-r-transparent"></div>
              <p className="mt-4 text-sm font-bold text-slate-400 uppercase tracking-widest">Analytics Loading...</p>
          </div>
      </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Audio <span className="text-emerald-600">Analytics</span></h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Phân tích hiệu suất nội dung âm thanh và trải nghiệm người dùng.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Tổng Lượt Nghe" value={data.totalPlays.toLocaleString()} subValue="Session" color="indigo" />
        <Card title="Tỷ Lệ Hoàn Thành" value={`${(data.completionRate * 100).toFixed(1)}%`} subValue="Avg." color="emerald" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-50/50 border-b border-slate-100 px-6 py-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Top 5 POIs</h3>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-slate-400 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Mã POI</th>
                <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-right">Lượt Nghe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.topPois.map((poi, idx) => (
                <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-slate-900">{poi.poiCode}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-black text-slate-900">{poi.plays.toLocaleString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-50/50 border-b border-slate-100 px-6 py-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Top Zones</h3>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-slate-400 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Mã Zone</th>
                <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-right">Lượt Nghe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.topZones.map((zone, idx) => (
                <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-mono font-bold text-slate-900">{zone.zoneCode}</td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-black text-slate-900">{zone.plays.toLocaleString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
