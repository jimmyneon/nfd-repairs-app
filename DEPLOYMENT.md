# Deployment Guide - Vercel

## 🚀 Quick Deploy to Vercel

## Pre-Deployment Checklist

- [ ] Supabase project created and configured
- [ ] Database schema deployed (`supabase/schema.sql`)
- [ ] Environment variables configured
- [ ] Email service set up (Resend/SendGrid)
- [ ] Test data verified
- [ ] Code pushed to GitHub

## Vercel Deployment

### Step 1: Prepare Repository

```bash
cd repair-app
git init
git add .
git commit -m "Initial repair app deployment"
git branch -M main
git remote add origin https://github.com/yourusername/nfd-repairs.git
git push -u origin main
```

### Step 2: Import to Vercel

1. Visit [vercel.com](https://vercel.com)
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. Configure project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `repair-app`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

### Step 3: Environment Variables

Add these in Vercel dashboard under **Settings** → **Environment Variables**:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
NEXT_PUBLIC_APP_URL=https://repairs.newforestdevicerepairs.co.uk
```

If using email service (e.g., Resend):
```
RESEND_API_KEY=re_xxx...
```

### Step 4: Deploy

Click **Deploy** and wait for build to complete.

## Custom Domain Setup

### Option 1: Subdomain (Recommended)

1. In Vercel, go to **Settings** → **Domains**
2. Add domain: `repairs.newforestdevicerepairs.co.uk`
3. Add DNS records to your domain provider:
   - Type: `CNAME`
   - Name: `repairs`
   - Value: `cname.vercel-dns.com`

### Option 2: Separate Domain

If using a completely separate domain:
1. Add domain in Vercel
2. Update nameservers or add A/CNAME records as instructed

## Post-Deployment

### 1. Test Magic Links

```bash
# Test with sample data
curl -X POST https://repairs.newforestdevicerepairs.co.uk/api/auth/send-magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### 2. Update Environment

Update `NEXT_PUBLIC_APP_URL` to production URL:
```
NEXT_PUBLIC_APP_URL=https://repairs.newforestdevicerepairs.co.uk
```

### 3. Configure Email

Ensure email service is configured for production:
- Verify sender domain
- Set up SPF/DKIM records
- Test email delivery

### 4. Monitor

Set up monitoring:
- Vercel Analytics (built-in)
- Sentry for error tracking (optional)
- Supabase logs for database monitoring

## Continuous Deployment

Vercel automatically deploys on:
- **Push to main**: Production deployment
- **Pull requests**: Preview deployments

## Rollback

If issues occur:
1. Go to Vercel dashboard
2. **Deployments** tab
3. Find previous working deployment
4. Click **Promote to Production**

## Performance Optimization

### Enable Caching

Already configured in Next.js with:
- Static page generation
- API route caching
- Image optimization

### Database Optimization

Monitor slow queries in Supabase:
1. Go to **Database** → **Query Performance**
2. Add indexes as needed

### CDN

Vercel automatically uses Edge Network for:
- Static assets
- API routes (Edge Functions)
- Images

## Security

### Production Checklist

- [ ] HTTPS enabled (automatic with Vercel)
- [ ] Environment variables secured
- [ ] Rate limiting implemented
- [ ] CORS configured
- [ ] RLS policies reviewed
- [ ] Magic link expiry tested
- [ ] Email verification enabled

### Supabase Security

Review RLS policies in production:

```sql
-- Example: Restrict updates to service role only
CREATE POLICY "Only service role can update repairs" ON repairs
    FOR UPDATE USING (auth.role() = 'service_role');
```

## Maintenance

### Regular Tasks

**Weekly:**
- Check error logs
- Monitor database size
- Review slow queries

**Monthly:**
- Update dependencies
- Review security advisories
- Backup database

### Database Backups

Supabase provides automatic backups:
- Daily backups (retained 7 days) - Free tier
- Point-in-time recovery - Pro tier

Manual backup:
```bash
# Using Supabase CLI
supabase db dump -f backup.sql
```

## Scaling

### Database

If you need more performance:
1. Upgrade Supabase plan
2. Add read replicas
3. Implement caching (Redis)

### Application

Vercel scales automatically, but monitor:
- Function execution time
- Bandwidth usage
- Build minutes

## Troubleshooting

### Build Failures

```bash
# Test build locally
npm run build

# Check logs in Vercel dashboard
```

### Database Connection Issues

- Verify Supabase URL and keys
- Check IP allowlist in Supabase
- Review RLS policies

### Email Not Sending

- Check API key validity
- Verify sender domain
- Review email service logs
- Check spam folders

## Support Resources

- **Vercel Docs**: https://vercel.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **Supabase Docs**: https://supabase.com/docs
- **Resend Docs**: https://resend.com/docs

## Cost Estimation

### Free Tier (Development)

- **Vercel**: Free for hobby projects
- **Supabase**: Free tier (500MB database, 2GB bandwidth)
- **Resend**: 100 emails/day free

### Production (Estimated)

- **Vercel Pro**: $20/month
- **Supabase Pro**: $25/month
- **Resend**: $20/month (50k emails)

**Total**: ~$65/month for professional setup
