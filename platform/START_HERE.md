# 🚀 Spectra Platform - Quick Start Guide

## Port Configuration

The Spectra platform is configured to run on:
- **Frontend**: http://localhost:3001 (avoiding conflict with Ollama WebUI on 3000)
- **Backend API**: http://localhost:5001

---

## First Time Setup

### 1. Create PostgreSQL Database

```bash
createdb spectra_platform
```

### 2. Setup Backend

```bash
cd /Users/groot/spectra/platform/backend

# Install dependencies
npm install

# Create .env file
cat > .env << 'EOF'
DATABASE_URL="postgresql://groot:@localhost:5432/spectra_platform"
JWT_SECRET="spectra-secret-key-change-in-production"
JWT_EXPIRES_IN="24h"
FRONTEND_URL="http://localhost:3001"
NODE_ENV="development"
PORT=5001
LOG_LEVEL="info"
EOF

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev --name init

# Seed demo data (optional but recommended)
npx prisma db seed
```

### 3. Setup Frontend

```bash
cd /Users/groot/spectra/platform/frontend

# Install dependencies
npm install
```

---

## Starting the Platform

### Terminal 1 - Backend API

```bash
cd /Users/groot/spectra/platform/backend
npm run dev
```

✅ Backend running on: **http://localhost:5001**

### Terminal 2 - Frontend

```bash
cd /Users/groot/spectra/platform/frontend
npm run dev
```

✅ Frontend running on: **http://localhost:3001**

---

## Access the Platform

Open your browser and navigate to:

### 🌐 http://localhost:3001

---

## Demo Accounts (After Seeding)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@demo.com | admin123 |
| Analyst | analyst@demo.com | analyst123 |
| Viewer | viewer@demo.com | viewer123 |

---

## Testing the API

```bash
# Health check
curl http://localhost:5001/health

# Register new account
curl -X POST http://localhost:5001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123456",
    "firstName": "Test",
    "lastName": "User",
    "tenantName": "Test Organization"
  }'

# Login
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "test@example.com",
    "password": "test123456"
  }'

# Get dashboard metrics
curl http://localhost:5001/api/dashboard/metrics -b cookies.txt
```

---

## Troubleshooting

### Landing Page Loads But Looks Unstyled

This usually means the Next.js dev build cache got corrupted and the CSS bundle is failing to load.

```bash
cd /Users/groot/spectra/platform/frontend
rm -rf .next
npm run dev
```

If you're previewing inside an embedded webview/proxy (e.g. Builder), make sure the proxy forwards `/_next/*` asset paths (CSS/JS). A simple local proxy is included:

```bash
cd /Users/groot/spectra/platform/frontend
npm run dev
BUILDER_PROXY_PORT=48753 npm run builder:proxy
```

Then point the embed/preview URL to `http://localhost:48753` (or set `BUILDER_PROXY_PORT` to an open port).

### Port 5001 Already in Use

```bash
# Find and kill process
lsof -ti:5001 | xargs kill -9
```

### Database Connection Error

```bash
# Check PostgreSQL is running
pg_isready

# Or start PostgreSQL
brew services start postgresql
```

### Node Modules Issues

```bash
# Clean install
cd backend
rm -rf node_modules package-lock.json
npm install

cd ../frontend
rm -rf node_modules package-lock.json
npm install
```

### Prisma Client Not Generated

```bash
cd backend
npx prisma generate
```

---

## Next Steps

1. ✅ Start backend and frontend
2. ✅ Open http://localhost:3001
3. ✅ View the landing page
4. 📋 Login page needs to be built (see STATUS.md)
5. 📋 Dashboard needs to be built (see STATUS.md)

See [STATUS.md](STATUS.md) for complete development status.

---

## Quick Reference

| What | URL | Status |
|------|-----|--------|
| Landing Page | http://localhost:3001 | ✅ Complete |
| Login Page | http://localhost:3001/login | ⏳ Pending |
| Dashboard | http://localhost:3001/dashboard | ⏳ Pending |
| Backend API | http://localhost:5001 | ✅ Complete |
| Health Check | http://localhost:5001/health | ✅ Complete |

---

**Your other services:**
- Ollama WebUI: http://localhost:3000 ✅
- Spectra Platform: http://localhost:3001 (this app)
- Backend API: http://localhost:5001
