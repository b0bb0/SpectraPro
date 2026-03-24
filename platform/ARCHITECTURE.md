# Spectra Vulnerability Management Platform - Architecture

## Overview

Enterprise-grade vulnerability management platform with premium UX, comparable to Rapid7 InsightVM.

## Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router) + React 18 + TypeScript
- **Styling**: Tailwind CSS + Custom Dark Theme
- **Components**: shadcn/ui (heavily customized)
- **Animations**: Framer Motion
- **Charts**: Recharts (custom styled)
- **State**: React Context + SWR for data fetching
- **Auth**: JWT with httpOnly cookies

### Backend
- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Express.js
- **ORM**: Prisma
- **Database**: PostgreSQL 15+
- **Authentication**: JWT + bcrypt
- **Validation**: Zod
- **API Documentation**: OpenAPI/Swagger

### Infrastructure
- **Containerization**: Docker + Docker Compose
- **Reverse Proxy**: Nginx (production)
- **Environment**: .env configuration
- **Logging**: Winston
- **Monitoring**: Built-in audit logs

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                           │
│  Next.js App (Port 3000)                                    │
│  - Landing Page                                              │
│  - Authentication                                            │
│  - Dashboard (InsightVM-style)                              │
│  - Asset Management                                          │
│  - Vulnerability Management                                  │
│  - Reports                                                   │
└─────────────────────────────────────────────────────────────┘
                            │
                     HTTPS/REST API
                            │
┌─────────────────────────────────────────────────────────────┐
│                     API Layer                                │
│  Express.js Server (Port 5001)                              │
│  - Authentication Middleware                                 │
│  - Tenant Isolation Middleware                              │
│  - RBAC Authorization                                        │
│  - Rate Limiting                                            │
└─────────────────────────────────────────────────────────────┘
                            │
              ┌─────────────┴──────────────┐
              │                            │
┌─────────────▼─────────────┐ ┌───────────▼──────────────┐
│    Business Logic Layer    │ │   Integration Layer      │
│  - Asset Service           │ │  - Nuclei Ingestion      │
│  - Vulnerability Service   │ │  - Nessus Parser         │
│  - Scan Service            │ │  - Generic Scanner API   │
│  - Report Service          │ │  - Webhook Support       │
│  - Analytics Service       │ └──────────────────────────┘
└────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                     Data Layer                               │
│  Prisma ORM + PostgreSQL                                    │
│  - Multi-tenant schema                                       │
│  - Audit logging                                            │
│  - Time-series vulnerability data                           │
│  - Asset relationships                                       │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema Design

### Core Entities

1. **Tenant** - Organization/company isolation
2. **User** - Platform users with roles
3. **Asset** - IT assets (domains, IPs, apps)
4. **Vulnerability** - Security findings
5. **Scan** - Scan execution records
6. **Evidence** - Vulnerability proof/artifacts
7. **AuditLog** - All user actions

### Multi-Tenancy

- Tenant ID in all major tables
- Row-level security enforced in application layer
- Strict tenant filtering in all queries
- User can belong to only one tenant

### Relationships

```
Tenant (1) ──→ (N) User
Tenant (1) ──→ (N) Asset
Tenant (1) ──→ (N) Vulnerability
Asset (1) ──→ (N) Vulnerability
Scan (1) ──→ (N) Vulnerability
Vulnerability (1) ──→ (N) Evidence
```

## Security Architecture

### Authentication Flow

1. User submits email/password
2. Backend validates credentials
3. JWT token generated (24h expiry)
4. Token stored in httpOnly cookie
5. Refresh token for session extension

### Authorization

**Roles**:
- **Admin**: Full control, user management, settings
- **Analyst**: Create/modify assets & vulnerabilities
- **Viewer**: Read-only access

**Middleware Chain**:
```
Request → Auth Check → Tenant Isolation → Role Check → Handler
```

### Data Isolation

- Every query filtered by tenantId
- Middleware injects tenant context
- No cross-tenant data leakage
- API responses scrubbed of sensitive data

## API Design

### REST Endpoints

```
/api/auth
  POST /login
  POST /logout
  POST /refresh
  GET /me

/api/assets
  GET / - List assets (filtered, paginated)
  POST / - Create asset
  GET /:id - Get asset details
  PUT /:id - Update asset
  DELETE /:id - Delete asset
  GET /:id/vulnerabilities - Asset's vulns

/api/vulnerabilities
  GET / - List vulnerabilities
  POST / - Create vulnerability
  GET /:id - Get details
  PUT /:id - Update
  DELETE /:id - Delete
  POST /:id/evidence - Upload evidence

/api/scans
  GET / - List scans
  POST /ingest - Ingest scan results
  GET /:id - Scan details

/api/dashboard
  GET /metrics - KPIs
  GET /risk-trend - Time series
  GET /severity-distribution
  GET /assets-by-category

/api/reports
  GET / - List reports
  POST /generate - Generate report
  GET /:id/pdf - Download PDF

/api/users (Admin only)
  GET / - List users
  POST / - Create user
  PUT /:id - Update user
  DELETE /:id - Delete user
```

### Response Format

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "total": 100,
    "hasMore": true
  }
}
```

### Error Format

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid credentials",
    "details": {}
  }
}
```

## Frontend Architecture

### Page Structure

```
/
├── / (landing)
├── /login
├── /dashboard
├── /assets
│   ├── / (list)
│   ├── /new
│   └── /[id] (details)
├── /vulnerabilities
│   ├── / (list)
│   ├── /new
│   └── /[id] (details)
├── /scans
├── /reports
└── /settings (admin)
```

### Component Structure

```
components/
├── auth/
│   ├── LoginForm.tsx
│   └── ProtectedRoute.tsx
├── dashboard/
│   ├── RiskOverview.tsx
│   ├── SeverityChart.tsx
│   ├── AssetCategoryChart.tsx
│   └── RiskTrendChart.tsx
├── assets/
│   ├── AssetTable.tsx
│   ├── AssetForm.tsx
│   └── AssetDetails.tsx
├── vulnerabilities/
│   ├── VulnTable.tsx
│   ├── VulnForm.tsx
│   └── VulnDetails.tsx
├── ui/ (shadcn/ui customized)
│   ├── button.tsx
│   ├── card.tsx
│   ├── table.tsx
│   └── dialog.tsx
└── layout/
    ├── Sidebar.tsx
    ├── Header.tsx
    └── Layout.tsx
```

### State Management

- **Authentication**: React Context + localStorage/cookies
- **Data Fetching**: SWR with auto-refresh
- **Forms**: React Hook Form + Zod validation
- **UI State**: Local component state

## Design System

### Color Palette (Dark Premium Theme)

```css
--background: #0a0a0f
--surface: #151520
--surface-elevated: #1f1f2e

--primary: #a855f7 (purple)
--secondary: #ec4899 (pink)
--accent: #f97316 (orange)
--info: #3b82f6 (blue)

--text-primary: #f8fafc
--text-secondary: #94a3b8
--text-muted: #64748b

--critical: #ef4444 (red)
--high: #f97316 (orange)
--medium: #eab308 (yellow)
--low: #22c55e (green)
--info-severity: #3b82f6 (blue)
```

### Typography

```css
--font-heading: 'Inter', sans-serif
--font-body: 'Inter', sans-serif
--font-mono: 'JetBrains Mono', monospace

Heading levels:
h1: 2.5rem / 40px (Dashboard titles)
h2: 2rem / 32px (Section headers)
h3: 1.5rem / 24px (Card titles)
h4: 1.25rem / 20px (Subsections)
```

### Layout Grid

- Max width: 1600px
- Gutter: 24px
- Dashboard: 12-column grid
- Card spacing: 20px
- Mobile breakpoints: 640px, 768px, 1024px, 1280px

### Glass Morphism Effect

```css
background: rgba(31, 31, 46, 0.6);
backdrop-filter: blur(12px);
border: 1px solid rgba(255, 255, 255, 0.1);
box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
```

## Data Flow Examples

### Scan Ingestion

```
1. External Scanner (Nuclei) → POST /api/scans/ingest
2. API validates JWT + tenant
3. Parse scan results
4. Deduplicate vulnerabilities
5. Create/update vulnerabilities
6. Link to assets (create if needed)
7. Update risk scores
8. Trigger notifications
9. Return summary
```

### Dashboard Load

```
1. User opens /dashboard
2. Frontend calls multiple APIs in parallel:
   - GET /api/dashboard/metrics
   - GET /api/dashboard/risk-trend
   - GET /api/dashboard/severity-distribution
   - GET /api/dashboard/assets-by-category
3. SWR caches responses (5min)
4. Charts render with animations
5. Auto-refresh every 5 minutes
```

## Performance Considerations

- Database indexing on tenantId, createdAt, severity
- Pagination (default 50 items)
- Query result caching (Redis in production)
- Lazy loading for charts
- Image optimization (Next.js)
- CDN for static assets
- Connection pooling

## Deployment

### Development
```bash
docker-compose up -d
npm run dev
```

### Production
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables
```
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_EXPIRES_IN=24h
FRONTEND_URL=http://localhost:3003
API_URL=http://localhost:5001
NODE_ENV=production
```

## Integration with Existing Spectra Scanner

The platform will integrate with the existing Spectra Nuclei scanner:

1. Scanner runs (existing CLI)
2. Results saved to database (existing)
3. **New**: Scanner calls platform ingestion API
4. Platform processes and displays results
5. Users manage vulnerabilities in web UI

## Next Steps

1. Set up project structure
2. Create Prisma schema
3. Build backend API
4. Implement frontend with premium theme
5. Create Docker setup
6. Write integration tests
7. Deploy locally
