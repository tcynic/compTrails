# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Total Compensation Calculator** web application - a privacy-first, local-first application for tracking complete compensation packages including salary, bonuses, and equity grants. The project has completed Phase 1 (Foundation Implementation) and is currently in Phase 2 (Core Features Development).

## Technology Stack

### Frontend Architecture

- **Framework**: Next.js 14 with App Router
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
- **Analytics**: PostHog (privacy-first)

### Development Tools

- **Language**: TypeScript (strict mode)
- **Testing**: Vitest + Playwright
- **Linting**: ESLint + Prettier
- **CI/CD**: GitHub Actions
- **Monitoring**: Sentry + Vercel Analytics

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
npm run start           # Start production server

# Code Quality
npm run lint            # ESLint checking
npm run format          # Prettier formatting

# Testing (Coming Soon)
npm run test            # Run unit tests with Vitest
npm run test:e2e        # Run E2E tests with Playwright
npm run test:watch      # Watch mode for unit tests

# Database (Coming Soon)
npx convex dev          # Start Convex development
npx convex deploy       # Deploy Convex functions
```

## Implemented Architecture

### Authentication System
- **WorkOS Integration**: Complete OAuth setup with Google SSO
- **API Routes**: `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`, `/api/auth/me`
- **Session Management**: Cookie-based sessions with secure httpOnly cookies
- **Auth Context**: React context for authentication state management (`src/contexts/AuthContext.tsx`)

### Encryption Layer (Zero-Knowledge Architecture)
- **Key Derivation**: Argon2id with PBKDF2 fallback for compatibility (`src/lib/crypto/keyDerivation.ts`)
- **Encryption**: AES-256-GCM with Web Crypto API (`src/lib/crypto/encryption.ts`)
- **Service Layer**: High-level encryption service with password validation (`src/services/encryptionService.ts`)
- **Type Safety**: Comprehensive TypeScript interfaces (`src/lib/crypto/types.ts`)

### Local Storage System
- **Database**: Dexie wrapper for IndexedDB with automatic schema management (`src/lib/db/database.ts`)
- **Data Models**: Comprehensive TypeScript interfaces for all entities (`src/lib/db/types.ts`)
- **Local Service**: CRUD operations with encryption integration (`src/services/localStorageService.ts`)
- **Sync Service**: Background synchronization with conflict resolution (`src/services/syncService.ts`)

### Offline Capability
- **Service Worker**: Comprehensive caching with background sync (`public/sw.js`)
- **SW Manager**: Service worker lifecycle management (`src/lib/serviceWorker.ts`)
- **Offline Provider**: React context for offline state management (`src/components/providers/OfflineProvider.tsx`)

### Provider Architecture
```
RootLayout
├── ConvexClientProvider (Database connectivity)
├── AuthProvider (Authentication state)
└── OfflineProvider (Offline/sync state)
```

## Core Data Models

### Database Schema (`src/lib/db/types.ts`)

#### CompensationRecord
- **Encrypted Storage**: All sensitive data stored as `EncryptedData` objects
- **Sync Management**: `syncStatus`, `lastSyncAt`, `version` for conflict resolution
- **Types**: `'salary' | 'bonus' | 'equity'`

#### Decrypted Data Structures
- **DecryptedSalaryData**: Company, title, location, amount, date ranges
- **DecryptedBonusData**: Performance, signing, retention, spot bonuses with categorization
- **DecryptedEquityData**: ISO/NSO/RSU grants with complex vesting schedules

#### Supporting Tables
- **PendingSyncItem**: Tracks operations needing synchronization
- **UserPreferences**: Theme, currency, notifications, security settings
- **OfflineQueueItem**: API calls queued for when connectivity returns

## Development Workflow

### New Feature Development

1. **Local-First Implementation**: Start with IndexedDB operations using `LocalStorageService`
2. **Encryption Integration**: Use `EncryptionService` for all sensitive data
3. **Optimistic UI Updates**: Update UI immediately, handle sync in background
4. **Background Sync**: Use `SyncService` for cross-device synchronization
5. **Offline Handling**: Leverage `OfflineProvider` for connectivity-aware UX

### Key Implementation Patterns

#### Data Flow
```
User Action → LocalStorageService → IndexedDB → Optimistic UI Update
     ↓
SyncService → Background Sync → Convex → Cross-device Sync
```

#### Encryption Flow
```
User Data → EncryptionService.encryptData() → EncryptedData → IndexedDB
IndexedDB → EncryptedData → EncryptionService.decryptData() → User Data
```

### Performance Considerations

- **Bundle Optimization**: Webpack config excludes `argon2-browser` from server builds
- **Code Splitting**: Use route-based splitting for large features
- **Lazy Loading**: Implement virtual scrolling for large datasets
- **Worker Threads**: Use Web Workers for encryption operations

## Key Files and Directories

### Core Architecture
- `src/app/layout.tsx` - Root layout with provider hierarchy
- `src/contexts/AuthContext.tsx` - Authentication state management
- `src/components/providers/OfflineProvider.tsx` - Offline state management

### Database Layer
- `src/lib/db/database.ts` - Dexie database class with hooks
- `src/lib/db/types.ts` - TypeScript interfaces for all entities
- `src/services/localStorageService.ts` - Local CRUD operations
- `src/services/syncService.ts` - Background synchronization

### Encryption Layer
- `src/lib/crypto/` - Crypto utilities and key derivation
- `src/services/encryptionService.ts` - High-level encryption service

### Authentication
- `src/lib/workos.ts` - WorkOS client configuration
- `src/app/api/auth/` - OAuth API routes

### Offline Support
- `public/sw.js` - Service worker with caching strategies
- `src/lib/serviceWorker.ts` - Service worker lifecycle management

### Configuration
- `next.config.ts` - Webpack configuration for crypto libraries

### Project Documentation
- `context/initialPRD.md` - Complete product requirements document with technical specifications
- `context/tasks.md` - Detailed development task breakdown organized by implementation phases

## Development Rules

### Markdown Version History

All markdown files must include a version history section at the bottom when edited. This is enforced by the Cursor rule in `.cursor/rules`.

### Code Writing Best Practices

- Always use descriptive variable names
- Follow the zero-knowledge architecture - encrypt all sensitive data before storage
- Use TypeScript strict mode - all files must pass type checking
- Implement offline-first patterns - assume network unavailability

### Environment Variables

Required environment variables for development:
```bash
WORKOS_API_KEY=your_workos_api_key
WORKOS_CLIENT_ID=your_workos_client_id
WORKOS_WEBHOOK_SECRET=your_workos_webhook_secret
```

## Task Management

- Keep track of tasks in `context/tasks.md`. Add new ones to that file if needed.  When tasks are complete mark them complete in that file.
- Phase 1 (Foundation) is complete
- Currently in Phase 2 (Core Features Development)

## Important Implementation Notes

### Argon2 Compatibility
- `argon2-browser` has build compatibility issues with Next.js
- PBKDF2 fallback is implemented in `src/lib/crypto/keyDerivation.ts`
- Webpack config excludes argon2-browser from server builds

### Service Worker Registration
- Service worker is registered in `src/lib/serviceWorker.ts`
- Background sync capabilities for offline operations
- Intelligent caching strategies implemented

### Database Hooks
- Dexie hooks automatically manage timestamps and sync status
- Version tracking for conflict resolution
- User isolation for multi-tenant data

---

**Document Version History**

- v1.0 - Initial creation (2025-01-03)
- v1.1 - Added Cursor rules section and version history (2025-01-03)
- v1.2 - Added best practice about using descriptive variable names (2024-02-22)
- v1.3 - Added Task Management section with guidance for task tracking (2024-02-22)
- v2.0 - Complete rewrite to reflect Phase 1 completion and current architecture (2025-01-03)