#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js was not found."
  echo "Install the current Node.js LTS from https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "[ERROR] npm was not found. Reinstall Node.js LTS."
  exit 1
fi

node scripts/check-git-update.mjs || {
  echo
  echo "[WARNING] Update was not completed. Starting the installed version."
  echo
}

npm run start:app
