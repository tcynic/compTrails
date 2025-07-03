# CompTrails Compensation Calculator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Convex](https://img.shields.io/badge/Convex-FF6B6B?logo=convex&logoColor=white)](https://convex.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

A **privacy-first, local-first** web application for tracking complete compensation packages including salary, bonuses, and equity grants. CompTrails prioritizes user privacy with zero-knowledge architecture, delivers sub-50ms response times through local-first design, and provides seamless cross-device synchronization.

## 🚀 Key Features

### 🔒 Zero-Knowledge Privacy
- **Client-side encryption** with AES-256-GCM
- **Your data never leaves your device** in plaintext
- **Argon2id key derivation** for maximum security
- **WorkOS enterprise SSO** with audit logging

### ⚡ Local-First Performance
- **Sub-50ms response times** for all operations
- **Offline functionality** with automatic sync
- **IndexedDB storage** for instant data access
- **Optimistic UI updates** for immediate feedback

### 📊 Comprehensive Tracking
- **Salary history** with company, title, and location tracking
- **Bonus management** for performance, signing, and spot bonuses
- **Equity grants** with complex vesting schedule calculations
- **Real-time analytics** and visualizations

### 🏢 Enterprise Ready
- **WorkOS integration** for SSO and compliance
- **Audit logging** for all data access and modifications
- **Multi-device sync** with conflict resolution
- **Data export** in CSV and JSON formats

## 🛠️ Technology Stack

### Frontend
- **[Next.js 14](https://nextjs.org/)** - React framework with App Router
- **[Tailwind CSS](https://tailwindcss.com/)** - Utility-first CSS framework
- **[Radix UI](https://www.radix-ui.com/)** - Unstyled, accessible components
- **[React Hook Form](https://react-hook-form.com/)** - Performant forms with validation
- **[Zod](https://zod.dev/)** - TypeScript-first schema validation
- **[Recharts](https://recharts.org/)** - Composable charting library

### Backend & Services
- **[Convex](https://convex.dev/)** - Real-time database with ACID compliance
- **[WorkOS](https://workos.com/)** - Enterprise SSO and audit logging
- **[Vercel](https://vercel.com/)** - Edge deployment and serverless functions
- **[PostHog](https://posthog.com/)** - Privacy-first analytics

### Security & Storage
- **Web Crypto API** - Client-side encryption
- **Argon2 WASM** - Key derivation function
- **IndexedDB** - Local storage with Dexie wrapper
- **Service Worker** - Offline functionality

## 📋 Project Status

**Current Phase:** Foundation Implementation (Phase 1)

CompTrails has progressed from planning to active development with core infrastructure completed:

- ✅ **Product Requirements Document** - Complete feature specification
- ✅ **Technical Architecture** - Local-first, zero-knowledge design
- ✅ **Development Tasks** - 200+ detailed tasks for implementation
- ✅ **Technology Stack** - Selected and documented
- ✅ **Authentication System** - WorkOS integration with Google SSO
- ✅ **Encryption Layer** - Zero-knowledge AES-256-GCM with Argon2id
- ✅ **Local Storage** - IndexedDB with Dexie wrapper
- ✅ **Offline Capability** - Service Worker with background sync
- 🔄 **UI Components** - Building core interface components

### Roadmap

| Phase | Timeline | Status | Description |
|-------|----------|---------|-------------|
| Phase 1 | Weeks 1-2 | ✅ Complete | Foundation setup, auth, encryption |
| Phase 2 | Weeks 3-4 | 🔄 In Progress | Core features, CRUD operations |
| Phase 3 | Weeks 5-6 | ⏳ Pending | Advanced features, analytics |
| Phase 4 | Weeks 7-8 | ⏳ Pending | Performance optimization |
| Phase 5 | Weeks 9-12 | ⏳ Pending | Polish, testing, launch |

## 🏗️ Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        A[Next.js App] --> B[Local IndexedDB]
        A --> C[Service Worker]
        A --> D[Encryption Layer]
    end
    
    subgraph "Edge Layer"
        E[Vercel Edge Functions]
        F[Vercel KV - Rate Limiting]
        G[Edge Config - Feature Flags]
    end
    
    subgraph "Backend Layer"
        H[Convex Real-time DB]
        I[WorkOS - Auth/Audit]
        J[PostHog - Analytics]
    end
    
    A --> E
    E --> H
    E --> I
    A --> J
    C --> H
```

### Data Flow
1. **User Action** → Local IndexedDB → Optimistic UI Update
2. **Background Sync** → Encrypt & batch changes → Convex
3. **Cross-device Sync** → Conflict resolution → Local update

## 🚀 Getting Started

> **Note:** CompTrails core infrastructure is complete. The application is ready for development and testing.

### Prerequisites
- Node.js 18+ 
- npm/yarn/pnpm
- Git

### Installation
```bash
# Clone the repository
git clone https://github.com/tcynic/compTrails.git
cd compTrails

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local
# Edit .env.local with your WorkOS configuration

# Start development server
npm run dev
```

### Development Commands
```bash
# Development
npm run dev              # Start development server
npm run build           # Build for production
npm run start           # Start production server

# Code Quality
npm run lint            # ESLint checking
npm run type-check      # TypeScript checking
npm run format          # Prettier formatting

# Testing (Coming Soon)
npm run test            # Unit tests
npm run test:e2e        # E2E tests

# Database (Coming Soon)
npx convex dev          # Start Convex development
```

## 📚 Documentation

- **[Product Requirements Document](./context/initialPRD.md)** - Complete feature specification and business requirements
- **[Development Tasks](./context/tasks.md)** - Detailed task breakdown for implementation
- **[Developer Guide](./CLAUDE.md)** - Technical architecture and development guidelines
- **[Cursor Rules](./.cursor/rules)** - Code style and documentation standards

## 🏛️ Architecture Principles

### Local-First Design
- All operations work offline first
- Data stored in IndexedDB for immediate access
- Background sync for cross-device synchronization
- Optimistic UI updates for <50ms response times

### Zero-Knowledge Security
- All sensitive data encrypted client-side
- Encryption keys derived from user credentials
- Backend never has access to plaintext data
- WorkOS handles authentication and audit logging

### Performance Targets
- **Bundle Size:** <100KB gzipped core bundle
- **Load Time:** <2s on 3G networks
- **Local Operations:** <50ms response time
- **Sync Operations:** <500ms for typical batch

## 🔒 Security & Privacy

CompTrails is built with privacy as a core principle:

- **Zero-Knowledge Architecture** - Your financial data is encrypted on your device before it ever leaves
- **Client-Side Encryption** - AES-256-GCM encryption with Argon2id key derivation
- **No Plaintext Storage** - The backend never sees your unencrypted data
- **Enterprise SSO** - WorkOS integration for secure authentication
- **Audit Logging** - Complete audit trail of all data access
- **Data Ownership** - Export your data anytime in CSV or JSON format

## 🤝 Contributing

We welcome contributions to CompTrails! Please read our contributing guidelines:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Follow the development tasks** in `context/tasks.md`
4. **Add tests** for new functionality
5. **Ensure code quality** with our linting and formatting rules
6. **Commit with conventional commits** format
7. **Push to your branch** and create a Pull Request

### Development Setup
- Review the [Development Tasks](./context/tasks.md) for detailed implementation steps
- Follow the [Developer Guide](./CLAUDE.md) for architecture guidance
- Use the [Cursor Rules](./.cursor/rules) for consistent code style

## 🎯 Success Metrics

### Technical Goals
- **Performance Score:** >90 Lighthouse score
- **Bundle Size:** <100KB gzipped core bundle
- **Load Time:** <2s on 3G, <500ms on 4G
- **Uptime:** 99.9% availability

### User Experience Goals
- **Activation Rate:** 80% complete profile within 7 days
- **Retention:** 70% monthly active users
- **Sync Success:** >99.5% successful cross-device syncs
- **Response Time:** <50ms for local operations

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/) and [Convex](https://convex.dev/)
- Secured with [WorkOS](https://workos.com/)
- Styled with [Tailwind CSS](https://tailwindcss.com/) and [Radix UI](https://www.radix-ui.com/)
- Deployed on [Vercel](https://vercel.com/)

---

**CompTrails Compensation Calculator** - Take control of your financial future with privacy-first compensation tracking.

---

**Document Version History**

- v1.0 - Initial README creation (2025-01-03)
- v1.1 - Updated project status to reflect Phase 1 completion (2025-01-03)