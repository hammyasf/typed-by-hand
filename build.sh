#!/bin/sh
# Builds app/index.html (the one file a buyer gets) from src/, then runs the self-check.
set -e
cd "$(dirname "$0")"
node selftest.cjs
mkdir -p app
node -e '
const fs = require("fs");
const core = fs.readFileSync("src/core.js", "utf8").replace(/<\/script/g, "<\\/script");
const html = fs.readFileSync("src/app.html", "utf8");
if (!html.includes("/*CORE*/")) throw new Error("placeholder missing");
fs.writeFileSync("app/index.html", html.replace("/*CORE*/", () => core));
'
echo "built app/index.html ($(wc -c < app/index.html | tr -d " ") bytes)"
