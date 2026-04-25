# 🧠 DESIGN DECISIONS & TRADE-OFFS

**Date:** 2026-04-23  
**Version:** 1.0  
**Purpose:** Technical Defense Documentation

---

## 📋 TABLE OF CONTENTS

1. [Technology Stack Decisions](#1-technology-stack-decisions)
2. [Database Design Decisions](#2-database-design-decisions)
3. [Security Design Decisions](#3-security-design-decisions)
4. [Performance Design Decisions](#4-performance-design-decisions)
5. [Business Logic Decisions](#5-business-logic-decisions)
6. [UX/UI Design Decisions](#6-uxui-design-decisions)

---

## 1. TECHNOLOGY STACK DECISIONS

### 1.1 Mobile: C# MAUI vs React Native vs Flutter

**Problem:**
Need cross-platform mobile app (iOS + Android) with native performance and QR scanning.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **C# MAUI** | Native performance, single codebase, .NET ecosystem | Smaller community, newer framework |
| **React Native** | Large community, hot reload, JavaScript | Bridge overhead, native modules complex |
| **Flutter** | Fast rendering, hot reload, growing community | Dart language, larger app size |
| **Native (Swift/Kotlin)** | Best performance, platform-specific features | 2x development time, 2x maintenance |

**Chosen Solution:** C# MAUI

**Justification:**
✅ **Native Performance** - Compiled to native code, no bridge overhead  
✅ **Single Codebase** - 95% code sharing between iOS/Android  
✅ **Strong Typing** - C# type system prevents runtime errors  
✅ **Mature Ecosystem** - .NET libraries for QR, audio, storage  
✅ **Team Expertise** - Team familiar with C#  

**Trade-offs:**
- ❌ Smaller community than React Native/Flutter
- ❌ Newer framework (MAUI released 2022)
- ✅ Microsoft backing ensures long-term support

**Why NOT React Native:**
- Bridge overhead adds 50-100ms latency
- Native module integration complex (QR scanner, audio player)
- JavaScript type safety weaker than C#

**Why NOT Flutter:**
- Team unfamiliar with Dart
- Larger app size (~20MB vs ~10MB for MAUI)
- Widget-based UI less intuitive than XAML

---

### 1.2 Backend: Node.js vs Python vs Go vs Java

**Problem:**
Need backend API with fast I/O, async operations, and easy integration with MongoDB.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **Node.js** | Async I/O, large ecosystem, JSON-native | Single-threaded, callback hell |
| **Python (Django/Flask)** | Easy to learn, ML libraries, rapid dev | Slower, GIL limits concurrency |
| **Go** | Fast, concurrent, compiled | Verbose, smaller ecosystem |
| **Java (Spring Boot)** | Enterprise-grade, mature, scalable | Heavy, slow startup, verbose |

**Chosen Solution:** Node.js + Express

**Justification:**
✅ **Async I/O** - Perfect for I/O-bound operations (DB, Redis, TTS API)  
✅ **JSON-Native** - MongoDB returns JSON, Node.js handles natively  
✅ **Large Ecosystem** - npm has packages for everything  
✅ **Fast Development** - Express minimal boilerplate  
✅ **Horizontal Scaling** - Stateless, easy to scale  

**Trade-offs:**
- ❌ Single-threaded (CPU-bound tasks slow)
- ❌ Callback hell (mitigated with async/await)
- ✅ Perfect for I/O-bound workloads (our use case)

**Why NOT Python:**
- GIL (Global Interpreter Lock) limits concurrency
- Slower than Node.js for I/O operations
- Less mature async ecosystem

**Why NOT Go:**
- More verbose code (error handling everywhere)
- Smaller ecosystem (fewer libraries)
- Team unfamiliar with Go

**Why NOT Java:**
- Heavy framework (Spring Boot ~50MB)
- Slow startup time (5-10 seconds)
- Overkill for MVP

---

### 1.3 Admin Web: React vs Vue vs Angular

**Problem:**
Need admin dashboard for managing POIs, users, and analytics.

**Options Considered:**

| Option | Pros | Cons |
|--------|------|------|
| **React** | Large community, flexible, component-based | JSX learning curve, many choices |
| **Vue** | Easy to learn, gentle curve, good docs | Smaller community, fewer jobs |
| **Angular** | Full framework, TypeScript, enterprise | Heavy, steep curve, opinionated |

**Chosen Solution:** React

**Justification:**
✅ **Large Community** - Easy to find help, libraries, developers  
✅ **Component-Based** - Reusable UI components  
✅ **Flexible** - Choose own state management, routing  
✅ **Job Market** - Most in-demand frontend skill  

**Trade-offs:**
- ❌ Many choices (state management: Redux/Context/Zustand)
- ❌ JSX syntax unfamiliar to beginners
- ✅ Flexibility allows optimization for specific needs

**Why NOT Vue:**
- Smaller community (harder to find developers)
- Fewer third-party libraries
- Less demand in job market

**Why NOT Angular:**
- Steep learning curve (RxJS, TypeScript, decorators)
- Heavy framework (larger bundle size)
- Overkill for simple admin dashboard

---

## 2. DATABASE DESIGN DECISIONS

### 2.1 MongoDB vs PostgreSQL vs MySQL

**Problem:**
Need database for POI content, user data, transactions with geospatial queries.

**Detailed Analysis:**

**MongoDB:**
- ✅ Flexible schema (POI content varies)
- ✅ Geospatial indexes (2dsphere)
- ✅ Horizontal scaling (sharding)
- ✅ JSON-native (matches Node.js)
- ❌ No foreign keys (enforce in app)
- ❌ No joins (denormalize or multiple queries)

**PostgreSQL:**
- ✅ ACID transactions
- ✅ Foreign keys + joins
- ✅ Geospatial (PostGIS extension)
- ❌ Rigid schema (migrations needed)
- ❌ Vertical scaling only (sharding complex)

**MySQL:**
- ✅ Mature, stable
- ✅ ACID transactions
- ❌ Weaker geospatial support
- ❌ Rigid schema

**Chosen Solution:** MongoDB

**Justification:**
✅ **Flexible Schema** - POI content evolves (add images, videos later)  
✅ **Geospatial Queries** - `$near`, `$geoWithin` built-in  
✅ **Horizontal Scaling** - Sharding for future growth  
✅ **JSON-Native** - No ORM needed, direct mapping  

**Trade-offs:**
- ❌ No foreign keys (must validate in application)
- ❌ No joins (denormalize data or multiple queries)
- ✅ Flexibility > Constraints for MVP

**Real-World Example:**
```javascript
// Flexible POI schema
{
    code: "HOAN_KIEM_LAKE",
    name: "Hồ Hoàn Kiếm",
    summary: "...",
    narrationLong: "...",
    images: ["url1", "url2"], // Added later without migration
    videos: ["url3"], // Added later without migration
    location: { type: "Point", coordinates: [105.85, 21.03] }
}
```

---

### 2.2 Denormalization vs Normalization

**Problem:**
Should we normalize data (3NF) or denormalize for performance?

**Options:**

**Normalized (3NF):**
```javascript
// users collection
{ _id: 1, email: "user@example.com" }

// credit_transactions collection
{ userId: 1, amount: -500 } // Reference user by ID
```

**Denormalized:**
```javascript
// credit_transactions collection
{
    userId: 1,
    userEmail: "user@example.com", // Duplicate data
    amount: -500
}
```

**Chosen Solution:** Hybrid (Mostly Normalized + Strategic Denormalization)

**Justification:**
✅ **Normalized for Core Data** - Users, POIs, Zones (single source of truth)  
✅ **Denormalized for Logs** - Events, transactions (include user email for fast queries)  
✅ **Balance** - Consistency where needed, performance where needed  

**Trade-offs:**
- ❌ Some data duplication (user email in transactions)
- ❌ Must update denormalized data on changes
- ✅ Fast queries without joins

**Example:**
```javascript
// Denormalized transaction log (for fast admin queries)
{
    userId: ObjectId("..."),
    userEmail: "demo@vngo.com", // Denormalized
    amount: -500,
    poiCode: "HOAN_KIEM_LAKE", // Denormalized
    poiName: "Hồ Hoàn Kiếm" // Denormalized
}

// Admin can query transactions without joining users/pois
```

---

### 2.3 Optimistic Locking vs Pessimistic Locking

**Problem:**
Prevent race conditions in credit deductions (concurrent purchases).

**Options:**

**Optimistic Locking (Version Field):**
```javascript
// Check version before update
await UserWallet.findOneAndUpdate(
    { userId, version: 5, balance: { $gte: 500 } },
    { $inc: { balance: -500, version: 1 } }
);
// Fails if version changed (another transaction updated)
```

**Pessimistic Locking (Lock Row):**
```javascript
// Lock wallet row
await UserWallet.findOneAndUpdate(
    { userId },
    { $set: { locked: true } }
);
// Other transactions wait
```

**Chosen Solution:** Optimistic Locking

**Justification:**
✅ **Better Performance** - No locks, no waiting  
✅ **No Deadlocks** - Transactions don't block each other  
✅ **Retry Logic** - Failed transactions retry automatically  
✅ **Scalable** - Works well under high concurrency  

**Trade-offs:**
- ❌ Retry overhead (transaction fails if version mismatch)
- ❌ More complex code (handle version conflicts)
- ✅ Better throughput (no blocking)

**Why NOT Pessimistic Locking:**
- Blocks other transactions (lower throughput)
- Deadlock risk (transaction A locks wallet, transaction B locks POI)
- Doesn't scale well

---

## 3. SECURITY DESIGN DECISIONS

### 3.1 JWT Expiration: 7 Days vs 30 Days vs No Expiration

**Problem:**
How long should user JWT tokens be valid?

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **7 Days** | Balanced security/UX | Users re-login weekly |
| **30 Days** | Better UX | Higher security risk |
| **No Expiration** | Best UX | Unacceptable security risk |
| **1 Day** | Most secure | Poor UX (daily login) |

**Chosen Solution:** 7 Days (User Tokens) + 1 Year (QR Tokens)

**Justification:**
✅ **User Tokens (7 days)** - Balance security and UX  
✅ **QR Tokens (1 year)** - Physical QR codes can't be updated frequently  
✅ **Refresh Tokens** - Can implement later for longer sessions  

**Trade-offs:**
- ❌ Users re-login weekly (acceptable for tourism app)
- ❌ QR tokens valid 1 year (must blacklist if compromised)
- ✅ Security > Convenience

**Why NOT 30 Days:**
- If JWT secret compromised, attacker has 30 days access
- Longer window for stolen tokens

**Why NOT No Expiration:**
- Unacceptable security risk
- Cannot revoke tokens (must blacklist)

---

### 3.2 Rate Limiting: IP vs User vs Device

**Problem:**
How to prevent QR scan abuse?

**Options:**

| Strategy | Pros | Cons |
|----------|------|------|
| **IP-based** | Simple, works for unauthenticated | VPN bypass, shared IPs |
| **User-based** | Accurate, per-user limits | Requires authentication |
| **Device-based** | Tracks physical devices | Device ID can be spoofed |
| **Hybrid (All 3)** | Most robust | Complex implementation |

**Chosen Solution:** Multi-Tier (IP + User + Device)

**Justification:**
✅ **IP-based (20/min)** - First line of defense  
✅ **User-based (10/min)** - Per-user limits  
✅ **Device-based (20/min)** - Track physical devices  
✅ **Abuse Detection (100/hour)** - Auto-blacklist  

**Implementation:**
```javascript
// Layer 1: IP rate limit
if (await redis.get(`rl:ip:${ip}`) > 20) throw RateLimitError;

// Layer 2: User rate limit
if (await redis.get(`rl:user:${userId}`) > 10) throw RateLimitError;

// Layer 3: Device rate limit
if (await redis.get(`rl:device:${deviceId}`) > 20) throw RateLimitError;

// Layer 4: Abuse detection
if (await redis.get(`abuse:device:${deviceId}`) > 100) throw BlacklistError;
```

**Trade-offs:**
- ❌ More complex (3 Redis checks per request)
- ❌ Device ID can be spoofed
- ✅ Very difficult to bypass all 3 layers

---

### 3.3 Daily Quota: Cumulative vs Daily Reset

**Problem:**
Should free users have cumulative quota or daily reset?

**Options:**

**Cumulative (10 scans total):**
```javascript
if (user.qrScanCount >= 10) throw QuotaExceededError;
user.qrScanCount++;
```

**Daily Reset (10 scans/day):**
```javascript
const today = new Date().toISOString().split('T')[0];
if (user.qrScanLastResetDate !== today) {
    user.qrScanCount = 0;
    user.qrScanLastResetDate = today;
}
if (user.qrScanCount >= 10) throw QuotaExceededError;
user.qrScanCount++;
```

**Chosen Solution:** Daily Reset (10 scans/day)

**Justification:**
✅ **Better UX** - Users get fresh quota daily  
✅ **Encourages Return** - Users come back tomorrow  
✅ **Fair** - Everyone gets same daily limit  
✅ **Predictable** - Users know when quota resets  

**Trade-offs:**
- ❌ More complex code (track last reset date)
- ❌ Cron job needed (daily reset at 00:00 UTC)
- ✅ Better user experience

**Why NOT Cumulative:**
- Poor UX (users run out of quota, never come back)
- Unfair (early users get quota, late users don't)

---

## 4. PERFORMANCE DESIGN DECISIONS

### 4.1 TTS: Real-time vs Pre-generated vs Hybrid

**Problem:**
How to deliver audio narration?

**Options:**

| Option | Storage | Latency | Cost | Flexibility |
|--------|---------|---------|------|-------------|
| **Real-time TTS** | 0 GB | 1-2s | Low | High |
| **Pre-generated** | 1.5 GB | 0.1s | High | Low |
| **Hybrid (TTS + Cache)** | 500 MB | 0.1s (cached) | Medium | High |

**Chosen Solution:** Real-time TTS (with client-side cache)

**Justification:**
✅ **Zero Storage** - No audio files to store  
✅ **Instant Updates** - Change text, audio updates immediately  
✅ **Multilingual** - Same text → multiple languages  
✅ **Cost Effective** - TTS API cheaper than storage + CDN  

**Trade-offs:**
- ❌ 1-2s latency on first play
- ❌ Requires internet connection
- ✅ Client caches audio after first play (0.1s subsequent plays)

**Why NOT Pre-generated:**
- 100 POIs × 3 languages × 5MB = 1.5GB storage
- CDN costs $50-100/month
- Slow updates (re-record → upload → deploy)

**Why NOT Hybrid:**
- Complex cache invalidation
- Storage still needed (500MB)
- Overkill for MVP

---

### 4.2 Caching Strategy: Redis vs In-Memory vs No Cache

**Problem:**
How to cache frequently accessed data (POIs, zones)?

**Options:**

| Option | Speed | Distributed | Persistence | Cost |
|--------|-------|-------------|-------------|------|
| **Redis** | Fast (1ms) | Yes | Yes | $10/month |
| **In-Memory (Node.js)** | Fastest (0.1ms) | No | No | Free |
| **No Cache** | Slow (50ms) | N/A | N/A | Free |

**Chosen Solution:** Redis (with in-memory fallback)

**Justification:**
✅ **Distributed** - Works across multiple backend instances  
✅ **Persistent** - Survives server restarts  
✅ **Fast** - 1ms lookup time  
✅ **Rate Limiting** - Also used for rate limiting  

**Trade-offs:**
- ❌ Redis dependency (single point of failure)
- ❌ Cost ($10/month for Redis Cloud)
- ✅ Graceful fallback to in-memory if Redis down

**Implementation:**
```javascript
// Try Redis first
let poi = await redis.get(`poi:${code}`);
if (!poi) {
    // Fallback to database
    poi = await Poi.findOne({ code });
    await redis.set(`poi:${code}`, JSON.stringify(poi), 'EX', 300);
}
```

---

### 4.3 Database Indexes: Selective vs Comprehensive

**Problem:**
Which fields should be indexed?

**Options:**

**Comprehensive (Index Everything):**
- ✅ Fast queries on all fields
- ❌ Slow writes (update all indexes)
- ❌ High storage (indexes take space)

**Selective (Index Only Critical Fields):**
- ✅ Fast writes
- ✅ Lower storage
- ❌ Slow queries on non-indexed fields

**Chosen Solution:** Selective Indexing

**Justification:**
✅ **Critical Indexes Only** - email, code, location, userId, timestamp  
✅ **Fast Writes** - Fewer indexes to update  
✅ **Lower Storage** - Indexes take 20-30% of data size  

**Indexes Created:**
```javascript
// User lookups
users: { email: 1 }

// POI lookups
pois: { code: 1 }
pois: { location: "2dsphere" } // Geospatial

// Transaction queries
credit_transactions: { userId: 1, createdAt: -1 }

// Event queries
system_events: { eventType: 1, timestamp: -1 }
```

**Trade-offs:**
- ❌ Queries on non-indexed fields slow (full collection scan)
- ✅ Fast writes (fewer indexes to update)
- ✅ Lower storage costs

---

## 5. BUSINESS LOGIC DECISIONS

### 5.1 Pricing Model: Freemium vs Subscription vs Pay-per-Use

**Problem:**
How should users pay for content?

**Options:**

| Model | Revenue | User Acquisition | Complexity |
|-------|---------|------------------|------------|
| **Freemium** | Medium | High | Medium |
| **Subscription** | High | Low | Low |
| **Pay-per-Use** | Low | Medium | High |

**Chosen Solution:** Freemium (10 free scans/day + Premium unlimited)

**Justification:**
✅ **User Acquisition** - Free tier attracts users  
✅ **Conversion** - Power users upgrade to premium  
✅ **Predictable Revenue** - Premium subscriptions  
✅ **Fair** - Casual users get value, power users pay  

**Trade-offs:**
- ❌ Some users never upgrade (freeloaders)
- ❌ Must enforce daily quota
- ✅ Larger user base (network effects)

**Why NOT Subscription Only:**
- High barrier to entry (users won't try)
- Lower user acquisition

**Why NOT Pay-per-Use:**
- Complex billing (track every scan)
- Unpredictable revenue
- Poor UX (users worry about costs)

---

### 5.2 Zone vs POI Pricing: Bundle vs Individual

**Problem:**
Should users buy zones (bundle) or individual POIs?

**Options:**

**Zone Pricing (Bundle):**
- Zone: 500 credits (unlocks 5-10 POIs)
- Discount: 50-100 credits per POI

**Individual POI Pricing:**
- POI: 100 credits each
- No discount

**Chosen Solution:** Both (Zone Bundle + Individual POI)

**Justification:**
✅ **Zone Bundle** - Better value for tourists (visit multiple POIs)  
✅ **Individual POI** - Flexibility for single-location visits  
✅ **Revenue Optimization** - Encourage zone purchases (higher revenue)  

**Trade-offs:**
- ❌ More complex pricing logic
- ❌ Users might game system (buy cheapest option)
- ✅ Flexibility increases conversions

**Example:**
```
Hanoi Old Quarter Zone: 500 credits
├─ Hoan Kiem Lake: 100 credits (individual)
├─ Ngoc Son Temple: 100 credits (individual)
├─ Dong Xuan Market: 100 credits (individual)
├─ Old Quarter Streets: 100 credits (individual)
└─ Thang Long Water Puppet: 100 credits (individual)

Buy zone: 500 credits (save 100 credits)
Buy individual: 500 credits (no savings)
```

---

## 6. UX/UI DESIGN DECISIONS

### 6.1 QR Scan: Camera vs Manual Entry vs Both

**Problem:**
How should users scan QR codes?

**Options:**

| Option | Speed | Reliability | Accessibility |
|--------|-------|-------------|---------------|
| **Camera Only** | Fast | Camera issues | Poor (blind users) |
| **Manual Entry Only** | Slow | 100% reliable | Good |
| **Both** | Fast (camera) + Fallback (manual) | High | Excellent |

**Chosen Solution:** Both (Camera + Manual Entry)

**Justification:**
✅ **Camera First** - Fast, convenient for most users  
✅ **Manual Fallback** - Works when camera fails  
✅ **Accessibility** - Blind users can type code  
✅ **Demo-Friendly** - Can demo without physical QR  

**Trade-offs:**
- ❌ More UI complexity (2 input methods)
- ✅ Better reliability (always works)

---

### 6.2 Audio Playback: Auto-play vs Manual

**Problem:**
Should audio start automatically after QR scan?

**Options:**

**Auto-play:**
- ✅ Seamless experience
- ❌ Unexpected (users might be in quiet place)
- ❌ Accessibility issue (screen readers conflict)

**Manual (Play Button):**
- ✅ User control
- ✅ Accessibility-friendly
- ❌ Extra tap required

**Chosen Solution:** Manual (Play Button)

**Justification:**
✅ **User Control** - Users choose when to listen  
✅ **Accessibility** - Screen readers don't conflict  
✅ **Context-Aware** - Users might be in quiet place  

**Trade-offs:**
- ❌ Extra tap required
- ✅ Better user experience (no surprises)

---

## 🎯 SUMMARY OF KEY TRADE-OFFS

| Decision | Chosen | Trade-off | Justification |
|----------|--------|-----------|---------------|
| **Mobile Framework** | C# MAUI | Smaller community | Native performance + team expertise |
| **Backend** | Node.js | Single-threaded | Perfect for I/O-bound workloads |
| **Database** | MongoDB | No foreign keys | Flexible schema + geospatial |
| **Audio** | TTS | 1-2s latency | Zero storage + instant updates |
| **Auth** | JWT | Cannot revoke | Stateless + scalable |
| **Rate Limiting** | Multi-tier | Complex | Robust abuse prevention |
| **Pricing** | Freemium | Some freeloaders | High user acquisition |
| **Locking** | Optimistic | Retry overhead | Better throughput |

---

## 🎓 LESSONS LEARNED

### What Worked Well

✅ **MongoDB Flexibility** - Schema changes without migrations  
✅ **TTS Simplicity** - No audio file management  
✅ **Atomic Transactions** - Zero double-spending bugs  
✅ **Multi-tier Rate Limiting** - Effective abuse prevention  

### What We'd Do Differently

⚠️ **Earlier Observability** - Should have added logging from day 1  
⚠️ **More Comprehensive Tests** - Integration tests added late  
⚠️ **Better Error Messages** - Some errors too technical for users  

### Future Improvements

🔮 **GraphQL** - Replace REST for flexible queries  
🔮 **WebSockets** - Real-time updates for admin dashboard  
🔮 **CDN** - Cache TTS audio for faster playback  
🔮 **Microservices** - Split into auth, content, payment services  

---

**Document Prepared By:** Staff Engineer + System Designer + Technical Reviewer  
**Last Updated:** 2026-04-23 12:46 UTC  
**Status:** ✅ READY FOR TECHNICAL DEFENSE
