# Deployment Guide

## Overview

This project uses Vercel for hosting with separate staging and production environments.

## Environment Setup

### Staging Environment
- **URL**: `https://comp-trails-staging.vercel.app`
- **Branch**: `staging` (auto-deploys)
- **Environment**: `staging`

### Production Environment
- **URL**: `https://comp-trails.vercel.app`
- **Branch**: `main` (auto-deploys)
- **Environment**: `production`

## Initial Setup

### 1. Login to Vercel
```bash
vercel login
```

### 2. Link Project
```bash
vercel link
```

### 3. Create Projects
You'll need to create two separate Vercel projects:
- `comp-trails-staging` (for staging)
- `comp-trails` (for production)

## Environment Variables

### Required Variables
All environment variables from `.env.staging` and `.env.production` must be set in Vercel dashboard:

#### Authentication (WorkOS)
- `WORKOS_API_KEY`
- `WORKOS_CLIENT_ID`
- `WORKOS_WEBHOOK_SECRET`

#### Database (Convex)
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`

#### Analytics & Monitoring
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_AUTH_TOKEN`

#### Application Configuration
- `NEXT_PUBLIC_ENVIRONMENT`
- `NEXT_PUBLIC_APP_URL`

### Setting Environment Variables

#### Via Vercel Dashboard
1. Go to your project settings
2. Navigate to "Environment Variables"
3. Add each variable with appropriate values for staging/production

#### Via CLI
```bash
# Set staging environment variables
vercel env add WORKOS_API_KEY staging

# Set production environment variables
vercel env add WORKOS_API_KEY production
```

## Branch-Based Deployments

### Automatic Deployments
- **Staging**: Pushes to `staging` branch auto-deploy to staging environment
- **Production**: Pushes to `main` branch auto-deploy to production environment

### Manual Deployments
```bash
# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:prod
```

## Deployment Workflow

### 1. Feature Development
```bash
# Create feature branch
git checkout -b feature/new-feature

# Develop and test locally
npm run dev

# Push to feature branch
git push origin feature/new-feature
```

### 2. Staging Deployment
```bash
# Merge to staging for testing
git checkout staging
git merge feature/new-feature
git push origin staging

# Vercel auto-deploys to staging environment
```

### 3. Production Deployment
```bash
# After testing, merge to main
git checkout main
git merge staging
git push origin main

# Vercel auto-deploys to production environment
```

## Build Configuration

### Next.js Configuration
The project uses Next.js 15 with:
- **Turbopack** for development
- **App Router** architecture
- **Server Components** where applicable
- **Static generation** for optimal performance

### Vercel Configuration
See `vercel.json` for:
- Build commands
- Environment variable mapping
- Function timeout settings
- Region configuration

## Monitoring

### Build Logs
- Check Vercel dashboard for build logs
- Monitor deployment status in real-time

### Application Monitoring
- **Sentry**: Error tracking and performance monitoring
- **PostHog**: User analytics and feature usage
- **Vercel Analytics**: Core web vitals and performance

## Troubleshooting

### Common Issues

#### Build Failures
1. Check environment variables are set correctly
2. Verify all dependencies are listed in `package.json`
3. Review build logs in Vercel dashboard

#### Environment Variable Issues
1. Ensure all required variables are set for each environment
2. Check variable names match exactly
3. Verify sensitive values are not exposed to client-side

#### Database Connection Issues
1. Verify Convex deployment URLs
2. Check authentication tokens
3. Ensure database schemas are synced

### Support
- Review Vercel documentation
- Check project logs in Vercel dashboard
- Monitor error tracking in Sentry

## Security Considerations

### Environment Variables
- Never commit actual environment variable values
- Use Vercel's encrypted storage for sensitive data
- Rotate keys regularly

### Branch Protection
- Protect `main` branch with required reviews
- Use staging environment for testing
- Implement automated checks before deployment

---

**Document Version History**

- v1.0 - Initial deployment guide creation (2025-01-04)