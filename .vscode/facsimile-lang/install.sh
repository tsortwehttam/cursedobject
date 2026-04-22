#!/usr/bin/env bash
# Symlinks this extension into ~/.vscode/extensions so VSCode loads it.
# Re-run after pulling updates is not needed; symlink tracks repo.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${HOME}/.vscode/extensions/facsimile-lang"

mkdir -p "${HOME}/.vscode/extensions"

if [ -L "$DEST" ] || [ -e "$DEST" ]; then
  echo "Removing existing: $DEST"
  rm -rf "$DEST"
fi

ln -s "$SRC" "$DEST"
echo "Linked: $DEST -> $SRC"
echo "Reload VSCode window (Cmd+Shift+P → 'Developer: Reload Window')."
