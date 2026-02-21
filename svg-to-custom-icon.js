#!/usr/bin/env node

/*
  Clipboard-first wrapper.

  Usage (PowerShell):
    # 1) Copia el <svg>...</svg>
    # 2) Ejecuta:
    node .\svg-to-custom-icon.js --name CustomMyIcon --key MyIcon

  This reads the SVG from the Windows clipboard and pipes it to:
    scripts/svg-to-custom-icon.js

  Why:
    - Avoid PowerShell quoting issues with xmlns="..." etc.
    - Avoid using files.
*/

const path = require("path");
const { execSync, spawn } = require("child_process");
const fs = require("fs");

function getClipboardText() {
  // -Raw preserves newlines
  return execSync('powershell -NoProfile -Command "Get-Clipboard -Raw"', {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function main() {
  let svg = "";
  try {
    svg = (getClipboardText() || "").trim();
  } catch (err) {
    console.error("Failed to read clipboard via PowerShell (Get-Clipboard -Raw).");
    console.error(err?.message || err);
    process.exit(1);
  }

  if (!svg || !svg.includes("<svg")) {
    console.error("Clipboard does not contain an <svg>...</svg>.");
    console.error("Copy the full SVG markup first, then run:");
    console.error("  node .\\svg-to-custom-icon.js --name CustomMyIcon --key MyIcon");
    process.exit(1);
  }

  const generatorPath = path.join(__dirname, "scripts", "svg-to-custom-icon.js");
  const fallbackGeneratorPath = path.join(__dirname, "src", "icons", "svg-to-custom-icon.js");

  const resolvedGeneratorPath = fs.existsSync(generatorPath)
    ? generatorPath
    : fallbackGeneratorPath;

  if (!fs.existsSync(resolvedGeneratorPath)) {
    console.error("Could not find svg-to-custom-icon generator script.");
    console.error("Tried:");
    console.error("  " + generatorPath);
    console.error("  " + fallbackGeneratorPath);
    process.exit(1);
  }
  const finalArgs = [resolvedGeneratorPath, ...process.argv.slice(2)];

  const child = spawn(process.execPath, finalArgs, {
    stdio: ["pipe", "inherit", "inherit"],
  });

  child.stdin.write(svg);
  child.stdin.write("\n");
  child.stdin.end();

  child.on("exit", (code) => process.exit(code ?? 0));
}

main();
