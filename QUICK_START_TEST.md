# 🚀 QUICK START - TEST YOUR QR SCAN FLOW

**Ready to test?** Follow these steps to verify everything works!

---

## ⚡ FASTEST PATH TO TEST (5 minutes)

### Step 1: Start Backend (30 seconds)
```bash
cd backend
npm start
# Wait for: "Server running on port 3000"
```

### Step 2: Create Test Zone (1 minute)
```bash
# Option A: Use existing zone
# Check if you have zones in database:
# MongoDB: db.zones.find({ isActive: true })

# Option B: Create new test zone via API
# Use Postman or curl to create a zone with POIs
```

### Step 3: Generate QR Code (30 seconds)
```bash
# Use admin panel or API to generate QR token
# You'll get a URL like:
# http://localhost:3000/app/scan?t=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 4: Test Web Bridge (1 minute)
1. Open the QR URL in your mobile browser
2. **✅ CHECK:** Zone name and description appear
3. **✅ CHECK:** POI preview cards show up
4. **✅ CHECK:** "Open in VN-GO App" button visible

### Step 5: Test Mobile App (2 minutes)
1. Click "Open in VN-GO App" button
2. **✅ CHECK:** App opens automatically
3. **✅ CHECK:** Zone POI list page loads
4. **✅ CHECK:** POI list is NOT empty
5. **✅ CHECK:** Each POI shows name and summary
6. **✅ CHECK:** Purchase banner appears (if not purchased)

---

## 🎯 WHAT TO VERIFY

### Web Bridge Checklist:
- [ ] Page loads without errors
- [ ] Zone name displays correctly
- [ ] Zone description shows
- [ ] POI count is accurate
- [ ] POI preview cards render (max 4)
- [ ] Button is clickable

### Mobile App Checklist:
- [ ] Deep link opens app
- [ ] Zone name in header
- [ ] POI count label correct
- [ ] POI list populated
- [ ] Each POI has name, summary, code
- [ ] Access banner shows/hides correctly
- [ ] Purchase button functional

### Purchase Flow Checklist:
- [ ] Authenticated user can purchase
- [ ] Guest redirected to login
- [ ] Purchase deducts credits
- [ ] Access banner disappears after purchase
- [ ] POI details accessible after purchase

---

## 🐛 QUICK TROUBLESHOOTING

### Problem: Web Bridge Shows "Zone not found"
**Fix:** Check if zone exists and is active
```bash
# MongoDB
db.zones.findOne({ code: "YOUR_ZONE_CODE" })
# Should return: { isActive: true, ... }
```

### Problem: POI List is Empty in Mobile App
**Fix:** Check backend response
```bash
curl http://localhost:3000/api/v1/zones/YOUR_ZONE_CODE
# Should return: { data: { pois: [...] } }
```

### Problem: Deep Link Doesn't Open App
**Fix:** 
1. Check if app is installed
2. Verify deep link scheme in app manifest
3. Try manual deep link: `vngo://zone?token=YOUR_TOKEN`

### Problem: Purchase Button Does Nothing
**Fix:** Check console logs
- Mobile: Look for error messages
- Backend: Check purchase endpoint logs
- Verify user has sufficient credits

---

## 📱 TESTING URLS

### Local Development:
```
Web Bridge: http://localhost:3000/app/scan?t={token}
Backend API: http://localhost:3000/api/v1
Zone Endpoint: http://localhost:3000/api/v1/zones/{code}
Public API: http://localhost:3000/api/v1/public/zones/{code}
```

### Production (Update these):
```
Web Bridge: https://yourdomain.com/app/scan?t={token}
Backend API: https://api.yourdomain.com/api/v1
```

---

## 🎬 DEMO SCENARIO

**Scenario:** Tourist scans QR code at museum entrance

1. **Tourist scans QR code** → Web page opens
2. **Tourist sees:** "Museum Tour - 15 locations"
3. **Tourist clicks:** "Open in VN-GO App"
4. **App opens** → Shows list of 15 museum locations
5. **Tourist sees:** "Purchase for 100 credits to unlock"
6. **Tourist clicks:** "Purchase Zone"
7. **Tourist confirms** → Purchase successful
8. **Tourist taps** → First location in list
9. **App shows:** Location details with audio guide
10. **Tourist plays** → Audio narration starts

**Expected Time:** 30 seconds from scan to audio playback

---

## ✅ SUCCESS INDICATORS

You know it's working when:

1. ✅ QR scan opens a beautiful web page (not error page)
2. ✅ Web page shows zone information (not "loading forever")
3. ✅ Mobile app opens from web page (not "app not found")
4. ✅ POI list shows locations (not empty list)
5. ✅ Purchase button works (not disabled or broken)
6. ✅ After purchase, can access POI details (not blocked)

---

## 🔥 COMMON MISTAKES TO AVOID

1. **Don't forget to start MongoDB** before backend
2. **Don't use expired QR tokens** (24h expiry)
3. **Don't test with inactive zones** (isActive: false)
4. **Don't test with zones that have no POIs**
5. **Don't test purchase without credits** in user account

---

## 📞 NEED HELP?

### Check These First:
1. Backend logs: `console.log` statements
2. Mobile logs: Debug.WriteLine statements
3. Browser console: JavaScript errors
4. Network tab: API response status codes

### Debug Commands:
```bash
# Check if backend is running
curl http://localhost:3000/api/v1/demo/health

# Check if zone exists
curl http://localhost:3000/api/v1/public/zones/YOUR_ZONE_CODE

# Check if POIs are returned
curl http://localhost:3000/api/v1/zones/YOUR_ZONE_CODE

# Check MongoDB connection
# In MongoDB shell: db.zones.count()
```

---

## 🎉 READY TO GO!

All fixes are in place. The system should work end-to-end now.

**Next Steps:**
1. Start your backend server
2. Open the web bridge URL
3. Test the complete flow
4. Report any issues you find

**Good luck! 🚀**

---

**Files to Reference:**
- Full audit: `AUDIO_SYSTEM_AUDIT.md`
- Detailed testing: `QR_SCAN_TESTING_GUIDE.md`
- Fix summary: `BUG_FIXES_SUMMARY.md`
- This guide: `QUICK_START_TEST.md`
