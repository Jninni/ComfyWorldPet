#!/bin/bash
# Build a production snapshot into /tmp/claude-0/dist, retrying while files are mid-edit.
cd "$(dirname "$0")/.."
for i in 1 2 3 4 5 6; do
  if npx vite build --outDir /tmp/claude-0/dist --emptyOutDir > /tmp/claude-0/build.log 2>&1; then echo BUILD_OK; exit 0; fi
  grep -m3 "ERROR\|error" /tmp/claude-0/build.log
  sleep 20
done
echo BUILD_FAIL; exit 1
