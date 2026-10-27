#!/bin/sh
# Refuses a commit that stages a ROM, a save, a patch or an archive, or any file over 5 MB.
# Installed as the repo's pre-commit hook by tools/install-hooks.sh.
bad=0
for f in $(git diff --cached --name-only --diff-filter=AM); do
  case "$f" in
    *.gba|*.GBA|*.gb|*.gbc|*.nds|*.bin|*.sav|*.srm|*.bps|*.ips|*.ups|*.xdelta|*.zip|*.7z|*.rar)
      echo "blocked: $f (ROMs, saves, patches and archives never go in this repo)"; bad=1 ;;
  esac
  if [ -f "$f" ]; then
    size=$(wc -c < "$f")
    if [ "$size" -gt 5242880 ]; then echo "blocked: $f is over 5 MB"; bad=1; fi
    # a GBA ROM header: the Nintendo logo bytes at 0x04
    if head -c 8 "$f" | od -An -tx1 | grep -q "24 ff ae 51"; then echo "blocked: $f looks like a GBA ROM"; bad=1; fi
  fi
done
exit $bad
