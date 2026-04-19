#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Local dev startup — backend + frontend + optional ngrok
# Usage:
#   bash start-local.sh          # browser only (localhost)
#   bash start-local.sh --ngrok  # + ngrok tunnel for mobile
# ─────────────────────────────────────────────────────────────

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "▶ Starting backend (port 8181)..."
cd "$ROOT/backend"
go run main.go &
BACKEND_PID=$!

# Give backend a moment to bind
sleep 1

if [[ "$1" == "--ngrok" ]]; then
  echo ""
  echo "▶ Starting ngrok tunnel on port 5173..."
  echo "   (Vite proxy will forward /api/* → localhost:8181)"
  echo ""

  # Start ngrok in background, wait for it to initialise
  ngrok http 5173 --log=stdout > /tmp/ngrok.log 2>&1 &
  NGROK_PID=$!
  sleep 3

  # Pull the public URL from ngrok's local API
  NGROK_URL=$(curl -s http://localhost:4040/api/tunnels \
    | grep -o '"public_url":"https://[^"]*"' \
    | head -1 \
    | cut -d'"' -f4)

  if [[ -z "$NGROK_URL" ]]; then
    echo "⚠  Could not read ngrok URL. Check /tmp/ngrok.log"
  else
    echo "┌──────────────────────────────────────────────────┐"
    echo "│  Open this URL on your mobile:                   │"
    echo "│  $NGROK_URL"
    echo "└──────────────────────────────────────────────────┘"
  fi
fi

echo ""
echo "▶ Starting frontend (port 5173)..."
cd "$ROOT/webar-app"
npm run dev

# Cleanup on exit
kill $BACKEND_PID 2>/dev/null || true
[[ -n "$NGROK_PID" ]] && kill $NGROK_PID 2>/dev/null || true
