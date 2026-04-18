/**
 * Stage 6 — backend integration tests (single file = one MongoMemoryServer instance).
 * Sections: Auth/RBAC | Owner | Admin moderation | Audit API
 */
const request = require('supertest');
const mongoose = require('mongoose');
const { seedUsers } = require('./helpers/seedUsers');
const { login } = require('./helpers/http');
const AdminPoiAudit = require('../src/models/admin-poi-audit.model');

const app = () => global.__APP__;

describe('Stage 6 — Auth & RBAC', () => {
    beforeEach(() => seedUsers());

    it('login returns 200 and JWT for valid admin', async () => {
        const res = await request(app())
            .post('/api/v1/auth/login')
            .send({ email: 'admin@test.local', password: 'password123' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.token).toBeDefined();
        expect(res.body.data.user.role).toBe('ADMIN');
    });

    it('login returns 401 for bad password', async () => {
        const res = await request(app())
            .post('/api/v1/auth/login')
            .send({ email: 'admin@test.local', password: 'wrong' });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('USER cannot call admin POI create', async () => {
        const token = await login('user@test.local', 'password123');
        const res = await request(app())
            .post('/api/v1/pois')
            .set('Authorization', `Bearer ${token}`)
            .send({
                code: 'X1',
                location: { lat: 10, lng: 106 },
                content: { en: 'e', vi: 'v' }
            });
        expect(res.status).toBe(403);
 });

    it('OWNER cannot call admin approve endpoint', async () => {
        const token = await login('owner@test.local', 'password123');
        const fakeId = new mongoose.Types.ObjectId();
        const res = await request(app())
            .post(`/api/v1/admin/pois/${fakeId.toString()}/approve`)
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
    });

    it('ADMIN cannot submit owner POI (wrong role)', async () => {
        const token = await login('admin@test.local', 'password123');
        const res = await request(app())
            .post('/api/v1/owner/pois')
            .set('Authorization', `Bearer ${token}`)
            .send({
                code: 'OWN-1',
                name: 'Place',
                radius: 50,
                location: { lat: 10.77, lng: 106.7 }
            });
        expect(res.status).toBe(403);
    });

    it('protected route without token returns 401', async () => {
        const res = await request(app()).get('/api/v1/pois/nearby?lat=10&lng=106');
        expect(res.status).toBe(401);
    });
});

describe('Stage 6 — Owner POI submit', () => {
    beforeEach(() => seedUsers());

    it('OWNER submits POI → 201 and status PENDING', async () => {
        const token = await login('owner@test.local', 'password123');
        const res = await request(app())
            .post('/api/v1/owner/pois')
            .set('Authorization', `Bearer ${token}`)
            .send({
                code: 'OWN-PEND-1',
                name: 'Test POI',
                radius: 100,
                location: { lat: 10.7769, lng: 106.7019 }
            });
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data.status).toBe('PENDING');
        expect(res.body.data.code).toBe('OWN-PEND-1');
    });

    it('duplicate POI code returns 409', async () => {
        const token = await login('owner@test.local', 'password123');
        const body = {
            code: 'OWN-DUP',
            name: 'A',
            radius: 50,
            location: { lat: 10, lng: 106 }
        };
        const r1 = await request(app())
            .post('/api/v1/owner/pois')
            .set('Authorization', `Bearer ${token}`)
            .send(body);
        expect(r1.status).toBe(201);
        const r2 = await request(app())
            .post('/api/v1/owner/pois')
            .set('Authorization', `Bearer ${token}`)
            .send({ ...body, name: 'B' });
        expect(r2.status).toBe(409);
    });
});

describe('Stage 6 — Admin moderation & idempotency', () => {
    beforeEach(() => seedUsers());

    async function createPendingPoi() {
        const ownerTok = await login('owner@test.local', 'password123');
        const create = await request(app())
            .post('/api/v1/owner/pois')
            .set('Authorization', `Bearer ${ownerTok}`)
            .send({
                code: `OWN-MOD-${Date.now()}`,
                name: 'Mod test',
                radius: 80,
                location: { lat: 11, lng: 107 }
            });
        expect(create.status).toBe(201);
        return create.body.data.id;
    }

    it('ADMIN lists PENDING POIs', async () => {
        const poiId = await createPendingPoi();
        const adminTok = await login('admin@test.local', 'password123');
        const res = await request(app())
            .get('/api/v1/admin/pois/pending')
            .set('Authorization', `Bearer ${adminTok}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        const ids = res.body.data.map((p) => String(p.id));
        expect(ids).toContain(String(poiId));
        expect(res.body.pagination).toBeDefined();
        expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('ADMIN lists master POIs (all statuses)', async () => {
        await createPendingPoi();
        const adminTok = await login('admin@test.local', 'password123');
        const res = await request(app())
            .get('/api/v1/admin/pois/master?page=1&limit=20')
            .set('Authorization', `Bearer ${adminTok}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('USER cannot list master POIs', async () => {
        const token = await login('user@test.local', 'password123');
        const res = await request(app())
            .get('/api/v1/admin/pois/master')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
    });

    it('ADMIN approves PENDING → APPROVED', async () => {
        const poiId = await createPendingPoi();
        const adminTok = await login('admin@test.local', 'password123');
        const res = await request(app())
            .post(`/api/v1/admin/pois/${poiId}/approve`)
            .set('Authorization', `Bearer ${adminTok}`);
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('APPROVED');
    });

    it('ADMIN rejects PENDING → REJECTED with reason', async () => {
        const poiId = await createPendingPoi();
        const adminTok = await login('admin@test.local', 'password123');
        const res = await request(app())
            .post(`/api/v1/admin/pois/${poiId}/reject`)
            .set('Authorization', `Bearer ${adminTok}`)
            .send({ reason: 'Insufficient documentation.' });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('REJECTED');
        expect(res.body.data.rejectionReason).toBe('Insufficient documentation.');
    });

    it('reject without reason → 400', async () => {
        const poiId = await createPendingPoi();
        const adminTok = await login('admin@test.local', 'password123');
        const res = await request(app())
            .post(`/api/v1/admin/pois/${poiId}/reject`)
            .set('Authorization', `Bearer ${adminTok}`)
            .send({});
        expect(res.status).toBe(400);
    });

    it('approving already APPROVED is idempotent (200, no extra audit row)', async () => {
        const poiId = await createPendingPoi();
        const adminTok = await login('admin@test.local', 'password123');
        const r1 = await request(app())
            .post(`/api/v1/admin/pois/${poiId}/approve`)
            .set('Authorization', `Bearer ${adminTok}`);
        expect(r1.status).toBe(200);
        const auditsAfterFirst = await AdminPoiAudit.countDocuments();
        expect(auditsAfterFirst).toBe(1);
        const r2 = await request(app())
            .post(`/api/v1/admin/pois/${poiId}/approve`)
            .set('Authorization', `Bearer ${adminTok}`);
        expect(r2.status).toBe(200);
        expect(r2.body.data.status).toBe('APPROVED');
        const auditsAfterSecond = await AdminPoiAudit.countDocuments();
        expect(auditsAfterSecond).toBe(1);
    });

    it('cannot approve REJECTED POI → 409', async () => {
        const poiId = await createPendingPoi();
        const adminTok = await login('admin@test.local', 'password123');
        await request(app())
            .post(`/api/v1/admin/pois/${poiId}/reject`)
            .set('Authorization', `Bearer ${adminTok}`)
            .send({ reason: 'No.' });
        const res = await request(app())
            .post(`/api/v1/admin/pois/${poiId}/approve`)
            .set('Authorization', `Bearer ${adminTok}`);
        expect(res.status).toBe(409);
    });
});

describe('Stage 6 — Audit log API', () => {
    beforeEach(() => seedUsers());

    it('creates audit row on approve and lists via GET /audits', async () => {
        const ownerTok = await login('owner@test.local', 'password123');
        const create = await request(app())
            .post('/api/v1/owner/pois')
            .set('Authorization', `Bearer ${ownerTok}`)
            .send({
                code: `OWN-AUD-${Date.now()}`,
                name: 'Audit test',
                radius: 50,
                location: { lat: 10, lng: 106 }
            });
        const poiId = create.body.data.id;
        const adminTok = await login('admin@test.local', 'password123');
        await request(app())
            .post(`/api/v1/admin/pois/${poiId}/approve`)
            .set('Authorization', `Bearer ${adminTok}`)
            .expect(200);

        const count = await AdminPoiAudit.countDocuments();
        expect(count).toBe(1);

        const list = await request(app())
            .get('/api/v1/admin/pois/audits?page=1&limit=10')
            .set('Authorization', `Bearer ${adminTok}`);
        expect(list.status).toBe(200);
        expect(list.body.success).toBe(true);
        expect(Array.isArray(list.body.data)).toBe(true);
        expect(list.body.data.length).toBe(1);
        expect(list.body.data[0].action).toBe('APPROVE');
        expect(list.body.data[0].admin.email).toBe('admin@test.local');
        expect(list.body.data[0].poi.code).toMatch(/^OWN-AUD-/);
        expect(list.body.pagination.total).toBe(1);
    });

    it('GET /audits forbidden for non-admin', async () => {
        const token = await login('user@test.local', 'password123');
        const res = await request(app())
            .get('/api/v1/admin/pois/audits')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
    });

    it('reject creates audit with REJECT and reason', async () => {
        const ownerTok = await login('owner@test.local', 'password123');
        const create = await request(app())
            .post('/api/v1/owner/pois')
            .set('Authorization', `Bearer ${ownerTok}`)
            .send({
                code: `OWN-REJ-${Date.now()}`,
                name: 'R',
                radius: 50,
                location: { lat: 10, lng: 106 }
            });
        const poiId = create.body.data.id;
        const adminTok = await login('admin@test.local', 'password123');
        await request(app())
            .post(`/api/v1/admin/pois/${poiId}/reject`)
            .set('Authorization', `Bearer ${adminTok}`)
            .send({ reason: 'Policy violation.' })
            .expect(200);

        const doc = await AdminPoiAudit.findOne({ poiId }).lean();
        expect(doc).toBeTruthy();
        expect(doc.action).toBe('REJECT');
        expect(doc.reason).toBe('Policy violation.');
        expect(doc.previousStatus).toBe('PENDING');
        expect(doc.newStatus).toBe('REJECTED');
    });
});

describe('7.3.0 — Intelligence ingestion (RBEL)', () => {
    beforeEach(() => seedUsers());

    const sampleEvent = (overrides = {}) => ({
        contractVersion: 'v2',
        correlationId: 'corr-test-1',
        deviceId: 'device-a',
        authState: 'guest',
        userType: 'guest',
        sourceSystem: 'GAK',
        rbelEventFamily: 'location',
        rbelMappingVersion: 'rbel-1.0.0',
        timestamp: new Date().toISOString(),
        eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        runtimeSequence: 1,
        runtimeTickUtcTicks: 638800000000000000,
        actionType: 'geofence',
        ...overrides
    });

    it('rejects batch without auth', async () => {
        const res = await request(app())
            .post('/api/v1/intelligence/events/batch')
            .send({ events: [sampleEvent()] });
        expect(res.status).toBe(401);
    });

    it('accepts batch with X-Api-Key', async () => {
        const ev = sampleEvent({
            correlationId: 'c-api-1',
            deviceId: 'd-ingest-1',
            eventId: `e1-${Date.now()}`
        });
        const res = await request(app())
            .post('/api/v1/intelligence/events/batch')
            .set('X-Api-Key', 'test-intel-ingest-key')
            .send({ schema: 'event-contract-v2', events: [ev] });
        expect(res.status).toBe(200);
        expect(res.body.accepted).toBe(1);
        expect(res.body.rejected).toBe(0);
    });

    it('dedupes on device_id + correlation_id + runtime_sequence', async () => {
        const key = 'test-intel-ingest-key';
        const base = sampleEvent({
            correlationId: 'c-dup-seq',
            deviceId: 'd-dup',
            runtimeSequence: 42,
            eventId: `e-dup-a-${Date.now()}`
        });
        const r1 = await request(app())
            .post('/api/v1/intelligence/events/batch')
            .set('X-Api-Key', key)
            .send({ events: [base] });
        expect(r1.status).toBe(200);
        expect(r1.body.accepted).toBe(1);
        const r2 = await request(app())
            .post('/api/v1/intelligence/events/batch')
            .set('X-Api-Key', key)
            .send({
                events: [{ ...base, eventId: `e-dup-b-${Date.now()}` }]
            });
        expect(r2.status).toBe(200);
        expect(r2.body.duplicate).toBe(1);
        expect(r2.body.accepted).toBe(0);
    });

    it('ADMIN GET journey lists events by correlationId', async () => {
        const cid = `c-journey-${Date.now()}`;
        const ev = sampleEvent({
            correlationId: cid,
            deviceId: 'dj-1',
            runtimeSequence: 1,
            eventId: `j1-${Date.now()}`
        });
        await request(app())
            .post('/api/v1/intelligence/events/batch')
            .set('X-Api-Key', 'test-intel-ingest-key')
            .send({ events: [ev] })
            .expect(200);
        const adminTok = await login('admin@test.local', 'password123');
        const jr = await request(app())
            .get(`/api/v1/admin/intelligence/journeys/${cid}`)
            .set('Authorization', `Bearer ${adminTok}`);
        expect(jr.status).toBe(200);
        expect(jr.body.success).toBe(true);
        expect(jr.body.data.events.length).toBe(1);
        expect(jr.body.data.events[0].correlation_id).toBe(cid);
    });

    it('USER forbidden from admin intelligence summary', async () => {
        const token = await login('user@test.local', 'password123');
        const res = await request(app())
            .get('/api/v1/admin/intelligence/summary')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
    });
});
