import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

function HeatLayer({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!Array.isArray(points) || points.length === 0) return undefined;

    const layer = L.heatLayer(points, {
      radius: 24,
      blur: 18,
      maxZoom: 17,
      minOpacity: 0.4,
      gradient: {
        0.2: '#3b82f6',
        0.4: '#22d3ee',
        0.6: '#a3e635',
        0.8: '#facc15',
        1.0: '#ef4444',
      },
    }).addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);

  return null;
}

function FitBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    if (!Array.isArray(points) || points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p[0], p[1]]));
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 15 });
    }
  }, [map, points]);

  return null;
}

export default function GeoHeatmapMap({ rows = [], fallbackRows = [] }) {
  const activeRows = Array.isArray(rows) && rows.length > 0 ? rows : fallbackRows;

  const points = useMemo(() => {
    const maxEvents = Math.max(1, ...activeRows.map((r) => Number(r.total_events) || 0));
    return activeRows
      .map((r) => {
        const lat = Number(r.lat);
        const lng = Number(r.lng);
        const weight = (Number(r.total_events) || 0) / maxEvents;
        if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
        return [lat, lng, Math.max(0.1, Math.min(1, weight))];
      })
      .filter(Boolean);
  }, [activeRows]);

  if (!activeRows.length) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
        Không có dữ liệu vị trí POI trong khoảng thời gian đã chọn
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      <MapContainer
        center={[10.7769, 106.7009]}
        zoom={12}
        scrollWheelZoom
        style={{ height: 360, width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <HeatLayer points={points} />
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
