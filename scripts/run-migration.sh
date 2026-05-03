#!/bin/bash
# Run the flujo tables migration against the remote Supabase database.
#
# Usage:
#   # Option 1: Provide a fresh Supabase access token
#   SUPABASE_ACCESS_TOKEN=sbp_xxxxx ./scripts/run-migration.sh
#
#   # Option 2: Provide the database password directly (pooler connection)
#   DB_PASSWORD=your_db_password ./scripts/run-migration.sh
#
# Generate a new access token at:
#   https://supabase.com/dashboard/account/tokens

set -euo pipefail

PROJECT_REF="rnjxmmcsxmyaktseegvt"
MIGRATION_FILE="$(dirname "$0")/../supabase/migrations/20260416_create_flujo_tables.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "Error: Migration file not found at $MIGRATION_FILE"
  exit 1
fi

SQL=$(cat "$MIGRATION_FILE")

# Option A: Use the Supabase MCP server with an access token
if [ -n "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "Applying migration via Supabase MCP server..."
  RESPONSE=$(printf '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli","version":"1.0"}}}\n{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"apply_migration","arguments":{"project_id":"%s","name":"create_flujo_tables","query":"%s"}}}' \
    "$PROJECT_REF" \
    "$(echo "$SQL" | sed 's/"/\\"/g' | tr '\n' ' ')" \
    | npx -y @supabase/mcp-server-supabase@latest --access-token "$SUPABASE_ACCESS_TOKEN" 2>/dev/null \
    | tail -1)

  if echo "$RESPONSE" | grep -q '"isError":true'; then
    echo "Error: $(echo "$RESPONSE" | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['result']['content'][0]['text'])" 2>/dev/null || echo "$RESPONSE")"
    exit 1
  fi
  echo "Migration applied successfully!"
  exit 0
fi

# Option B: Use pg client with database password
if [ -n "${DB_PASSWORD:-}" ]; then
  echo "Applying migration via pooler connection..."
  DB_URL="postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-1-us-west-2.pooler.supabase.com:6543/postgres"
  npx supabase db query --db-url "$DB_URL" -f "$MIGRATION_FILE"
  echo "Migration applied successfully!"
  exit 0
fi

echo "Error: No credentials provided."
echo ""
echo "Either set SUPABASE_ACCESS_TOKEN or DB_PASSWORD:"
echo "  SUPABASE_ACCESS_TOKEN=sbp_xxx ./scripts/run-migration.sh"
echo "  DB_PASSWORD=xxx ./scripts/run-migration.sh"
echo ""
echo "Or copy-paste the SQL from $MIGRATION_FILE into the Supabase SQL Editor:"
echo "  https://supabase.com/dashboard/project/${PROJECT_REF}/sql"
exit 1
