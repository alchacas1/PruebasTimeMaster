/*
  Usage:
    node scripts/svg-to-custom-icon.js --name CustomMyIcon --key MyIcon --svg "<svg ...>...</svg>"

  PowerShell friendly (clipboard):
    # Copia el <svg> al portapapeles y ejecuta:
    Get-Clipboard | node scripts/svg-to-custom-icon.js --name CustomMyIcon --key MyIcon

  Base64 (evita problemas de comillas / límite de longitud):
    # Si tienes el SVG en clipboard:
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Clipboard)))
    node scripts/svg-to-custom-icon.js --name CustomMyIcon --key MyIcon --svgBase64 $b64

  Or paste SVG via stdin:
    type icon.svg | node scripts/svg-to-custom-icon.js --name CustomMyIcon --key MyIcon

  Or read from file:
    node scripts/svg-to-custom-icon.js --name CustomMyIcon --key MyIcon --file path/to/icon.svg

  Output:
    - A createIcon(...) component export
    - A CustomIcons registry entry

  Notes:
    This is a lightweight transformer (regex-based). For complex SVGs you may need
    small manual tweaks after generation.
*/

const fs = require("fs");

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    args[key] = value;
  }
  return args;
}

function extractSvgParts(svg) {
  const svgOpenMatch = svg.match(/<svg\b([^>]*)>/i);
  const viewBoxMatch = svgOpenMatch?.[1]?.match(/\bviewBox\s*=\s*"([^"]+)"/i);
  const viewBox = viewBoxMatch?.[1] || "0 0 24 24";

  const innerMatch = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/i);
  const inner = (innerMatch?.[1] || svg).trim();

  return { viewBox, inner };
}

function toJsx(svgInner) {
  let out = svgInner;

  // Common attribute conversions
  const replacements = [
    [/\bstroke-linecap\b/g, "strokeLinecap"],
    [/\bstroke-linejoin\b/g, "strokeLinejoin"],
    [/\bstroke-width\b/g, "strokeWidth"],
    [/\bfill-rule\b/g, "fillRule"],
    [/\bclip-rule\b/g, "clipRule"],
    [/\bclass\b=/g, "className="],
  ];
  for (const [re, rep] of replacements) out = out.replace(re, rep);

  // Prefer using our color/strokeWidth props when the SVG uses currentColor / numeric widths.
  out = out.replace(/stroke=\"currentColor\"/g, 'stroke={color}');
  out = out.replace(/fill=\"currentColor\"/g, 'fill={color}');

  // strokeWidth="2" -> strokeWidth={strokeWidth}
  // (only when strokeWidth is a plain number)
  out = out.replace(/strokeWidth=\"(\d+(?:\.\d+)?)\"/g, "strokeWidth={strokeWidth}");

  // Some SVGs include width/height; those belong on the outer <svg>, so strip if present.
  out = out.replace(/\swidth=\"[^\"]*\"/gi, "");
  out = out.replace(/\sheight=\"[^\"]*\"/gi, "");
  out = out.trim();

  // If multiple root nodes, wrap in fragment
  const looksLikeSingleRoot = /^<\w[\s\S]*>\s*<\/\w+>\s*$/.test(out) || /^<\w[^>]*\/>\s*$/.test(out);
  if (!looksLikeSingleRoot) {
    out = `<>\n${out}\n</>`;
  }

  // Indent nicely (very lightweight)
  out = out
    .split("\n")
    .map((l) => (l.trim().length ? `\t${l}` : l))
    .join("\n");

  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const name = args.name;
  const key = args.key;
  const file = args.file;
  const svgArg = args.svg;
  const svgBase64 = args.svgBase64;

  if (!name || !key) {
    console.error("Missing required args: --name and --key");
    console.error("Example: node scripts/svg-to-custom-icon.js --name CustomMyIcon --key MyIcon --svg \"<svg ...>...</svg>\"");
    process.exit(1);
  }

  let svgRaw = "";

  if (typeof svgArg === "string" && svgArg.trim()) {
    svgRaw = svgArg.trim();
  } else if (typeof svgBase64 === "string" && svgBase64.trim()) {
    try {
      svgRaw = Buffer.from(svgBase64.trim(), "base64").toString("utf8").trim();
    } catch {
      console.error("Invalid --svgBase64 value (expected base64 UTF-8). ");
      process.exit(1);
    }
  } else if (file) {
    svgRaw = fs.readFileSync(file, "utf8");
  } else {
    svgRaw = (await readStdin()).trim();
  }

  if (!svgRaw) {
    console.error("No SVG input provided (use --svg, --svgBase64, --file, or pipe via stdin). ");
    process.exit(1);
  }

  const { viewBox, inner } = extractSvgParts(svgRaw);
  const jsxInner = toJsx(inner);

  const component = `export const ${name} = createIcon(({ color, strokeWidth }) => (\n${jsxInner}\n), { viewBox: \"${viewBox}\" });`;
  const registry = `${key}: ${name},`;

  process.stdout.write("\n// --- Component ---\n" + component + "\n\n// --- CustomIcons entry ---\n" + registry + "\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
