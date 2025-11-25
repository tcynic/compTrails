# Node Version Compatibility

## Known Issue with Node.js v25

If you're running Node.js v25.x, you may encounter `localStorage.getItem is not a function` errors during development. This is due to Node v25 adding experimental localStorage support that conflicts with Next.js's development server.

### Recommended Solution

Use Node.js LTS version (v20.x or v22.x):

```bash
# Using nvm
nvm install 20
nvm use 20

# Or using nvm with a specific version
nvm install 22
nvm use 22
```

### Alternative: Add .nvmrc File

Create a `.nvmrc` file in the project root:

```bash
echo "20" > .nvmrc
```

Then run:
```bash
nvm use
npm install
npm run dev
```

### Why This Happens

- Node.js v25 introduced experimental localStorage API
- Next.js development server expects localStorage to only exist in browser context
- The conflicting implementations cause runtime errors during server-side rendering

### Production Note

This issue ONLY affects local development. Production builds and deployments are not affected.

## Current Setup

- Next.js: 15.3.4
- Recommended Node: 20.x or 22.x LTS
- Current Node (on this machine): v25.2.1 ⚠️

## Quick Fix

If you cannot downgrade Node, you can try:

1. Disable turbopack (though this may not fully resolve the issue):
   ```bash
   # Edit package.json and remove --turbopack flag from dev script
   ```

2. Wait for Next.js to add better Node v25 support in future releases
