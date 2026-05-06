import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAdminDevices } from '../apiClient.js';

function fmtDate(v) {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

export default function DeviceManagementPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({ onlineCount: 0, totalCount: 0, devices: [] });

  const loadData = useCallback(async () => {
    try {
      setError('');
      const res = await fetchAdminDevices();
      const payload = res?.data || {};
      setData({
        onlineCount: Number(payload.onlineCount || 0),
        totalCount: Number(payload.totalCount || 0),
        devices: Array.isArray(payload.devices) ? payload.devices : [],
      });
    } catch (e) {
      setError(e?.message || 'Không tải được dữ liệu thiết bị.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const id = setInterval(loadData, 10000);
    return () => clearInterval(id);
  }, [loadData]);

  const onlinePercent = useMemo(() => {
    if (!data.totalCount) return 0;
    return Math.round((data.onlineCount / data.totalCount) * 100);
  }, [data.onlineCount, data.totalCount]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Quản lý thiết bị</h1>
        <p className="mt-1 text-sm text-slate-600">
          Theo dõi thiết bị đang online, IP, thông tin máy và trạng thái phiên theo thời gian thực.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs uppercase text-emerald-700">Đang online</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-900">{data.onlineCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Tổng thiết bị</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.totalCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase text-slate-500">Tỷ lệ online</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{onlinePercent}%</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">Danh sách thiết bị</h2>
          <button
            type="button"
            onClick={loadData}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Làm mới
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Đang tải...</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">{error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Thiết bị</th>
                  <th className="px-4 py-3">Nền tảng</th>
                  <th className="px-4 py-3">IP</th>
                  <th className="px-4 py-3">Tài khoản</th>
                  <th className="px-4 py-3">Lần cuối online</th>
                  <th className="px-4 py-3">Bắt đầu phiên</th>
                </tr>
              </thead>
              <tbody>
                {data.devices.map((row) => (
                  <tr key={row.id || row.deviceId} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}
                      >
                        {row.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      <div className="font-medium">{row.deviceName || row.model || '-'}</div>
                      <div className="text-xs text-slate-500">
                        ID: {row.deviceId || '-'}{row.manufacturer ? ` • ${row.manufacturer}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.platform || '-'} {row.osVersion ? `(${row.osVersion})` : ''}
                      {row.appVersion ? <div className="text-xs text-slate-500">App {row.appVersion}</div> : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.ipAddress || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{row.email || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{fmtDate(row.lastSeenAt)}</td>
                    <td className="px-4 py-3 text-slate-700">{fmtDate(row.sessionStartedAt)}</td>
                  </tr>
                ))}
                {data.devices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                      Chưa có dữ liệu thiết bị.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
