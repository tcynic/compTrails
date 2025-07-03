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

- [ ] Run `npx create-next-app@latest comp-trails --typescript --tailwind --app`
- [ ] Choose "Yes" for ESLint
- [ ] Choose "Yes" for `src/` directory
- [ ] Navigate to project: `cd comp-trails`
- [ ] Test initial setup: `npm run dev`
- [ ] Verify app loads at <http://localhost:3000>

#### Task 1.1.2: Configure TypeScript

- [ ] Open `tsconfig.json`
- [ ] Set `"strict": true` in compilerOptions
- [ ] Add `"noImplicitAny": true`
- [ ] Add `"strictNullChecks": true`
- [ ] Run `npm run build` to verify no TypeScript errors

#### Task 1.1.3: Setup Code Quality Tools

- [ ] Install Prettier: `npm install --save-dev prettier`
- [ ] Create `.prettierrc` file with team standards
- [ ] Install Prettier ESLint plugin: `npm install --save-dev eslint-config-prettier`
- [ ] Update `.eslintrc.json` to include prettier config
- [ ] Create `.prettierignore` file
- [ ] Add format script to package.json: `"format": "prettier --write ."`

#### Task 1.1.4: Initialize Git Repository

- [ ] Run `git init` (if not already initialized)
- [ ] Create `.gitignore` file
- [ ] Add node_modules, .env.local, .next to .gitignore
- [ ] Make initial commit: `git add . && git commit -m "Initial project setup"`

### 1.2 Environment Configuration

#### Task 1.2.1: Setup Environment Variables

- [ ] Create `.env.local` file in root directory
- [ ] Create `.env.example` with placeholder values
- [ ] Add environment variables for:
  - `NEXT_PUBLIC_APP_URL`
  - `NEXT_PUBLIC_CONVEX_URL` (placeholder)
  - `WORKOS_API_KEY` (placeholder)
  - `WORKOS_CLIENT_ID` (placeholder)
- [ ] Add `.env.local` to `.gitignore`

#### Task 1.2.2: Install Core Dependencies

- [ ] Install UI libraries: `npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-slot`
- [ ] Install form libraries: `npm install react-hook-form zod @hookform/resolvers`
- [ ] Install utility libraries: `npm install clsx tailwind-merge class-variance-authority`
- [ ] Install date library: `npm install date-fns`
- [ ] Verify all packages installed: `npm list`

### 1.3 Convex Setup

#### Task 1.3.1: Install and Initialize Convex

- [ ] Install Convex: `npm install convex`
- [ ] Run Convex setup: `npx convex dev`
- [ ] Follow prompts to create new Convex project
- [ ] Save deployment URL to `.env.local`
- [ ] Verify `convex/` directory created

#### Task 1.3.2: Create Initial Schema

- [ ] Create `convex/schema.ts` file
- [ ] Define User table with basic fields (id, email, name)
- [ ] Define CompensationRecord table with fields:
  - userId (string)
  - type (salary/bonus/equity)
  - amount (number)
  - currency (string)
  - createdAt (number)
- [ ] Run `npx convex dev` to sync schema

#### Task 1.3.3: Setup Convex Client Provider

- [ ] Create `src/providers/ConvexClientProvider.tsx`
- [ ] Import ConvexProvider from "convex/react"
- [ ] Wrap app with ConvexProvider in `app/layout.tsx`
- [ ] Add "use client" directive to provider file
- [ ] Test connection with simple query

### 1.4 WorkOS Authentication Setup

#### Task 1.4.1: Install WorkOS SDK

- [ ] Install WorkOS: `npm install @workos-inc/node`
- [ ] Create `src/lib/workos.ts` file
- [ ] Initialize WorkOS client with API key
- [ ] Export configured client

#### Task 1.4.2: Create Auth API Routes

- [ ] Create `app/api/auth/login/route.ts`
- [ ] Implement GET handler for SSO authorization URL
- [ ] Create `app/api/auth/callback/route.ts`
- [ ] Implement GET handler for OAuth callback
- [ ] Add error handling for failed auth

#### Task 1.4.3: Create Auth Context

- [ ] Create `src/contexts/AuthContext.tsx`
- [ ] Define auth state interface (user, loading, error)
- [ ] Implement login and logout functions
- [ ] Create useAuth hook
- [ ] Wrap app with AuthProvider

#### Task 1.4.4: Build Login Page

- [ ] Create `app/login/page.tsx`
- [ ] Add "Sign in with Google" button
- [ ] Add "Sign in with Microsoft" button
- [ ] Style with Tailwind CSS
- [ ] Handle loading states

### 1.5 Encryption Implementation

#### Task 1.5.1: Setup Encryption Utilities

- [ ] Create `src/lib/crypto/encryption.ts`
- [ ] Implement generateKey function using Web Crypto API
- [ ] Implement encrypt function (AES-256-GCM)
- [ ] Implement decrypt function
- [ ] Add TypeScript types for encrypted data

#### Task 1.5.2: Install Argon2 WASM

- [ ] Install argon2-browser: `npm install argon2-browser`
- [ ] Create `src/lib/crypto/keyDerivation.ts`
- [ ] Implement deriveKey function with Argon2id
- [ ] Set appropriate memory/iteration parameters
- [ ] Test key derivation in browser console

#### Task 1.5.3: Create Encryption Service

- [ ] Create `src/services/encryptionService.ts`
- [ ] Implement encryptData method
- [ ] Implement decryptData method
- [ ] Add methods for key management
- [ ] Create unit tests for encryption/decryption

### 1.6 IndexedDB Setup

#### Task 1.6.1: Install Dexie (IndexedDB Wrapper)

- [ ] Install Dexie: `npm install dexie`
- [ ] Create `src/lib/db/database.ts`
- [ ] Define database schema
- [ ] Create tables for:
  - compensationRecords
  - pendingSync
  - userPreferences

#### Task 1.6.2: Create Local Storage Service

- [ ] Create `src/services/localStorageService.ts`
- [ ] Implement CRUD operations for compensation records
- [ ] Add methods for querying by date range
- [ ] Implement sync queue management
- [ ] Add error handling and fallbacks

#### Task 1.6.3: Setup Service Worker

- [ ] Create `public/sw.js` file
- [ ] Implement basic caching strategy
- [ ] Add offline detection
- [ ] Register service worker in `app/layout.tsx`
- [ ] Test offline functionality

## Phase 2: Core Features (Weeks 3-4)

### 2.1 UI Component Library

#### Task 2.1.1: Setup Component Structure

- [ ] Create `src/components/ui/` directory
- [ ] Create `src/components/features/` directory
- [ ] Create `src/components/layouts/` directory
- [ ] Add index.ts files for exports

#### Task 2.1.2: Build Base UI Components

- [ ] Create Button component with variants
- [ ] Create Input component with validation states
- [ ] Create Card component
- [ ] Create Dialog/Modal component
- [ ] Create Select/Dropdown component
- [ ] Add proper TypeScript types for all props

#### Task 2.1.3: Create Form Components

- [ ] Create FormField component wrapper
- [ ] Create FormError component
- [ ] Create FormLabel component
- [ ] Integrate with react-hook-form
- [ ] Add Zod validation examples

### 2.2 Dashboard Layout

#### Task 2.2.1: Create Main Layout

- [ ] Create `src/components/layouts/DashboardLayout.tsx`
- [ ] Add navigation sidebar
- [ ] Add top header bar
- [ ] Implement responsive design
- [ ] Add logout button

#### Task 2.2.2: Build Navigation

- [ ] Create navigation items array
- [ ] Add icons for each nav item
- [ ] Implement active state styling
- [ ] Add mobile menu toggle
- [ ] Test on various screen sizes

### 2.3 Salary Management

#### Task 2.3.1: Create Salary Data Model

- [ ] Update Convex schema for salary records
- [ ] Add fields: company, title, location, startDate, endDate
- [ ] Create validation schema with Zod
- [ ] Add currency support
- [ ] Create TypeScript interfaces

#### Task 2.3.2: Build Add Salary Form

- [ ] Create `src/components/features/salary/AddSalaryForm.tsx`
- [ ] Add form fields for all salary properties
- [ ] Implement date pickers
- [ ] Add currency selector
- [ ] Implement form validation
- [ ] Handle form submission

#### Task 2.3.3: Create Salary List Component

- [ ] Create `src/components/features/salary/SalaryList.tsx`
- [ ] Fetch salaries from local database
- [ ] Display in table format
- [ ] Add sorting by date
- [ ] Implement pagination
- [ ] Add loading states

#### Task 2.3.4: Implement CRUD Operations

- [ ] Create Convex mutations for salary CRUD
- [ ] Add optimistic updates
- [ ] Implement edit functionality
- [ ] Add delete with confirmation
- [ ] Handle errors gracefully

### 2.4 Bonus Tracking

#### Task 2.4.1: Create Bonus Data Model

- [ ] Update schema for bonus records
- [ ] Add bonus type enum
- [ ] Add fields: amount, date, description, payrollDate
- [ ] Create validation rules
- [ ] Add to TypeScript types

#### Task 2.4.2: Build Bonus Form

- [ ] Create `src/components/features/bonus/AddBonusForm.tsx`
- [ ] Add bonus type selector
- [ ] Add amount input with formatting
- [ ] Add date pickers
- [ ] Implement description field
- [ ] Add form validation

#### Task 2.4.3: Create Bonus Display

- [ ] Create `src/components/features/bonus/BonusList.tsx`
- [ ] Group bonuses by year
- [ ] Calculate YTD totals
- [ ] Add filtering by type
- [ ] Implement search functionality

### 2.5 Basic Equity Support

#### Task 2.5.1: Create Equity Grant Model

- [ ] Update schema for equity grants
- [ ] Add grant type enum (ISO, NSO, RSU, etc.)
- [ ] Add basic fields: shares, grantDate, vestingStart
- [ ] Create simple vesting schedule type
- [ ] Add to TypeScript types

#### Task 2.5.2: Build Equity Grant Form

- [ ] Create `src/components/features/equity/AddEquityForm.tsx`
- [ ] Add grant type selector
- [ ] Add number of shares input
- [ ] Add grant date picker
- [ ] Add basic vesting period selector
- [ ] Implement form submission

### 2.6 Dashboard Overview

#### Task 2.6.1: Create Dashboard Page

- [ ] Create `app/dashboard/page.tsx`
- [ ] Add grid layout for cards
- [ ] Implement responsive design
- [ ] Add loading skeleton
- [ ] Handle empty states

#### Task 2.6.2: Build Summary Cards

- [ ] Create `src/components/features/dashboard/SummaryCard.tsx`
- [ ] Build Total Compensation card
- [ ] Build Current Salary card
- [ ] Build YTD Bonuses card
- [ ] Add number formatting
- [ ] Implement loading states

#### Task 2.6.3: Add Quick Actions

- [ ] Create quick add buttons
- [ ] Add recent items list
- [ ] Implement shortcuts
- [ ] Add tooltips
- [ ] Test keyboard navigation

### 2.7 Data Export

#### Task 2.7.1: Implement CSV Export

- [ ] Create `src/utils/exporters/csvExporter.ts`
- [ ] Build CSV generation function
- [ ] Add column selection
- [ ] Handle different data types
- [ ] Test with sample data

#### Task 2.7.2: Implement JSON Export

- [ ] Create `src/utils/exporters/jsonExporter.ts`
- [ ] Build JSON structure
- [ ] Add data validation
- [ ] Include metadata
- [ ] Implement download functionality

#### Task 2.7.3: Create Export UI

- [ ] Create `src/components/features/export/ExportDialog.tsx`
- [ ] Add format selection
- [ ] Add date range picker
- [ ] Show preview of data
- [ ] Add download button

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

- [ ] Create `src/services/syncService.ts`
- [ ] Implement change tracking
- [ ] Build sync queue
- [ ] Add conflict detection
- [ ] Implement retry logic

#### Task 3.4.2: Handle Sync Conflicts

- [ ] Define conflict resolution strategy
- [ ] Create conflict UI
- [ ] Allow manual resolution
- [ ] Log conflict history
- [ ] Test edge cases

#### Task 3.4.3: Add Sync Status Indicator

- [ ] Create sync status component
- [ ] Show pending changes count
- [ ] Add last sync time
- [ ] Implement sync button
- [ ] Handle sync errors

### 3.5 Audit Logging

#### Task 3.5.1: Setup Audit Schema

- [ ] Create audit log table in Convex
- [ ] Define audit event types
- [ ] Add user/timestamp tracking
- [ ] Include change details
- [ ] Add IP address logging

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

- [ ] Analyze bundle size
- [ ] Identify large dependencies
- [ ] Add dynamic imports
- [ ] Split by route
- [ ] Lazy load charts library

#### Task 4.1.2: Optimize Database Queries

- [ ] Add database indexes
- [ ] Implement query caching
- [ ] Batch similar queries
- [ ] Add pagination
- [ ] Profile slow queries

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

- [ ] Detect offline state
- [ ] Queue failed requests
- [ ] Show offline UI
- [ ] Auto-retry when online
- [ ] Notify user of status

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

- [ ] Create GitHub Actions workflow
- [ ] Add build step
- [ ] Add test step
- [ ] Add deployment step
- [ ] Configure secrets

#### Task 5.4.2: Configure Production Environment

- [ ] Setup Vercel project
- [ ] Configure environment variables
- [ ] Setup custom domain
- [ ] Configure CDN
- [ ] Enable analytics

#### Task 5.4.3: Implement Monitoring

- [ ] Setup Sentry for errors
- [ ] Configure Vercel Analytics
- [ ] Add custom metrics
- [ ] Create alerts
- [ ] Build dashboard

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
