#!/usr/bin/env sh
set -eu
npm --prefix server run dev &
API_PID=$!
trap 'kill "$API_PID" 2>/dev/null || true' EXIT INT TERM
npm exec vite -- --host 0.0.0.0 --port 3000 "$@"
