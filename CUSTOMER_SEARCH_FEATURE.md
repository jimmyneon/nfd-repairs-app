# Customer Search Feature

## Overview
Added a customer search feature to the manual job creation page that allows staff to quickly find and reuse previous customer details and repair information for repeat customers.

## Implementation Date
May 11, 2026

## Features

### 1. Customer Search Modal
**Location:** `/components/CustomerSearchModal.tsx`

The modal provides:
- **Search functionality** - Search by customer name, phone number, or email
- **Customer list view** - Shows unique customers with their most recent job details
- **Job history view** - Displays all previous jobs for a selected customer
- **Two import options:**
  - **Customer details only** - Import just name, phone, email (for new device/repair)
  - **Full job data** - Import customer details + device info + repair details + pricing

### 2. Integration with Manual Job Creation
**Location:** `/app/app/jobs/create/page.tsx`

Added:
- Green "Search Customers" button in the header (alongside Search Quotes and Import JSON)
- Handler function `handleCustomerSelect()` to populate form with selected data
- Auto-detection of device type from device make
- Session storage for customer data to pass to confirmation page

## How It Works

### Search Flow
1. Click "Search Customers" button
2. Enter search query (name, phone, or email)
3. Click "Search" or press Enter
4. View list of matching customers

### Customer Selection Flow
1. Click on a customer from search results
2. View their complete job history
3. Choose one of two options:
   - **Use Customer Details Only** - For new repairs on different devices
   - **Click a previous job** - To copy device, issue, and pricing details

### Data Imported

**Customer Details Only:**
- Customer name
- Customer phone
- Customer email

**Full Job Data:**
- All customer details above, plus:
- Device make
- Device model
- Issue/repair type
- Description
- Price
- Parts requirement flag

## UI Features

### Customer List Display
- Customer name with icon
- Phone number
- Email (if available)
- Last job date
- Most recent device and issue

### Job History Display
- Device make and model
- Issue description
- Full description (truncated)
- Price with parts indicator
- Job date and status badge
- Job reference number

### Visual Design
- Green button for easy identification
- Responsive modal with max-width
- Dark mode support
- Status badges with color coding
- Smooth transitions and hover effects

## Database Queries

The search uses Supabase's `.or()` filter to search across:
- `customer_name` (case-insensitive)
- `customer_phone` (case-insensitive)
- `customer_email` (case-insensitive)

Results are:
- Limited to 50 matches
- Ordered by most recent first
- Grouped by phone number (unique customers)

## Benefits

✅ **Faster job creation** for repeat customers
✅ **Reduced data entry errors** by reusing existing data
✅ **Quick access to repair history** for recurring issues
✅ **Better customer service** with instant access to previous jobs
✅ **Flexible import options** - customer only or full job data

## Usage Tips

1. **For repeat customers with new devices:**
   - Search customer → Select → "Use Customer Details Only"
   - Then enter new device and repair info

2. **For recurring repairs (same device/issue):**
   - Search customer → Select → Click the previous job
   - All details auto-filled, just adjust if needed

3. **Quick lookup:**
   - Search by phone number for fastest results
   - Partial names work too (case-insensitive)

## Technical Notes

- Uses Supabase client-side queries (no API endpoint needed)
- Leverages existing RLS policies on jobs table
- Integrates with existing form validation
- Compatible with Quick Walk-In Mode
- Works alongside Quote Lookup and JSON Import features

## Future Enhancements

Potential improvements:
- Add customer notes/tags for flagging VIP or problem customers
- Show total repair count and lifetime value
- Filter by device type or issue
- Export customer repair history
- Link to customer management system
