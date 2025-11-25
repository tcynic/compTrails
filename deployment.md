# Deployment Guide

## Overview

This project uses a single Vercel project (`comptrails`) with Git integration for automatic deployments:
- `main` branch → Production environment
- `staging` branch → Preview environment
- Feature branches → Ephemeral preview deployments

## Initial Setup

### 1. Create Vercel Project

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Name the project: `comptrails`
5. Configure build settings (Vercel auto-detects Next.js)
6. Deploy

### 2. Configure Git Integration

Vercel automatically configures:
- Production branch: `main`
- Automatic deployments on push
- Preview deployments for pull requests

### 3. Set Production Branch

In Vercel project settings:
1. Go to **Settings** → **Git**
2. Set **Production Branch** to `main`
3. Enable **Automatic deployments for Production Branch**

## Environment Variables

### Required Variables

Set these in Vercel dashboard under **Settings** → **Environment Variables**:

#### Authentication (Clerk)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk publishable key
- `CLERK_SECRET_KEY` - Clerk secret key (use different keys for production vs preview)

#### Database (Convex)
- `NEXT_PUBLIC_CONVEX_URL` - Convex deployment URL

#### Application Configuration
- `NEXT_PUBLIC_APP_URL` - Your application URL (e.g., `https://comptrails.vercel.app`)

### Setting Environment Variables

1. Go to your Vercel project → **Settings** → **Environment Variables**
2. Add each variable
3. Select which environments to apply:
   - **Production**: Applied to `main` branch deployments
   - **Preview**: Applied to `staging` and feature branch deployments
   - **Development**: For local development (optional)

**Tip**: Use separate Clerk applications for production and preview environments for better isolation.

## Deployment Workflow

### Feature Development

```bash
# Create feature branch
git checkout -b feature/new-feature

# Develop and test locally
npm run dev

# Commit and push
git add .
git commit -m "Add new feature"
git push origin feature/new-feature
```

Vercel automatically creates a preview deployment for your feature branch.

### Deploy to Staging

```bash
# Merge to staging branch
git checkout staging
git merge feature/new-feature
git push origin staging
```

Vercel deploys to preview environment automatically.

### Deploy to Production

```bash
# After testing in staging, merge to main
git checkout main
git merge staging
git push origin main
```

Vercel deploys to production automatically.

## Build Configuration

### Next.js

The project uses:
- **Next.js 15** with App Router
- **Turbopack** for development builds
- **React 19** with Server Components
- **Tailwind CSS 4** for styling

### Vercel Settings

`vercel.json` specifies:
- **Region**: `iad1` (US East)
- **Function timeout**: 30s for API routes

Vercel auto-detects Next.js and uses optimal build settings.

## Monitoring

### Deployment Status

- View deployments in Vercel dashboard
- Check build logs for errors
- Preview URLs available immediately after deployment

### Production Monitoring

- **Vercel Analytics**: Built-in performance monitoring
- **Vercel Logs**: Real-time function logs
- **Build Logs**: Detailed build output

## Troubleshooting

### Build Failures

1. Check environment variables are set correctly
2. Verify all dependencies in `package.json`
3. Review build logs in Vercel dashboard
4. Ensure TypeScript compilation succeeds locally

### Environment Variable Issues

- Verify variables are set for correct environment (Production vs Preview)
- Check for typos in variable names
- Ensure `NEXT_PUBLIC_*` variables are set at build time
- Redeploy after changing environment variables

### Authentication Issues

- Verify Clerk keys match the environment
- Check allowed domains in Clerk dashboard
- Ensure production uses production Clerk keys

## Security Best Practices

### Environment Variables

- Never commit `.env.local` or actual secrets to Git
- Use separate Clerk apps for production vs preview
- Rotate keys regularly
- Use Vercel's encrypted environment variable storage

### Branch Protection

- Protect `main` branch with required reviews
- Require status checks to pass before merging
- Use `staging` branch for testing before production

---

**Document Version History**

- v1.0 - Initial deployment guide creation (2025-01-04)
- v2.0 - Simplified to single Vercel project with Clerk auth (2025-11-25)
