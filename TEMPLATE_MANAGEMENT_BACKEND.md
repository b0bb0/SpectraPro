# Custom Template Management - Backend Implementation

**Implementation Date**: January 27, 2026
**Status**: ✅ Backend Complete
**Implementation**: Ralph (Autonomous Agent)

## Overview

Implemented complete backend infrastructure for custom Nuclei template management. Users can now upload, validate, and manage their own vulnerability scanning templates, extending the platform's capabilities beyond the default Nuclei template library.

## What Was Implemented

### 1. Database Schema ✅

**File**: `platform/backend/prisma/schema.prisma`

**Added Models**:
- `NucleiTemplate` - Stores custom templates with metadata
- Enums: `TemplateStatus`, `TemplateCategory`
- Relations to `Tenant` and `User`

**Schema Structure**:
```prisma
model NucleiTemplate {
  id          String   @id @default(uuid())
  name        String
  description String?
  content     String   @db.Text // YAML content
  fileName    String
  author      String?
  severity    Severity
  category    TemplateCategory
  status      TemplateStatus

  // Metadata
  tags        String[]
  reference   String[]
  cveId       String?
  cweId       String?

  // Validation
  isValid     Boolean
  validatedAt DateTime?
  validationError String?

  // Usage stats
  usageCount  Int
  lastUsedAt  DateTime?

  // Relations
  tenantId     String
  uploadedById String

  @@unique([tenantId, fileName])
}
```

**Enums**:
```prisma
enum TemplateStatus {
  ACTIVE      // Ready for use
  INACTIVE    // Disabled by user
  VALIDATING  // Being validated
  FAILED      // Validation failed
}

enum TemplateCategory {
  CVE
  MISCONFIGURATION
  EXPOSED_PANEL
  EXPOSED_SERVICE
  DEFAULT_CREDENTIALS
  INFORMATION_DISCLOSURE
  INJECTION
  XSS
  AUTHENTICATION
  AUTHORIZATION
  CUSTOM
}
```

### 2. Template Service ✅

**File**: `platform/backend/src/services/template.service.ts` (440 lines)

**Key Features**:
- YAML template validation
- Metadata extraction from template
- File system storage (per-tenant directories)
- Category inference from tags
- Usage tracking
- Multi-tenant isolation

**Core Methods**:
```typescript
class TemplateService {
  // Create and validate template
  async createTemplate(options)

  // Validate YAML without saving
  async validateTemplate(content)

  // Get templates with filters
  async getTemplates(tenantId, filters?)

  // Get single template
  async getTemplateById(id, tenantId)

  // Update status (activate/deactivate)
  async updateTemplateStatus(id, tenantId, status)

  // Delete template
  async deleteTemplate(id, tenantId)

  // Increment usage count
  async incrementUsage(id)

  // Get template paths for scanning
  async getActiveTemplatePaths(tenantId)
}
```

**Template Validation**:
```typescript
// Validates:
- YAML syntax
- Required fields (id, info, info.name)
- Extracts metadata (author, severity, tags, etc.)
- Returns validation result with metadata
```

**Category Inference**:
```typescript
// Auto-categorizes based on:
- CVE ID presence
- Template tags (panel, login, injection, xss, etc.)
- Falls back to CUSTOM if no match
```

**File Storage**:
```
data/custom-templates/
  ├── <tenant-id-1>/
  │   ├── template1.yaml
  │   └── template2.yaml
  └── <tenant-id-2>/
      └── template3.yaml
```

### 3. API Routes ✅

**File**: `platform/backend/src/routes/template.routes.ts` (200 lines)

**Endpoints**:

#### GET /api/templates
Get all templates for authenticated user's tenant

**Query Parameters**:
- `status` - Filter by status (ACTIVE, INACTIVE, etc.)
- `category` - Filter by category
- `severity` - Filter by severity

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Custom Login Panel Detector",
      "description": "Detects custom admin panels",
      "fileName": "custom-login.yaml",
      "author": "Security Team",
      "severity": "MEDIUM",
      "category": "EXPOSED_PANEL",
      "status": "ACTIVE",
      "tags": ["panel", "login", "admin"],
      "reference": ["https://example.com/ref"],
      "isValid": true,
      "usageCount": 15,
      "createdAt": "2026-01-27T10:00:00Z",
      "uploadedBy": {
        "id": "uuid",
        "email": "user@example.com",
        "firstName": "John",
        "lastName": "Doe"
      }
    }
  ]
}
```

#### GET /api/templates/:id
Get specific template by ID

**Response**: Single template object

#### POST /api/templates
Create new custom template

**Request Body**:
```json
{
  "name": "Custom Template Name",
  "description": "Template description",
  "content": "id: custom-template\ninfo:\n  name: ...",
  "fileName": "custom-template.yaml"
}
```

**Validation**:
- Name: 1-200 characters
- Description: Max 1000 characters (optional)
- Content: Required YAML string
- FileName: Must end with `.yaml`

**Response**:
```json
{
  "success": true,
  "data": { /* template object */ },
  "message": "Template created successfully"
}
```

#### POST /api/templates/validate
Validate template without saving

**Request Body**:
```json
{
  "content": "id: test\ninfo:\n  name: Test\n..."
}
```

**Response** (success):
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "metadata": {
      "id": "test",
      "name": "Test Template",
      "author": "Author Name",
      "severity": "medium",
      "tags": ["tag1", "tag2"]
    }
  },
  "message": "Template is valid"
}
```

**Response** (failure):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TEMPLATE",
    "message": "Missing required field: info.name"
  }
}
```

#### PATCH /api/templates/:id/status
Update template status

**Request Body**:
```json
{
  "status": "ACTIVE" | "INACTIVE"
}
```

**Response**:
```json
{
  "success": true,
  "data": { /* updated template */ },
  "message": "Template status updated"
}
```

#### DELETE /api/templates/:id
Delete template

**Response**:
```json
{
  "success": true,
  "message": "Template deleted successfully"
}
```

### 4. Dependencies Installed ✅

```bash
npm install js-yaml @types/js-yaml
```

- `js-yaml`: YAML parser for template validation
- `@types/js-yaml`: TypeScript types

### 5. Integration ✅

**Registered Routes**:
- Added `templateRoutes` to `src/index.ts`
- Mounted at `/api/templates`
- Authentication middleware applied to all routes
- Audit middleware applied to write operations

## Technical Details

### Template Validation Flow

```
User uploads YAML content
  ↓
POST /api/templates (or /api/templates/validate)
  ↓
templateService.validateTemplate()
  ↓
Parse YAML with js-yaml
  ↓
Check required fields:
  - id
  - info
  - info.name
  ↓
Extract metadata:
  - name, author, severity
  - tags, reference
  - CVE ID, CWE ID
  ↓
Infer category from tags/CVE
  ↓
Return validation result
```

### Template Storage Flow

```
Valid template
  ↓
Save to database (Prisma)
  ↓
Create tenant directory if needed
  data/custom-templates/<tenantId>/
  ↓
Write YAML file to disk
  <tenantId>/<fileName>
  ↓
Return template object
```

### Multi-Tenant Isolation

**Database Level**:
- All queries filtered by `tenantId`
- Unique constraint: `(tenantId, fileName)`
- Foreign key to Tenant with CASCADE delete

**File System Level**:
- Separate directory per tenant
- Path: `data/custom-templates/<tenantId>/`
- Cannot access other tenant's files

**API Level**:
- `tenantId` extracted from JWT
- All operations scoped to authenticated tenant
- No cross-tenant access possible

### Security Considerations

**YAML Validation**:
- Parse with js-yaml (safe mode)
- Validate structure before executing
- Prevent YAML injection attacks
- Limit file size (10MB body limit)

**File System**:
- Write to controlled directory only
- Sanitize file names
- Prevent path traversal
- Multi-tenant isolation

**Access Control**:
- JWT authentication required
- Tenant isolation enforced
- Audit logging for all changes
- User tracking (uploadedBy)

## Usage Examples

### Example 1: Upload Custom Template

**Request**:
```bash
curl -X POST http://localhost:5001/api/templates \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "Custom Admin Panel Detector",
    "description": "Detects /admin-custom endpoints",
    "fileName": "custom-admin.yaml",
    "content": "id: custom-admin-panel\n\ninfo:\n  name: Custom Admin Panel\n  author: Security Team\n  severity: medium\n  description: Detects custom admin panel\n  tags:\n    - panel\n    - admin\n\nhttp:\n  - method: GET\n    path:\n      - \"{{BaseURL}}/admin-custom\"\n    matchers:\n      - type: status\n        status:\n          - 200\n"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Custom Admin Panel",
    "fileName": "custom-admin.yaml",
    "status": "ACTIVE",
    "category": "EXPOSED_PANEL",
    "severity": "MEDIUM",
    "isValid": true
  },
  "message": "Template created successfully"
}
```

### Example 2: Validate Before Upload

**Request**:
```bash
curl -X POST http://localhost:5001/api/templates/validate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "content": "id: test\ninfo:\n  name: Test\n  severity: high\n"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "metadata": {
      "id": "test",
      "name": "Test",
      "severity": "high"
    }
  }
}
```

### Example 3: List Templates

**Request**:
```bash
curl http://localhost:5001/api/templates?status=ACTIVE&category=CVE \
  -b cookies.txt
```

**Response**: Array of templates matching filters

### Example 4: Deactivate Template

**Request**:
```bash
curl -X PATCH http://localhost:5001/api/templates/<id>/status \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"status": "INACTIVE"}'
```

## Testing Checklist

### Manual Testing
- [ ] Create template with valid YAML
- [ ] Create template with invalid YAML (should fail)
- [ ] Validate template without saving
- [ ] List all templates
- [ ] Filter templates by status/category/severity
- [ ] Get single template by ID
- [ ] Update template status (activate/deactivate)
- [ ] Delete template
- [ ] Verify file created in tenant directory
- [ ] Verify file deleted when template deleted
- [ ] Test multi-tenant isolation (different tenants)
- [ ] Test duplicate file name (should fail)

### Integration Testing
- [ ] Upload template then use in scan (future)
- [ ] Track usage count when template used
- [ ] Verify audit logs created
- [ ] Test with large YAML files
- [ ] Test with special characters in file names

### Security Testing
- [ ] Attempt to access other tenant's templates
- [ ] Attempt path traversal in file name
- [ ] Attempt YAML injection
- [ ] Verify JWT authentication required
- [ ] Test file size limits

## Database Migration

**Required Migration**:
```bash
cd platform/backend
npx prisma migrate dev --name add_nuclei_templates
```

This will:
1. Create `nuclei_templates` table
2. Add foreign keys to `tenants` and `users`
3. Create indexes for performance
4. Add unique constraint on (tenantId, fileName)

**Note**: Migration command was prepared but not executed. Run manually after reviewing.

## Known Limitations

### Current Implementation
1. **No Template Testing** - Cannot test template against target
2. **No Version Control** - No template versioning
3. **No Template Sharing** - Cannot share between tenants
4. **No Template Import** - Cannot import from Nuclei community
5. **No Syntax Highlighting** - Plain text editor needed in UI

### Future Enhancements
- [ ] Template testing endpoint (run against test target)
- [ ] Template versioning (track changes)
- [ ] Template marketplace (share/import)
- [ ] Community template sync
- [ ] Syntax validation beyond YAML
- [ ] Template categories management
- [ ] Template tags management
- [ ] Bulk import/export

## Next Steps

### Frontend Implementation (Next Loop)
1. Create templates page UI
2. Build template upload modal
3. Implement YAML editor with syntax highlighting
4. Add template validation before upload
5. Create template list with filters
6. Add status toggle (activate/deactivate)
7. Implement delete confirmation
8. Show template usage statistics

### Integration with Scanning
1. Modify scan service to include custom templates
2. Add option in NewScanModal to use custom templates
3. Track template usage when used in scans
4. Show which templates were used in scan results

## Files Created

1. **Schema**: `platform/backend/prisma/schema.prisma` (modified, +70 lines)
2. **Service**: `platform/backend/src/services/template.service.ts` (440 lines)
3. **Routes**: `platform/backend/src/routes/template.routes.ts` (200 lines)
4. **Index**: `platform/backend/src/index.ts` (modified, +2 lines)

**Total**: ~710 lines of backend code

## Summary

Successfully implemented complete backend infrastructure for custom Nuclei template management. The system provides secure, multi-tenant template storage with validation, categorization, and usage tracking.

### Key Achievements
- ✅ Database schema with proper relations
- ✅ Template validation with YAML parsing
- ✅ RESTful API with 6 endpoints
- ✅ File system storage per tenant
- ✅ Multi-tenant isolation enforced
- ✅ Comprehensive error handling
- ✅ Audit logging integration

### Status
**Backend**: ✅ Complete and ready for testing
**Frontend**: ⏳ Not started (next priority)
**Integration**: ⏳ Scan service integration pending

**Confidence**: Very High
**Production Ready**: After migration and testing

---

*Implementation Date: January 27, 2026*
*Implemented By: Ralph (Autonomous AI Agent)*
*Lines of Code: ~710 backend implementation*
