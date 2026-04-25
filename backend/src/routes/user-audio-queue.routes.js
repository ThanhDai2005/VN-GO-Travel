const express = require('express');
const router = express.Router();
const userAudioQueueController = require('../controllers/user-audio-queue.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

/**
 * User Audio Queue Routes
 * Per-user independent audio queue system
 */

// Enqueue audio for current user
router.post(
    '/enqueue',
    requireAuth,
    userAudioQueueController.enqueue
);

// Complete current audio and play next
router.post(
    '/complete',
    requireAuth,
    userAudioQueueController.complete
);

// Interrupt current audio
router.post(
    '/interrupt',
    requireAuth,
    userAudioQueueController.interrupt
);

// Cancel all audio and clear queue
router.post(
    '/cancel-all',
    requireAuth,
    userAudioQueueController.cancelAll
);

// Get current user's audio state
router.get(
    '/my-state',
    requireAuth,
    userAudioQueueController.getMyState
);

// Get system statistics (admin only)
router.get(
    '/stats',
    requireAuth,
    userAudioQueueController.getStats
);

module.exports = router;
