# SMS Templates - Complete Guide

## Overview

The repair app has comprehensive SMS templates for every stage of the repair workflow, plus additional templates for special situations.

---

## 📱 **Core Workflow Templates**

### 1. **RECEIVED**
**When**: Job first created and received  
**Purpose**: Confirm receipt of device

```
Hi {customer_name}, we've received your {device_make} {device_model}. 
We'll assess it and get back to you shortly with a quote. 
Track your repair: {tracking_link} - New Forest Device Repairs
```

---

### 2. **DEPOSIT_REQUIRED** (AWAITING_DEPOSIT)
**When**: Parts needed, deposit required  
**Purpose**: Request deposit payment

```
Hi {customer_name}, your {device_make} {device_model} repair quote is £{price_total}. 
We need a £{deposit_amount} deposit to order parts. 
Pay here: {deposit_link}. 
Track: {tracking_link} - NFD Repairs
```

---

### 3. **PARTS_ORDERED**
**When**: Parts ordered after deposit received  
**Purpose**: Confirm parts are on the way

```
Hi {customer_name}, parts for your {device_make} {device_model} have been ordered. 
We'll notify you when they arrive and we're ready to start the repair. 
Track: {tracking_link} - NFD Repairs
```

---

### 4. **READY_TO_BOOK_IN**
**When**: Parts arrived or device ready for repair  
**Purpose**: Arrange booking time

```
Hi {customer_name}, your {device_make} {device_model} is ready to book in for repair. 
We'll contact you to arrange a convenient time to drop it off. 
Track: {tracking_link} - NFD Repairs
```

---

### 5. **IN_REPAIR**
**When**: Repair work started  
**Purpose**: Update customer on progress

```
Hi {customer_name}, your {device_make} {device_model} repair is now in progress. 
Our technicians are working on it and we'll update you when it's ready. 
Track: {tracking_link} - NFD Repairs
```

---

### 6. **READY_TO_COLLECT**
**When**: Repair complete, ready for pickup  
**Purpose**: Notify customer to collect

```
Hi {customer_name}, great news! Your {device_make} {device_model} is ready to collect 
from New Forest Device Repairs. We're open Mon-Sat 9am-5pm. 
Track: {tracking_link} - NFD Repairs
```

---

### 7. **COMPLETED**
**When**: Job marked as completed  
**Purpose**: Final confirmation

```
Hi {customer_name}, your {device_make} {device_model} repair is complete. 
Thank you for choosing New Forest Device Repairs! 
Track: {tracking_link}
```

---

### 8. **COLLECTED** ⭐ NEW
**When**: Device picked up by customer  
**Purpose**: Thank customer, request review, provide warranty info

```
Hi {customer_name}, thanks for collecting your {device_make} {device_model}! 

⭐ Loved our service? Please leave us a 5-star Google review: 
https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review

Your repair is covered by our warranty. Any issues? Reply to this SMS or use your tracking link: {tracking_link}

Warranty terms: https://newforestdevicerepairs.co.uk/warranty

Need warranty work? Contact us via SMS or book in again at {tracking_link}

Thanks for choosing NFD Repairs! 📱
```

**Key Features**:
- ⭐ Google review request (5-star emphasis)
- Warranty information
- Multiple contact methods (SMS reply, tracking link)
- Warranty terms link
- Process for warranty claims
- Friendly, professional tone

---

### 9. **CANCELLED**
**When**: Job cancelled  
**Purpose**: Confirm cancellation

```
Hi {customer_name}, your {device_make} {device_model} repair has been cancelled. 
If you have any questions, please contact us. 
Track: {tracking_link} - NFD Repairs
```

---

## 📋 **Additional Templates**

### **DEPOSIT_RECEIVED**
**When**: Deposit payment confirmed  
**Purpose**: Acknowledge payment

```
Hi {customer_name}, we've received your £{deposit_amount} deposit for {device_make} {device_model}. 
Parts are being ordered now. 
Track: {tracking_link} - NFD Repairs
```

---

### **DELAY_NOTIFICATION**
**When**: Unexpected delay occurs  
**Purpose**: Keep customer informed

```
Hi {customer_name}, there's a slight delay with your {device_make} {device_model} repair. 
We'll keep you updated. 
Track: {tracking_link} - NFD Repairs
```

---

### **QUOTE_REMINDER**
**When**: Customer hasn't responded to quote  
**Purpose**: Follow up on quote

```
Hi {customer_name}, just a reminder about your {device_make} {device_model} repair quote of £{price_total}. 
Let us know if you'd like to proceed. 
Track: {tracking_link} - NFD Repairs
```

---

## 🔧 **Template Variables**

All templates support these variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `{customer_name}` | Customer's name | "John Smith" |
| `{device_make}` | Device manufacturer | "Apple" |
| `{device_model}` | Device model | "iPhone 12 Pro" |
| `{issue}` | Main issue | "Cracked screen" |
| `{price_total}` | Total repair cost | "89.99" |
| `{deposit_amount}` | Deposit required | "30.00" |
| `{job_ref}` | Job reference | "NFD-20260221-001" |
| `{tracking_link}` | Customer tracking URL | Full URL |
| `{deposit_link}` | Payment link | SumUp payment URL |

---

## 🎯 **When to Send Each Template**

### Automatic Triggers

| Status Change | Template Sent | Automatic? |
|---------------|---------------|------------|
| Job created | RECEIVED | ✅ Yes |
| → AWAITING_DEPOSIT | DEPOSIT_REQUIRED | ✅ Yes |
| Deposit received | DEPOSIT_RECEIVED | ⚠️ Manual |
| → PARTS_ORDERED | PARTS_ORDERED | ✅ Yes |
| → READY_TO_BOOK_IN | READY_TO_BOOK_IN | ✅ Yes |
| → IN_REPAIR | IN_REPAIR | ✅ Yes |
| → READY_TO_COLLECT | READY_TO_COLLECT | ✅ Yes |
| → COMPLETED | COMPLETED | ✅ Yes |
| Device collected | COLLECTED | ⚠️ Manual |
| → CANCELLED | CANCELLED | ✅ Yes |

---

## 📝 **Editing Templates**

### Via Staff Interface

1. Go to `/app/templates`
2. Click template to edit
3. Modify text (keep variables intact)
4. Save changes
5. Toggle active/inactive

### Via Database

```sql
UPDATE sms_templates 
SET body = 'Your new message text here'
WHERE key = 'TEMPLATE_KEY';
```

---

## ⭐ **Google Review Setup**

### Update COLLECTED Template

Replace `YOUR_GOOGLE_REVIEW_LINK` with your actual Google review link:

1. Get your Google Business review link
2. Update template in `/app/templates`
3. Replace placeholder URL

**Example**:
```
https://g.page/r/CabcdefGHIJKLMNO/review
```

---

## 🔗 **Warranty Page Setup**

### Create Warranty Page

1. Add warranty terms to your website
2. Update URL in COLLECTED template
3. Include:
   - Warranty duration
   - What's covered
   - How to claim
   - Contact methods

**Example URL**:
```
https://newforestdevicerepairs.co.uk/warranty
```

---

## 📊 **SMS Sending Process**

### How It Works

1. **Status changes** in repair app
2. **Template selected** based on new status
3. **Variables replaced** with job data
4. **SMS queued** in `sms_logs` table
5. **MacroDroid webhook** sends SMS
6. **Status updated** to SENT/FAILED

### Manual Sending

Staff can also send SMS manually:
- From job detail page
- Select template
- Preview message
- Send

---

## 🎨 **Best Practices**

### ✅ Do's
- Keep messages concise
- Include tracking link
- Use customer's name
- Mention device details
- Clear call-to-action
- Professional but friendly

### ❌ Don'ts
- Don't use ALL CAPS
- Avoid too many emojis
- Don't make messages too long
- Don't forget variables
- Don't remove tracking links

---

## 🔍 **Testing Templates**

### Test Before Sending

```sql
-- View rendered template
SELECT 
  key,
  REPLACE(
    REPLACE(
      REPLACE(body, '{customer_name}', 'Test Customer'),
      '{device_make}', 'Apple'),
    '{device_model}', 'iPhone 12'
  ) as preview
FROM sms_templates
WHERE key = 'COLLECTED';
```

---

## 📈 **Template Performance**

### Track Success

Monitor in `sms_logs` table:
- Delivery rate
- Customer responses
- Template effectiveness
- Most used templates

---

## 🆘 **Troubleshooting**

### Template Not Sending

1. Check template is active
2. Verify MacroDroid webhook URL
3. Check `sms_logs` for errors
4. Ensure variables are correct

### Variables Not Replacing

1. Check spelling: `{customer_name}` not `{customername}`
2. Ensure job has required data
3. Check API endpoint logic

---

## 📱 **Collection Template - Detailed Breakdown**

### Why This Template Is Important

1. **Google Reviews**: Drives 5-star ratings
2. **Warranty Info**: Reduces support queries
3. **Customer Confidence**: Shows professionalism
4. **Repeat Business**: Keeps communication open
5. **Brand Building**: Positive final impression

### Key Elements

- ⭐ **Review Request**: Direct link, emphasizes 5 stars
- 🛡️ **Warranty Assurance**: Builds trust
- 💬 **Contact Options**: SMS reply or tracking link
- 📄 **Terms Link**: Transparency
- 🔄 **Re-booking Process**: Easy warranty claims

---

## 🎯 **Next Steps**

1. ✅ Templates created in database
2. ⏳ Update Google review link
3. ⏳ Create warranty page
4. ⏳ Test each template
5. ⏳ Train staff on manual sending
6. ⏳ Monitor delivery rates

---

**All templates are ready to use!** 🎉
