# Total Compensation Calculator - Development Tasks

This document contains a comprehensive task list for building the Total Compensation Calculator application, broken down into manageable steps suitable for junior developers.

## Prerequisites

Before starting development, ensure you have:

- Node.js 18+ installed
- Git configured
- Basic knowledge of React, TypeScript, and Next.js
- Access to required service accounts (will be provided by team lead)

## Phase 1: Foundation Setup (Weeks 1-2)

### 1.1 Project Initialization

#### Task 1.1.1: Create Next.js Project

- [x] Run `npx create-next-app@latest comp-trails --typescript --tailwind --app`
- [x] Choose "Yes" for ESLint
- [x] Choose "Yes" for `src/` directory
- [x] Navigate to project: `cd comp-trails`
- [x] Test initial setup: `npm run dev`
- [x] Verify app loads at <http://localhost:3000>

#### Task 1.1.2: Configure TypeScript

- [x] Open `tsconfig.json`
- [x] Set `"strict": true` in compilerOptions
- [x] Add `"noImplicitAny": true`
- [x] Add `"strictNullChecks": true`
- [x] Run `npm run build` to verify no TypeScript errors

#### Task 1.1.3: Setup Code Quality Tools

- [x] Install Prettier: `npm install --save-dev prettier`
- [x] Create `.prettierrc` file with team standards
- [x] Install Prettier ESLint plugin: `npm install --save-dev eslint-config-prettier`
- [x] Update `eslint.config.mjs` to include prettier config
- [x] Create `.prettierignore` file
- [x] Add format script to package.json: `"format": "prettier --write ."`

#### Task 1.1.4: Initialize Git Repository

- [x] Run `git init` (if not already initialized)
- [x] Create `.gitignore` file
- [x] Add node_modules, .env.local, .next to .gitignore
- [x] Make initial commit: `git add . && git commit -m "Initial project setup"`

### 1.2 Environment Configuration

#### Task 1.2.1: Setup Environment Variables

- [x] Create `.env.local` file in root directory
- [x] Create `.env.example` with placeholder values
- [x] Add environment variables for:
  - `NEXT_PUBLIC_APP_URL`
  - `NEXT_PUBLIC_CONVEX_URL` (placeholder)
  - `WORKOS_API_KEY` (placeholder)
  - `WORKOS_CLIENT_ID` (placeholder)
- [x] Add `.env.local` to `.gitignore`

#### Task 1.2.2: Install Core Dependencies

- [x] Install UI libraries: `npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-slot`
- [x] Install form libraries: `npm install react-hook-form zod @hookform/resolvers`
- [x] Install utility libraries: `npm install clsx tailwind-merge class-variance-authority`
- [x] Install date library: `npm install date-fns`
- [x] Verify all packages installed: `npm list`

### 1.3 Convex Setup

#### Task 1.3.1: Install and Initialize Convex

- [x] Install Convex: `npm install convex`
- [x] Run Convex setup: `npx convex dev` (manually created config files due to non-interactive terminal)
- [x] Follow prompts to create new Convex project (manually configured)
- [x] Save deployment URL to `.env.local` (placeholder added)
- [x] Verify `convex/` directory created

#### Task 1.3.2: Create Initial Schema

- [x] Create `convex/schema.ts` file
- [x] Define User table with basic fields (id, email, name)
- [x] Define CompensationRecord table with fields:
  - userId (string)
  - type (salary/bonus/equity)
  - amount (number)
  - currency (string)
  - createdAt (number)
- [x] Run `npx convex dev` to sync schema

#### Task 1.3.3: Setup Convex Client Provider

- [x] Create `src/providers/ConvexClientProvider.tsx`
- [x] Import ConvexProvider from "convex/react"
- [x] Wrap app with ConvexProvider in `app/layout.tsx`
- [x] Add "use client" directive to provider file
- [x] Test connection with simple query

### 1.4 WorkOS Authentication Setup

#### Task 1.4.1: Install WorkOS SDK

- [x] Install WorkOS: `npm install @workos-inc/node`
- [x] Create `src/lib/workos.ts` file
- [x] Initialize WorkOS client with API key
- [x] Export configured client

#### Task 1.4.2: Create Auth API Routes

- [x] Create `app/api/auth/login/route.ts`
- [x] Implement GET handler for SSO authorization URL
- [x] Create `app/api/auth/callback/route.ts`
- [x] Implement GET handler for OAuth callback
- [x] Add error handling for failed auth

#### Task 1.4.3: Create Auth Context

- [x] Create `src/contexts/AuthContext.tsx`
- [x] Define auth state interface (user, loading, error)
- [x] Implement login and logout functions
- [x] Create useAuth hook
- [x] Wrap app with AuthProvider

#### Task 1.4.4: Build Login Page

- [x] Create `app/login/page.tsx`
- [x] Add "Sign in with Google" button
- [x] Style with Tailwind CSS
- [x] Handle loading states

### 1.5 Encryption Implementation

#### Task 1.5.1: Setup Encryption Utilities

- [x] Create `src/lib/crypto/encryption.ts`
- [x] Implement generateKey function using Web Crypto API
- [x] Implement encrypt function (AES-256-GCM)
- [x] Implement decrypt function
- [x] Add TypeScript types for encrypted data

#### Task 1.5.2: Install Argon2 WASM

- [x] Install argon2-browser: `npm install argon2-browser`
- [x] Create `src/lib/crypto/keyDerivation.ts`
- [x] Implement deriveKey function with Argon2id
- [x] Set appropriate memory/iteration parameters
- [x] Test key derivation in browser console

#### Task 1.5.3: Create Encryption Service

- [x] Create `src/services/encryptionService.ts`
- [x] Implement encryptData method
- [x] Implement decryptData method
- [x] Add methods for key management
- [x] Create unit tests for encryption/decryption

### 1.6 IndexedDB Setup

#### Task 1.6.1: Install Dexie (IndexedDB Wrapper)

- [x] Install Dexie: `npm install dexie`
- [x] Create `src/lib/db/database.ts`
- [x] Define database schema
- [x] Create tables for:
  - compensationRecords
  - pendingSync
  - userPreferences

#### Task 1.6.2: Create Local Storage Service

- [x] Create `src/services/localStorageService.ts`
- [x] Implement CRUD operations for compensation records
- [x] Add methods for querying by date range
- [x] Implement sync queue management
- [x] Add error handling and fallbacks

#### Task 1.6.3: Setup Service Worker

- [x] Create `public/sw.js` file
- [x] Implement basic caching strategy
- [x] Add offline detection
- [x] Register service worker in `app/layout.tsx`
- [x] Test offline functionality

## Phase 2: Core Features (Weeks 3-4)

### 2.1 UI Component Library

#### Task 2.1.1: Setup Component Structure

- [x] Create `src/components/ui/` directory
- [x] Create `src/components/features/` directory
- [x] Create `src/components/layouts/` directory
- [x] Add index.ts files for exports

#### Task 2.1.2: Build Base UI Components

- [x] Create Button component with variants
- [x] Create Input component with validation states
- [x] Create Card component
- [x] Create Dialog/Modal component
- [x] Create Select/Dropdown component
- [x] Add proper TypeScript types for all props

#### Task 2.1.3: Create Form Components

- [x] Create FormField component wrapper
- [x] Create FormError component
- [x] Create FormLabel component
- [x] Integrate with react-hook-form
- [x] Add Zod validation examples

### 2.2 Dashboard Layout

#### Task 2.2.1: Create Main Layout

- [x] Create `src/components/layouts/DashboardLayout.tsx`
- [x] Add navigation sidebar
- [x] Add top header bar
- [x] Implement responsive design
- [x] Add logout button

#### Task 2.2.2: Build Navigation

- [x] Create navigation items array
- [x] Add icons for each nav item
- [x] Implement active state styling
- [x] Add mobile menu toggle
- [x] Test on various screen sizes

### 2.3 Salary Management

#### Task 2.3.1: Create Salary Data Model

- [x] Update Convex schema for salary records
- [x] Add fields: company, title, location, startDate, endDate
- [x] Create validation schema with Zod
- [x] Add currency support
- [x] Create TypeScript interfaces

#### Task 2.3.2: Build Add Salary Form

- [x] Create `src/components/features/salary/AddSalaryForm.tsx`
- [x] Add form fields for all salary properties
- [x] Implement date pickers
- [x] Add currency selector
- [x] Implement form validation
- [x] Handle form submission

#### Task 2.3.3: Create Salary List Component

- [x] Create `src/components/features/salary/SalaryList.tsx`
- [x] Fetch salaries from local database
- [x] Display in table format
- [x] Add sorting by date
- [x] Implement pagination
- [x] Add loading states

#### Task 2.3.4: Implement CRUD Operations

- [x] Create Convex mutations for salary CRUD
- [x] Add optimistic updates
- [x] Implement edit functionality
- [x] Add delete with confirmation
- [x] Handle errors gracefully

### 2.4 Bonus Tracking

#### Task 2.4.1: Create Bonus Data Model

- [x] Update schema for bonus records
- [x] Add bonus type enum
- [x] Add fields: amount, date, description, payrollDate
- [x] Create validation rules
- [x] Add to TypeScript types

#### Task 2.4.2: Build Bonus Form

- [x] Create `src/components/features/bonus/AddBonusForm.tsx`
- [x] Add bonus type selector
- [x] Add amount input with formatting
- [x] Add date pickers
- [x] Implement description field
- [x] Add form validation

#### Task 2.4.3: Create Bonus Display

- [x] Create `src/components/features/bonus/BonusList.tsx`
- [x] Group bonuses by year
- [x] Calculate YTD totals
- [x] Add filtering by type
- [x] Implement search functionality

### 2.5 Basic Equity Support

#### Task 2.5.1: Create Equity Grant Model

- [x] Update schema for equity grants
- [x] Add grant type enum (ISO, NSO, RSU, etc.)
- [x] Add basic fields: shares, grantDate, vestingStart
- [x] Create simple vesting schedule type
- [x] Add to TypeScript types

#### Task 2.5.2: Build Equity Grant Form

- [x] Create `src/components/features/equity/AddEquityForm.tsx`
- [x] Add grant type selector
- [x] Add number of shares input
- [x] Add grant date picker
- [x] Add basic vesting period selector
- [x] Implement form submission

### 2.6 Dashboard Overview

#### Task 2.6.1: Create Dashboard Page

- [x] Create `app/dashboard/page.tsx`
- [x] Add grid layout for cards
- [x] Implement responsive design
- [x] Add loading skeleton
- [x] Handle empty states

#### Task 2.6.2: Build Summary Cards

- [x] Create `src/components/features/dashboard/SummaryCard.tsx`
- [x] Build Total Compensation card
- [x] Build Current Salary card
- [x] Build YTD Bonuses card
- [x] Add number formatting
- [x] Implement loading states

#### Task 2.6.3: Add Quick Actions

- [x] Create quick add buttons
- [x] Add recent items list
- [x] Implement shortcuts
- [x] Add tooltips
- [x] Test keyboard navigation

### 2.7 Data Export

#### Task 2.7.1: Implement CSV Export

- [x] Create `src/utils/exporters/csvExporter.ts`
- [x] Build CSV generation function
- [x] Add column selection
- [x] Handle different data types
- [x] Test with sample data

#### Task 2.7.2: Implement JSON Export

- [x] Create `src/utils/exporters/jsonExporter.ts`
- [x] Build JSON structure
- [x] Add data validation
- [x] Include metadata
- [x] Implement download functionality

#### Task 2.7.3: Create Export UI

- [x] Create `src/components/features/export/ExportDialog.tsx`
- [x] Add format selection
- [x] Add date range picker
- [x] Show preview of data
- [x] Add download button

### 2.8 Additional Features Implemented

#### Task 2.8.1: PostHog Analytics Integration

- [x] Install PostHog: `npm install posthog-js`
- [x] Create `src/app/posthog-client.tsx` with privacy-first configuration
- [x] Create `src/app/providers.tsx` with lazy loading
- [x] Create `src/services/analyticsService.ts` with comprehensive tracking
- [x] Create `src/hooks/useAnalytics.ts` custom hook
- [x] Implement property sanitization for privacy
- [x] Add analytics opt-out functionality

#### Task 2.8.2: Reports Page Implementation

- [x] Create `app/dashboard/reports/page.tsx`
- [x] Implement Compensation Summary report
- [x] Add Year-over-Year Analysis
- [x] Build Company Comparison view
- [x] Create Equity Vesting Schedule display
- [x] Add Export Planning section
- [x] Implement responsive design

#### Task 2.8.3: Settings Page Implementation

- [x] Create `app/dashboard/settings/page.tsx`
- [x] Build Profile settings section
- [x] Implement Security settings with encryption status
- [x] Add Data Management tools
- [x] Create Notifications preferences
- [x] Add Analytics preferences with opt-out
- [x] Implement sync status display

## Phase 3: Advanced Features (Weeks 5-6)

### 3.1 Complex Vesting Calculations

#### Task 3.1.1: Enhance Vesting Model

- [ ] Update equity schema for complex vesting
- [ ] Add cliff period support
- [ ] Add vesting frequency options
- [ ] Support custom vesting schedules
- [ ] Add acceleration clauses

#### Task 3.1.2: Build Vesting Calculator

- [ ] Create `src/utils/vesting/vestingCalculator.ts`
- [ ] Implement cliff vesting logic
- [ ] Add monthly/quarterly vesting
- [ ] Calculate vested shares by date
- [ ] Handle edge cases

#### Task 3.1.3: Create Vesting Schedule View

- [ ] Create `src/components/features/equity/VestingSchedule.tsx`
- [ ] Display vesting timeline
- [ ] Show vested vs unvested
- [ ] Add upcoming vests
- [ ] Implement visual timeline

### 3.2 Analytics Charts

#### Task 3.2.1: Install and Setup Recharts

- [ ] Install Recharts: `npm install recharts`
- [ ] Create `src/components/charts/` directory
- [ ] Setup base chart wrapper
- [ ] Add responsive container
- [ ] Configure default styling

#### Task 3.2.2: Build Compensation Timeline Chart

- [ ] Create `src/components/charts/CompensationTimeline.tsx`
- [ ] Aggregate data by month
- [ ] Add line for each comp type
- [ ] Implement tooltips
- [ ] Add legend
- [ ] Make responsive

#### Task 3.2.3: Create Compensation Breakdown Pie Chart

- [ ] Create `src/components/charts/CompensationBreakdown.tsx`
- [ ] Calculate percentages
- [ ] Add interactive labels
- [ ] Implement animations
- [ ] Add click handlers

#### Task 3.2.4: Build Company Comparison Chart

- [ ] Create `src/components/charts/CompanyComparison.tsx`
- [ ] Group data by company
- [ ] Create bar chart
- [ ] Add sorting options
- [ ] Implement filters

### 3.3 Bulk Operations

#### Task 3.3.1: Add Multi-Select to Lists

- [ ] Update list components with checkboxes
- [ ] Implement select all functionality
- [ ] Add selection counter
- [ ] Create bulk actions menu
- [ ] Handle keyboard shortcuts

#### Task 3.3.2: Implement Bulk Delete

- [ ] Create bulk delete mutation
- [ ] Add confirmation dialog
- [ ] Show progress indicator
- [ ] Handle partial failures
- [ ] Update UI optimistically

#### Task 3.3.3: Build Bulk Edit Feature

- [ ] Create bulk edit dialog
- [ ] Allow field selection
- [ ] Implement batch updates
- [ ] Add validation
- [ ] Show success/error summary

### 3.4 Offline Sync Implementation

#### Task 3.4.1: Create Sync Engine

- [x] Create `src/services/syncService.ts`
- [x] Implement change tracking
- [x] Build sync queue
- [x] Add conflict detection
- [x] Implement retry logic

#### Task 3.4.2: Handle Sync Conflicts

- [x] Define conflict resolution strategy
- [x] Create conflict UI
- [x] Allow manual resolution
- [x] Log conflict history
- [x] Test edge cases

#### Task 3.4.3: Add Sync Status Indicator

- [x] Create sync status component
- [x] Show pending changes count
- [x] Add last sync time
- [x] Implement sync button
- [x] Handle sync errors

### 3.5 Audit Logging

#### Task 3.5.1: Setup Audit Schema

- [x] Create audit log table in Convex
- [x] Define audit event types
- [x] Add user/timestamp tracking
- [x] Include change details
- [x] Add IP address logging

#### Task 3.5.2: Implement Audit Middleware

- [ ] Create audit logging service
- [ ] Intercept all mutations
- [ ] Log user actions
- [ ] Send to WorkOS audit log
- [ ] Handle failures gracefully

#### Task 3.5.3: Build Audit Log Viewer

- [ ] Create audit log page
- [ ] Add filtering by date/user
- [ ] Show action details
- [ ] Implement search
- [ ] Add export functionality

## Phase 4: Optimization (Weeks 7-8)

### 4.1 Performance Optimization

#### Task 4.1.1: Implement Code Splitting

- [x] Analyze bundle size
- [x] Identify large dependencies
- [x] Add dynamic imports
- [x] Split by route
- [x] Lazy load charts library

#### Task 4.1.2: Optimize Database Queries

- [x] Add database indexes
- [x] Implement query caching
- [x] Batch similar queries
- [x] Add pagination
- [x] Profile slow queries

#### Task 4.1.3: Add Virtual Scrolling

- [ ] Install react-window: `npm install react-window`
- [ ] Implement for large lists
- [ ] Add loading placeholders
- [ ] Test with 10k+ records
- [ ] Measure performance improvement

### 4.2 Security Hardening

#### Task 4.2.1: Implement CSP Headers

- [ ] Create CSP policy
- [ ] Add to Next.js config
- [ ] Test for violations
- [ ] Allow necessary sources
- [ ] Monitor CSP reports

#### Task 4.2.2: Add Input Sanitization

- [ ] Review all user inputs
- [ ] Add sanitization layer
- [ ] Implement XSS prevention
- [ ] Test with malicious input
- [ ] Add security tests

#### Task 4.2.3: Enhance Session Security

- [ ] Implement session fingerprinting
- [ ] Add device trust tokens
- [ ] Reduce session timeout
- [ ] Add activity monitoring
- [ ] Test session hijacking

### 4.3 Rate Limiting

#### Task 4.3.1: Setup Vercel KV

- [ ] Enable Vercel KV in dashboard
- [ ] Install KV SDK: `npm install @vercel/kv`
- [ ] Create rate limit utility
- [ ] Define rate limit rules
- [ ] Test with load

#### Task 4.3.2: Implement API Rate Limiting

- [ ] Add rate limit middleware
- [ ] Set limits per endpoint
- [ ] Return proper headers
- [ ] Handle exceeded limits
- [ ] Add bypass for auth

### 4.4 Error Handling

#### Task 4.4.1: Create Error Boundary

- [ ] Build ErrorBoundary component
- [ ] Add to app layout
- [ ] Design error UI
- [ ] Log errors to Sentry
- [ ] Add recovery actions

#### Task 4.4.2: Implement Global Error Handler

- [ ] Create error service
- [ ] Categorize error types
- [ ] Add user-friendly messages
- [ ] Implement retry logic
- [ ] Add error reporting

#### Task 4.4.3: Add Offline Error Handling

- [x] Detect offline state
- [x] Queue failed requests
- [x] Show offline UI
- [x] Auto-retry when online
- [x] Notify user of status

### 4.5 Progressive Enhancement

#### Task 4.5.1: Add Loading States

- [ ] Create skeleton components
- [ ] Add to all async operations
- [ ] Implement suspense boundaries
- [ ] Test slow connections
- [ ] Measure perceived performance

#### Task 4.5.2: Implement Optimistic Updates

- [ ] Identify update operations
- [ ] Add optimistic UI changes
- [ ] Handle rollback on error
- [ ] Test edge cases
- [ ] Add loading indicators

## Phase 5: Polish & Launch (Weeks 9-12)

### 5.1 UI/UX Refinements

#### Task 5.1.1: Implement Design System

- [ ] Create design tokens
- [ ] Standardize spacing
- [ ] Define color palette
- [ ] Create typography scale
- [ ] Document usage

#### Task 5.1.2: Add Animations

- [ ] Install Framer Motion: `npm install framer-motion`
- [ ] Add page transitions
- [ ] Animate list items
- [ ] Add micro-interactions
- [ ] Test performance impact

#### Task 5.1.3: Improve Accessibility

- [ ] Add ARIA labels
- [ ] Test keyboard navigation
- [ ] Check color contrast
- [ ] Add focus indicators
- [ ] Test with screen reader

### 5.2 Testing

#### Task 5.2.1: Setup Testing Framework

- [ ] Configure Vitest
- [ ] Setup React Testing Library
- [ ] Configure Playwright
- [ ] Add test scripts
- [ ] Create test helpers

#### Task 5.2.2: Write Unit Tests

- [ ] Test utility functions
- [ ] Test encryption/decryption
- [ ] Test vesting calculations
- [ ] Test data transformers
- [ ] Achieve 80% coverage

#### Task 5.2.3: Create Integration Tests

- [ ] Test auth flow
- [ ] Test CRUD operations
- [ ] Test sync functionality
- [ ] Test export features
- [ ] Test error scenarios

#### Task 5.2.4: Implement E2E Tests

- [ ] Test user onboarding
- [ ] Test main workflows
- [ ] Test mobile experience
- [ ] Test offline mode
- [ ] Add to CI pipeline

### 5.3 Documentation

#### Task 5.3.1: Create User Documentation

- [ ] Write getting started guide
- [ ] Document all features
- [ ] Add screenshots
- [ ] Create video tutorials
- [ ] Build help center

#### Task 5.3.2: Write Developer Documentation

- [ ] Document architecture
- [ ] Create API reference
- [ ] Add code examples
- [ ] Document deployment
- [ ] Create troubleshooting guide

### 5.4 Deployment Preparation

#### Task 5.4.1: Setup CI/CD Pipeline

- [x] Create GitHub Actions workflow
- [x] Add build step
- [x] Add test step
- [x] Add deployment step
- [x] Configure secrets

#### Task 5.4.2: Configure Production Environment

- [x] Setup Vercel project
- [x] Configure environment variables
- [x] Setup custom domain
- [x] Configure CDN
- [x] Enable analytics

#### Task 5.4.3: Implement Monitoring

- [x] Setup Sentry for errors
- [x] Configure Vercel Analytics
- [x] Add custom metrics
- [x] Create alerts
- [x] Build dashboard

### 5.5 Beta Testing

#### Task 5.5.1: Prepare Beta Program

- [ ] Create beta signup form
- [ ] Define beta criteria
- [ ] Setup feedback system
- [ ] Create beta documentation
- [ ] Plan rollout schedule

#### Task 5.5.2: Launch Beta

- [ ] Deploy to beta environment
- [ ] Onboard beta users
- [ ] Monitor usage
- [ ] Collect feedback
- [ ] Fix critical issues

#### Task 5.5.3: Production Launch

- [ ] Final security audit
- [ ] Performance testing
- [ ] Update documentation
- [ ] Deploy to production
- [ ] Monitor launch metrics

## Post-Launch Tasks

### Maintenance and Updates

- [ ] Monitor error rates
- [ ] Track performance metrics
- [ ] Respond to user feedback
- [ ] Plan feature updates
- [ ] Regular security updates

### Feature Backlog

- [ ] CSV import functionality
- [ ] Advanced filtering options
- [ ] Custom report builder
- [ ] API for third-party integrations
- [ ] Mobile app development

---

**Document Version History**

- v1.0 - Initial task list creation (2025-01-03)
- v1.1 - Updated Phase 2 tasks to reflect completion - all core features implemented (2025-01-03)
- v1.2 - Updated task completion status to reflect actual codebase state:
  - Marked Phase 3.4 (Offline Sync) as complete
  - Marked Phase 3.5.1 (Audit Schema) as complete  
  - Marked Phase 4.1.1-4.1.2 (Performance Optimization) as complete
  - Marked Phase 4.4.3 (Offline Error Handling) as complete
  - Marked Phase 5.4 (Deployment Preparation) as complete
  - Added section 2.8 for additional implemented features (PostHog analytics, Reports page, Settings page) (2025-07-07)
