# Spectra Vulnerability Management Platform

<div align="center">

![Spectra Logo](https://via.placeholder.com/150x150/a855f7/ffffff?text=SPECTRA)

**Next-Generation Vulnerability Management with AI-Powered Analysis**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)

</div>

---

## 🌟 Overview

Spectra is an enterprise-grade vulnerability management platform that combines the power of automated scanning with AI-driven analysis. Built with modern technologies and designed with a premium dark theme inspired by next-generation AI/SaaS products.

### ✨ Key Features

- 🧠 **AI-Powered Analysis** - Llama 3.1 integration for intelligent vulnerability assessment
- 🎯 **InsightVM-Quality Dashboard** - Executive-friendly visualizations and actionable insights
- 🔒 **Multi-Tenant Architecture** - Complete data isolation for SaaS deployment
- ⚡ **Real-Time Scanning** - Integration with Nuclei and other security scanners
- 📊 **Executive Reporting** - Beautiful PDF reports for stakeholders
- 🛡️ **Role-Based Access Control** - Admin, Analyst, and Viewer roles
- 🔍 **Advanced Search & Filtering** - Find vulnerabilities and assets quickly
- 📈 **Trend Analysis** - Track security posture over time
- 🎨 **Premium UX** - Dark theme with glassmorphism and neon gradients

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- npm or yarn

### One-Command Setup

```bash
chmod +x QUICK_START.sh
./QUICK_START.sh
```

### Manual Setup

1. **Clone and Setup**
   ```bash
   cd /Users/groot/spectra/platform
   ```

2. **Setup Backend**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your database URL and JWT secret
   npm run prisma:generate
   npm run prisma:migrate
   ```

3. **Setup Frontend**
   ```bash
   cd ../frontend
   npm install
   echo "NEXT_PUBLIC_API_URL=http://localhost:5001" > .env.local
   ```

4. **Start Development**
   ```bash
   # Terminal 1 - Backend
   cd backend && npm run dev

   # Terminal 2 - Frontend
   cd frontend && npm run dev
   ```

5. **Access Platform**
   - Frontend: http://localhost:3003
   - Backend API: http://localhost:5001
   - API Health: http://localhost:5001/health

### Design/UX Dev Server

- For UI copy/style work, run just the Next.js dev server:
  ```bash
  cd frontend
  NEXT_PUBLIC_API_URL=http://localhost:5001 npm run dev
  ```
  The design preview is available at http://localhost:3003.
- Embedding in design tools (e.g. Builder): keep `npm run dev` running, then in another terminal:
  ```bash
  BUILDER_PROXY_TARGET=http://localhost:3003 BUILDER_PROXY_PORT=48752 npm run builder:proxy
  ```
  Point your design tool to the proxy URL so assets under `/_next/*` load correctly.

## 📁 Project Structure

```
platform/
├── backend/                 # Express.js API Server
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Auth, validation, errors
│   │   └── utils/          # Utilities (auth, logger, prisma)
│   ├── prisma/             # Database schema
│   └── logs/               # Application logs
│
├── frontend/               # Next.js Frontend
│   ├── app/               # App router pages
│   ├── components/        # Reusable components
│   ├── lib/               # Utilities and API client
│   └── contexts/          # React contexts
│
├── prisma/                # Shared Prisma schema
│   └── schema.prisma      # Database models
│
└── docs/                  # Documentation
    ├── ARCHITECTURE.md
    └── IMPLEMENTATION_SUMMARY.md
```

## 🎨 Design System

### Color Palette

```css
/* Background */
--background: #0a0a0f
--surface: #151520
--card: #1f1f2e

/* Brand */
--primary: #a855f7    /* Purple */
--secondary: #ec4899  /* Pink */
--accent: #f97316     /* Orange */

/* Severity */
--critical: #ef4444
--high: #f97316
--medium: #eab308
--low: #22c55e
--info: #3b82f6

/* Text */
--text-primary: #f8fafc
--text-secondary: #94a3b8
--text-muted: #64748b
```

### Typography

- **Font**: Inter (sans-serif)
- **Headings**: Bold, gradient text for emphasis
- **Body**: Regular weight, high readability

### Components

- **Glass Morphism**: Frosted glass effect with backdrop blur
- **Neon Gradients**: Purple → Pink → Orange transitions
- **Smooth Animations**: Framer Motion powered
- **Premium Shadows**: Multi-layer depth effects

## 🔐 Authentication

### Register New Account

```bash
POST /api/auth/register
{
  "email": "admin@example.com",
  "password": "securepass123",
  "firstName": "John",
  "lastName": "Doe",
  "tenantName": "Acme Corp"
}
```

### Login

```bash
POST /api/auth/login
{
  "email": "admin@example.com",
  "password": "securepass123"
}
```

### Protected Routes

All API endpoints (except auth) require authentication via JWT token in cookie or Authorization header.

## 📊 Dashboard Metrics

The dashboard provides InsightVM-quality visualizations:

1. **Risk Posture Overview**
   - Total assets
   - Open vulnerabilities
   - Risk score (0-100)
   - Trend indicators

2. **Severity Distribution**
   - Pie/donut chart
   - Color-coded by severity
   - Interactive tooltips

3. **Assets by Category**
   - Bar charts
   - By type, environment, criticality

4. **Risk Trend**
   - Line chart over time
   - 7/30/90 day views
   - Historical comparison

5. **Top Vulnerabilities**
   - Prioritized list
   - CVSS scores
   - Asset details

6. **Recent Activity**
   - Latest scans
   - New findings
   - Mitigation actions

## 🛠️ API Endpoints

### Authentication
- `POST /api/auth/register` - Register user + tenant
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user
- `POST /api/auth/refresh` - Refresh token

### Dashboard
- `GET /api/dashboard/metrics` - KPIs
- `GET /api/dashboard/risk-trend` - Time series
- `GET /api/dashboard/severity-distribution` - Severity breakdown
- `GET /api/dashboard/assets-by-category` - Asset grouping
- `GET /api/dashboard/top-vulnerabilities` - Top risks
- `GET /api/dashboard/recent-scans` - Recent activity

### Assets
- `GET /api/assets` - List assets (paginated)
- `POST /api/assets` - Create asset
- `GET /api/assets/:id` - Get asset
- `PUT /api/assets/:id` - Update asset
- `DELETE /api/assets/:id` - Delete asset
- `GET /api/assets/:id/vulnerabilities` - Asset vulnerabilities

### Vulnerabilities
- `GET /api/vulnerabilities` - List vulnerabilities (paginated)
- `POST /api/vulnerabilities` - Create vulnerability
- `GET /api/vulnerabilities/:id` - Get vulnerability
- `PUT /api/vulnerabilities/:id` - Update vulnerability
- `DELETE /api/vulnerabilities/:id` - Delete vulnerability
- `POST /api/vulnerabilities/:id/evidence` - Add evidence

## 🔗 Integration with Existing Scanner

The platform integrates with the existing Spectra Nuclei scanner:

```python
# In your existing scanner code
import requests

def upload_scan_results(scan_data):
    response = requests.post(
        'http://localhost:5001/api/scans/ingest',
        json=scan_data,
        cookies={'token': your_auth_token}
    )
    return response.json()
```

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

### API Testing with curl

```bash
# Register
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","firstName":"Test","lastName":"User","tenantName":"Test Org"}'

# Login (saves cookie)
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"test123"}'

# Get metrics
curl http://localhost:5001/api/dashboard/metrics \
  -b cookies.txt
```

## 📦 Deployment

### Production Build

```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
npm start
```

### Docker (Coming Soon)

```bash
docker-compose up -d
```

## 🤝 Contributing

This is an internal project. For questions or contributions, please contact the development team.

## 📝 License

Proprietary - All rights reserved

## 🙏 Acknowledgments

- **Nuclei** - Vulnerability scanner integration
- **Llama 3.1** - AI-powered analysis
- **Rapid7 InsightVM** - Dashboard inspiration
- **Next.js** - Frontend framework
- **Prisma** - Database ORM
- **Tailwind CSS** - Styling system

---

<div align="center">

**Built with ❤️ for Security Teams**

[Documentation](./ARCHITECTURE.md) • [API Reference](./IMPLEMENTATION_SUMMARY.md) • [Report Issues](mailto:security@example.com)

</div>
