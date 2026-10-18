# Task Tracker - Setup Guide

## Prerequisites

- Node.js 18+ installed
- A Supabase account (free tier works)

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be fully provisioned
3. Go to **Project Settings** > **API**
4. Copy the following values:
   - **Project URL** (this will be `NEXT_PUBLIC_SUPABASE_URL`)
   - **anon public key** (this will be `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

## Step 2: Set Up Database

1. Go to **SQL Editor** in your Supabase dashboard
2. Copy the entire contents of `supabase-schema.sql` from this project
3. Paste and execute the SQL script
4. This will create:
   - `profiles` table
   - `tasks` table
   - `comments` table
   - `notifications` table
   - Row Level Security policies
   - Realtime subscriptions

## Step 3: Configure Authentication

1. Go to **Authentication** > **Providers**
2. Enable **Email** provider
3. Disable other providers (optional)
4. Go to **Authentication** > **URL Configuration**
5. Add your development and production URLs:
   - Development: `http://localhost:3000/**`
   - Production: `https://your-domain.vercel.app/**`

## Step 4: Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

## Step 5: Create Demo Users

After deployment, you can create demo users through the registration page or use the Admin dashboard.

Recommended demo accounts:
- Admin: `admin@demo.com`
- Manager: `manager@demo.com`
- Employee: `employee@demo.com`

## Step 6: Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deployment to Vercel

1. Push your code to GitHub
2. Import the repository in Vercel
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy!

## Features

### Admin Dashboard
- Create and manage users
- Assign roles (Admin, Manager, Employee)
- View system statistics

### Manager Dashboard
- Create and assign tasks to employees
- Set task priorities (BOMBE, High, Medium, Low)
- Track task progress
- Real-time notifications when tasks are completed

### Employee Dashboard
- View assigned tasks
- Update task status (To Do → In Progress → Done)
- Add comments to tasks
- Real-time notifications for new assignments

### Real-Time Features
- Live task updates
- Online presence indicators
- Browser notifications (with permission)
- Instant comment updates

## Troubleshooting

### "Invalid API key" error
- Verify your Supabase URL and anon key are correct
- Make sure environment variables are set properly

### Authentication not working
- Check that email provider is enabled in Supabase
- Verify redirect URLs are configured correctly

### RLS policy errors
- Make sure the SQL schema was executed completely
- Check that the user has a profile in the `profiles` table

## Support

For issues or feature requests, please open a GitHub issue.
