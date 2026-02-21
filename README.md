# NFD Repairs - Repair Jobs Management App

A mobile-first Next.js application for managing device repair jobs at New Forest Device Repairs. Built with Next.js 14, TypeScript, Tailwind CSS, and Supabase.

**IMPORTANT**: This app handles the post-acceptance repair workflow. It is separate from the AI responder system that handles enquiries and quotes.

## Features

- **Staff Interface** - Mobile-optimized job management with authentication
- **Job Lifecycle Management** - Track repairs through 8 distinct statuses
- **Customer Tracking** - GDPR-safe public tracking page (no personal data)
- **SMS Notifications** - Template-based customer updates via API
- **Real-time Updates** - Supabase Realtime for instant notifications
- **API Integration** - REST endpoint for AI system to create jobs
- **Audit Trail** - Complete event history for every job

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Magic Links (custom implementation)
- **Icons**: Lucide React
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Supabase account and project

### Installation

1. Clone the repository and navigate to the repair-app directory:
```bash
cd repair-app
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. Set up the database (see Database Setup below)

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Database Setup

Run the SQL schema in your Supabase SQL editor (see `supabase/schema.sql`).

The database includes:
- `repairs` - Main repair records
- `repair_updates` - Status updates and messages
- `issues` - Customer-reported issues and warranty claims
- `magic_links` - Authentication tokens

## Project Structure

```
repair-app/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   └── auth/         # Authentication endpoints
│   ├── auth/             # Auth pages
│   ├── repair/           # Repair tracking pages
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Home page
│   └── globals.css       # Global styles
├── components/            # React components
├── lib/                   # Utilities and configurations
│   ├── supabase.ts       # Supabase client
│   └── utils.ts          # Helper functions
├── public/               # Static assets
└── supabase/             # Database schema and migrations
```

## Key Features Explained

### Magic Link Authentication

1. Customer enters their email
2. System checks for repairs associated with that email
3. Generates a unique token with 15-minute expiry
4. Sends magic link via email (you'll need to implement email sending)
5. Customer clicks link and is authenticated

### Repair Status Flow

1. **Received** - Device received and logged
2. **Diagnosing** - Technician assessing the issue
3. **Awaiting Parts** - Waiting for replacement components
4. **Repairing** - Active repair work
5. **Testing** - Quality assurance testing
6. **Completed** - Repair finished
7. **Ready for Collection** - Customer can collect
8. **Collected** - Device returned to customer

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import the project in Vercel
3. Set environment variables in Vercel dashboard
4. Deploy!

The app is optimized for Vercel with automatic deployments on push.

## TODO

- [ ] Implement email sending for magic links (Resend, SendGrid, etc.)
- [ ] Add admin dashboard for staff
- [ ] Implement issue reporting form
- [ ] Add SMS notifications (optional)
- [ ] Add file upload for repair photos
- [ ] Implement payment integration

## Design System

The app uses a design system inspired by the New Forest Device Repairs website:

- **Primary Color**: Forest Green (#009B4D)
- **Secondary Color**: Tangerine Yellow (#FFCC00)
- **Font**: Poppins
- **Components**: Custom Tailwind utilities

## License

Proprietary - New Forest Device Repairs
