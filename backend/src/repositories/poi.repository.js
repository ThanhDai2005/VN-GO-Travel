const mongoose = require('mongoose');
const Poi = require('../models/poi.model');
const { POI_STATUS } = require('../constants/poi-status');

class PoiRepository {
    _publicVisibilityFilter() {
        return {
            $or: [
                { status: POI_STATUS.APPROVED },
                { status: { $exists: false } }
            ]
        };
    }

    async findNearby(lng, lat, radiusStr, limitStr, pageStr) {
        const radius = parseInt(radiusStr) || 5000;
        const limit = parseInt(limitStr) || 10;
        const page = parseInt(pageStr) || 1;
        const skip = (page - 1) * limit;

        return await Poi.find({
            $and: [
                this._publicVisibilityFilter(),
                {
                    location: {
                        $near: {
                            $geometry: {
                                type: 'Point',
                                coordinates: [parseFloat(lng), parseFloat(lat)]
                            },
                            $maxDistance: radius
                        }
                    }
                }
            ]
        })
            .skip(skip)
            .limit(limit);
    }

    async findByCode(code, { publicOnly = false } = {}) {
        const codeFilter = { code: { $regex: new RegExp(`^${code}$`, 'i') } };
        if (publicOnly) {
            return await Poi.findOne({
                $and: [codeFilter, this._publicVisibilityFilter()]
            });
        }
        return await Poi.findOne(codeFilter);
    }

    async create(data) {
        return await Poi.create(data);
    }

    async updateByCode(code, update) {
        return await Poi.findOneAndUpdate({ code }, update, { new: true, runValidators: true });
    }

    async deleteByCode(code) {
        return await Poi.findOneAndDelete({ code });
    }

    isValidObjectId(id) {
        return mongoose.Types.ObjectId.isValid(id);
    }

    async findById(id) {
        if (!this.isValidObjectId(id)) {
            return null;
        }
        return await Poi.findById(id);
    }

    async findPending({ limit, skip }) {
        return await Poi.find({ status: POI_STATUS.PENDING })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('submittedBy', 'email');
    }

    async findBySubmitter(userId, { limit, skip }) {
        return await Poi.find({ submittedBy: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('submittedBy', 'email');
    }

    async countBySubmitter(userId) {
        return await Poi.countDocuments({ submittedBy: userId });
    }

    async countPending() {
        return await Poi.countDocuments({ status: POI_STATUS.PENDING });
    }

    async findAllForAdmin({ limit, skip, filter = {}, sort = { updatedAt: -1 } }) {
        return await Poi.find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit);
    }

    async countAll(filter = {}) {
        return await Poi.countDocuments(filter);
    }

    async transitionPendingToApproved(id, options = {}) {
        return await Poi.findOneAndUpdate(
            { _id: id, status: POI_STATUS.PENDING },
            { $set: { status: POI_STATUS.APPROVED, rejectionReason: null } },
            { new: true, runValidators: true, ...options }
        );
    }

    async transitionPendingToRejected(id, reason, options = {}) {
        return await Poi.findOneAndUpdate(
            { _id: id, status: POI_STATUS.PENDING },
            { $set: { status: POI_STATUS.REJECTED, rejectionReason: reason } },
            { new: true, runValidators: true, ...options }
        );
    }

    async updateById(id, update) {
        return await Poi.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    }

    async deleteById(id) {
        return await Poi.findByIdAndDelete(id);
    }

    /**
     * Find POIs by array of codes
     * Used by zone download and sync operations
     */
    async findByCodes(codes) {
        if (!Array.isArray(codes) || codes.length === 0) {
            return [];
        }
        return await Poi.find({ code: { $in: codes } });
    }
}

module.exports = new PoiRepository();
