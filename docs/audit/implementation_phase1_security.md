# Phase 1: Critical Security Implementation

**Priority:** CRITICAL  
**Timeline:** 3-5 days  
**Status:** READY FOR IMPLEMENTATION

---

## 1. JWT EXPIRATION IMPLEMENTATION

### 1.1 Backend Changes

**File:** `backend/src/services/poi.service.js`

```javascript
// Line 697-702: Update generateQrScanTokenForAdmin
async generateQrScanTokenForAdmin(rawPoiId) {
    if (!rawPoiId || typeof rawPoiId !== 'string') {
        throw new AppError('POI id is required', 400);
    }
    if (!poiRepository.isValidObjectId(rawPoiId)) {
        throw new AppError('Invalid POI id', 400);
    }
    const doc = await poiRepository.findById(rawPoiId);
    if (!doc) {
        throw new AppError('POI not found', 404);
    }
    const code = String(doc.code || '').trim();
    
    // NEW: Add expiration (1 year for printed QR codes)
    const now = Math.floor(Date.now() / 1000);
    const oneYearInSeconds = 365 * 24 * 60 * 60;
    
    const token = jwt.sign(
        { 
            code, 
            type: 'static_secure_qr',
            iat: now,
            exp: now + oneYearInSeconds,
            version: 1 // For future token format changes
        },
        config.jwtSecret
    );
    
    const scanUrl = `${config.scanQrUrlBase}?t=${encodeURIComponent(token)}`;
    
    return { 
        token, 
        scanUrl, 
        permanent: false, // Changed from true
        expiresAt: new Date((now + oneYearInSeconds) * 1000).toISOString(),
        expiresInDays: 365
    };
}

// Line 708-731: Update generateQrScanTokenForOwner (same changes)
async generateQrScanTokenForOwner(rawPoiId, user) {
    if (!rawPoiId || typeof rawPoiId !== 'string') {
        throw new AppError('POI id is required', 400);
    }
    if (!poiRepository.isValidObjectId(rawPoiId)) {
        throw new AppError('Invalid POI id', 400);
    }
    const doc = await poiRepository.findById(rawPoiId);
    if (!doc) {
        throw new AppError('POI not found', 404);
    }

    if (String(doc.submittedBy) !== String(user._id)) {
        throw new AppError('Bạn không có quyền tạo mã QR cho địa điểm này.', 403);
    }

    const code = String(doc.code || '').trim();
    
    // NEW: Add expiration
    const now = Math.floor(Date.now() / 1000);
    const oneYearInSeconds = 365 * 24 * 60 * 60;
    
    const token = jwt.sign(
        { 
            code, 
            type: 'static_secure_qr',
            iat: now,
            exp: now + oneYearInSeconds,
            version: 1
        },
        config.jwtSecret
    );
    
    const scanUrl = `${config.scanQrUrlBase}?t=${encodeURIComponent(token)}`;
    
    return { 
        token, 
        scanUrl, 
        permanent: false,
        expiresAt: new Date((now + oneYearInSeconds) * 1000).toISOString(),
        expiresInDays: 365
    };
}
```

**File:** `backend/src/services/poi.service.js` (Line 738-754)

```javascript
// Update resolveQrScanToken - verification already handles exp automatically
async resolveQrScanToken(rawToken, user, req) {
    if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
        throw new AppError('token is required', 400);
    }

    const qrSecurityService = require('./qr-security.service');
    const accessControlService = require('./access-control.service');

    let decoded;
    try {
        decoded = jwt.verify(rawToken.trim(), config.jwtSecret);
        // jwt.verify automatically checks exp claim and throws if expired
    } catch (e) {
        // Track invalid QR scan for rate limiting
        const { trackInvalidQrScan } = require('../middlewares/advanced-rate-limit.middleware');
        await trackInvalidQrScan(req);
        
        // Provide user-friendly error message
        if (e.name === 'TokenExpiredError') {
            throw new AppError('QR code has expired. Please request a new QR code from the POI owner.', 401);
        }
        
        throw new AppError('Invalid or expired QR token', 401);
    }
    
    // ... rest of existing code unchanged ...
}
```

### 1.2 Database Migration

**File:** `backend/migrations/add-qr-token-expiration.js`

```javascript
/**
 * Migration: Add QR token expiration tracking
 * Run: node backend/migrations/add-qr-token-expiration.js
 */

const mongoose = require('mongoose');
const Poi = require('../src/models/poi.model');
const config = require('../src/config');

async function migrate() {
    try {
        await mongoose.connect(config.mongoUri);
        console.log('[MIGRATION] Connected to MongoDB');

        // Add qrTokenGeneratedAt field to track when QR was last generated
        const result = await Poi.updateMany(
            { qrTokenGeneratedAt: { $exists: false } },
            { $set: { qrTokenGeneratedAt: null } }
        );

        console.log(`[MIGRATION] Updated ${result.modifiedCount} POIs`);
        console.log('[MIGRATION] Migration completed successfully');
        
        process.exit(0);
    } catch (error) {
        console.error('[MIGRATION] Error:', error);
        process.exit(1);
    }
}

migrate();
```

**File:** `backend/src/models/poi.model.js` (Add field)

```javascript
// Line 28: Add after lastUpdated
qrTokenGeneratedAt: { type: Date, default: null }, // Track QR generation for expiration warnings
```

### 1.3 Admin Web UI Updates

**File:** `admin-web/src/components/QrCodeGenerator.jsx` (NEW FILE)

```jsx
import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, RefreshCw, AlertTriangle } from 'lucide-react';

export default function QrCodeGenerator({ poiId, poiName }) {
    const [qrData, setQrData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const generateQr = async () => {
        setLoading(true);
        setError(null);
        
        try {
            const response = await fetch(`/api/v1/admin/pois/${poiId}/qr-token`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to generate QR code');
            }
            
            const data = await response.json();
            setQrData(data.data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const downloadQr = () => {
        const svg = document.getElementById('qr-code-svg');
        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `qr-${poiName}.png`;
                a.click();
                URL.revokeObjectURL(url);
            });
        };
        
        img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
    };

    const isExpiringSoon = () => {
        if (!qrData?.expiresAt) return false;
        const expiryDate = new Date(qrData.expiresAt);
        const daysUntilExpiry = (expiryDate - new Date()) / (1000 * 60 * 60 * 24);
        return daysUntilExpiry < 30; // Warn if less than 30 days
    };

    return (
        <div className="qr-generator">
            <h3>QR Code Generator</h3>
            
            {!qrData && (
                <button 
                    onClick={generateQr} 
                    disabled={loading}
                    className="btn-primary"
                >
                    {loading ? 'Generating...' : 'Generate QR Code'}
                </button>
            )}
            
            {error && (
                <div className="alert alert-error">
                    {error}
                </div>
            )}
            
            {qrData && (
                <div className="qr-display">
                    <div className="qr-code-container">
                        <QRCodeSVG
                            id="qr-code-svg"
                            value={qrData.scanUrl}
                            size={256}
                            level="H"
                            includeMargin={true}
                        />
                    </div>
                    
                    <div className="qr-info">
                        <p><strong>POI:</strong> {poiName}</p>
                        <p><strong>Expires:</strong> {new Date(qrData.expiresAt).toLocaleDateString()}</p>
                        <p><strong>Days remaining:</strong> {qrData.expiresInDays}</p>
                        
                        {isExpiringSoon() && (
                            <div className="alert alert-warning">
                                <AlertTriangle size={16} />
                                <span>QR code expires in less than 30 days. Consider regenerating.</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="qr-actions">
                        <button onClick={downloadQr} className="btn-secondary">
                            <Download size={16} />
                            Download PNG
                        </button>
                        
                        <button onClick={generateQr} className="btn-secondary">
                            <RefreshCw size={16} />
                            Regenerate
                        </button>
                    </div>
                    
                    <div className="qr-url">
                        <label>Scan URL:</label>
                        <input 
                            type="text" 
                            value={qrData.scanUrl} 
                            readOnly 
                            onClick={(e) => e.target.select()}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
```

---

## 2. BACKEND QUOTA DAILY RESET

### 2.1 User Model Update

**File:** `backend/src/models/user.model.js`

```javascript
// Line 14: Update qrScanCount field
qrScanCount: { type: Number, default: 0, min: 0 },
qrScanLastResetDate: { type: String, default: null }, // Format: YYYY-MM-DD UTC
```

### 2.2 Repository Update

**File:** `backend/src/repositories/user.repository.js`

```javascript
// Add new method for daily reset
async resetQrScanCountIfNewDay(userId) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    const user = await User.findById(userId);
    if (!user) return null;
    
    // Reset if new day or never reset before
    if (user.qrScanLastResetDate !== today) {
        user.qrScanCount = 0;
        user.qrScanLastResetDate = today;
        await user.save();
        console.log(`[QR-QUOTA] Reset scan count for user ${userId} (new day: ${today})`);
    }
    
    return user;
}

// Update existing method
async incrementQrScanCountIfAllowed(userId, limit = 20) {
    const today = new Date().toISOString().split('T')[0];
    
    // First, reset count if new day
    await this.resetQrScanCountIfNewDay(userId);
    
    // Then increment with limit check
    const updated = await User.findOneAndUpdate(
        {
            _id: userId,
            isPremium: false,
            isActive: true,
            qrScanCount: { $lt: limit }
        },
        { 
            $inc: { qrScanCount: 1 },
            $set: { qrScanLastResetDate: today }
        },
        { new: true }
    );
    
    if (!updated) {
        console.log(`[QR-QUOTA] User ${userId} exceeded daily limit (${limit})`);
    }
    
    return updated;
}

// Add bulk reset for all users (run daily via cron)
async resetAllUsersQrScanCount() {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await User.updateMany(
        { 
            qrScanLastResetDate: { $ne: today },
            isPremium: false
        },
        { 
            $set: { 
                qrScanCount: 0, 
                qrScanLastResetDate: today 
            } 
        }
    );
    
    console.log(`[QR-QUOTA] Daily reset: ${result.modifiedCount} users reset`);
    return result;
}
```

### 2.3 Cron Job for Daily Reset

**File:** `backend/src/jobs/daily-qr-reset.job.js` (NEW FILE)

```javascript
const cron = require('node-cron');
const userRepository = require('../repositories/user.repository');

/**
 * Daily QR Scan Count Reset Job
 * Runs at 00:01 UTC every day
 */
function startDailyQrResetJob() {
    // Run at 00:01 UTC daily
    cron.schedule('1 0 * * *', async () => {
        console.log('[CRON] Starting daily QR scan count reset...');
        
        try {
            const result = await userRepository.resetAllUsersQrScanCount();
            console.log(`[CRON] Daily QR reset completed: ${result.modifiedCount} users`);
        } catch (error) {
            console.error('[CRON] Daily QR reset failed:', error);
        }
    }, {
        timezone: 'UTC'
    });
    
    console.log('[CRON] Daily QR reset job scheduled (00:01 UTC)');
}

module.exports = { startDailyQrResetJob };
```

**File:** `backend/src/server.js` (Add to startup)

```javascript
// Add after other imports
const { startDailyQrResetJob } = require('./jobs/daily-qr-reset.job');

// Add after server starts
startDailyQrResetJob();
```

---

## 3. DEVICE-BASED RATE LIMITING

### 3.1 Middleware Update

**File:** `backend/src/middlewares/advanced-rate-limit.middleware.js`

```javascript
// Add after line 128 (after invalidQrRateLimiter)

/**
 * Device-based QR scan rate limiter (15/min per device)
 * Prevents guest users from bypassing IP limits by using VPN
 */
const qrScanDeviceRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 15,
    message: 'Too many QR scan attempts from this device, please try again later',
    prefix: 'rl:qr:device:',
    keyGenerator: (req) => {
        // Prioritize device ID over IP
        const deviceId = req.headers['x-device-id'];
        if (deviceId && deviceId.length > 10) {
            return `device:${deviceId}`;
        }
        // Fallback to IP if no device ID
        return req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    }
});

// Export at bottom
module.exports = {
    globalRateLimiter,
    qrScanRateLimiter,
    qrScanUserRateLimiter,
    qrScanDeviceRateLimiter, // NEW
    invalidQrRateLimiter,
    authRateLimiter,
    purchaseRateLimiter,
    trackInvalidQrScan,
    createRateLimiter
};
```

### 3.2 Route Update

**File:** `backend/src/routes/poi.routes.js`

```javascript
const { 
    qrScanRateLimiter, 
    qrScanUserRateLimiter,
    qrScanDeviceRateLimiter // NEW
} = require('../middlewares/advanced-rate-limit.middleware');

// Update scan route (add device limiter)
router.post(
    '/scan',
    optionalAuth,
    qrScanRateLimiter,        // IP-based: 20/min
    qrScanUserRateLimiter,    // User-based: 10/min
    qrScanDeviceRateLimiter,  // NEW: Device-based: 15/min
    poiController.scan
);
```

### 3.3 Mobile App Update

**File:** `Services/ApiService.cs`

```csharp
// Ensure device ID is sent with all requests
public class ApiService
{
    private readonly HttpClient _client;
    private readonly IDeviceIdProvider _deviceId;
    
    public async Task<HttpResponseMessage> PostAsJsonAsync<T>(string endpoint, T data, CancellationToken ct = default)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = JsonContent.Create(data)
        };
        
        // Add device ID header for rate limiting
        request.Headers.Add("X-Device-Id", await _deviceId.GetDeviceIdAsync());
        
        return await _client.SendAsync(request, ct);
    }
}
```

---

## 4. TESTING CHECKLIST

### 4.1 JWT Expiration Tests

```bash
# Test 1: Generate QR and verify expiration is set
curl -X GET http://localhost:3000/api/v1/admin/pois/{POI_ID}/qr-token \
  -H "Authorization: Bearer {ADMIN_TOKEN}"

# Expected: Response includes expiresAt and expiresInDays

# Test 2: Scan with expired token (manually create expired JWT)
curl -X POST http://localhost:3000/api/v1/pois/scan \
  -H "Content-Type: application/json" \
  -d '{"token": "{EXPIRED_JWT}"}'

# Expected: 401 error with "QR code has expired" message
```

### 4.2 Daily Quota Reset Tests

```bash
# Test 1: Scan 20 times in one day
for i in {1..20}; do
  curl -X POST http://localhost:3000/api/v1/pois/scan \
    -H "Authorization: Bearer {USER_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"token": "{VALID_JWT}"}'
done

# Expected: First 20 succeed, 21st fails with quota error

# Test 2: Wait for next day (or manually trigger cron)
node backend/src/jobs/daily-qr-reset.job.js

# Test 3: Scan again
curl -X POST http://localhost:3000/api/v1/pois/scan \
  -H "Authorization: Bearer {USER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"token": "{VALID_JWT}"}'

# Expected: Success (quota reset)
```

### 4.3 Device Rate Limiting Tests

```bash
# Test 1: Scan 15 times with same device ID
for i in {1..16}; do
  curl -X POST http://localhost:3000/api/v1/pois/scan \
    -H "X-Device-Id: test-device-123" \
    -H "Content-Type: application/json" \
    -d '{"token": "{VALID_JWT}"}'
done

# Expected: First 15 succeed, 16th fails with rate limit error

# Test 2: Scan with different device ID
curl -X POST http://localhost:3000/api/v1/pois/scan \
  -H "X-Device-Id: test-device-456" \
  -H "Content-Type: application/json" \
  -d '{"token": "{VALID_JWT}"}'

# Expected: Success (different device)
```

---

## 5. DEPLOYMENT STEPS

### 5.1 Pre-Deployment

1. **Backup Database**
```bash
mongodump --uri="mongodb://..." --out=backup-$(date +%Y%m%d)
```

2. **Run Migration**
```bash
node backend/migrations/add-qr-token-expiration.js
```

3. **Test in Staging**
```bash
# Deploy to staging
git checkout staging
git merge feature/jwt-expiration
npm run deploy:staging

# Run test suite
npm run test:integration
```

### 5.2 Deployment

1. **Deploy Backend**
```bash
git checkout main
git merge feature/jwt-expiration
npm run deploy:production
```

2. **Verify Cron Job**
```bash
# Check logs for cron job startup
tail -f logs/app.log | grep CRON
```

3. **Monitor Rate Limiting**
```bash
# Check Redis for rate limit keys
redis-cli keys "rl:qr:*"
```

### 5.3 Post-Deployment

1. **Regenerate All QR Codes** (Optional, for immediate expiration)
```bash
# Admin action: Bulk regenerate QR codes
node backend/scripts/regenerate-all-qr-codes.js
```

2. **Monitor Error Rates**
```bash
# Check for 401 errors (expired tokens)
tail -f logs/app.log | grep "401"
```

3. **Notify POI Owners**
```
Subject: QR Code Expiration Notice

Dear POI Owner,

We've implemented QR code expiration for enhanced security. 
Your QR codes will now expire after 1 year.

Please regenerate your QR codes from the admin panel if needed.

Thank you!
```

---

## 6. ROLLBACK PLAN

If issues arise:

1. **Revert Code**
```bash
git revert {COMMIT_HASH}
git push origin main
```

2. **Restore Database** (if migration caused issues)
```bash
mongorestore --uri="mongodb://..." backup-{DATE}
```

3. **Clear Rate Limit Cache**
```bash
redis-cli FLUSHDB
```

---

## 7. SUCCESS METRICS

After deployment, monitor:

- ✅ JWT expiration errors < 1% of scans
- ✅ Daily quota reset runs successfully every day
- ✅ Device rate limiting blocks < 0.5% of legitimate scans
- ✅ No increase in 500 errors
- ✅ QR scan success rate > 95%

---

**Implementation Status:** READY  
**Estimated Time:** 3-5 days  
**Risk Level:** LOW (backward compatible, graceful degradation)
