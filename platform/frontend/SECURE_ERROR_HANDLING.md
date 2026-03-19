# Secure Error Handling Guidelines

## Overview

This document outlines the security-first approach to error handling across the SpectraPRO platform. **All developers must follow these guidelines when implementing new features or modifying existing code.**

## Core Principles

### 1. Never Expose Internal Details to Users
❌ **BAD:**
```typescript
} catch (error) {
  toast.error(error.message); // May expose stack traces, DB errors, file paths
}
```

✅ **GOOD:**
```typescript
} catch (error) {
  console.error('Failed to load assets:', error); // Developer debugging
  toast.error('Unable to load assets. Please try again.'); // Generic user message
}
```

### 2. Always Log for Developers
Detailed error information should always be logged to console for debugging:
```typescript
console.error('Failed to fetch data:', {
  error,
  context: { endpoint: '/api/assets', userId: user.id },
  timestamp: new Date().toISOString()
});
```

### 3. Parse Error Responses Safely
Always handle JSON parsing failures:
```typescript
if (!response.ok) {
  const errorData = await response.json().catch(() => ({
    error: { message: 'Failed to fetch data' }
  }));
  throw new Error(errorData.error?.message || 'Failed to fetch data');
}
```

## Standard Patterns

### Pattern 1: User-Initiated Actions (with Toast)
Use for actions triggered by user clicks (form submissions, button clicks).

```typescript
const handleSubmit = async () => {
  try {
    const response = await fetch('/api/endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: { message: 'Request failed' }
      }));
      throw new Error(errorData.error?.message || 'Request failed');
    }

    const result = await response.json();
    toast.success('Operation completed successfully');
    return result;
  } catch (error) {
    console.error('Operation failed:', error);
    toast.error('Unable to complete operation. Please try again.');
  }
};
```

### Pattern 2: Background Polling (Silent Failures)
Use for data polling/refresh operations that run automatically.

```typescript
const fetchData = async () => {
  try {
    const response = await fetch('/api/data');

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: { message: 'Failed to fetch data' }
      }));
      throw new Error(errorData.error?.message || 'Failed to fetch data');
    }

    const data = await response.json();
    setData(data);
  } catch (error) {
    console.error('Failed to fetch data:', error);
    // Silent failure - no toast spam for polling
  }
};
```

### Pattern 3: Using the Secure Error Handler Utility
For consistent error handling across the platform:

```typescript
import { handleSecureError, parseErrorResponse } from '@/lib/secureErrorHandler';

try {
  const response = await fetch('/api/endpoint');

  if (!response.ok) {
    throw await parseErrorResponse(response, 'Failed to load data');
  }

  const data = await response.json();
} catch (error) {
  handleSecureError(error, {
    userMessage: 'Unable to load data. Please try again.',
    showToast: true,
    toastFn: toast.error,
    context: { endpoint: '/api/endpoint', operation: 'fetchData' }
  });
}
```

## Error Message Guidelines

### Generic User Messages
Always use generic, user-friendly error messages:

| Operation | Generic Message |
|-----------|----------------|
| Data Loading | "Unable to load [resource]. Please try again." |
| Form Submission | "Unable to save changes. Please try again." |
| Delete Action | "Unable to delete [resource]. Please try again." |
| Network Error | "Connection error. Please check your network and try again." |
| Permission Error | "You don't have permission to perform this action." |
| Validation Error | "Please check your input and try again." |

### What NOT to Expose

❌ **Never expose:**
- Stack traces
- Database error messages (e.g., "duplicate key constraint violation")
- File paths (e.g., "/Users/groot/spectra/...")
- Internal service names (e.g., "Postgres connection failed")
- API keys or tokens
- User IDs or internal identifiers
- Version numbers or framework details

## Implementation Checklist

When implementing a new feature with API calls:

- [ ] All `fetch()` calls have error response parsing with `.catch()` fallback
- [ ] User-facing errors use generic messages
- [ ] Detailed errors logged to console for debugging
- [ ] Toast notifications used for user-initiated actions
- [ ] Silent failures for background polling
- [ ] No `error.message` directly displayed to users
- [ ] No stack traces or internal details exposed
- [ ] Error context includes relevant debugging information

## Common Vulnerabilities to Avoid

### 1. Direct Error Message Display
```typescript
// ❌ BAD - Exposes internal details
setError(error.message);

// ✅ GOOD - Generic message
console.error('Operation failed:', error);
setError('Unable to complete operation. Please try again.');
```

### 2. Missing JSON Parse Error Handling
```typescript
// ❌ BAD - May throw if response is not JSON
const errorData = await response.json();

// ✅ GOOD - Safe parsing
const errorData = await response.json().catch(() => ({
  error: { message: 'Request failed' }
}));
```

### 3. Verbose Error Objects
```typescript
// ❌ BAD - May expose sensitive data
console.error(error);

// ✅ GOOD - Structured logging
console.error('Operation failed:', {
  message: error.message,
  operation: 'createAsset',
  timestamp: new Date().toISOString()
});
```

## Testing Error Handling

When testing your implementation:

1. **Test with network failures**: Disable network and verify generic messages appear
2. **Test with malformed responses**: Return invalid JSON and verify fallback works
3. **Test with 4xx/5xx errors**: Verify appropriate generic messages displayed
4. **Check browser console**: Ensure detailed errors are logged for debugging
5. **Verify no sensitive data**: No internal paths, DB errors, or tokens visible

## Examples from the Codebase

### ✅ Secure Implementation
[reconnaissance/page.tsx:73-88](/Users/groot/spectra/platform/frontend/app/dashboard/reconnaissance/page.tsx#L73-L88)
```typescript
const fetchAssets = async () => {
  try {
    const response = await fetch('/api/assets');
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: { message: 'Failed to fetch assets' }
      }));
      throw new Error(errorData.error?.message || 'Failed to fetch assets');
    }
    const data = await response.json();
    setAssets(data.data || []);
  } catch (error) {
    console.error('Failed to fetch assets:', error);
    toast.error('Failed to load assets');
  }
};
```

### ✅ Kill-Switch Critical Operations
[KillSwitchControl.tsx:60-94](/Users/groot/spectra/platform/frontend/components/KillSwitchControl.tsx#L60-L94)
```typescript
const handleActivate = async () => {
  try {
    setActing(true);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        error: { message: 'Failed to activate kill switch' }
      }));
      throw new Error(errorData.error?.message || 'Failed to activate kill switch');
    }

    toast.success('Kill switch activated successfully');
  } catch (error) {
    console.error('Failed to activate kill switch:', error);
    toast.error('Unable to activate kill switch. Please check permissions and try again.');
  } finally {
    setActing(false);
  }
};
```

## Questions?

If you're unsure about error handling for a specific scenario:

1. Check this document first
2. Review similar implementations in the codebase
3. Use the `secureErrorHandler` utility for consistency
4. When in doubt, err on the side of less information to users

---

**Remember:** Security is not optional. Every error message is a potential information leak. Always think: "What could an attacker learn from this error?"
