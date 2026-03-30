#!/usr/bin/env bash
set -euo pipefail

if [[ -d "receipt-css/.git" ]]; then
  echo "Syncing receipt-css from upstream..."
  git -C receipt-css pull --ff-only
elif [[ -d "receipt-css" ]]; then
  echo "receipt-css folder exists but is not a git clone. Skipping pull."
else
  echo "receipt-css folder not found. Clone it with: git clone https://github.com/george-m8/receipt-css.git"
fi
