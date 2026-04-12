#!/usr/bin/env bash
# Deploy Talabat Treasure Hunt AR to Vercel (production).
# Requires: Node.js, npm, and `npx vercel` (login once: npx vercel login).
# On Windows, double-click `deploy.cmd` for the same flow (console stays open).

set -euo pipefail

cd "$(dirname "$0")"

echo "==> Install dependencies"
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

echo "==> Build"
npm run build

echo "==> Deploy to Vercel (production)"
npx vercel deploy --prod --yes

echo "==> Done"
