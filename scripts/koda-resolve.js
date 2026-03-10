#!/usr/bin/env node
/**
 * KODA Conflict Resolver — Resolución automática de merge conflicts
 * Uso: node scripts/koda-resolve.js [archivo] [--auto] [--dry-run]
 *
 * --auto     : Resuelve automáticamente según ownership (sin preguntar)
 * --dry-run  : Muestra qué haría pero no modifica archivos
 * [archivo]  : Resolver un archivo específico. Sin argumento, busca todos los conflictos.
 */

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = findRepoRoot();
const OWNERSHIP_FILE = path.join(ROOT, "KODA_OWNERSHIP.json");
const config = JSON.parse(fs.readFileSync(OWNERSHIP_FILE, "utf8"));
const rules  = config.rules;
const owners = config._meta.owners;

const C = {
  red: "\x1b[31m", yellow: "\x1b[33m", green: "\x1b[32m",
  cyan: "\x1b[36m", magenta: "\x1b[35m", white: "\x1b[37m",
  bold: "\x1b[1m", dim: "\x1b[2m", reset: "\x1b[0m",
};

const args    = process.argv.slice(2);
const AUTO    = args.includes("--auto");
const DRY_RUN = args.includes("--dry-run");
const targetFile = args.find(a => !a.startsWith("--"));

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n${C.bold}╔══════════════════════════════════════════════╗${C.reset}`);
console.log(`${C.bold}║       KODA Conflict Resolver                 ║${C.reset}`);
console.log(`${C.bold}╚══════════════════════════════════════════════╝${C.reset}\n`);

if (DRY_RUN) console.log(`${C.yellow}  [DRY RUN] — No se modificará ningún archivo\n${C.reset}`);

const conflictedFiles = targetFile
  ? [targetFile]
  : getConflictedFiles();

if (conflictedFiles.length === 0) {
  console.log(`${C.green}  ✓ No hay archivos con conflictos de merge activos.${C.reset}\n`);
  process.exit(0);
}

console.log(`  Archivos con conflictos: ${C.red}${conflictedFiles.length}${C.reset}\n`);

let resolved = 0, skipped = 0, manual = 0;

for (const file of conflictedFiles) {
  console.log(`${C.bold}  ── ${file} ──${C.reset}`);
  const absPath = path.join(ROOT, file);

  if (!fs.existsSync(absPath)) {
    console.log(`  ${C.red}  Archivo no encontrado: ${absPath}${C.reset}`);
    skipped++; continue;
  }

  const content  = fs.readFileSync(absPath, "utf8");
  const sections = parseConflicts(content);

  if (sections.conflicts.length === 0) {
    console.log(`  ${C.green}  ✓ Sin marcadores de conflicto activos${C.reset}\n`);
    skipped++; continue;
  }

  const rule  = matchRule(file);
  const owner = rule?.owner ?? "unknown";
  const ownerMeta = owners[owner];

  console.log(`  Propietario : ${C.cyan}${ownerMeta?.name ?? owner}${C.reset} (${ownerMeta?.tool ?? "?"})`);
  console.log(`  Conflictos  : ${C.red}${sections.conflicts.length}${C.reset} sección(es)\n`);

  // Show each conflict
  for (let i = 0; i < sections.conflicts.length; i++) {
    const conflict = sections.conflicts[i];
    console.log(`  ${C.yellow}Conflicto #${i + 1}${C.reset}`);
    console.log(`  ${C.dim}OURS   (${conflict.ourBranch}):${C.reset}`);
    conflict.ours.slice(0, 5).forEach(l => console.log(`    ${C.green}+ ${l}${C.reset}`));
    if (conflict.ours.length > 5) console.log(`    ${C.dim}... (${conflict.ours.length - 5} líneas más)${C.reset}`);
    console.log(`  ${C.dim}THEIRS (${conflict.theirBranch}):${C.reset}`);
    conflict.theirs.slice(0, 5).forEach(l => console.log(`    ${C.red}- ${l}${C.reset}`));
    if (conflict.theirs.length > 5) console.log(`    ${C.dim}... (${conflict.theirs.length - 5} líneas más)${C.reset}`);
    console.log();
  }

  // Determine resolution strategy
  let strategy = null;
  if (owner === "jose") {
    strategy = { keep: "ours", reason: `Archivo de José Juan → mantenemos nuestra versión` };
  } else if (owner === "colega") {
    strategy = { keep: "theirs", reason: `Archivo del Colega → aceptamos su versión` };
  } else if (owner === "shared") {
    strategy = null; // needs manual
  }

  if (!strategy) {
    console.log(`  ${C.yellow}  ⚠ Archivo compartido o sin dueño — requiere resolución manual.${C.reset}`);
    console.log(`  ${C.dim}  Sugerencia: Abre el archivo, revisa ambas versiones y elige qué conservar.${C.reset}\n`);
    manual++; continue;
  }

  console.log(`  ${C.cyan}  Estrategia: ${strategy.reason}${C.reset}`);

  if (AUTO || promptYesNo(`  ¿Aplicar resolución automática? [s/N] `)) {
    const resolved_content = applyResolution(content, sections.conflicts, strategy.keep);
    if (!DRY_RUN) {
      fs.writeFileSync(absPath, resolved_content, "utf8");
      // Stage the file
      try {
        execSync(`git add "${file}"`, { cwd: ROOT });
        console.log(`  ${C.green}  ✓ Resuelto y staged: ${file}${C.reset}\n`);
      } catch {
        console.log(`  ${C.green}  ✓ Resuelto (no se pudo hacer git add automáticamente)${C.reset}\n`);
      }
    } else {
      console.log(`  ${C.yellow}  [DRY RUN] Hubiera aplicado: keep-${strategy.keep}${C.reset}\n`);
    }
    resolved++;
  } else {
    console.log(`  ${C.yellow}  Omitido. Resuelve manualmente y ejecuta: git add ${file}${C.reset}\n`);
    skipped++;
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`${C.bold}─── Resumen de resolución ──────────────────────${C.reset}`);
console.log(`  ${C.green}✓ Resueltos automáticamente : ${resolved}${C.reset}`);
console.log(`  ${C.yellow}⚠ Requieren revisión manual : ${manual}${C.reset}`);
console.log(`  ${C.dim}  Omitidos                  : ${skipped}${C.reset}`);

if (manual > 0) {
  console.log(`\n${C.yellow}  Archivos manuales: edita los marcadores <<<<< ===== >>>>> y luego:${C.reset}`);
  console.log(`  ${C.cyan}  git add <archivo> && git commit${C.reset}\n`);
}

if (resolved > 0 && manual === 0) {
  console.log(`\n${C.green}${C.bold}  ✓ Todos los conflictos resueltos. Ejecuta: git commit${C.reset}\n`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseConflicts(content) {
  const lines    = content.split("\n");
  const conflicts = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].startsWith("<<<<<<<")) {
      const ourBranch = lines[i].replace("<<<<<<<", "").trim();
      const ours = [], theirs = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("=======")) { ours.push(lines[i]); i++; }
      i++; // skip =======
      const theirBranch = lines[i]?.startsWith(">>>>>>>") ? lines[i].replace(">>>>>>>", "").trim() : "";
      while (i < lines.length && !lines[i].startsWith(">>>>>>>")) { theirs.push(lines[i]); i++; }
      conflicts.push({ ourBranch, theirBranch, ours, theirs, lineStart: i });
      i++;
    } else {
      i++;
    }
  }
  return { conflicts };
}

function applyResolution(content, conflicts, keep) {
  let result = content;
  // Process in reverse to preserve line positions
  const pattern = /<<<<<<<[^\n]*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>>[^\n]*/g;
  result = result.replace(pattern, (match, ours, theirs) => {
    return keep === "ours"
      ? ours.replace(/\n$/, "")
      : theirs.replace(/\n$/, "");
  });
  return result;
}

function getConflictedFiles() {
  try {
    const output = execSync("git diff --name-only --diff-filter=U", {
      cwd: ROOT, encoding: "utf8"
    }).trim();
    return output ? output.split("\n").filter(Boolean) : [];
  } catch { return []; }
}

function matchRule(filePath) {
  const sorted = [...rules].sort((a, b) => b.path.length - a.path.length);
  for (const rule of sorted) {
    if (filePath.startsWith(rule.path)) return rule;
  }
  return null;
}

function promptYesNo(question) {
  if (AUTO) return true;
  // In non-TTY env (CI), default to false
  if (!process.stdin.isTTY) return false;
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.toLowerCase() === "s" || answer.toLowerCase() === "si");
    });
  });
}

function findRepoRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch { return process.cwd(); }
}
