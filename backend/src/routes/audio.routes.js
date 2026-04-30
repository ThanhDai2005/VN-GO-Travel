const express = require('express');
const audioService = require('../services/audio.service');
const { protect } = require('../middlewares/auth.middleware');

const rateLimit = require('express-rate-limit');

const router = express.Router();

// Cost Protection: Limit TTS requests to 20 per minute per IP
const generateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { success: false, error: 'Too many generation requests. Please wait a minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * @route   GET /api/v1/audio/analytics
 * @desc    Get audio system usage insights
 */
router.get('/analytics', async (req, res, next) => {
    try {
        const stats = await audioService.getAnalytics();
        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   GET /api/v1/audio/stats
 * @desc    Get lean audio stats for admin
 */
router.get('/stats', async (req, res, next) => {
    try {
        const stats = await audioService.getLeanStats();
        res.status(200).json({ success: true, data: stats });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/v1/audio/cleanup
 * @desc    Manual trigger for orphan file cleanup
 */
router.post('/cleanup', async (req, res, next) => {
    try {
        const deleted = await audioService.cleanupOrphans();
        res.status(200).json({ success: true, deletedCount: deleted });
    } catch (error) {
        next(error);
    }
});
/**
 * @route   POST /api/v1/audio/play
 * @desc    Track audio playback for analytics
 */
router.post('/play', async (req, res, next) => {
    try {
        const { poiCode, hash, duration, completed } = req.body;
        if (!hash) return res.status(400).json({ success: false, error: 'Hash required' });
        
        // Pass userId if available, else anonymous
        const userId = req.user ? req.user.id : 'anonymous';
        
        const tracked = await audioService.trackPlayback({ 
            poiCode, 
            audioHash: hash, 
            duration: duration || 0, 
            completed: !!completed,
            userId
        });
        
        res.status(200).json({ success: true, tracked });
    } catch (error) {
        next(error);
    }
});

router.post('/generate', generateLimiter, (req, res, next) => {
    req.setTimeout(60000); // 60 seconds
    next();
}, async (req, res, next) => {
    try {
        const { text, language, voice, version, poiCode } = req.body;
        
        const result = await audioService.generateAudio({ 
            text, 
            language, 
            voice, 
            version: version ? parseInt(version) : 1,
            poiCode 
        });
        
        res.status(200).json({
            success: true,
            data: {
                audioUrl: result.audioUrl,
                cached: result.cached
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * @route   POST /api/v1/audio/play-event
 * @desc    Track lean audio play event
 */
router.post('/play-event', async (req, res, next) => {
    try {
        const { poiCode, zoneCode, duration, completed } = req.body;
        const userId = req.user ? req.user.id : 'anonymous';
        
        await audioService.trackLeanPlayback({
            poiCode,
            zoneCode,
            duration,
            completed,
            userId
        });
        
        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
