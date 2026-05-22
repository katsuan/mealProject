#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
CONFIG_FILE="$ROOT_DIR/html/js/site-config.js"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "site-config.js が見つかりません: $CONFIG_FILE" >&2
  exit 1
fi

APP_VERSION=$(date '+%Y-%m-%d-1')
APP_COMMIT=$(git -C "$ROOT_DIR" rev-parse --short HEAD)

perl -0pi -e "s/appVersion: '\\K[^']+(?=',)/$APP_VERSION/g; s/appCommit: '\\K[^']+(?=',)/$APP_COMMIT/g" "$CONFIG_FILE"

echo "Updated site-config.js -> version=$APP_VERSION commit=$APP_COMMIT"
