# SpectraPRO — Quick Start Guide

**Get SpectraPRO running in < 10 minutes.**

## Choose Your Path

### 🐳 Docker (Recommended for any server)

**Best for:** Production servers, any Linux/macOS/Windows machine

```bash
# 1. Create environment file
cp .env.production .env

# 2. Edit with your secrets
nano .env
# Generate a password: openssl rand -base64 32
# Generate JWT secret: openssl rand -base64 48

# 3. Start everything
./scripts/start-docker.sh
```

**That's it!** Access at: http://localhost

---

### 🍎 Local MacBook (No Docker)

**Best for:** Development on your MacBook

```bash
# 1. Install dependencies (one-time)
brew install postgresql@15
node -v  # Should be 20+

# 2. Create environment file
cp .env.production .env

# 3. Edit with your database connection
nano .env

# 4. Start servers
./scripts/start-local.sh
```

**Done!** Access at: http://localhost:3003

---

## After Starting

### 📋 First Steps

1. **Open the app**: http://localhost (Docker) or http://localhost:3003 (local)
2. **Register account**: Click "Sign Up"
3. **View dashboard**: Login with your credentials
4. **Run a scan**: Dashboard → New Scan → Enter target URL

### 🔧 Common Commands

```bash
# View logs (Docker)
docker-compose logs -f backend
docker-compose logs -f frontend

# View logs (Local)
tail -f logs/backend.log
tail -f logs/frontend.log

# Database GUI (Local)
cd platform/backend && npm run prisma:studio
# Opens: http://localhost:5555

# Stop everything (Docker)
docker-compose down

# Stop everything (Local)
./scripts/stop-local.sh
```

### 🌐 Configure for remote server

Edit `.env` to point to your server IP:

```env
NEXT_PUBLIC_API_URL=http://192.168.1.100  # Your server IP
NEXT_PUBLIC_APP_URL=http://192.168.1.100
```

Then restart services.

---

## Full Documentation

See **[DEPLOY.md](./DEPLOY.md)** for:
- Detailed setup instructions
- Environment configuration
- Database management
- Troubleshooting
- Security recommendations
- Upgrade procedures

---

## Troubleshooting

### "Port already in use"

```bash
# Docker
docker-compose down
docker system prune -a

# Local
lsof -i :5001
kill -9 <PID>
```

### "Database connection failed"

**Docker:** Check PostgreSQL is running
```bash
docker-compose ps postgres
docker-compose logs postgres
```

**Local:** Verify PostgreSQL and connection string
```bash
brew services list | grep postgresql
grep DATABASE_URL .env
```

### "Build failed"

```bash
# Docker
docker-compose down -v  # Remove volumes
docker system prune -a  # Clean up
./scripts/start-docker.sh
```

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Your Browser                                   │
│  http://localhost (Docker)                      │
│  http://localhost:3003 (Local)                  │
└────────────────┬────────────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    v                         v
┌──────────────────┐  ┌──────────────────┐
│ Caddy            │  │ Local Frontend   │
│ Reverse Proxy    │  │ Next.js :3003    │
│ :80              │  │ (dev only)       │
└────────┬─────────┘  └──────────────────┘
         │
    ┌────┴──────┬───────────┐
    │            │           │
    v            v           v
┌──────────────────────┐  ┌─────────────────────┐
│ Backend API          │  │ Frontend            │
│ Express.js :5001     │  │ Next.js :3000       │
│ (Docker internal)    │  │ (Docker internal)   │
└──────────┬───────────┘  └─────────────────────┘
           │
           v
       ┌───────────────┐
       │ PostgreSQL    │
       │ :5432         │
       │ (Docker only) │
       └───────────────┘
```

---

## Next: Read Full Docs

👉 **[DEPLOY.md](./DEPLOY.md)** — Complete deployment guide

