# Guidelines

This document contains guidelines and best practices working on this codebase.

## Code Quality Standards

### 1. Import Statements

**DO:**

- Use static imports at the top of the file
- Import all dependencies before they're used

```typescript
import path from "path";
import {
  saveImages,
  ensureDir,
} from "../../infrastructure/storage/file-manager";
```

**DON'T:**

- Use dynamic imports (`await import()`) unless absolutely necessary for lazy loading
- Dynamic imports add unnecessary overhead and complexity for modules that are always available

```typescript
// ❌ Avoid this
const path = await import("path");
const { saveImages } = await import(
  "../../infrastructure/storage/file-manager"
);
```

## Project-Specific Conventions

### File Organization

- **`src/services/`** - Business logic and main operations
- **`src/infrastructure/`** - Utilities, storage, retry logic
- **`src/types/`** - TypeScript type definitions
- **`data/`** - Runtime data (gitignored, except directory structure)

### Debug Features

- **Development mode**: Set `NODE_ENV=development` or `NODE_ENV=debug`
- **Production mode**: Set `NODE_ENV=production` (default)
- Debug features should be non-intrusive and documented

## Before Committing

1. **Type check**: Run `npx tsc --noEmit`
2. **Test**: Ensure changes don't break existing functionality
3. **Review imports**: No unnecessary dynamic imports
4. **Check consistency**: Related operations use consistent identifiers
5. **Documentation**: Update `.env.example` for new environment variables

## Common Pitfalls to Avoid

1. **Dynamic imports for Node.js built-ins** - `path`, `fs`, etc. are always available
2. **Forgetting to document environment variables** - Always update `.env.example`

## Questions?

If you're unsure about an implementation approach:

1. Check existing patterns in the codebase
2. When in doubt, ask the user for clarification
