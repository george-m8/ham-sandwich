#!/usr/bin/env bash
set -euo pipefail

if [[ -d "receipt-js/.git" ]]; then
  echo "Syncing receipt-js from upstream..."
  git -C receipt-js pull --ff-only
elif [[ -d "receipt-js" ]]; then
  echo "receipt-js folder exists but is not a git clone. Skipping pull."
else
  echo "receipt-js folder not found. Clone it with: git clone https://github.com/george-m8/receipt-js.git"
fi
