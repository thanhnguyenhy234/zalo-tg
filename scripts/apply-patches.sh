#!/usr/bin/env bash
# Reapply local node_modules patches after npm install / npm ci.
# Usage: bash scripts/apply-patches.sh
set -euo pipefail
cd "$(dirname "$0")/.."

shopt -s nullglob
patches=(patches/*.patch)
if [ ${#patches[@]} -eq 0 ]; then
  echo "No patches to apply."
  exit 0
fi

for p in "${patches[@]}"; do
  if git apply --check "$p" 2>/dev/null; then
    git apply "$p"
    echo "applied:          $p"
  elif git apply --reverse --check "$p" 2>/dev/null; then
    echo "already applied:  $p"
  else
    echo "FAILED:           $p (target file changed upstream? rebase the patch)" >&2
    exit 1
  fi
done
