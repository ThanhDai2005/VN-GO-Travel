/**
 * IP Helper Utilities
 * Normalize IPv6 addresses to IPv4 for consistency
 */

/**
 * Normalize IP address to IPv4 format
 * Converts IPv6 loopback (::1, ::ffff:127.0.0.1) to IPv4 (127.0.0.1)
 *
 * @param {string} ip - IP address (IPv4 or IPv6)
 * @returns {string} - Normalized IPv4 address
 */
function normalizeIPv4(ip) {
    if (!ip || typeof ip !== 'string') {
        return '0.0.0.0';
    }

    const trimmed = ip.trim();

    // IPv6 loopback → IPv4 loopback
    if (trimmed === '::1' || trimmed === '::ffff:127.0.0.1') {
        return '127.0.0.1';
    }

    // IPv6-mapped IPv4 (::ffff:192.168.1.1 → 192.168.1.1)
    if (trimmed.startsWith('::ffff:')) {
        const ipv4Part = trimmed.substring(7);
        // Validate it's a valid IPv4
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ipv4Part)) {
            return ipv4Part;
        }
    }

    // Pure IPv6 address (not mapped) - convert to a stable IPv4 representation
    // Use hash of IPv6 to generate consistent IPv4 in private range (10.x.x.x)
    if (trimmed.includes(':')) {
        // Simple hash: sum of character codes modulo 256
        let hash = 0;
        for (let i = 0; i < trimmed.length; i++) {
            hash = (hash + trimmed.charCodeAt(i)) % 256;
        }
        const octet2 = hash;
        const octet3 = (hash * 7) % 256;
        const octet4 = (hash * 13) % 256;
        return `10.${octet2}.${octet3}.${octet4}`;
    }

    // Already IPv4 - return as is
    return trimmed;
}

/**
 * Get client IP from request (normalized to IPv4)
 * Checks x-forwarded-for, x-real-ip, and socket.remoteAddress
 *
 * @param {object} req - Express request object
 * @returns {string} - Client IPv4 address
 */
function getClientIP(req) {
    // Check x-forwarded-for (proxy/load balancer)
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        const firstIP = forwarded.split(',')[0].trim();
        return normalizeIPv4(firstIP);
    }

    // Check x-real-ip (nginx)
    const realIP = req.headers['x-real-ip'];
    if (typeof realIP === 'string' && realIP.trim()) {
        return normalizeIPv4(realIP);
    }

    // Check req.ip (Express with trust proxy)
    if (req.ip) {
        return normalizeIPv4(req.ip);
    }

    // Fallback to socket.remoteAddress
    const socketIP = req.socket?.remoteAddress || req.connection?.remoteAddress;
    if (socketIP) {
        return normalizeIPv4(socketIP);
    }

    return '0.0.0.0';
}

module.exports = {
    normalizeIPv4,
    getClientIP
};
