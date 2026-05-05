import React, { useEffect, useState } from 'react';
import axios from 'axios';

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
      // Fallback mock data
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

  if (loading) return <div className="p-8 text-center text-slate-500">Đang tải Audio Stats...</div>;
  if (!data) return <div className="p-8 text-center text-slate-500">Lỗi tải dữ liệu.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Audio Analytics Dashboard (Lean)</h1>
      
      {/* KPI Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Tổng Lượt Nghe</h3>
          <p className="mt-2 text-4xl font-bold text-indigo-600">{data.totalPlays.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Tỷ Lệ Hoàn Thành</h3>
          <p className="mt-2 text-4xl font-bold text-emerald-600">{(data.completionRate * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top 5 POIs */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-semibold text-slate-900">Top 5 POIs</h3>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium">Mã POI</th>
                <th className="px-4 py-3 font-medium text-right">Lượt Nghe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.topPois.map((poi, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{poi.poiCode}</td>
                  <td className="px-4 py-3 text-right">{poi.plays.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top Zones */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <h3 className="font-semibold text-slate-900">Top Zones</h3>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="bg-white text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-medium">Mã Zone</th>
                <th className="px-4 py-3 font-medium text-right">Lượt Nghe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.topZones.map((zone, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{zone.zoneCode}</td>
                  <td className="px-4 py-3 text-right">{zone.plays.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
