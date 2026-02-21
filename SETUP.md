# Setup Guide - NFD Repair Tracker

## Quick Start

### 1. Install Dependencies

```bash
cd repair-app
npm install
```

### 2. Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to be provisioned
3. Go to **Settings** → **API** and copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key

### 3. Configure Environment Variables

Create `.env.local` in the repair-app directory:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Set Up Database Schema

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the contents of `supabase/schema.sql`
4. Paste and run it in the SQL Editor

This will create:
- All necessary tables
- Indexes for performance
- Row Level Security policies
- Sample test data

### 5. Run the Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### 6. Test the App

Use the sample data to test:
- Email: `test@example.com`
- This will show a repair in progress

## Email Configuration (Required for Production)

The magic link authentication requires email sending. You need to implement one of these:

### Option 1: Resend (Recommended)

```bash
npm install resend
```

Add to `.env.local`:
```
RESEND_API_KEY=your-resend-api-key
```

Create `app/api/auth/send-email/route.ts`:
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const { email, magicLink } = await request.json();
  
  await resend.emails.send({
    from: 'repairs@newforestdevicerepairs.co.uk',
    to: email,
    subject: 'Access Your Repair Status',
    html: `
      <h1>Access Your Repair</h1>
      <p>Click the link below to view your repair status:</p>
      <a href="${magicLink}">View My Repair</a>
      <p>This link expires in 15 minutes.</p>
    `
  });
}
```

### Option 2: SendGrid

```bash
npm install @sendgrid/mail
```

### Option 3: Supabase Auth (Alternative)

You can also use Supabase's built-in auth instead of custom magic links.

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin your-repo-url
git push -u origin main
```

### 2. Import to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **Import Project**
3. Select your GitHub repository
4. Set the **Root Directory** to `repair-app`
5. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` (your production URL)
   - Email service keys (Resend, SendGrid, etc.)

### 3. Deploy

Click **Deploy** and wait for the build to complete.

## Admin Dashboard (TODO)

To manage repairs, you'll need to create an admin interface. Options:

1. **Build custom admin** in Next.js
2. **Use Supabase Dashboard** directly
3. **Use a tool like Retool** for quick admin UI

## Security Considerations

1. **Magic Links**: Tokens expire in 15 minutes and are single-use
2. **RLS Policies**: Currently allow public read - adjust for production
3. **Email Validation**: Ensure email addresses are verified
4. **Rate Limiting**: Add rate limiting to prevent abuse
5. **HTTPS**: Always use HTTPS in production

## Customization

### Branding

Update colors in `tailwind.config.ts`:
```typescript
colors: {
  primary: {
    DEFAULT: '#009B4D', // Your brand color
    dark: '#007A3D',
    light: '#00B95B',
  },
}
```

### Email Templates

Create branded email templates in your email service.

### Add Features

- SMS notifications (Twilio)
- File uploads (Supabase Storage)
- Payment processing (Stripe)
- Admin dashboard
- Customer reviews

## Troubleshooting

### "Cannot find module" errors
```bash
npm install
```

### Database connection errors
- Check your Supabase URL and keys
- Ensure `.env.local` is in the correct location
- Restart the dev server

### Magic links not working
- Check email service configuration
- Verify token generation in database
- Check console for errors

## Support

For issues specific to this app, check:
- Database logs in Supabase
- Browser console
- Server logs in terminal

## Next Steps

1. ✅ Set up database
2. ✅ Configure environment
3. ✅ Test locally
4. ⬜ Implement email sending
5. ⬜ Create admin interface
6. ⬜ Deploy to production
7. ⬜ Add custom domain
8. ⬜ Set up monitoring
