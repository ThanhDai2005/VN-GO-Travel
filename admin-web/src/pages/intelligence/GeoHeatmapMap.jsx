import { useEffect, useMemo, useState, useRef } from 'react';
import { MapContainer, TileLayer, useMap, Marker, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

import { getDensityColor, getDensityLabel } from '../../utils/densityColorMapper';

// ⚙️ IMPLEMENTATION PART 3 — LEAFLET HEATMAP LAYER
function HeatmapLayer({ points, longitudeExtractor, latitudeExtractor, intensityExtractor }) {
  const map = useMap();
  const layerRef = useRef(null);

  useEffect(() => {
    const layer = L.heatLayer([], {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      minOpacity: 0.2,
      gradient: {
        0.0: '#FFFFFF',
        0.25: '#C8F7C5',
        0.5: '#7ED957',
        0.75: '#2ECC71',
        1.0: '#006400',
      },
    }).addTo(map);

    layerRef.current = layer;
    return () => map.removeLayer(layer);
  }, [map]);

  useEffect(() => {
    if (!layerRef.current || !Array.isArray(points)) return;
    const heatData = points.map(p => [
      latitudeExtractor(p),
      longitudeExtractor(p),
      intensityExtractor(p)
    ]);
    layerRef.current.setLatLngs(heatData);
  }, [points, latitudeExtractor, longitudeExtractor, intensityExtractor]);

  return null;
}

// FitBounds implementation
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [50, 50] });
  }, [points, map]);

  return null;
}

// ⚙️ IMPLEMENTATION PART 2 — CUSTOM PIN MARKER
const createPinIcon = (intensity) => {
  const color = getDensityColor(intensity);
  return L.divIcon({
    className: 'custom-pin',
    html: `
      <div style="position: relative; width: 30px; height: 30px;">
        <svg viewBox="0 0 384 512" style="width: 100%; height: 100%; fill: ${color}; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
          <path d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0zM192 272c44.183 0 80-35.817 80-80s-35.817-80-80-80-80 35.817-80 80 35.817 80 80 80z" fill-rule="evenodd" />
          <circle cx="192" cy="192" r="60" fill="white" />
        </svg>
      </div>
    `,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
  });
};

function PredictionMarkers({ points }) {
  const map = useMap();

  return (
    <>
      {points.map((p, idx) => (
        <Marker
          key={p.poi_id || idx}
          position={[p.lat, p.lng]}
          icon={createPinIcon(p.intensity)}
        >
          <Tooltip direction="top" offset={[0, -40]} opacity={1}>
            <div className="p-2 min-w-[140px]">
              <div className="font-bold text-slate-800 border-b pb-1 mb-2">{p.name || 'POI'}</div>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between bg-slate-50 p-1 rounded">
                  <span className="text-slate-500">Intensity:</span>
                  <span className="font-bold">{(p.intensity * 100).toFixed(0)}%</span>
                </div>
                <div className="mt-2 flex items-center justify-center gap-2 py-1 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-widest">
                   <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getDensityColor(p.intensity) }} />
                   <span style={{ color: getDensityColor(p.intensity) }}>{getDensityLabel(p.intensity)}</span>
                </div>
              </div>
            </div>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

function HeatmapLegend() {
  const items = [
    { label: 'Quiet', intensity: 0.0 },
    { label: 'Low', intensity: 0.3 },
    { label: 'Active', intensity: 0.6 },
    { label: 'Busy', intensity: 1.0 },
  ];

  return (
    <div className="absolute bottom-6 right-6 z-[1000] bg-white/90 backdrop-blur-md p-5 rounded-2xl shadow-xl border border-slate-200">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Density Legend</h4>
      <div className="flex flex-col gap-3">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className="h-4 w-4 rounded shadow-inner" style={{ backgroundColor: getDensityColor(item.intensity), border: '1px solid #eee' }} />
            <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GeoHeatmapMap({ 
  rows = [], 
  fallbackRows = [], 
  isOwner = false, 
  ownerPoiIds = [],
  onLiveUpdate = null,
  isLoading = false
}) {
  const activeRows = Array.isArray(rows) && rows.length > 0 ? rows : fallbackRows;

  // ⚙️ IMPLEMENTATION PART 6 — LIVE UPDATE
  useEffect(() => {
    if (onLiveUpdate) {
      const tid = setInterval(() => {
        onLiveUpdate();
      }, 30000);
      return () => clearInterval(tid);
    }
  }, [onLiveUpdate]);

  const points = useMemo(() => {
    // ⚙️ IMPLEMENTATION PART 4 — OWNER FILTER
    let filteredData = activeRows;
    if (isOwner && Array.isArray(ownerPoiIds) && ownerPoiIds.length > 0) {
      filteredData = filteredData.filter(p => ownerPoiIds.includes(p.poi_id));
    }

    if (filteredData.length === 0) return [];

    // ⚙️ IMPLEMENTATION PART 1 & 6 — NORMALIZATION AND OUTLIER PROTECTION
    // Step 1: Clamp and find max
    const counts = filteredData
      .map((x) => Number(x.total_unique_visitors || x.total_events || 0))
      .filter((v) => v >= 0)
      .sort((a, b) => a - b);

    if (counts.length === 0) return [];

    const min = counts[0];
    // ⚙️ OUTLIER PROTECTION: max out at 95th percentile (or max if small data) to avoid 1 POI = 9999 ruining map
    const maxThreshold = counts.length > 10 ? counts[Math.floor(counts.length * 0.95)] : counts[counts.length - 1];

    // ⚙️ LOGGING (DEMO MODE)
    console.log("[Heatmap] Processing points:", filteredData.length);
    console.log("[Heatmap] Max intensity threshold (p95 / clamped max):", maxThreshold);

    const mappedPoints = filteredData
      .map((r) => {
        const lat = Number(r.lat);
        const lng = Number(r.lng);
        let value = Number(r.total_unique_visitors || r.total_events || 0);

        // ⚙️ IMPLEMENTATION PART 5 — DATA SANITY CHECK
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || value < 0) {
            return null;
        }

        // Apply clamping
        value = Math.min(value, maxThreshold);

        // Step 2: Normalize (0 to 1)
        let normalized = 0;
        if (maxThreshold > min) {
          normalized = (value - min) / (maxThreshold - min);
        } else if (maxThreshold > 0) {
          normalized = 1.0; // All points are equal and > 0, so all are 'max'
        }

        return {
          ...r,
          lat,
          lng,
          intensity: normalized,
        };
      })
      .filter(Boolean);

    console.log("[Heatmap] Valid points rendered:", mappedPoints.length);
    return mappedPoints;
  }, [activeRows, isOwner, ownerPoiIds]);

  // ⚙️ IMPLEMENTATION PART 3 & 2 — LOADING & EMPTY STATE
  if (isLoading) {
    return (
      <div className="flex h-[480px] flex-col gap-3 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 font-medium">
        <svg className="h-8 w-8 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
          <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
        </svg>
        Đang tải dữ liệu... (Loading)
      </div>
    );
  }

  if (!points.length) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 font-medium">
        Không có dữ liệu lưu lượng / No traffic data available
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-200 transition-all hover:shadow-slate-300">
      <div className="overflow-hidden rounded-[2rem]">
        <MapContainer
        center={[10.7769, 106.7009]}
        zoom={12}
        scrollWheelZoom
        style={{ height: 480, width: '100%', zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <HeatmapLayer 
          points={points}
          longitudeExtractor={m => m.lng}
          latitudeExtractor={m => m.lat}
          intensityExtractor={m => m.intensity}
        />
        <PredictionMarkers points={points} />
        <FitBounds points={points} />
      </MapContainer>
      </div>
      <HeatmapLegend />
    </div>
  );
}
