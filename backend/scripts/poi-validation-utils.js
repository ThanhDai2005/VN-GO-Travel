/**
 * POI VALIDATION UTILITIES
 *
 * Reusable validation functions for POI data quality checks.
 * Can be imported by other scripts or used in application code.
 */

const VIETNAM_BOUNDS = {
    minLat: 8.5,
    maxLat: 23.4,
    minLng: 102.1,
    maxLng: 114.0
};

/**
 * Validate if coordinates are within Vietnam boundaries
 */
function isInVietnam(lat, lng) {
    return lat >= VIETNAM_BOUNDS.minLat &&
           lat <= VIETNAM_BOUNDS.maxLat &&
           lng >= VIETNAM_BOUNDS.minLng &&
           lng <= VIETNAM_BOUNDS.maxLng;
}

/**
 * Validate coordinate format and values
 */
function validateCoordinates(location) {
    const errors = [];

    if (!location) {
        errors.push('Missing location field');
        return { valid: false, errors };
    }

    if (location.type !== 'Point') {
        errors.push(`Invalid location type: ${location.type} (expected "Point")`);
    }

    if (!Array.isArray(location.coordinates) || location.coordinates.length !== 2) {
        errors.push('Invalid coordinates array (expected [lng, lat])');
        return { valid: false, errors };
    }

    const [lng, lat] = location.coordinates;

    if (typeof lng !== 'number' || typeof lat !== 'number') {
        errors.push(`Coordinates must be numbers: [${lng}, ${lat}]`);
        return { valid: false, errors };
    }

    if (isNaN(lng) || isNaN(lat)) {
        errors.push(`Coordinates are NaN: [${lng}, ${lat}]`);
        return { valid: false, errors };
    }

    if (lng === 0 && lat === 0) {
        errors.push('Coordinates are [0, 0] (likely invalid)');
    }

    if (!isInVietnam(lat, lng)) {
        errors.push(`Coordinates outside Vietnam: [${lat}, ${lng}]`);
    }

    // Validate longitude range
    if (lng < -180 || lng > 180) {
        errors.push(`Longitude out of range: ${lng} (must be -180 to 180)`);
    }

    // Validate latitude range
    if (lat < -90 || lat > 90) {
        errors.push(`Latitude out of range: ${lat} (must be -90 to 90)`);
    }

    return {
        valid: errors.length === 0,
        errors,
        coordinates: { lat, lng }
    };
}

/**
 * Validate POI radius
 */
function validateRadius(radius) {
    const errors = [];

    if (radius === undefined || radius === null) {
        errors.push('Radius is required');
        return { valid: false, errors };
    }

    if (typeof radius !== 'number') {
        errors.push(`Radius must be a number: ${typeof radius}`);
        return { valid: false, errors };
    }

    if (isNaN(radius)) {
        errors.push('Radius is NaN');
        return { valid: false, errors };
    }

    if (radius <= 0) {
        errors.push(`Radius must be positive: ${radius}`);
    }

    if (radius > 100000) {
        errors.push(`Radius too large: ${radius}m (max 100km)`);
    }

    return {
        valid: errors.length === 0,
        errors,
        radius
    };
}

/**
 * Validate POI code
 */
function validateCode(code) {
    const errors = [];

    if (!code || typeof code !== 'string') {
        errors.push('Code is required and must be a string');
        return { valid: false, errors };
    }

    const trimmed = code.trim();

    if (trimmed.length === 0) {
        errors.push('Code cannot be empty');
        return { valid: false, errors };
    }

    if (trimmed.length > 100) {
        errors.push(`Code too long: ${trimmed.length} chars (max 100)`);
    }

    // Check for valid characters (alphanumeric, underscore, hyphen)
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        errors.push('Code contains invalid characters (use only A-Z, 0-9, _, -)');
    }

    return {
        valid: errors.length === 0,
        errors,
        code: trimmed
    };
}

/**
 * Validate complete POI document
 */
function validatePoi(poi) {
    const errors = [];
    const warnings = [];

    // Validate code
    const codeValidation = validateCode(poi.code);
    if (!codeValidation.valid) {
        errors.push(...codeValidation.errors);
    }

    // Validate coordinates
    const coordValidation = validateCoordinates(poi.location);
    if (!coordValidation.valid) {
        errors.push(...coordValidation.errors);
    }

    // Validate radius
    const radiusValidation = validateRadius(poi.radius);
    if (!radiusValidation.valid) {
        errors.push(...radiusValidation.errors);
    }

    // Validate required fields
    if (!poi.name || typeof poi.name !== 'string' || poi.name.trim().length === 0) {
        errors.push('Name is required');
    }

    if (!poi.languageCode || typeof poi.languageCode !== 'string') {
        warnings.push('languageCode missing (will default to "vi")');
    }

    if (!poi.status) {
        warnings.push('status missing (will default to "APPROVED")');
    }

    // Check for legacy content field
    if (poi.content !== null && poi.content !== undefined) {
        warnings.push('Legacy content field present (should be null)');
    }

    // Validate priority
    if (poi.priority !== undefined && (typeof poi.priority !== 'number' || poi.priority < 0 || poi.priority > 10)) {
        warnings.push(`Priority should be 0-10: ${poi.priority}`);
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        poi: {
            code: codeValidation.code,
            coordinates: coordValidation.coordinates,
            radius: radiusValidation.radius
        }
    };
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in meters
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Check if a point is within a POI's geofence
 */
function isPointInGeofence(pointLat, pointLng, poiLat, poiLng, radius) {
    const distance = calculateDistance(pointLat, pointLng, poiLat, poiLng);
    return distance <= radius;
}

/**
 * Find duplicate POIs by code or coordinates
 */
function findDuplicates(pois, coordinateTolerance = 0.0001) {
    const duplicates = {
        byCode: [],
        byCoordinates: []
    };

    const codeMap = new Map();
    const coordMap = new Map();

    pois.forEach((poi, index) => {
        // Check code duplicates
        const code = poi.code.toUpperCase();
        if (codeMap.has(code)) {
            duplicates.byCode.push({
                code: poi.code,
                indices: [codeMap.get(code), index],
                pois: [pois[codeMap.get(code)], poi]
            });
        } else {
            codeMap.set(code, index);
        }

        // Check coordinate duplicates
        if (poi.location?.coordinates) {
            const [lng, lat] = poi.location.coordinates;
            const coordKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;

            if (coordMap.has(coordKey)) {
                const existingIndex = coordMap.get(coordKey);
                const [existingLng, existingLat] = pois[existingIndex].location.coordinates;
                const distance = calculateDistance(lat, lng, existingLat, existingLng);

                if (distance < coordinateTolerance * 111000) { // Convert degrees to meters
                    duplicates.byCoordinates.push({
                        coordinates: [lng, lat],
                        distance,
                        indices: [existingIndex, index],
                        pois: [pois[existingIndex], poi]
                    });
                }
            } else {
                coordMap.set(coordKey, index);
            }
        }
    });

    return duplicates;
}

/**
 * Generate a summary report for a POI collection
 */
function generateSummary(pois) {
    const summary = {
        total: pois.length,
        valid: 0,
        invalid: 0,
        byStatus: {},
        byPriority: {},
        radiusStats: {
            min: Infinity,
            max: -Infinity,
            avg: 0,
            total: 0
        },
        coordinateStats: {
            inVietnam: 0,
            outOfBounds: 0
        }
    };

    pois.forEach(poi => {
        const validation = validatePoi(poi);

        if (validation.valid) {
            summary.valid++;
        } else {
            summary.invalid++;
        }

        // Status distribution
        const status = poi.status || 'UNKNOWN';
        summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;

        // Priority distribution
        const priority = poi.priority || 0;
        summary.byPriority[priority] = (summary.byPriority[priority] || 0) + 1;

        // Radius stats
        if (typeof poi.radius === 'number' && poi.radius > 0) {
            summary.radiusStats.min = Math.min(summary.radiusStats.min, poi.radius);
            summary.radiusStats.max = Math.max(summary.radiusStats.max, poi.radius);
            summary.radiusStats.total += poi.radius;
        }

        // Coordinate stats
        if (poi.location?.coordinates) {
            const [lng, lat] = poi.location.coordinates;
            if (isInVietnam(lat, lng)) {
                summary.coordinateStats.inVietnam++;
            } else {
                summary.coordinateStats.outOfBounds++;
            }
        }
    });

    // Calculate average radius
    if (summary.total > 0) {
        summary.radiusStats.avg = Math.round(summary.radiusStats.total / summary.total);
    }

    return summary;
}

module.exports = {
    VIETNAM_BOUNDS,
    isInVietnam,
    validateCoordinates,
    validateRadius,
    validateCode,
    validatePoi,
    calculateDistance,
    isPointInGeofence,
    findDuplicates,
    generateSummary
};
