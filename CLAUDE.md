# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Total Compensation Calculator** web application - a privacy-first, local-first application for tracking complete compensation packages including salary, bonuses, and equity grants. The project is currently in the planning phase with a detailed PRD in `context/initialPRD.md`.

## Planned Technology Stack

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

Since this is a new project, these commands are planned based on the technology stack:

```bash
# Development
npm run dev              # Start development server
npm run build           # Build for production
npm run start           # Start production server

# Code Quality
npm run lint            # ESLint checking
npm run lint:fix        # ESLint with auto-fix
npm run type-check      # TypeScript checking
npm run format          # Prettier formatting

# Testing
npm run test            # Run unit tests with Vitest
npm run test:e2e        # Run E2E tests with Playwright
npm run test:watch      # Watch mode for unit tests

# Database
npx convex dev          # Start Convex development
npx convex deploy       # Deploy Convex functions
```

## Core Data Models

### Compensation Records

- **Salary**: Base salary with company, title, location, date ranges
- **Bonuses**: Performance, signing, retention, spot bonuses with categorization
- **Equity**: ISO/NSO/RSU grants with complex vesting schedules

### Security Features

- Client-side encryption of all financial data
- WorkOS integration for enterprise SSO
- Audit logging for all data access
- Session management with 15-minute idle timeout

## Development Workflow

### New Feature Development

1. Implement local-first: Start with IndexedDB operations
2. Add optimistic UI updates for immediate feedback
3. Implement background sync to Convex
4. Add proper error handling and offline scenarios
5. Encrypt sensitive data before storage

### Performance Considerations

- Use route-based code splitting for large features
- Implement virtual scrolling for large datasets
- Leverage Web Workers for heavy calculations
- Use WASM for encryption operations when needed

## Key Files and Directories

- `context/initialPRD.md` - Complete product requirements document
- `.cursor/rules` - Cursor IDE rules including markdown version history requirements
- Future structure will likely include:
  - `src/app/` - Next.js app directory
  - `src/components/` - Reusable UI components
  - `src/lib/` - Utility functions and configurations
  - `convex/` - Convex backend functions
  - `tests/` - Test files

## Development Rules

### Markdown Version History

All markdown files must include a version history section at the bottom when edited. This is enforced by the Cursor rule in `.cursor/rules`.

---

**Document Version History**

- v1.0 - Initial creation (2025-01-03)
- v1.1 - Added Cursor rules section and version history (2025-01-03)
