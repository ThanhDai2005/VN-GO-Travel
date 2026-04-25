/**
 * Intelligence heatmap — aggregates uis_events_raw by UTC calendar day + hour.
 * POI filter uses payload.poi_id (string or ObjectId stored in Mixed payload).
 *
 * Grid-based heatmap per v7.3.2 §9.2: Returns 0.01° grid cells (~1.1km)
 */

const mongoose = require('mongoose');
const PoiHourlyStats = require('../models/poi-hourly-stats.model');
const IntelligenceEventRaw = require('../models/intelligence-event-raw.model');
const Poi = require('../models/poi.model');
const { AppError } = require('../middlewares/error.middleware');
const { POI_STATUS } = require('../constants/poi-status');

const MAX_RANGE_MS = 14 * 24 * 60 * 60 * 1000;
const OWNER_MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_TIME_MS = 5000;
const GRID_SIZE = 0.01; // 0.01° cells (~1.1km) per spec v7.3.2 §9.2
const GRID_HEATMAP_MAX_HOURS = 24; // 24-hour constraint for grid heatmap

function defaultUtcDayRange7() {
    const end = new Date();
    end.setUTCHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    start.setUTCHours(0, 0, 0, 0);
    return { start, end };
}

/**
 * @param {string|undefined} startStr
 * @param {string|undefined} endStr
 */
function parseRange(startStr, endStr, opts = {}) {
    const maxRangeMs = opts.maxRangeMs || MAX_RANGE_MS;
    const defaultDays = Number.isInteger(opts.defaultDays) ? opts.defaultDays : 7;

    if (!startStr || !endStr) {
        const end = new Date();
        end.setUTCHours(23, 59, 59, 999);
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - (defaultDays - 1));
        start.setUTCHours(0, 0, 0, 0);
        return { start, end };
    }
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new AppError('Invalid start or end (use ISO 8601)', 400);
    }
    if (start > end) {
        throw new AppError('start must be before or equal to end', 400);
    }
    if (end.getTime() - start.getTime() > maxRangeMs) {
        throw new AppError(`Time range must not exceed ${Math.floor(maxRangeMs / (24 * 60 * 60 * 1000))} days`, 400);
    }
    return { start, end };
}

/**
 * Calculate grid cell for coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {{ cell_key: string, cell_center_lat: number, cell_center_lon: number }}
 */
function getGridCell(lat, lng) {
    const latIdx = Math.floor(lat / GRID_SIZE);
    const lonIdx = Math.floor(lng / GRID_SIZE);

    return {
        cell_key: `${latIdx}_${lonIdx}`,
        cell_center_lat: (latIdx + 0.5) * GRID_SIZE,
        cell_center_lon: (lonIdx + 0.5) * GRID_SIZE
    };
}

/**
 * Get grid-based heatmap per v7.3.2 §9.2
 * Returns 0.01° grid cells with event counts (no PII)
 * @param {Date} from - Start time (max 24 hours from 'to')
 * @param {Date} to - End time
 * @returns {Promise<Array<{ cell_key: string, cell_center_lat: number, cell_center_lon: number, weight: number }>>}
 */
async function getGridHeatmap(from, to) {
    // Enforce 24-hour constraint per spec
    const rangeMs = to.getTime() - from.getTime();
    if (rangeMs > GRID_HEATMAP_MAX_HOURS * 60 * 60 * 1000) {
        throw new AppError('Grid heatmap time range must not exceed 24 hours', 400);
    }

    // Query LocationEvents with coordinates
    const events = await IntelligenceEventRaw.find({
        event_family: 'LocationEvent',
        timestamp: { $gte: from, $lte: to },
        'payload.latitude': { $exists: true },
        'payload.longitude': { $exists: true }
    })
    .select('payload.latitude payload.longitude')
    .lean()
    .maxTimeMS(MAX_TIME_MS);

    // Aggregate into grid cells
    const cellCounts = {};

    events.forEach(ev => {
        const lat = ev.payload.latitude;
        const lng = ev.payload.longitude;

        if (typeof lat === 'number' && typeof lng === 'number') {
            const cell = getGridCell(lat, lng);
            cellCounts[cell.cell_key] = (cellCounts[cell.cell_key] || 0) + 1;
        }
    });

    // Convert to array
    return Object.entries(cellCounts).map(([key, weight]) => {
        const [latIdx, lonIdx] = key.split('_').map(Number);
        return {
            cell_key: key,
            cell_center_lat: (latIdx + 0.5) * GRID_SIZE,
            cell_center_lon: (lonIdx + 0.5) * GRID_SIZE,
            weight
        };
    }).sort((a, b) => b.weight - a.weight); // Sort by weight descending
}

/**
 * @param {Date} rangeStart
 * @param {Date} rangeEnd
 * @param {string[]|null} poiIdStrings optional — matches poi_id
 * @returns {Promise<Array<{ date: string, hour: number, total_unique_visitors: number }>>}
 */
async function aggregateHeatmap(rangeStart, rangeEnd, poiIdStrings) {
    /** @type {Record<string, unknown>} */
    const match = {
        hour_bucket: { $gte: rangeStart, $lte: rangeEnd }
    };

    if (Array.isArray(poiIdStrings) && poiIdStrings.length > 0) {
        match.poi_id = { $in: poiIdStrings.map(String) };
    }

    const pipeline = [
        { $match: match },
        {
            $group: {
                _id: '$hour_bucket',
                total_unique_visitors: { $sum: { $size: { $ifNull: ['$unique_devices', []] } } }
            }
        },
        {
            $project: {
                _id: 0,
                date: {
                    $dateToString: { format: '%Y-%m-%d', date: '$_id', timezone: 'UTC' }
                },
                hour: { $hour: { date: '$_id', timezone: 'UTC' } },
                total_unique_visitors: 1
            }
        },
        { $sort: { date: 1, hour: 1 } }
    ];

    return PoiHourlyStats.aggregate(pipeline).option({ maxTimeMS: MAX_TIME_MS });
}

/**
 * @param {{ start?: string, end?: string }} params
 */
async function getAdminHeatmap(params) {
    const { start, end } = parseRange(params.start, params.end, { maxRangeMs: MAX_RANGE_MS, defaultDays: 7 });
    return aggregateHeatmap(start, end, null);
}

/**
 * @param {string} userId
 * @param {{ poi_id?: string, start?: string, end?: string }} params
 */
async function getOwnerHeatmap(userId, params) {
    const rawPoiId = params.poi_id ?? params.poiId;
    const poiId = rawPoiId == null ? '' : String(rawPoiId).trim();

    if (poiId !== '' && !mongoose.Types.ObjectId.isValid(poiId)) {
        throw new AppError('Invalid poi_id', 400);
    }

    const baseOwnerFilter = {
        submittedBy: new mongoose.Types.ObjectId(String(userId)),
        status: POI_STATUS.APPROVED
    };

    const ownerFilter = poiId !== ''
        ? { ...baseOwnerFilter, _id: new mongoose.Types.ObjectId(poiId) }
        : baseOwnerFilter;

    const ownerPois = await Poi.find(ownerFilter).select('_id').lean();

    if (poiId !== '' && ownerPois.length === 0) {
        const ownPoi = await Poi.findById(poiId).select('_id submittedBy status').lean();
        if (!ownPoi) {
            throw new AppError('POI not found', 404);
        }
        if (!ownPoi.submittedBy || String(ownPoi.submittedBy) !== String(userId)) {
            throw new AppError('You do not have access to this POI', 403);
        }
        throw new AppError('POI must be APPROVED to show owner heatmap', 409);
    }

    if (ownerPois.length === 0) {
        return [];
    }

    const poiIds = ownerPois.map((p) => String(p._id));
    const { start, end } = parseRange(params.start, params.end, {
        maxRangeMs: OWNER_MAX_RANGE_MS,
        defaultDays: 365
    });
    return aggregateHeatmap(start, end, poiIds);
}

module.exports = {
    getAdminHeatmap,
    getOwnerHeatmap,
    getGridHeatmap,
    parseRange,
    defaultUtcDayRange7,
    getGridCell,
    MAX_RANGE_MS,
    OWNER_MAX_RANGE_MS,
    MAX_TIME_MS,
    GRID_SIZE,
    GRID_HEATMAP_MAX_HOURS
};
