# AGENTS.md

## Build/Lint/Test Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production (includes WASM copy)
- `npm run build:analyze` - Build with bundle analysis
- `npm run start` - Start production server
- `npm run lint` - Run ESLint checking
- `npm run format` - Run Prettier formatting
- `npm run copy-wasm` - Copy Argon2 WASM files (required before build)
- `npx convex dev` - Push Convex mutations during development
- `npx convex deploy --prod` - Deploy Convex functions to production

## Code Style Guidelines

- **TypeScript**: Strict mode enabled, use explicit types, avoid `any`
- **Imports**: Use `@/` alias for src imports, group by external/internal
- **Formatting**: Prettier config - 2 spaces, semicolons, double quotes, 80 char width
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Components**: Use function declarations, destructure props with types
- **Error Handling**: Use custom error classes, validate inputs, handle async errors
- **Files**: kebab-case for files, PascalCase for React components

## Architecture Principles

- **Local-First**: All operations work offline, IndexedDB for immediate access
- **Zero-Knowledge**: Client-side encryption with AES-256-GCM + Argon2id
- **Performance**: <100KB core bundle, <50ms local ops, <500ms sync
- **Feature-Based**: Components organized by feature (salary/bonus/equity)
- **Service Layer**: Business logic separated from UI components

## Special Rules

- **Markdown**: Always add version history at bottom when editing .md files
- **Security**: Never log/commit sensitive data, encrypt before storage
- **Performance**: Use lazy loading for charts, optimize bundle size
- **Convex**: All sensitive data must be encrypted client-side before storage

---

**Document Version History**

- v1.0 - Initial creation (2025-07-11)
- v1.1 - Added architecture principles and additional commands from CLAUDE.md (2025-07-11)
