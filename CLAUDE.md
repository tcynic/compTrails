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
- Use `npx convex deploy --prod` for production deployments
- Convex functions are in `/convex/` directory with TypeScript schema
- All sensitive data is stored encrypted in Convex (zero-knowledge architecture)

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

### Three-Tier Performance Optimization System

- **Tier 1**: Session cache for instant page navigation (0ms loads)
- **Tier 2**: Summary-first loading with minimal encrypted payloads
- **Tier 3**: Key derivation cache (80-90% faster repeat operations)
- **Result**: 95%+ reduction in load times after initial authentication

### Performance Targets

- **Bundle Size**: <100KB gzipped core bundle
- **Load Time**: <2s on 3G networks (0ms on repeat visits)
- **Local Operations**: <50ms response time
- **Sync Operations**: <500ms for typical batch

## Common Commands

```bash
# Development
npm run dev              # Start development server with Turbopack
npm run build           # Build for production (includes WASM copy)
npm run build:analyze   # Build with bundle analysis
npm run start           # Start production server

# Code Quality
npm run lint            # ESLint checking
npm run format          # Prettier formatting

# Special Commands
npm run copy-wasm       # Copy Argon2 WASM files to public directory

# Deployment
npm run deploy:staging  # Deploy to staging environment
npm run deploy:prod     # Deploy to production environment
```

## Codebase Architecture

### Project Structure

```
src/
├── app/                    # Next.js App Router (pages and API routes)
│   ├── dashboard/         # Main dashboard pages
│   └── api/              # API endpoints (auth, emergency-sync)
├── components/            # React components
│   ├── features/         # Feature-specific components
│   │   ├── bonus/       # Bonus tracking
│   │   ├── equity/      # Equity management
│   │   └── salary/      # Salary tracking
│   └── ui/              # Reusable UI components
├── lib/                   # Core libraries
│   ├── crypto/          # Encryption/decryption (Argon2 + AES)
│   ├── db/              # IndexedDB interface (Dexie)
│   └── validations/     # Zod schemas
├── services/             # Business logic services
│   ├── syncService.ts   # Online/offline sync
│   └── encryptionService.ts  # Client-side encryption
└── hooks/               # Custom React hooks
```

### Key Development Patterns

- **Feature-based organization**: Components organized by feature (salary, bonus, equity)
- **Service layer pattern**: Business logic separated from UI components
- **Global Loading Context**: Single `useCompensationData` hook prevents duplicate operations
- **Session-based caching**: Full record pre-loading for instant page navigation
- **Smart cache invalidation**: Automatic cache updates after form submissions
- **Zero-knowledge encryption**: All sensitive data encrypted before storage
- **Optimistic updates**: UI updates immediately, sync happens in background

### Testing

- Limited testing setup currently implemented
- Manual encryption tests available in `src/lib/crypto/__tests__/encryption.test.ts`
- No formal test framework configured - consider adding Vitest or Jest for comprehensive testing

### Critical Dependencies

- **Argon2 WASM**: Requires `npm run copy-wasm` for proper builds
- **Dexie**: IndexedDB wrapper for local storage
- **Convex**: Real-time database with TypeScript integration
- **WorkOS**: Enterprise authentication with audit logging

## Critical Development Notes

### Data Loading Architecture

- **GlobalLoadingContext**: Provides single source of truth for all compensation data
- **useCompensationSummaries**: Optimized hook for dashboard display (minimal fields)
- **useCompensationData**: Full record loading with three-tier caching system
- **sessionDataCache**: Manages both summary and full record caching with TTL

### Cache Invalidation Pattern

When modifying data, always invalidate the session cache:
```typescript
import { sessionDataCache } from '@/services/sessionDataCache';

// After successful form submission or data modification
sessionDataCache.invalidateUser(user.id);
```

### Encryption Service Usage

All sensitive data must be encrypted before storage:
```typescript
import { EncryptionService } from '@/services/encryptionService';

// Encrypt data before storage
const encryptedData = await EncryptionService.encryptData(
  JSON.stringify(sensitiveData), 
  password
);
```

### Sync Service Integration

The sync service handles bidirectional synchronization:
- Use `SyncService.triggerBidirectionalSync()` for manual sync
- Background sync runs automatically every 5 minutes when online
- Offline queue maintains operations until connectivity restored

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
- v2.6 - Enhanced with detailed codebase architecture, project structure, development patterns, and current testing status (2025-07-10)
- v2.7 - Added three-tier performance optimization system details, critical development patterns, data loading architecture, and cache management guidance (2025-07-13)