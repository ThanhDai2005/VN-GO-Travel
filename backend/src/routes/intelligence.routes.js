const express = require('express');
const intelligenceController = require('../controllers/intelligence.controller');
const { intelligenceIngestAuth } = require('../middlewares/intelligence-ingest.middleware');

const router = express.Router();

router.post('/batch', intelligenceIngestAuth, intelligenceController.postBatch);
router.post('/single', intelligenceIngestAuth, intelligenceController.postSingle);

module.exports = router;
