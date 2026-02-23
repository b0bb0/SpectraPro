#!/bin/bash

# Spectra Platform Startup Script
# Starts both backend and frontend

set -e

echo "🛡️  Starting Spectra Platform..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "${BLUE}📍 Project directory: ${SCRIPT_DIR}${NC}"
echo ""

# Check if backend dependencies are installed
if [ ! -d "$SCRIPT_DIR/backend/node_modules" ]; then
    echo "${YELLOW}Installing backend dependencies...${NC}"
    cd "$SCRIPT_DIR/backend"
    npm install
fi

# Check if frontend dependencies are installed
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ]; then
    echo "${YELLOW}Installing frontend dependencies...${NC}"
    cd "$SCRIPT_DIR/frontend"
    npm install
fi

# Check if .env exists in backend
if [ ! -f "$SCRIPT_DIR/backend/.env" ]; then
    echo "${YELLOW}⚠️  Backend .env file not found!${NC}"
    echo "Creating from .env.example..."
    cp "$SCRIPT_DIR/backend/.env.example" "$SCRIPT_DIR/backend/.env"
    echo "${YELLOW}⚠️  Please edit backend/.env with your database URL${NC}"
    echo ""
fi

# Check if .env.local exists in frontend
if [ ! -f "$SCRIPT_DIR/frontend/.env.local" ]; then
    echo "Creating frontend .env.local..."
    echo "NEXT_PUBLIC_API_URL=http://localhost:5001" > "$SCRIPT_DIR/frontend/.env.local"
    echo "PORT=3001" >> "$SCRIPT_DIR/frontend/.env.local"
fi

echo ""
echo "${GREEN}✅ Dependencies ready${NC}"
echo ""
echo "${BLUE}Starting services...${NC}"
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo "${YELLOW}Shutting down services...${NC}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

trap cleanup EXIT INT TERM

# Start backend in background
echo "${BLUE}🚀 Starting Backend API on port 5001...${NC}"
cd "$SCRIPT_DIR/backend"
npm run dev > /tmp/spectra-backend.log 2>&1 &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend in background
echo "${BLUE}🚀 Starting Frontend on port 3001...${NC}"
cd "$SCRIPT_DIR/frontend"
npm run dev > /tmp/spectra-frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 5

echo ""
echo "${GREEN}✅ Spectra Platform is running!${NC}"
echo ""
echo "📍 URLs:"
echo "   Frontend:  ${GREEN}http://localhost:3001${NC}"
echo "   Backend:   ${GREEN}http://localhost:5001${NC}"
echo "   Health:    ${GREEN}http://localhost:5001/health${NC}"
echo ""
echo "📋 Demo Accounts (after seeding):"
echo "   Admin:    admin@demo.com / admin123"
echo "   Analyst:  analyst@demo.com / analyst123"
echo "   Viewer:   viewer@demo.com / viewer123"
echo ""
echo "📝 Logs:"
echo "   Backend:  tail -f /tmp/spectra-backend.log"
echo "   Frontend: tail -f /tmp/spectra-frontend.log"
echo ""
echo "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for processes
wait $BACKEND_PID $FRONTEND_PID
