# Status Flow Clarification

## 🔄 **COLLECTED vs COMPLETED**

### **COLLECTED Status**
**When:** Customer physically picks up their device from the shop  
**Triggered by:** Staff member marks job as COLLECTED when customer collects device  
**What happens:**
- Device possession changes (`device_in_shop = false`)
- Post-collection SMS scheduled (3 hours later or 10am next day)
- Job moves to final stage

**Purpose:** Marks the physical handover of the device back to customer

---

### **COMPLETED Status**
**When:** After post-collection SMS is sent and warranty period begins  
**Triggered by:** Automatically after COLLECTED, or manually by staff  
**What happens:**
- Job is fully closed
- Appears in "Completed" filter
- Final status in customer tracking

**Purpose:** Final administrative closure of the job

---

## 📊 **Complete Status Flow**

### **Standard Flow (No Parts):**
```
1. QUOTE_APPROVED (API jobs) or RECEIVED (Manual jobs)
   ↓
2. RECEIVED (device in shop)
   ↓
3. IN_REPAIR (technician working on it)
   ↓
4. READY_TO_COLLECT (repair complete, waiting for pickup)
   ↓
5. COLLECTED (customer picked up device)
   ↓ [3 hours later - post-collection SMS sent]
   ↓
6. COMPLETED (job fully closed)
```

### **Flow with Parts:**
```
1. QUOTE_APPROVED (API jobs) or RECEIVED (Manual jobs)
   ↓
2. RECEIVED (device in shop)
   ↓
3. AWAITING_DEPOSIT (£20 deposit needed)
   ↓
4. PARTS_ORDERED (deposit paid, parts ordered)
   ↓
5. PARTS_ARRIVED (parts delivered)
   ↓
6. IN_REPAIR (technician working on it)
   ↓
7. READY_TO_COLLECT (repair complete, waiting for pickup)
   ↓
8. COLLECTED (customer picked up device)
   ↓ [3 hours later - post-collection SMS sent]
   ↓
9. COMPLETED (job fully closed)
```

---

## 🎯 **Key Differences**

| Status | Device Location | Customer Action | Staff Action | SMS Sent |
|--------|----------------|-----------------|--------------|----------|
| **COLLECTED** | With customer | Picked up device | Mark as collected | No (scheduled for later) |
| **COMPLETED** | With customer | None | Close job | Post-collection SMS already sent |

---

## 📱 **Customer Tracking Page**

### **READY_TO_COLLECT Display:**
- ✅ Shows "Your device is ready for collection!"
- ✅ Displays prominent button: "Get Directions & Opening Hours"
- ✅ Button links to Google Maps
- ✅ Shows opening times below button
- ❌ No longer shows hardcoded address in message

### **Why This Is Better:**
1. **Dynamic** - Opening hours always up-to-date via Google
2. **Interactive** - One tap to get directions
3. **Mobile-friendly** - Opens in Google Maps app
4. **Less cluttered** - Cleaner message without address text
5. **Professional** - Modern UX pattern

---

## 🔧 **Staff Workflow**

### **When Device is Ready:**
1. Mark job as `READY_TO_COLLECT`
2. Customer gets SMS notification
3. Customer checks tracking page
4. Customer clicks "Get Directions & Opening Hours"
5. Customer arrives and collects device
6. Staff marks as `COLLECTED`
7. System schedules post-collection SMS
8. SMS sent 3 hours later (or 10am next day)
9. Staff can mark as `COMPLETED` or it happens automatically

---

## ⚙️ **Configuration**

### **Google Maps Link:**
- Stored in: `SHOP_INFO.google_maps_link`
- Value: `https://maps.app.goo.gl/oVczouUePXkRbrKb7`
- Used in: Customer tracking page READY_TO_COLLECT button

### **Opening Hours:**
- Stored in: `SHOP_INFO.opening_times`
- Value: `Mon-Fri 9am-5:30pm`
- Displayed: Under directions button

---

## 📝 **Best Practices**

### **For COLLECTED:**
- ✅ Mark immediately when customer picks up
- ✅ Verify device condition with customer
- ✅ Explain warranty terms
- ❌ Don't mark as COLLECTED until device physically handed over

### **For COMPLETED:**
- ✅ Can be marked after post-collection SMS sent
- ✅ Use for final job closure
- ✅ Helps with reporting and analytics
- ❌ Don't rush - let post-collection SMS send first

---

## 🎨 **Customer Experience**

### **What Customer Sees:**

**READY_TO_COLLECT:**
```
┌─────────────────────────────────────┐
│ ⏰ Current Status                   │
│ Ready to Collect                    │
│                                     │
│ Your device is ready for collection!│
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 📍 Get Directions & Opening Hours│ │
│ │ Mon-Fri 9am-5:30pm              │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**COLLECTED:**
```
┌─────────────────────────────────────┐
│ ⏰ Current Status                   │
│ Collected                           │
│                                     │
│ You have collected your device.     │
│ Thank you!                          │
└─────────────────────────────────────┘
```

**COMPLETED:**
```
┌─────────────────────────────────────┐
│ ⏰ Current Status                   │
│ Completed                           │
│                                     │
│ Your repair is complete.            │
│ Thank you for choosing NFD Repairs! │
└─────────────────────────────────────┘
```

---

## ✅ **Summary**

- **COLLECTED** = Physical handover complete
- **COMPLETED** = Administrative closure
- **READY_TO_COLLECT** now shows Google Maps link instead of hardcoded address
- Customer gets better UX with interactive directions button
- Opening hours always accurate via Google Business
