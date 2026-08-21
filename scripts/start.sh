#!/usr/bin/env bash
# Production start script: seeds demo data only on the very first boot
# (when no database file exists yet), then starts the server.
# Safe to redeploy repeatedly — it will never re-run the seed (and wipe
# real data) once data/wedding.db already exists on the persistent disk.
set -e

DATA_DIR="${DATA_DIR:-./data}"
DB_PATH="$DATA_DIR/wedding.db"

mkdir -p "$DATA_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "No existing database found at $DB_PATH — seeding demo data..."
  node --experimental-sqlite src/seed.js
else
  echo "Existing database found at $DB_PATH — skipping seed."
fi

exec node --experimental-sqlite src/server.js
