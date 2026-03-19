#!/bin/bash
# SpectraPRO Enterprise Setup Script
# Run this to apply database migrations and prepare for service implementation

set -e

echo "🚀 SpectraPRO Enterprise Setup"
echo "=============================="
echo ""

# Check if we're in the right directory
if [ ! -f "prisma/schema.prisma" ]; then
    echo "❌ Error: Must run from platform/backend directory"
    echo "Usage: cd platform/backend && ./setup-spectrapro.sh"
    exit 1
fi

# Check if PostgreSQL is running
echo "📊 Checking database connection..."
if ! npx prisma db pull --force &> /dev/null; then
    echo "⚠️  Warning: Could not connect to database"
    echo "   Make sure PostgreSQL is running and DATABASE_URL is configured in .env"
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Format and validate schema
echo "✅ Validating Prisma schema..."
npx prisma format
npx prisma validate

# Create migration
echo ""
echo "📝 Creating database migration..."
echo "   This will create tables for:"
echo "   - RulesOfEngagement (ROE authorization)"
echo "   - AIDecisionLedger (AI transparency)"
echo "   - EndpointMap (discovered URLs/parameters)"
echo "   - ScanControl (kill switch)"
echo ""
read -p "Apply migration now? (y/N) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npx prisma migrate dev --name add_spectrapro_enterprise_features
    echo "✅ Migration applied successfully"
else
    echo "⏭️  Migration skipped. Run manually later:"
    echo "   npx prisma migrate dev --name add_spectrapro_enterprise_features"
fi

# Generate Prisma Client
echo ""
echo "🔧 Generating Prisma Client..."
npx prisma generate

echo ""
echo "✅ Schema setup complete!"
echo ""
echo "📁 Next steps:"
echo ""
echo "1. Implement backend services (see SPECTRAPRO_IMPLEMENTATION_SUMMARY.md)"
echo "   - src/services/roe.service.ts"
echo "   - src/services/ai-ledger.service.ts"
echo "   - src/services/endpoint-discovery.service.ts"
echo "   - src/services/scan-control.service.ts"
echo ""
echo "2. Implement backend routes"
echo "   - src/routes/roe.routes.ts"
echo "   - src/routes/ai-ledger.routes.ts"
echo "   - src/routes/scan-control.routes.ts"
echo ""
echo "3. Update scan-orchestrator.service.ts with ROE enforcement and AI ledger"
echo ""
echo "4. Implement frontend components"
echo "   - app/dashboard/roe/page.tsx"
echo "   - app/dashboard/ai-ledger/page.tsx"
echo "   - components/ROEModal.tsx"
echo "   - components/AIDecisionDetail.tsx"
echo ""
echo "5. Add configuration to .env (see SPECTRAPRO_IMPLEMENTATION_SUMMARY.md)"
echo ""
echo "6. Write tests"
echo ""
echo "📖 Full implementation plan: ../../SPECTRAPRO_IMPLEMENTATION_SUMMARY.md"
echo ""
