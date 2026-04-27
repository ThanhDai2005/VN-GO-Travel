const TOKEN_KEY = "vngo_admin_jwt";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function apiBase() {
  const b = import.meta.env.VITE_API_BASE;
  return b && String(b).trim() ? String(b).replace(/\/$/, "") : "";
}

export async function apiRequest(path, { method = "GET", body, token } = {}) {
  const base = apiBase();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    Accept: "application/json",
  };
  const t = token ?? getStoredToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg = json?.error?.message || json?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  return json;
}

export async function login(email, password) {
  return apiRequest("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
    token: null,
  });
}

export async function fetchPendingPois() {
  return apiRequest("/api/v1/admin/pois/pending");
}

export async function approvePoi(id) {
  return apiRequest(`/api/v1/admin/pois/${encodeURIComponent(id)}/approve`, {
    method: "POST",
  });
}

export async function rejectPoi(id, reason) {
  return apiRequest(`/api/v1/admin/pois/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    body: { reason },
  });
}

export async function fetchAudits(page = 1, limit = 20) {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiRequest(`/api/v1/admin/pois/audits?${q}`);
}

/** All POIs (any status), paginated — ADMIN only. */
export async function fetchMasterPois(page = 1, limit = 50) {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiRequest(`/api/v1/admin/pois/master?${q}`);
}

export async function createPoi(body) {
  return apiRequest("/api/v1/pois", { method: "POST", body });
}

export async function updatePoiByCode(code, body) {
  return apiRequest(`/api/v1/pois/code/${encodeURIComponent(code)}`, {
    method: "PUT",
    body,
  });
}

export async function deletePoiByCode(code) {
  return apiRequest(`/api/v1/pois/code/${encodeURIComponent(code)}`, {
    method: "DELETE",
  });
}

/** Short-lived scan JWT + full URL for QR (ADMIN). */
export async function fetchPoiQrToken(poiId) {
  return apiRequest(`/api/v1/admin/pois/${encodeURIComponent(poiId)}/qr-token`);
}

export async function fetchAdminUsers() {
  return apiRequest("/api/v1/admin/users");
}

export async function createAdminUser(body) {
  return apiRequest("/api/v1/admin/users", {
    method: "POST",
    body,
  });
}

export async function updateAdminUser(userId, body) {
  return apiRequest(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body,
  });
}

export async function updateUserRole(userId, role) {
  return apiRequest(`/api/v1/admin/users/${encodeURIComponent(userId)}/role`, {
    method: "PUT",
    body: { role },
  });
}

export async function updateUserPremium(userId, isPremium) {
  return apiRequest(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/premium`,
    {
      method: "PUT",
      body: { isPremium },
    },
  );
}

export async function updateUserStatus(userId, isActive) {
  return apiRequest(
    `/api/v1/admin/users/${encodeURIComponent(userId)}/status`,
    {
      method: "PUT",
      body: { isActive },
    },
  );
}

export async function fetchOwnerSubmissions(page = 1, limit = 50) {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiRequest(`/api/v1/owner/pois?${q}`);
}

export async function submitOwnerPoi(body) {
  return apiRequest("/api/v1/owner/pois", { method: "POST", body });
}

export async function fetchOwnerPoiQrToken(poiId) {
  return apiRequest(`/api/v1/owner/pois/${encodeURIComponent(poiId)}/qr-token`);
}

/** @returns {Promise<Array<{ event_family: string, total_events: number }>>} */
export async function fetchIntelligenceEventsByFamily(
  start,
  end,
  granularity = "daily",
) {
  const q = new URLSearchParams({
    start,
    end,
    granularity: String(granularity),
  });
  return apiRequest(`/api/v1/admin/intelligence/metrics/events-by-family?${q}`);
}

/** @returns {Promise<Array<{ auth_state: string, total_events: number }>>} */
export async function fetchIntelligenceEventsByAuthState(
  start,
  end,
  granularity = "daily",
) {
  const q = new URLSearchParams({
    start,
    end,
    granularity: String(granularity),
  });
  return apiRequest(
    `/api/v1/admin/intelligence/metrics/events-by-auth-state?${q}`,
  );
}

/** @returns {Promise<Array<{ bucket_start: string, total_events: number }>>} */
export async function fetchIntelligenceTimeline(
  start,
  end,
  granularity = "daily",
) {
  const q = new URLSearchParams({
    start,
    end,
    granularity: String(granularity),
  });
  return apiRequest(`/api/v1/admin/intelligence/metrics/timeline?${q}`);
}

/** @returns {Promise<Array<{ poi_id: string, code: string, name: string, lat: number, lng: number, total_events: number }>>} */
export async function fetchIntelligenceGeoHeatmap(start, end) {
  const q = new URLSearchParams({ start, end });
  return apiRequest(`/api/v1/admin/intelligence/metrics/geo-heatmap?${q}`);
}

/** @returns {Promise<{ totalUsers: number, newPremiumUsers: number, estimatedRevenue: number }>} */
export async function fetchIntelligenceOverview(start, end) {
  const q = new URLSearchParams({ start, end });
  return apiRequest(`/api/v1/admin/intelligence/metrics/overview?${q}`);
}

/** @returns {Promise<{ totalUsers: number, totalPremiumUsers: number }>} */
export async function fetchSystemOverview() {
  return apiRequest('/api/v1/admin/intelligence/metrics/system-overview');
}

/** @returns {Promise<Array<{ date: string, hour: number, total_events: number }>>} */
export async function fetchIntelligenceHeatmap(start, end) {
  const q = new URLSearchParams({ start, end });
  return apiRequest(`/api/v1/admin/intelligence/heatmap?${q}`);
}

/** Owner heatmap: APPROVED POIs submitted by current owner only. */
export async function fetchOwnerIntelligenceHeatmap(start, end, poiId) {
  const q = new URLSearchParams({ start, end });
  if (poiId) q.set('poi_id', String(poiId));
  return apiRequest(`/api/v1/owner/intelligence/heatmap?${q}`);
}

export async function fetchOwnerIntelligenceTimeline(start, end, granularity = "daily") {
  const q = new URLSearchParams({ start, end, granularity });
  return apiRequest(`/api/v1/owner/intelligence/metrics/timeline?${q}`);
}

export async function fetchOwnerIntelligenceEventsByFamily(start, end) {
  const q = new URLSearchParams({ start, end });
  return apiRequest(`/api/v1/owner/intelligence/metrics/events-by-family?${q}`);
}

export async function requestOwnerPoiUpdate(poiId, body) {
  return apiRequest(`/api/v1/owner/pois/${encodeURIComponent(poiId)}/request-update`, {
    method: "POST",
    body,
  });
}

export async function requestOwnerPoiDelete(poiId) {
  return apiRequest(`/api/v1/owner/pois/${encodeURIComponent(poiId)}/request-delete`, {
    method: "POST",
  });
}

export async function fetchPoiChangeRequests(page = 1, limit = 50) {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiRequest(`/api/v1/admin/pois/change-requests?${q}`);
}

// ============================================================================
// ZONE MANAGEMENT APIs
// ============================================================================

export async function fetchZones(page = 1, limit = 50) {
  const q = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiRequest(`/api/v1/admin/zones?${q}`);
}

export async function createZone(body) {
  return apiRequest("/api/v1/admin/zones", {
    method: "POST",
    body,
  });
}

export async function updateZone(zoneId, body) {
  return apiRequest(`/api/v1/admin/zones/${encodeURIComponent(zoneId)}`, {
    method: "PUT",
    body,
  });
}

export async function deleteZone(zoneId) {
  return apiRequest(`/api/v1/admin/zones/${encodeURIComponent(zoneId)}`, {
    method: "DELETE",
  });
}

export async function updateZonePois(zoneId, poiIds) {
  return apiRequest(`/api/v1/admin/zones/${encodeURIComponent(zoneId)}/pois`, {
    method: "PUT",
    body: { poiIds },
  });
}

export async function fetchZoneQrToken(zoneId) {
  return apiRequest(`/api/v1/admin/zones/${encodeURIComponent(zoneId)}/qr-token`);
}

export async function reviewPoiChangeRequest(requestId, status, reason) {
  return apiRequest(`/api/v1/admin/pois/change-requests/${encodeURIComponent(requestId)}/review`, {
    method: "POST",
    body: { status, reason },
  });
}

/** Device sessions for admin dashboard (online/offline, IP, user). */
export async function fetchAdminDevices() {
  return apiRequest("/api/v1/devices/admin/list");
}
