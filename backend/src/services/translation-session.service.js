const { TranslationSession } = require('../models/translation-safety.model');
const { AppError } = require('../middlewares/error.middleware');

class TranslationSessionService {
  /**
   * Attempt to lock a translation for editing
   * @param {string} poiCode 
   * @param {string} lang_code 
   * @param {string} userId 
   * @param {string} userName 
   */
  async acquireLock(poiCode, lang_code, userId, userName) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60000); // 5 minutes TTL

    try {
      // Find existing session
      const existing = await TranslationSession.findOne({ poiCode, lang_code });

      if (existing) {
        // If it's the same user, just renew
        if (String(existing.userId) === String(userId)) {
          existing.lastHeartbeatAt = now;
          existing.expiresAt = expiresAt;
          await existing.save();
          return { status: 'acquired', session: existing };
        }

        // STALE SESSION CHECK: If last heartbeat > 60s ago, consider DEAD
        const isStale = (now - existing.lastHeartbeatAt) > 60000;

        if (isStale || existing.expiresAt < now) {
          await TranslationSession.deleteOne({ _id: existing._id });
        } else {
          // Locked by another active user
          return { 
            status: 'locked', 
            user: existing.userName || 'Another Admin',
            expiresAt: existing.expiresAt 
          };
        }
      }

      // Create new session
      const session = await TranslationSession.create({
        poiCode,
        lang_code,
        userId,
        userName,
        lastHeartbeatAt: now,
        expiresAt
      });

      return { status: 'acquired', session };
    } catch (error) {
      if (error.code === 11000) {
          return { status: 'locked', user: 'Another Admin' };
      }
      throw error;
    }
  }

  /**
   * Heartbeat to keep session alive
   */
  async heartbeat(poiCode, lang_code, userId) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60000);

    const result = await TranslationSession.findOneAndUpdate(
        { poiCode, lang_code, userId },
        { 
            lastHeartbeatAt: now, 
            expiresAt 
        },
        { new: true }
    );

    if (!result) throw new AppError('Session expired or lost', 403);
    return result;
  }

  /**
   * Release a lock manually
   */
  async releaseLock(poiCode, lang_code, userId) {
    await TranslationSession.deleteOne({ poiCode, lang_code, userId });
  }

  /**
   * Check session status without acquiring
   */
  async checkSession(poiCode, lang_code) {
    const session = await TranslationSession.findOne({ poiCode, lang_code });
    if (session && session.expiresAt > new Date()) {
      return { status: 'locked', user: session.userName };
    }
    return { status: 'free' };
  }
}

module.exports = new TranslationSessionService();
