# 🔥 FAILURE ANALYSIS & RECOVERY

**Date:** 2026-04-23  
**Version:** 1.0  
**Purpose:** Technical Defense - Failure Scenarios & Recovery Strategies

---

## 📋 TABLE OF CONTENTS

1. [Database Failures](#1-database-failures)
2. [Network Failures](#2-network-failures)
3. [Cache Failures](#3-cache-failures)
4. [Service Failures](#4-service-failures)
5. [Security Incidents](#5-security-incidents)
6. [Data Corruption](#6-data-corruption)
7. [Recovery Procedures](#7-recovery-procedures)

---

## 1. DATABASE FAILURES

### 1.1 MongoDB Connection Lost

**Scenario:** MongoDB server becomes unreachable

**Symptoms:**
- API returns 500 errors
- "MongoNetworkError: connection refused"
- All database operations fail

**Impact:**
- **Severity:** CRITICAL
- **Affected:** All users (100%)
- **Downtime:** Until MongoDB restored

**Root Causes:**
- MongoDB server crashed
- Network partition
- Firewall rules changed
- Connection pool exhausted

**Immediate Response:**

```javascript
// Mongoose auto-reconnect (already implemented)
mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    maxPoolSize: 100,
    minPoolSize: 10,
    retryWrites: true,
    retryReads: true
});

// Connection error handler
mongoose.connection.on('error', (err) => {
    logger.error('[MongoDB] Connection error:', err);
    // Alert ops team
    alertOpsTeam('MongoDB connection lost');
});

// Reconnection handler
mongoose.connection.on('reconnected', () => {
    logger.info('[MongoDB] Reconnected successfully');
});
```

**Recovery Steps:**

1. **Check MongoDB Status** (30 seconds)
   ```bash
   # Check if MongoDB is running
   systemctl status mongod
   
   # Check MongoDB logs
   tail -f /var/log/mongodb/mongod.log
   ```

2. **Restart MongoDB** (1 minute)
   ```bash
   systemctl restart mongod
   ```

3. **Verify Connection** (30 seconds)
   ```bash
   mongo --eval "db.adminCommand('ping')"
   ```

4. **Monitor Recovery** (2 minutes)
   ```bash
   # Watch backend logs
   pm2 logs backend
   
   # Check error rate
   curl http://localhost:3000/api/v1/admin/monitoring/health
   ```

**Prevention:**
- ✅ MongoDB replica set (auto-failover)
- ✅ Connection pooling (reuse connections)
- ✅ Health checks (detect failures early)
- ✅ Monitoring alerts (PagerDuty/Slack)

**Expected Recovery Time:** 2-5 minutes

---

### 1.2 MongoDB Disk Full

**Scenario:** MongoDB disk space reaches 100%

**Symptoms:**
- Write operations fail
- "No space left on device"
- Read operations still work

**Impact:**
- **Severity:** HIGH
- **Affected:** Write operations (purchases, scans)
- **Downtime:** Until disk space freed

**Immediate Response:**

```bash
# Check disk usage
df -h

# Find large files
du -sh /var/lib/mongodb/*

# Delete old logs
find /var/log/mongodb -name "*.log" -mtime +7 -delete

# Compact database (if needed)
mongo admin --eval "db.runCommand({compact: 'system_events'})"
```

**Recovery Steps:**

1. **Free Disk Space** (5 minutes)
   - Delete old system_events (TTL index auto-deletes after 30 days)
   - Delete old logs
   - Compact collections

2. **Increase Disk Size** (10 minutes)
   - MongoDB Atlas: Upgrade tier
   - Self-hosted: Add disk volume

3. **Verify Writes** (1 minute)
   ```bash
   # Test write operation
   mongo vngo --eval "db.test.insert({test: 1})"
   ```

**Prevention:**
- ✅ TTL indexes (auto-delete old events)
- ✅ Disk usage alerts (> 80%)
- ✅ Log rotation (delete logs > 7 days)
- ✅ Regular compaction (monthly)

**Expected Recovery Time:** 5-15 minutes

---

### 1.3 MongoDB Replica Set Failure

**Scenario:** Primary node fails, replica set elects new primary

**Symptoms:**
- Brief write unavailability (5-10 seconds)
- "Not master" errors
- Automatic failover

**Impact:**
- **Severity:** MEDIUM
- **Affected:** Write operations (5-10 seconds)
- **Downtime:** 5-10 seconds (auto-recovery)

**Automatic Recovery:**

```javascript
// Mongoose handles replica set failover automatically
mongoose.connect(mongoUri, {
    replicaSet: 'rs0',
    readPreference: 'primaryPreferred', // Fallback to secondary
    retryWrites: true
});
```

**What Happens:**

```
Time 0s: Primary node crashes
Time 1s: Replica set detects failure
Time 3s: Election starts
Time 5s: New primary elected
Time 6s: Writes resume
```

**Recovery Steps:**

1. **Monitor Failover** (automatic)
   - Mongoose auto-reconnects to new primary
   - No manual intervention needed

2. **Investigate Failed Node** (after failover)
   ```bash
   # Check failed node logs
   ssh failed-node
   tail -f /var/log/mongodb/mongod.log
   ```

3. **Restore Failed Node** (when ready)
   ```bash
   # Restart MongoDB
   systemctl restart mongod
   
   # Node rejoins replica set automatically
   ```

**Prevention:**
- ✅ 3-node replica set (2 can fail)
- ✅ Monitoring (detect failures)
- ✅ Auto-failover (built-in)

**Expected Recovery Time:** 5-10 seconds (automatic)

---

## 2. NETWORK FAILURES

### 2.1 Client Network Disconnection

**Scenario:** Mobile app loses internet connection

**Symptoms:**
- API requests timeout
- "Network request failed"
- User sees error message

**Impact:**
- **Severity:** LOW (user-specific)
- **Affected:** Individual user
- **Downtime:** Until network restored

**Client-Side Handling:**

```csharp
// Mobile app network detection
public class NetworkService
{
    public async Task<bool> IsConnectedAsync()
    {
        var connectivity = Connectivity.Current;
        return connectivity.NetworkAccess == NetworkAccess.Internet;
    }

    public async Task<T> RetryOnNetworkErrorAsync<T>(
        Func<Task<T>> operation,
        int maxRetries = 3
    )
    {
        for (int i = 0; i < maxRetries; i++)
        {
            try
            {
                if (!await IsConnectedAsync())
                {
                    throw new NetworkException("No internet connection");
                }

                return await operation();
            }
            catch (HttpRequestException ex)
            {
                if (i == maxRetries - 1) throw;
                
                // Exponential backoff
                await Task.Delay(1000 * (int)Math.Pow(2, i));
            }
        }

        throw new NetworkException("Max retries exceeded");
    }
}
```

**User Experience:**

```
1. User scans QR code
2. Network request fails
3. App shows: "Network error. Retrying..."
4. Auto-retry 3 times (1s, 2s, 4s delays)
5. If still fails: "Please check your internet connection"
6. User can retry manually
```

**Recovery:**
- ✅ Automatic retry (3 attempts)
- ✅ Exponential backoff (1s, 2s, 4s)
- ✅ User-friendly error message
- ✅ Manual retry button

**Expected Recovery Time:** Automatic when network restored

---

### 2.2 Backend Network Partition

**Scenario:** Backend loses connection to MongoDB/Redis

**Symptoms:**
- Backend can't reach database
- Health check fails
- Load balancer removes instance

**Impact:**
- **Severity:** MEDIUM
- **Affected:** Requests to affected instance
- **Downtime:** Until network restored

**Load Balancer Handling:**

```
┌──────────────┐
│ Load Balancer│
└──────┬───────┘
       │
   ┌───┴───┬───────┬───────┐
   │       │       │       │
┌──▼───┐ ┌─▼────┐ ┌─▼────┐ ┌─▼────┐
│ BE#1 │ │ BE#2 │ │ BE#3 │ │ BE#4 │
│  ✅  │ │  ✅  │ │  ❌  │ │  ✅  │
└──────┘ └──────┘ └──────┘ └──────┘
                   Network
                   Partition
```

**Health Check:**

```javascript
// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        // Check MongoDB
        await mongoose.connection.db.admin().ping();
        
        // Check Redis
        await redis.ping();
        
        res.status(200).json({ status: 'healthy' });
    } catch (error) {
        res.status(503).json({ status: 'unhealthy', error: error.message });
    }
});
```

**Load Balancer Config:**

```nginx
upstream backend {
    server backend1:3000 max_fails=3 fail_timeout=30s;
    server backend2:3000 max_fails=3 fail_timeout=30s;
    server backend3:3000 max_fails=3 fail_timeout=30s;
    server backend4:3000 max_fails=3 fail_timeout=30s;
}

# Health check
location /health {
    proxy_pass http://backend;
    proxy_connect_timeout 2s;
    proxy_read_timeout 2s;
}
```

**Recovery:**
- ✅ Load balancer detects failure (health check)
- ✅ Removes unhealthy instance from pool
- ✅ Routes traffic to healthy instances
- ✅ Re-adds instance when healthy

**Expected Recovery Time:** 30 seconds (automatic)

---

## 3. CACHE FAILURES

### 3.1 Redis Connection Lost

**Scenario:** Redis server becomes unreachable

**Symptoms:**
- Cache operations fail
- Rate limiting disabled
- Slower API responses

**Impact:**
- **Severity:** MEDIUM
- **Affected:** Performance (cache miss)
- **Downtime:** Graceful degradation

**Graceful Degradation:**

```javascript
// Redis with fallback
class CacheService {
    async get(key) {
        try {
            return await redis.get(key);
        } catch (error) {
            logger.warn('[Cache] Redis unavailable, using in-memory fallback');
            return inMemoryCache.get(key);
        }
    }

    async set(key, value, ttl) {
        try {
            await redis.set(key, value, 'EX', ttl);
        } catch (error) {
            logger.warn('[Cache] Redis unavailable, using in-memory fallback');
            inMemoryCache.set(key, value, ttl);
        }
    }
}
```

**Rate Limiting Fallback:**

```javascript
// Rate limiting with fallback
const rateLimiter = (req, res, next) => {
    if (req.skipRateLimit) return next(); // Demo mode

    try {
        // Try Redis-based rate limiting
        const key = `rl:${req.ip}`;
        const count = await redis.incr(key);
        await redis.expire(key, 60);

        if (count > 100) {
            return res.status(429).json({ error: 'Rate limit exceeded' });
        }
    } catch (error) {
        // Fallback to in-memory rate limiting
        logger.warn('[RateLimit] Redis unavailable, using in-memory fallback');
        
        const count = inMemoryRateLimiter.increment(req.ip);
        if (count > 100) {
            return res.status(429).json({ error: 'Rate limit exceeded' });
        }
    }

    next();
};
```

**Recovery:**
- ✅ Automatic fallback to in-memory cache
- ✅ System continues working (slower)
- ✅ No user-facing errors
- ✅ Auto-reconnect when Redis available

**Expected Recovery Time:** Immediate (graceful degradation)

---

## 4. SERVICE FAILURES

### 4.1 TTS API Failure

**Scenario:** Text-to-Speech API becomes unavailable

**Symptoms:**
- Audio generation fails
- "TTS service unavailable"
- Users can't play audio

**Impact:**
- **Severity:** MEDIUM
- **Affected:** Audio playback
- **Downtime:** Until TTS restored or fallback used

**Fallback Strategy:**

```javascript
// TTS with fallback
class TTSService {
    async generateAudio(text, language) {
        try {
            // Try primary TTS provider
            return await primaryTTS.generate(text, language);
        } catch (error) {
            logger.warn('[TTS] Primary provider failed, trying fallback');
            
            try {
                // Try fallback TTS provider
                return await fallbackTTS.generate(text, language);
            } catch (fallbackError) {
                logger.error('[TTS] All providers failed');
                
                // Return text-only response
                return {
                    audio: null,
                    text: text,
                    fallback: true,
                    message: 'Audio unavailable. Showing text narration.'
                };
            }
        }
    }
}
```

**User Experience:**

```
1. User taps "Play Audio"
2. TTS API fails
3. App shows: "Audio unavailable. Showing text narration."
4. User sees text narration instead
5. User can retry audio later
```

**Recovery:**
- ✅ Fallback to secondary TTS provider
- ✅ Text-only fallback (always works)
- ✅ User-friendly error message
- ✅ Retry option

**Expected Recovery Time:** Immediate (text fallback)

---

### 4.2 Backend Server Crash

**Scenario:** Node.js process crashes

**Symptoms:**
- Server stops responding
- PM2 restarts process
- Brief downtime (5-10 seconds)

**Impact:**
- **Severity:** LOW (with PM2)
- **Affected:** Requests during restart
- **Downtime:** 5-10 seconds

**PM2 Auto-Restart:**

```javascript
// PM2 ecosystem config
module.exports = {
    apps: [{
        name: 'vngo-backend',
        script: './src/server.js',
        instances: 4, // Cluster mode
        exec_mode: 'cluster',
        watch: false,
        max_memory_restart: '1G',
        error_file: './logs/error.log',
        out_file: './logs/out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
        env: {
            NODE_ENV: 'production'
        },
        // Auto-restart on crash
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s'
    }]
};
```

**Crash Handling:**

```
Time 0s: Process crashes (uncaught exception)
Time 1s: PM2 detects crash
Time 2s: PM2 starts new process
Time 5s: New process ready
Time 6s: Requests resume
```

**Recovery:**
- ✅ PM2 auto-restart (5-10 seconds)
- ✅ Cluster mode (other instances handle requests)
- ✅ Load balancer routes to healthy instances
- ✅ Crash logs saved for debugging

**Expected Recovery Time:** 5-10 seconds (automatic)

---

## 5. SECURITY INCIDENTS

### 5.1 JWT Secret Compromised

**Scenario:** JWT secret key leaked

**Symptoms:**
- Attacker can forge tokens
- Unauthorized access
- Security breach

**Impact:**
- **Severity:** CRITICAL
- **Affected:** All users
- **Downtime:** Until secret rotated

**Immediate Response:**

1. **Rotate JWT Secret** (5 minutes)
   ```bash
   # Generate new secret
   NEW_SECRET=$(openssl rand -base64 32)
   
   # Update environment variable
   export JWT_SECRET=$NEW_SECRET
   
   # Restart backend
   pm2 restart vngo-backend
   ```

2. **Invalidate All Tokens** (immediate)
   ```javascript
   // All existing tokens become invalid
   // Users must re-login
   ```

3. **Notify Users** (1 hour)
   ```
   Subject: Security Update - Please Re-Login
   
   We've updated our security systems. Please log in again.
   Your data is safe. This is a precautionary measure.
   ```

4. **Investigate Breach** (24 hours)
   - Check access logs
   - Identify compromised accounts
   - Reset passwords if needed

**Prevention:**
- ✅ Store secret in environment variables (not code)
- ✅ Use strong secrets (32+ characters)
- ✅ Rotate secrets regularly (quarterly)
- ✅ Monitor for suspicious activity

**Expected Recovery Time:** 5 minutes (secret rotation)

---

### 5.2 DDoS Attack

**Scenario:** Distributed Denial of Service attack

**Symptoms:**
- Massive traffic spike
- Server overload
- Legitimate users can't access

**Impact:**
- **Severity:** HIGH
- **Affected:** All users
- **Downtime:** Until attack mitigated

**Mitigation:**

1. **Enable Cloudflare DDoS Protection** (immediate)
   ```
   Cloudflare automatically detects and blocks DDoS traffic
   ```

2. **Increase Rate Limits** (temporary)
   ```javascript
   // Stricter rate limits during attack
   const ddosRateLimiter = rateLimit({
       windowMs: 60 * 1000,
       max: 10, // Reduced from 100
       message: 'Too many requests'
   });
   ```

3. **Block Malicious IPs** (ongoing)
   ```bash
   # Block IP range
   iptables -A INPUT -s 192.168.1.0/24 -j DROP
   ```

4. **Scale Up** (if needed)
   ```bash
   # Add more backend instances
   pm2 scale vngo-backend +4
   ```

**Recovery:**
- ✅ Cloudflare DDoS protection (automatic)
- ✅ Rate limiting (blocks excessive requests)
- ✅ IP blacklisting (blocks attackers)
- ✅ Horizontal scaling (handle legitimate traffic)

**Expected Recovery Time:** 10-30 minutes

---

## 6. DATA CORRUPTION

### 6.1 Incorrect Credit Balance

**Scenario:** User's credit balance is incorrect

**Symptoms:**
- Balance doesn't match transactions
- User reports wrong balance
- Audit trail inconsistent

**Impact:**
- **Severity:** HIGH (financial)
- **Affected:** Individual user
- **Downtime:** N/A (data issue)

**Investigation:**

```javascript
// Check transaction history
const transactions = await CreditTransaction.find({ userId })
    .sort({ createdAt: 1 });

// Calculate expected balance
let expectedBalance = 0;
for (const tx of transactions) {
    expectedBalance += tx.amount;
    
    if (tx.balanceAfter !== expectedBalance) {
        console.error('Inconsistency found:', {
            transaction: tx._id,
            expected: expectedBalance,
            actual: tx.balanceAfter
        });
    }
}

// Check current balance
const wallet = await UserWallet.findOne({ userId });
console.log('Current balance:', wallet.balance);
console.log('Expected balance:', expectedBalance);
```

**Recovery:**

1. **Verify Transactions** (5 minutes)
   - Check all transactions for user
   - Calculate expected balance
   - Compare with actual balance

2. **Correct Balance** (2 minutes)
   ```javascript
   // Correct balance
   await UserWallet.findOneAndUpdate(
       { userId },
       { balance: expectedBalance, $inc: { version: 1 } }
   );
   
   // Log correction
   await CreditTransaction.create({
       userId,
       amount: expectedBalance - wallet.balance,
       type: 'CORRECTION',
       description: 'Balance correction',
       balanceBefore: wallet.balance,
       balanceAfter: expectedBalance
   });
   ```

3. **Notify User** (10 minutes)
   ```
   Subject: Account Balance Corrected
   
   We've corrected your account balance.
   Previous: 4500 credits
   Corrected: 5000 credits
   
   We apologize for the inconvenience.
   ```

**Prevention:**
- ✅ Atomic transactions (prevent corruption)
- ✅ Optimistic locking (prevent race conditions)
- ✅ Audit trail (track all changes)
- ✅ Regular audits (detect issues early)

**Expected Recovery Time:** 10-20 minutes

---

## 7. RECOVERY PROCEDURES

### 7.1 Database Backup & Restore

**Backup Strategy:**

```bash
# Daily automated backup (cron job)
0 2 * * * mongodump --uri="mongodb://..." --out=/backups/$(date +\%Y-\%m-\%d)

# Retention: 30 days
find /backups -type d -mtime +30 -exec rm -rf {} \;
```

**Restore Procedure:**

```bash
# 1. Stop backend (prevent writes)
pm2 stop vngo-backend

# 2. Restore database
mongorestore --uri="mongodb://..." --drop /backups/2026-04-23

# 3. Verify data
mongo vngo --eval "db.users.count()"

# 4. Start backend
pm2 start vngo-backend

# 5. Monitor logs
pm2 logs vngo-backend
```

**Expected Recovery Time:** 15-30 minutes

---

### 7.2 Disaster Recovery Plan

**Scenario:** Complete system failure (data center down)

**Recovery Steps:**

1. **Activate Backup Region** (10 minutes)
   - Switch DNS to backup region
   - Restore database from backup
   - Start backend instances

2. **Verify System** (5 minutes)
   - Test API endpoints
   - Check database connectivity
   - Verify user login

3. **Notify Users** (immediate)
   ```
   Subject: Service Restored
   
   Our service is back online. We apologize for the downtime.
   All your data is safe.
   ```

4. **Post-Mortem** (24 hours)
   - Investigate root cause
   - Document lessons learned
   - Implement preventive measures

**Expected Recovery Time:** 15-30 minutes

---

## 🎯 SUMMARY

### Failure Severity Matrix

| Failure | Severity | Recovery Time | Auto-Recovery |
|---------|----------|---------------|---------------|
| MongoDB Connection Lost | CRITICAL | 2-5 min | ✅ Yes |
| MongoDB Disk Full | HIGH | 5-15 min | ❌ No |
| Replica Set Failover | MEDIUM | 5-10 sec | ✅ Yes |
| Client Network Loss | LOW | Automatic | ✅ Yes |
| Backend Network Partition | MEDIUM | 30 sec | ✅ Yes |
| Redis Connection Lost | MEDIUM | Immediate | ✅ Yes (fallback) |
| TTS API Failure | MEDIUM | Immediate | ✅ Yes (fallback) |
| Backend Crash | LOW | 5-10 sec | ✅ Yes (PM2) |
| JWT Secret Compromised | CRITICAL | 5 min | ❌ No |
| DDoS Attack | HIGH | 10-30 min | ✅ Yes (Cloudflare) |
| Data Corruption | HIGH | 10-20 min | ❌ No |

### Key Principles

✅ **Graceful Degradation** - System continues working with reduced functionality  
✅ **Auto-Recovery** - Most failures recover automatically  
✅ **Monitoring** - Detect failures early  
✅ **Redundancy** - Multiple layers of protection  
✅ **Backups** - Daily automated backups  

---

**Document Prepared By:** Staff Engineer + System Designer + Technical Reviewer  
**Last Updated:** 2026-04-23 12:51 UTC  
**Status:** ✅ READY FOR TECHNICAL DEFENSE
