const poiContentService = require('../services/poi-content.service');
const translationSessionService = require('../services/translation-session.service');

/**
 * Get all translations for a POI
 */
exports.getAll = async (req, res, next) => {
    try {
        const { code } = req.params;
        const translations = await poiContentService.getAllContentForPoi(code);
        res.status(200).json({
            success: true,
            data: translations
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get translation history
 */
exports.getHistory = async (req, res, next) => {
    try {
        const { code, lang_code } = req.params;
        const history = await poiContentService.getHistory(code, lang_code);
        res.status(200).json({
            success: true,
            data: history
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create or update a translation override
 */
exports.upsert = async (req, res, next) => {
    try {
        const { code, lang_code } = req.params;
        const { expectedBaseVersion } = req.body;

        const translation = await poiContentService.upsertContent(
            code, 
            lang_code, 
            req.body, 
            req.user._id,
            { expectedBaseVersion, req } // Pass req for rate limiting
        );
        
        // Release lock after successful save
        await translationSessionService.releaseLock(code, lang_code, req.user._id);

        res.status(200).json({
            success: true,
            data: translation
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Heartbeat to keep session alive
 */
exports.heartbeat = async (req, res, next) => {
    try {
        const { code, lang_code } = req.params;
        await translationSessionService.heartbeat(code, lang_code, req.user._id);
        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

/**
 * Rollback to specific version
 */
exports.rollback = async (req, res, next) => {
    try {
        const { code, lang_code, version } = req.params;
        const result = await poiContentService.rollback(code, lang_code, Number(version), req.user._id);
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Acquire edit lock
 */
exports.acquireLock = async (req, res, next) => {
    try {
        const { code, lang_code } = req.params;
        const result = await translationSessionService.acquireLock(
            code, 
            lang_code, 
            req.user._id, 
            req.user.name || req.user.email
        );
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Release edit lock
 */
exports.releaseLock = async (req, res, next) => {
    try {
        const { code, lang_code } = req.params;
        await translationSessionService.releaseLock(code, lang_code, req.user._id);
        res.status(200).json({
            success: true,
            message: 'Lock released'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete a translation override (Soft Delete)
 */
exports.remove = async (req, res, next) => {
    try {
        const { code, lang_code } = req.params;
        const success = await poiContentService.deleteContent(code, lang_code, req.user._id);
        res.status(200).json({
            success: true,
            message: success ? 'Translation removed' : 'Translation not found'
        });
    } catch (error) {
        next(error);
    }
};
