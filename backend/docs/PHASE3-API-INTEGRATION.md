# Phase 3 API Integration Guide

**Date:** 2026-04-23  
**Status:** Ready for Integration  
**Target:** Mobile App (MAUI) & Admin Web

---

## 🎯 Overview

Phase 3 adds analytics capabilities to the VN-GO Travel platform:
- Identity tracking for funnel analysis
- Audio playback analytics
- POI visit session tracking
- Grid-based heatmap visualization
- Owner analytics dashboard

---

## 📱 Mobile App Integration

### 1. Visit Session Tracking (Geofence Events)

**When to Send:**
- User enters POI geofence radius → send `enter` event
- User exits POI geofence radius → send `exit` event

**Implementation:**

```csharp
// On Geofence Enter
public async Task OnPoiEnter(string poiId, string poiCode)
{
    var sessionId = Guid.NewGuid().ToString();
    var deviceId = await GetDeviceId();
    var userId = await GetUserId(); // null if not logged in
    
    var enterEvent = new
    {
        contractVersion = "v2",
        deviceId = deviceId,
        correlationId = sessionId,
        authState = userId != null ? "logged_in" : "guest",
        sourceSystem = "GAK",
        rbelEventFamily = "location",
        rbelMappingVersion = "7.3.1",
        timestamp = DateTime.UtcNow.ToString("o"),
        userId = userId,
        poiId = poiId,
        payload = new
        {
            poi_id = poiId,
            poi_code = poiCode,
            session_event = "enter",
            session_id = sessionId
        }
    };
    
    await PostEvent(enterEvent);
    
    // Store sessionId and enterTime for exit event
    await SaveSessionData(poiId, sessionId, DateTime.UtcNow);
}

// On Geofence Exit
public async Task OnPoiExit(string poiId, string poiCode)
{
    var sessionData = await GetSessionData(poiId);
    if (sessionData == null) return;
    
    var durationSeconds = (int)(DateTime.UtcNow - sessionData.EnterTime).TotalSeconds;
    var deviceId = await GetDeviceId();
    var userId = await GetUserId();
    
    var exitEvent = new
    {
        contractVersion = "v2",
        deviceId = deviceId,
        correlationId = sessionData.SessionId,
        authState = userId != null ? "logged_in" : "guest",
        sourceSystem = "GAK",
        rbelEventFamily = "location",
        rbelMappingVersion = "7.3.1",
        timestamp = DateTime.UtcNow.ToString("o"),
        userId = userId,
        poiId = poiId,
        payload = new
        {
            poi_id = poiId,
            poi_code = poiCode,
            session_event = "exit",
            session_id = sessionData.SessionId,
            duration_seconds = durationSeconds
        }
    };
    
    await PostEvent(exitEvent);
    await ClearSessionData(poiId);
}

private async Task PostEvent(object eventData)
{
    var response = await _httpClient.PostAsJsonAsync(
        "/api/v1/intelligence/events/batch",
        new { schema = "event-contract-v2", events = new[] { eventData } }
    );
    response.EnsureSuccessStatusCode();
}
```

### 2. Audio Events (Already Integrated)

Audio events are automatically sent via Socket.IO when:
- Audio starts playing → `audio_start` event
- Audio completes → `audio_completed` event
- Audio cancelled → `audio_cancelled` event

**No mobile app changes needed** - backend handles this automatically.

---

## 🖥️ Admin Web Integration

### 1. Owner Analytics Dashboard

**New Endpoints Available:**

```typescript
// Get POI visit statistics
GET /api/v1/owner/intelligence/poi-visits/:poiId?from=2026-04-20T00:00:00Z&to=2026-04-23T23:59:59Z

Response:
[
  {
    "hour": "2026-04-23T10:00:00.000Z",
    "unique_visitors": 15
  },
  ...
]

// Get audio playback statistics
GET /api/v1/owner/intelligence/audio-stats/:poiId?from=2026-04-20T00:00:00Z&to=2026-04-23T23:59:59Z

Response:
{
  "total_starts": 42,
  "total_completions": 38,
  "total_cancellations": 4,
  "completion_rate": 90.48,
  "short_audio_plays": 25,
  "long_audio_plays": 17
}

// Get visit duration statistics
GET /api/v1/owner/intelligence/visit-duration/:poiId?from=2026-04-20T00:00:00Z&to=2026-04-23T23:59:59Z

Response:
{
  "average_duration": 420,
  "total_visits": 28,
  "min_duration": 60,
  "max_duration": 1200
}

// Get comprehensive summary
GET /api/v1/owner/intelligence/summary/:poiId?from=2026-04-20T00:00:00Z&to=2026-04-23T23:59:59Z

Response:
{
  "poi_id": "69dfca38087c183f8f132994",
  "time_range": {
    "from": "2026-04-20T00:00:00.000Z",
    "to": "2026-04-23T23:59:59.999Z"
  },
  "visits": {
    "total_unique_visitors": 156,
    "hourly_breakdown": [...]
  },
  "audio": {
    "total_starts": 42,
    "total_completions": 38,
    "completion_rate": 90.48
  },
  "visit_duration": {
    "average_duration": 420,
    "total_visits": 28
  }
}
```

**Authorization:**
- All endpoints require JWT authentication
- User must own the POI (`poi.submittedBy === user._id`)
- POI must be APPROVED status
- Max time range: 7 days

**Example React Component:**

```typescript
import { useState, useEffect } from 'react';
import axios from 'axios';

export function OwnerAnalyticsDashboard({ poiId }: { poiId: string }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await axios.get(
          `/api/v1/owner/intelligence/summary/${poiId}`,
          {
            params: {
              from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
              to: new Date().toISOString()
            },
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`
            }
          }
        );
        setSummary(response.data.data);
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [poiId]);

  if (loading) return <div>Loading analytics...</div>;
  if (!summary) return <div>No data available</div>;

  return (
    <div className="analytics-dashboard">
      <h2>POI Analytics</h2>
      
      <div className="metric-card">
        <h3>Visitors</h3>
        <p className="metric-value">{summary.visits.total_unique_visitors}</p>
        <p className="metric-label">Total Unique Visitors (7 days)</p>
      </div>

      <div className="metric-card">
        <h3>Audio Engagement</h3>
        <p className="metric-value">{summary.audio.completion_rate}%</p>
        <p className="metric-label">Completion Rate</p>
        <p className="metric-detail">
          {summary.audio.total_completions} / {summary.audio.total_starts} plays
        </p>
      </div>

      <div className="metric-card">
        <h3>Visit Duration</h3>
        <p className="metric-value">{Math.round(summary.visit_duration.average_duration / 60)} min</p>
        <p className="metric-label">Average Visit Duration</p>
        <p className="metric-detail">
          {summary.visit_duration.total_visits} visits tracked
        </p>
      </div>
    </div>
  );
}
```

### 2. Grid-Based Heatmap (Admin Only)

**Endpoint:**

```typescript
GET /api/v1/admin/intelligence/grid-heatmap?from=2026-04-23T00:00:00Z&to=2026-04-23T23:59:59Z

Response:
[
  {
    "cell_key": "2102_10585",
    "cell_center_lat": 21.025,
    "cell_center_lon": 105.855,
    "weight": 42
  },
  ...
]
```

**Constraints:**
- Max time range: 24 hours
- No PII in response (only grid cells and weights)
- Sorted by weight descending

**Example Leaflet Integration:**

```typescript
import L from 'leaflet';
import 'leaflet.heat';

export function HeatmapLayer({ from, to }: { from: Date; to: Date }) {
  useEffect(() => {
    const fetchHeatmap = async () => {
      const response = await axios.get('/api/v1/admin/intelligence/grid-heatmap', {
        params: {
          from: from.toISOString(),
          to: to.toISOString()
        },
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      const heatmapData = response.data.data.map(cell => [
        cell.cell_center_lat,
        cell.cell_center_lon,
        cell.weight / 100 // Normalize weight
      ]);

      L.heatLayer(heatmapData, {
        radius: 25,
        blur: 15,
        maxZoom: 17
      }).addTo(map);
    };

    fetchHeatmap();
  }, [from, to]);

  return null;
}
```

---

## 🔐 Authentication

All owner analytics endpoints require JWT authentication:

```typescript
// Add to axios defaults
axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

// Or per request
const response = await axios.get('/api/v1/owner/intelligence/summary/:poiId', {
  headers: {
    Authorization: `Bearer ${token}`
  }
});
```

---

## 📊 Data Flow

```
Mobile App (Geofence)
  ↓ enter/exit events
POST /api/v1/intelligence/events/batch
  ↓
uis_events_raw collection
  ↓ (background aggregation every 5 min)
uis_analytics_rollups_hourly
  ↓
Owner Analytics APIs
  ↓
Admin Web Dashboard
```

---

## ⚠️ Important Notes

### Time Ranges
- Owner analytics: Max 7 days
- Admin analytics: Max 14 days
- Grid heatmap: Max 24 hours

### Query Performance
- All queries have 5000ms timeout
- Indexes optimize common queries
- Use date range filters to improve performance

### Privacy
- Grid heatmap contains NO PII (no device IDs, user IDs)
- Only aggregated cell coordinates and weights
- Complies with privacy requirements

### Error Handling

```typescript
try {
  const response = await axios.get('/api/v1/owner/intelligence/summary/:poiId');
  // Handle success
} catch (error) {
  if (error.response?.status === 403) {
    // User doesn't own this POI
    console.error('Unauthorized: You do not own this POI');
  } else if (error.response?.status === 409) {
    // POI not approved
    console.error('POI must be approved to view analytics');
  } else if (error.response?.status === 400) {
    // Invalid parameters
    console.error('Invalid request parameters');
  } else {
    // Server error
    console.error('Failed to fetch analytics');
  }
}
```

---

## 🧪 Testing

### Test Owner Analytics
1. Create a POI as a logged-in user
2. Wait for POI approval
3. Generate some test events (visit, audio)
4. Query analytics endpoints
5. Verify data appears correctly

### Test Geofence Events
1. Simulate geofence enter in mobile app
2. Verify event appears in `uis_events_raw` collection
3. Simulate geofence exit after 5 minutes
4. Verify exit event has correct duration
5. Query visit duration analytics

### Test Grid Heatmap
1. Generate location events across multiple POIs
2. Query grid heatmap for last 24 hours
3. Verify cells returned with correct coordinates
4. Verify no PII in response
5. Test 24-hour constraint enforcement

---

## 📝 Next Steps

1. **Mobile App:**
   - Implement geofence enter/exit event sending
   - Test with real device location
   - Verify events appear in backend

2. **Admin Web:**
   - Add owner analytics dashboard page
   - Implement charts for visit trends
   - Add grid heatmap visualization
   - Test with real data

3. **Backend:**
   - Monitor query performance
   - Set up alerts for slow queries
   - Review logs for errors

---

**Integration Status:** ✅ Ready  
**Documentation:** Complete  
**Testing:** Validated  
**Deployment:** Ready for production
