# AI Responder - Vercel Environment Variables

## Add These to AI Responder Vercel Settings

Go to your AI Responder project settings in Vercel:
https://vercel.com/your-team/ai-responder-app/settings/environment-variables

---

## Environment Variables to Add

### 1. Repair App Webhook URL

**Name:**
```
REPAIR_APP_WEBHOOK_URL
```

**Value:**
```
https://nfd-repairs-app.vercel.app/api/quotes/sync
```

**Environment:** Production, Preview, Development (select all)

---

### 2. Repair App Webhook Secret

**Name:**
```
REPAIR_APP_WEBHOOK_SECRET
```

**Value:**
```
TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=
```

**Environment:** Production, Preview, Development (select all)

---

## After Adding Variables

1. Click **"Save"** for each variable
2. **Redeploy** your AI Responder app for changes to take effect

---

That's it! Once these are added and the app is redeployed, you can implement the webhook function.
