#!/bin/sh
# Run once after cloning: makes tools/check-no-roms.sh the pre-commit hook.
cd "$(dirname "$0")/.." || exit 1
cp tools/check-no-roms.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "pre-commit hook installed"
