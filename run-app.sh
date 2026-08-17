#!/usr/bin/env bash

# Resolve project directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "=== GDKapp Runner (macOS / Linux) ==="

# Check Node.js and NPM
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed or not in PATH."
  echo "Please install Node.js (e.g. 'brew install node') and try again."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm is not available in PATH."
  exit 1
fi

echo "Node: $(node -v)  NPM: $(npm -v)"

# Ensure backend .env
if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "Creating backend .env with default JWT_SECRET"
  echo "JWT_SECRET=dev_secret_change_me" > "$BACKEND_DIR/.env"
fi

# Ensure frontend .env
if [ ! -f "$FRONTEND_DIR/.env" ]; then
  echo "Creating frontend .env with default VITE_API_BASE"
  echo "VITE_API_BASE=http://localhost:3001/api" > "$FRONTEND_DIR/.env"
fi

# Install dependencies if missing
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
  echo "Installing backend dependencies..."
  (cd "$BACKEND_DIR" && npm install)
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

echo "Starting backend and frontend..."
# Auto open browser
(sleep 2 && if [[ "$OSTYPE" == "darwin"* ]]; then open http://localhost:5173; elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:5173; fi) &

if command -v npx >/dev/null 2>&1; then
  npx -y concurrently -n backend,frontend -c "bgBlue.bold,bgGreen.bold" \
    "npm --prefix \"$BACKEND_DIR\" run dev" \
    "npm --prefix \"$FRONTEND_DIR\" run dev"
else
  (cd "$BACKEND_DIR" && npm run dev) &
  BACKEND_PID=$!
  (cd "$FRONTEND_DIR" && npm run dev) &
  FRONTEND_PID=$!
  trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
  wait
fi
