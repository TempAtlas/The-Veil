#!/bin/bash
# Stamp a new version on every page's stylesheet, scripts and data (?v=...), so visitors' browsers fetch the new files
# after an update instead of the copies they kept (GitHub Pages lets browsers keep them for about 10 minutes).
# Run from the website folder before committing an update:  bash tools/stamp-version.sh
set -e
cd "$(dirname "$0")/.."
V=$(date +%Y%m%d%H%M)
sed -i -E "s#(assets/[A-Za-z0-9_-]+\.(js|css))(\?v=[0-9A-Za-z.-]+)?\"#\1?v=$V\"#g" *.html
sed -i -E "s#^(  version: \")[^\"]*(\",)#\1$V\2#" assets/site.js
echo "stamped v=$V"
