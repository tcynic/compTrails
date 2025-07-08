# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Total Compensation Calculator** web application - a privacy-first, local-first application for tracking complete compensation packages including salary, bonuses, and equity grants. The project is **production-ready** with all core features implemented and deployed.

## Technology Stack

### Frontend Architecture

- **Framework**: Next.js 15 with App Router
- **UI**: Tailwind CSS + Radix UI components
- **State Management**: Zustand + Convex hooks
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts (lazy loaded)
- **Encryption**: Web Crypto API + Argon2 WASM

### Backend Architecture

- **Database**: Convex (real-time, ACID compliant)
- **Authentication**: WorkOS (SSO + audit logs)
- **Hosting**: Vercel Edge Functions
- **Cache**: Vercel KV (Redis)
- **Configuration**: Vercel Edge Config
- **Analytics**: PostHog (privacy-first, implemented with opt-out)

### Development Tools

- **Language**: TypeScript (strict mode)
- **Linting**: ESLint + Prettier
- **CI/CD**: GitHub Actions
- **Monitoring**: Vercel Analytics + PostHog (privacy-first)
- **Bundle Analysis**: @next/bundle-analyzer

## Convex Development Notes

- Use `npx convex dev` to push changes to Convex mutations

## Key Architectural Principles

### Local-First Design

- All operations should work offline first
- Data stored in IndexedDB for immediate access
- Background sync to Convex for cross-device synchronization
- Optimistic UI updates for <50ms response times

### Zero-Knowledge Security

- All sensitive data encrypted client-side with AES-256-GCM
- Encryption keys derived from user credentials using Argon2id
- Backend never has access to plaintext financial data
- WorkOS handles authentication and audit logging

### Performance Targets

- **Bundle Size**: <100KB gzipped core bundle
- **Load Time**: <2s on 3G networks
- **Local Operations**: <50ms response time
- **Sync Operations**: <500ms for typical batch

## Common Commands

```bash
# Development
npm run dev              # Start development server with Turbopack
npm run build           # Build for production
npm run build:analyze   # Build with bundle analysis
npm run start           # Start production server

# Code Quality
npm run lint            # ESLint checking
npm run format          # Prettier formatting

# Deployment
npm run deploy:staging  # Deploy to staging environment
npm run deploy:prod     # Deploy to production environment
```

## Project Documentation

- Refer to @context/initialPRD.md for the product design 
- Refer to @deployment.md for any questions about deployment methods
- Refer to @context/architecture.md for the architecture of the application

**Document Version History**

- v1.0 - Initial creation (2025-01-03)
- v1.1 - Added Cursor rules section and version history (2025-01-03)
- v1.2 - Added best practice about using descriptive variable names (2024-02-22)
- v1.3 - Added Task Management section with guidance for task tracking (2024-02-22)
- v2.0 - Complete rewrite to reflect Phase 1 completion and current architecture (2025-01-03)
- v2.1 - Updated to reflect production-ready status, added PostHog analytics details, PWA configuration, deployment setup, and implemented features documentation (2025-07-07)
- v2.2 - Added Convex development note about using `npx convex dev` to push mutations (2024-02-22)
- v2.3 - Added reference to initialPRD.md for product design documentation (2024-07-10)
- v2.4 - Added reference to @deployment.md for deployment methods (2024-07-10)
- v2.5 - Added reference to @context/architecture.md for application architecture (2024-07-11)