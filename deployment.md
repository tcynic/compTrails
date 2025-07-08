# Deployment Guide

## Overview

This Total Compensation Calculator application uses a modern deployment architecture with:
- **Frontend**: Vercel for hosting with Edge Functions
- **Database**: Convex for real-time data synchronization
- **Authentication**: WorkOS for enterprise SSO
- **Analytics**: PostHog for privacy-first analytics

The deployment supports separate staging and production environments with automatic branch-based deployments.

## Environment Setup

### Staging Environment
- **URL**: `https://comp-trails-staging.vercel.app`
- **Branch**: `staging` (auto-deploys)
- **Environment**: `staging`
- **Convex**: Development deployment
- **WorkOS**: Development environment

### Production Environment
- **URL**: `https://comp-trails.vercel.app`
- **Branch**: `main` (auto-deploys)
- **Environment**: `production`
- **Convex**: Production deployment
- **WorkOS**: Production environment

## Initial Setup

### 1. Prerequisites
Before deployment, ensure you have:
- Node.js 18+ installed
- Vercel CLI installed: `npm i -g vercel`
- Convex CLI installed: `npm i -g convex`
- Access to WorkOS dashboard
- PostHog account for analytics

### 2. Login to Vercel
```bash
vercel login
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Setup Convex
```bash
# Login to Convex
npx convex login

# Initialize Convex (if not already done)
npx convex dev

# Deploy Convex functions
npx convex deploy --prod  # for production
npx convex dev           # for development/staging
```

### 5. Link Vercel Project
```bash
vercel link
```

### 6. Create Projects
You'll need to create two separate Vercel projects:
- `comp-trails-staging` (for staging)
- `comp-trails` (for production)

## Environment Variables

### Required Variables
All environment variables must be set in Vercel dashboard for each environment. Use `.env.example` as a reference:

#### Authentication (WorkOS)
- `WORKOS_API_KEY` - WorkOS API key for authentication
- `WORKOS_CLIENT_ID` - WorkOS client ID
- `WORKOS_WEBHOOK_SECRET` - Secret for webhook validation

#### Database (Convex)
- `CONVEX_DEPLOYMENT` - Convex deployment ID (different for staging/prod)
- `NEXT_PUBLIC_CONVEX_URL` - Public Convex URL for client connections

#### Analytics & Monitoring
- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog project API key
- `NEXT_PUBLIC_POSTHOG_HOST` - PostHog instance URL (usually app.posthog.com)
- `SENTRY_DSN` - Sentry DSN for error tracking
- `SENTRY_ORG` - Sentry organization slug
- `SENTRY_PROJECT` - Sentry project slug
- `SENTRY_AUTH_TOKEN` - Sentry authentication token

#### Application Configuration
- `NEXT_PUBLIC_ENVIRONMENT` - Environment name (`staging` or `production`)
- `NEXT_PUBLIC_APP_URL` - Base URL for the application
- `NODE_ENV` - Node environment (`development`, `staging`, or `production`)

#### Security (Optional but Recommended)
- `ENCRYPTION_KEY` - Additional encryption key for sensitive operations
- `RATE_LIMIT_SECRET` - Secret for rate limiting middleware

### Setting Environment Variables

#### Via Vercel Dashboard
1. Go to your Vercel project dashboard
2. Navigate to "Settings" → "Environment Variables"
3. Add each variable with appropriate values for each environment:
   - **Development**: Used for `vercel dev` and Vercel preview deployments
   - **Preview**: Used for branch deployments (staging)
   - **Production**: Used for production deployments

#### Via CLI
```bash
# Set environment variables for different environments
vercel env add WORKOS_API_KEY development
vercel env add WORKOS_API_KEY preview     # for staging
vercel env add WORKOS_API_KEY production

# Pull environment variables to local .env files
vercel env pull .env.local
```

#### From .env Files
For bulk upload, you can prepare environment files and use:
```bash
# Upload from file
vercel env add < .env.staging
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

### 1. Local Development
```bash
# Create feature branch
git checkout -b feature/new-feature

# Install dependencies
npm install

# Start development servers
npm run dev          # Next.js development server
npx convex dev      # Convex development (in separate terminal)

# Test locally
npm run test        # Run tests
npm run lint        # Check code quality
npm run build       # Test production build
```

### 2. Staging Deployment
```bash
# Ensure Convex functions are deployed
npx convex dev --once  # Push latest functions to dev deployment

# Merge to staging for testing
git checkout staging
git merge feature/new-feature
git push origin staging

# Vercel auto-deploys to staging environment
# Check deployment at: https://comp-trails-staging.vercel.app
```

### 3. Production Deployment
```bash
# Deploy Convex to production
npx convex deploy --prod

# After staging testing, merge to main
git checkout main
git merge staging
git push origin main

# Vercel auto-deploys to production environment
# Check deployment at: https://comp-trails.vercel.app
```

### 4. Hotfix Process
```bash
# For urgent production fixes
git checkout main
git checkout -b hotfix/urgent-fix

# Make fix and test
npm run build
npm run test

# Deploy Convex if needed
npx convex deploy --prod

# Deploy to production
git push origin hotfix/urgent-fix
# Create PR to main, then merge and deploy
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
1. **TypeScript Errors**: 
   - Run `npm run build` locally to catch issues early
   - Check for missing type definitions or imports
   - Use `npx convex dev --typecheck=disable` if Convex deployment fails due to types
   
2. **Environment Variables**: 
   - Verify all required variables are set in Vercel dashboard
   - Check variable names match exactly (case-sensitive)
   - Ensure client-side variables start with `NEXT_PUBLIC_`

3. **Dependencies**: 
   - Verify all dependencies are in `package.json`
   - Clear npm cache: `npm cache clean --force`
   - Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`

#### Convex Issues
1. **Schema Sync**: 
   ```bash
   npx convex dev --once  # Sync development
   npx convex deploy --prod  # Sync production
   ```

2. **Function Deployment**:
   - Check Convex dashboard for deployment status
   - Verify function names match between client and server
   - Review Convex logs for runtime errors

3. **Authentication**:
   - Ensure `CONVEX_DEPLOYMENT` matches the deployed environment
   - Check WorkOS integration is properly configured

#### Sync Service Errors
1. **ArgumentValidationError**:
   - Usually indicates schema mismatch between client and Convex
   - Deploy latest Convex functions: `npx convex dev --once`
   - Check if new fields need to be added to Convex schema

2. **Network Issues**:
   - Verify application works offline-first
   - Check browser network tab for failed requests
   - Monitor sync status in application UI

#### Performance Issues
1. **Bundle Size**:
   - Run `npm run build:analyze` to check bundle sizes
   - Review dynamic imports and code splitting
   - Check for unnecessary dependencies

2. **Runtime Performance**:
   - Monitor Vercel Analytics dashboard
   - Check PostHog for user behavior insights
   - Review Sentry for performance metrics

### Debugging Commands

```bash
# Check deployment status
vercel ls

# View deployment logs
vercel logs [deployment-url]

# Test production build locally
npm run build
npm run start

# Check Convex deployment
npx convex dashboard

# Monitor real-time logs
npx convex logs --tail
```

### Support Resources
- **Vercel**: https://vercel.com/docs
- **Convex**: https://docs.convex.dev
- **WorkOS**: https://workos.com/docs
- **Next.js**: https://nextjs.org/docs
- **Project Logs**: Check Vercel dashboard and Sentry for detailed error tracking

## Security Considerations

### Environment Variables
- Never commit actual environment variable values
- Use Vercel's encrypted storage for sensitive data
- Rotate keys regularly

### Branch Protection
- Protect `main` branch with required reviews
- Use staging environment for testing
- Implement automated checks before deployment

## Best Practices

### Pre-Deployment Checklist
- [ ] All tests pass locally (`npm run test`)
- [ ] Build completes without errors (`npm run build`)
- [ ] Convex functions deployed (`npx convex dev --once`)
- [ ] Environment variables configured in Vercel
- [ ] Feature tested in staging environment
- [ ] Security audit completed for sensitive changes
- [ ] Performance impact assessed
- [ ] Documentation updated

### Deployment Schedule
- **Staging**: Deploy anytime for testing
- **Production**: Deploy during low-traffic hours (typically weekends or off-peak)
- **Hotfixes**: Deploy immediately after testing

### Rollback Strategy
```bash
# If deployment fails, rollback using Vercel dashboard or CLI
vercel rollback [deployment-url]

# Or revert to previous commit
git revert [commit-hash]
git push origin main
```

### Monitoring Post-Deployment
1. **Immediate (0-15 minutes)**:
   - Check application loads correctly
   - Verify user authentication works
   - Test core compensation tracking features
   - Monitor error rates in Sentry

2. **Short-term (15 minutes - 2 hours)**:
   - Monitor user activity in PostHog
   - Check sync service performance
   - Review Convex function execution logs
   - Verify offline functionality

3. **Long-term (2+ hours)**:
   - Monitor user retention and feature adoption
   - Review performance metrics in Vercel Analytics
   - Check for any user-reported issues
   - Assess impact on key business metrics

---

**Document Version History**

- v1.0 - Initial deployment guide creation (2025-01-04)
- v2.0 - Enhanced with current architecture, Convex integration, and comprehensive troubleshooting (2025-01-08)