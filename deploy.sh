#!/bin/sh
# One-command deploy: refresh the data, commit everything, push to main.
# GitHub Pages deploys automatically from main (see .github/workflows/deploy.yml).
set -e
cd "$(dirname "$0")"
node scripts/fetch-data.mjs
git add -A
git diff --cached --quiet || git commit -m "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push origin main
echo "Deployed. Live at https://adryanryan03-create.github.io/taskmarket-visualizer/"
