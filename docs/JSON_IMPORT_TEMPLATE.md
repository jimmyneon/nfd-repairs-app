# JSON Import Template for Job Creation

## Overview

This template is designed for importing job data from paper forms using OCR (Optical Character Recognition) software or ChatGPT.

## Workflow

1. **Take a photo** of the completed paper repair form
2. **Upload to ChatGPT** or OCR software
3. **Ask ChatGPT** to extract the data and format it using this JSON template
4. **Copy the JSON** output
5. **Click "Import from JSON"** in the repair app
6. **Paste the JSON** and click Import
7. **Review and edit** the auto-filled form
8. **Submit** the job

## JSON Template

```json
{
  "customer_name": "John Smith",
  "customer_phone": "+447410123456",
  "customer_email": "john@example.com",
  "device_type": "phone",
  "device_make": "Apple",
  "device_model": "iPhone 14 Pro",
  "issue": "Screen Replacement",
  "description": "Cracked screen from drop",
  "price_total": 89.99,
  "requires_parts_order": true,
  "device_password": "1234",
  "password_na": false,
  "terms_accepted": true
}
```

## Field Descriptions

### Required Fields

- **customer_name** (string): Full name of the customer
- **customer_phone** (string): Phone number with country code (must start with +)
- **device_type** (string): Type of device - must be one of:
  - `"phone"` - Mobile Phone
  - `"tablet"` - Tablet
  - `"laptop"` - Laptop
  - `"desktop"` - Desktop PC
  - `"console"` - Gaming Console
  - `"other"` - Other
- **device_make** (string): Manufacturer/brand (e.g., "Apple", "Samsung", "Dell")
- **device_model** (string): Specific model (e.g., "iPhone 14 Pro", "Galaxy S23")
- **issue** (string): Main issue/repair needed
- **price_total** (number): Total repair price in GBP (no currency symbol)

### Optional Fields

- **customer_email** (string): Customer's email address
- **description** (string): Additional details about the issue
- **requires_parts_order** (boolean): `true` if parts need to be ordered, `false` otherwise
- **device_password** (string): Device passcode/password
- **password_na** (boolean): `true` if password not applicable, `false` otherwise
- **terms_accepted** (boolean): `true` if customer accepted terms, `false` otherwise

## ChatGPT Prompt Example

```
Please extract the repair job information from this image and format it as JSON using this template:

{
  "customer_name": "",
  "customer_phone": "",
  "customer_email": "",
  "device_type": "",
  "device_make": "",
  "device_model": "",
  "issue": "",
  "description": "",
  "price_total": 0,
  "requires_parts_order": false,
  "device_password": "",
  "password_na": false,
  "terms_accepted": true
}

Important:
- Phone number must include country code starting with +
- device_type must be one of: phone, tablet, laptop, desktop, console, or other
- price_total should be a number without currency symbol
- Use true/false for boolean fields (requires_parts_order, password_na, terms_accepted)
- If a field is not visible or not applicable, leave it empty or use appropriate default
```

## Common Issues

### Common device_type values:
- Phone repairs → `"phone"`
- iPad/tablet repairs → `"tablet"`
- MacBook/laptop repairs → `"laptop"`
- iMac/desktop repairs → `"desktop"`
- PlayStation/Xbox repairs → `"console"`

### Common device_make values by type:

**Phones:**
- Apple, Samsung, Google, OnePlus, Huawei, Motorola, Nokia, Sony

**Tablets:**
- Apple, Samsung, Amazon, Lenovo, Microsoft, Huawei

**Laptops:**
- Apple, Dell, HP, Lenovo, Asus, Acer, Microsoft, MSI, Razer

**Consoles:**
- Sony PlayStation, Microsoft Xbox, Nintendo Switch, Nintendo

### Common issues:
- Screen Replacement
- Battery Replacement
- Charging Port Replacement
- Not Charging
- No Power
- Water Damage
- Data Recovery
- Windows 10 Installation
- Windows 11 Installation
- Software Glitches
- Not Loading
- Black Screen
- Blue Screen of Death
- SSD Upgrade
- Hard Drive Replacement
- RAM Upgrade
- HDMI Port Repair
- Software Malfunction
- Overheating
- Virus Removal

## Validation Rules

The import will fail if:
- Any required field is missing
- Phone number doesn't start with `+`
- `price_total` is not a valid number
- `device_type` is not one of the allowed values

## Example: Complete Import

```json
{
  "customer_name": "Amanda Smith",
  "customer_phone": "+447388870610",
  "customer_email": "amanda@example.com",
  "device_type": "phone",
  "device_make": "Google",
  "device_model": "Pixel 8",
  "issue": "Screen Replacement",
  "description": "Screen cracked after dropping on concrete",
  "price_total": 129.99,
  "requires_parts_order": true,
  "device_password": "5678",
  "password_na": false,
  "terms_accepted": true
}
```

## Tips for Best Results

1. **Take clear photos** - Ensure handwriting is legible
2. **Good lighting** - Avoid shadows and glare
3. **Full form visible** - Capture entire form in one photo
4. **Use ChatGPT-4** - Better OCR accuracy than older versions
5. **Review before importing** - Always check the JSON output for accuracy
6. **Edit after import** - The form will be pre-filled but you can still edit any field
