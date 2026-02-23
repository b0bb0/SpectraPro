# Authenticated Scanning

This document explains how to perform authenticated vulnerability scans where the scanner logs in or uses credentials to access protected areas of the application.

## Overview

Authenticated scanning allows you to test vulnerabilities behind authentication barriers. The platform supports multiple authentication methods that can be configured when starting a scan.

## Authentication Methods

### 1. None (Default)
```json
{
  "method": "none"
}
```

### 2. Basic Authentication
HTTP Basic Auth with username/password.

```json
{
  "method": "basic",
  "username": "testuser",
  "password": "testpass123"
}
```

### 3. Bearer Token
API token-based authentication.

```json
{
  "method": "bearer",
  "bearerToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 4. Cookie-based
Session cookies for authenticated sessions.

```json
{
  "method": "cookie",
  "cookies": {
    "PHPSESSID": "abc123def456",
    "auth_token": "xyz789"
  }
}
```

### 5. Custom Headers
Any custom authentication headers.

```json
{
  "method": "header",
  "headers": {
    "X-API-Key": "your-api-key",
    "X-Auth-Token": "your-token"
  }
}
```

### 6. Form-based (Future)
Login form automation (not yet implemented).

```json
{
  "method": "form",
  "loginUrl": "https://example.com/login",
  "usernameField": "email",
  "passwordField": "password",
  "username": "test@example.com",
  "password": "testpass123",
  "submitPath": "/auth/login"
}
```

## API Usage

### Starting an Authenticated Scan

**Endpoint:** `POST /api/scans`

**Request:**
```json
{
  "target": "https://app.example.com",
  "scanLevel": "normal",
  "deepScanAuthorized": false,
  "authConfig": {
    "method": "bearer",
    "bearerToken": "your-jwt-token-here"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "scanId": "uuid-here",
    "status": "PENDING",
    "target": "https://app.example.com"
  }
}
```

## How It Works

1. **Authentication Configuration Stored**: When you create a scan with `authConfig`, it's stored in the database with the scan record.

2. **Headers Injected**: During scan execution, the appropriate authentication headers are automatically added to all Nuclei requests:
   - Basic Auth → `Authorization: Basic <base64>`
   - Bearer Token → `Authorization: Bearer <token>`
   - Cookies → `Cookie: name=value; name2=value2`
   - Custom Headers → Direct header injection

3. **hasAuth Detection**: If authentication is provided, the system automatically:
   - Sets `hasAuth: true` in the asset context
   - Enables authentication-aware vulnerability tests
   - Logs authentication method usage

4. **AI Assessment**: The AI analysis considers authentication when:
   - Recommending SQLi tests (authenticated endpoints may have different parameters)
   - Prioritizing vulnerability classes
   - Generating scan intent

## Example: Testing Authenticated Admin Panel

```bash
curl -X POST http://localhost:5001/api/scans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-user-token>" \
  -d '{
    "target": "https://app.example.com/admin",
    "scanLevel": "balanced",
    "authConfig": {
      "method": "cookie",
      "cookies": {
        "session_id": "abc123",
        "admin_token": "xyz789"
      }
    }
  }'
```

## Security Considerations

### Credential Storage
- Authentication credentials are stored in the database as JSON
- **Important**: Ensure database encryption at rest is enabled
- **Important**: Use environment-specific credentials (never production creds for testing)

### Audit Logging
- All authenticated scans are logged
- Authentication method is recorded in scan metadata
- Credentials are NOT logged in console output

### Best Practices
1. **Use Test Accounts**: Create dedicated test accounts with limited privileges
2. **Rotate Credentials**: Regularly rotate test account credentials
3. **Monitor Usage**: Review authenticated scan audit logs
4. **Limit Scope**: Only scan assets you have permission to test
5. **Token Expiry**: Be aware of session/token expiration times

## Environment Configuration

The following environment variables are used:

```bash
# In backend/.env
NMAP_PATH=/opt/homebrew/bin/nmap
FEROXBUSTER_PATH=/opt/homebrew/bin/feroxbuster
WORDLIST_PATH=/path/to/wordlists/raft-medium-directories.txt
```

## Troubleshooting

### "hasAuth: false" Error
If you're seeing `hasAuth: false, no authentication mechanism detected`:

1. **Solution**: Provide `authConfig` in the scan request
2. **Why**: The system only detects authentication if:
   - Login forms are found during discovery, OR
   - You explicitly provide authentication configuration

### Authentication Not Working
1. Check that headers are being added (visible in scan console output)
2. Verify token/credentials are valid and not expired
3. Test authentication manually with curl first
4. Check for rate limiting or WAF blocking

### Session Expires During Scan
- Form-based authentication will support automatic re-authentication (future)
- Current workaround: Use longer-lived bearer tokens
- Or: Use cookie-based auth with extended session duration

## Future Enhancements

- [ ] Form-based authentication with automatic login
- [ ] Multi-step authentication flows
- [ ] OAuth2 support
- [ ] Automatic session refresh
- [ ] Credential vault integration
- [ ] Per-template authentication override
