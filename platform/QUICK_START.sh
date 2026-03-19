#!/bin/bash

# Spectra Platform - Quick Start Script
# This script sets up the entire platform in one command

set -e

echo "🛡️  Spectra Platform - Quick Start"
echo "=================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ first."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

if ! command -v psql &> /dev/null; then
    echo "⚠️  PostgreSQL CLI (psql) not found. Make sure PostgreSQL is installed."
fi

echo "✅ Prerequisites check passed"
echo ""

# Setup Backend
echo "${BLUE}📦 Setting up backend...${NC}"
cd backend

if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "${YELLOW}⚠️  Please edit backend/.env with your database URL and JWT secret${NC}"
fi

echo "Installing backend dependencies..."
npm install

echo "Generating Prisma client..."
npm run prisma:generate

echo "${GREEN}✅ Backend setup complete${NC}"
echo ""

# Setup Frontend
echo "${BLUE}📦 Setting up frontend...${NC}"
cd ../frontend

if [ ! -f ".env.local" ]; then
    echo "Creating .env.local file..."
    echo "NEXT_PUBLIC_API_URL=http://localhost:5001" > .env.local
fi

echo "Installing frontend dependencies..."
npm install

echo "${GREEN}✅ Frontend setup complete${NC}"
echo ""

# Instructions
echo "${GREEN}🎉 Setup Complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Create PostgreSQL database:"
echo "   ${YELLOW}createdb spectra_platform${NC}"
echo ""
echo "2. Update backend/.env with your database URL:"
echo "   ${YELLOW}DATABASE_URL=\"postgresql://user:password@localhost:5432/spectra_platform\"${NC}"
echo "   ${YELLOW}JWT_SECRET=\"your-secure-random-string\"${NC}"
echo ""
echo "3. Run database migrations:"
echo "   ${YELLOW}cd backend && npm run prisma:migrate${NC}"
echo ""
echo "4. Start the backend (Terminal 1):"
echo "   ${YELLOW}cd backend && npm run dev${NC}"
echo ""
echo "5. Start the frontend (Terminal 2):"
echo "   ${YELLOW}cd frontend && npm run dev${NC}"
echo ""
echo "6. Open http://localhost:3000 in your browser"
echo ""
echo "📚 For more details, see IMPLEMENTATION_SUMMARY.md"
