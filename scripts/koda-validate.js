#!/usr/bin/env node
/**
 * KODA Conflict Guard — Validador de propiedad de archivos
 * Uso: node koda-validate.js [--json] [--branch <nombre>] [files...]
 *
 * Si no se pasan archivos, usa `git diff --name-only HEAD` automáticamente.
 */

const fs   = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ─── Config ──────────────────────────────────────────────────────────────────

const ROOT = findRepoRoot();
const OWNERSHIP_FILE = path.join(ROOT, "KODA_OWNERSHIP.json");

if (!fs.existsSync(OWNERSHIP_FILE)) {
  console.error("❌  KODA_OWNERSHIP.json no encontrado en la raíz del repo.");
  process.exit(1);
}

const config   = JSON.parse(fs.readFileSync(OWNERSHIP_FILE, "utf8"));
const rules    = config.rules;
const owners   = config._meta.owners;
const policies = {
  shared:    config.shared_policy    || "warn",
  unknown:   config.unknown_policy   || "block",
  violation: config.violation_policy || "block",
};

// ─── Args ─────────────────────────────────────────────────────────────────────

const args       = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const branchIdx  = args.indexOf("--branch");
const currentBranch = branchIdx !== -1
  ? args[branchIdx + 1]
  : getCurrentBranch();

const fileArgs = args.filter(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--branch");
const files    = fileArgs.length > 0 ? fileArgs : getChangedFiles();

// ─── Detect who "I am" based on branch ────────────────────────────────────────

function detectSelf(branch) {
  for (const [key, meta] of Object.entries(owners)) {
    if (branch && branch.includes(key)) return key;
    if (branch && branch.includes(meta.branch)) return key;
  }
  return null;
}

const self = detectSelf(currentBranch);

// ─── Core matching logic ───────────────────────────────────────────────────────

function matchRule(filePath) {
  const sorted = [...rules].sort((a, b) => b.path.length - a.path.length);
  for (const rule of sorted) {
    if (filePath.startsWith(rule.path)) return rule;
  }
  return null;
}

// ─── Analyze files ────────────────────────────────────────────────────────────

const results = files.map(file => {
  const rule  = matchRule(file);
  const owner = rule ? rule.owner : "unknown";
  let status  = "ok";
  let message = null;

  if (!rule || owner === "unknown") {
    status  = policies.unknown === "block" ? "block" : "warn";
    message = `Archivo sin propietario definido. Agrégalo a KODA_OWNERSHIP.json`;
  } else if (owner === "shared") {
    status  = policies.shared === "block" ? "block" : "warn";
    message = `Archivo compartido — coordinen antes de hacer merge`;
  } else if (self && owner !== self) {
    status  = policies.violation === "block" ? "block" : "warn";
    const ownerMeta = owners[owner];
    message = `Este archivo pertenece a ${ownerMeta?.name ?? owner} (${ownerMeta?.tool ?? owner}). No debes modificarlo desde tu rama.`;
  }

  return { file, rule, owner, status, message };
});

const blocks   = results.filter(r => r.status === "block");
const warnings = results.filter(r => r.status === "warn");
const clean    = results.filter(r => r.status === "ok");

// ─── Output ───────────────────────────────────────────────────────────────────

if (jsonOutput) {
  console.log(JSON.stringify({ currentBranch, self, results, blocks, warnings, clean }, null, 2));
  process.exit(blocks.length > 0 ? 1 : 0);
}

// Human-readable output
const C = {
  red:    "\x1b[31m",
  yellow: "\x1b[33m",
  green:  "\x1b[32m",
  cyan:   "\x1b[36m",
  white:  "\x1b[37m",
  bold:   "\x1b[1m",
  reset:  "\x1b[0m",
};

console.log(`\n${C.bold}╔══════════════════════════════════════════════╗${C.reset}`);
console.log(`${C.bold}║       KODA Conflict Guard — Pre-Push         ║${C.reset}`);
console.log(`${C.bold}╚══════════════════════════════════════════════╝${C.reset}`);
console.log(`  Rama detectada : ${C.cyan}${currentBranch}${C.reset}`);
console.log(`  Tú eres        : ${C.cyan}${self ? (owners[self]?.name ?? self) : "No identificado (revisa el nombre de tu rama)"}${C.reset}`);
console.log(`  Archivos       : ${files.length} modificados\n`);

if (results.length === 0) {
  console.log(`${C.green}  ✓ No hay archivos para validar.${C.reset}\n`);
  process.exit(0);
}

// Print each file
for (const r of results) {
  const icon  = r.status === "block" ? "🚫" : r.status === "warn" ? "⚠️ " : "✅";
  const color = r.status === "block" ? C.red : r.status === "warn" ? C.yellow : C.green;
  const label = r.rule?.label ?? "Sin asignar";
  console.log(`  ${icon} ${color}${r.file}${C.reset}`);
  if (r.message) console.log(`     └─ ${color}${r.message}${C.reset}`);
  if (r.status === "ok") console.log(`     └─ ${C.white}${label}${C.reset} — OK`);
}

// Summary
console.log(`\n${C.bold}─── Resumen ───────────────────────────────────${C.reset}`);
console.log(`  ${C.green}✅ Limpios  : ${clean.length}${C.reset}`);
console.log(`  ${C.yellow}⚠️  Alertas  : ${warnings.length}${C.reset}`);
console.log(`  ${C.red}🚫 Bloqueados: ${blocks.length}${C.reset}`);

if (blocks.length > 0) {
  console.log(`\n${C.red}${C.bold}  ✗ PUSH BLOQUEADO — Resuelve los conflictos antes de continuar.${C.reset}`);
  console.log(`${C.yellow}  → Ejecuta: node scripts/koda-resolve.js para ayuda de resolución.${C.reset}\n`);
  process.exit(1);
} else if (warnings.length > 0) {
  console.log(`\n${C.yellow}  ⚠ Push permitido con advertencias. Coordina con tu colega los archivos compartidos.${C.reset}\n`);
  process.exit(0);
} else {
  console.log(`\n${C.green}${C.bold}  ✓ Todo en orden. Push autorizado.${C.reset}\n`);
  process.exit(0);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch { return "unknown"; }
}

function getChangedFiles() {
  try {
    // Archivos staged (para pre-commit) o vs origin/main (para pre-push)
    const staged = execSync("git diff --name-only --cached", { cwd: ROOT, encoding: "utf8" }).trim();
    if (staged) return staged.split("\n").filter(Boolean);
    const pushed = execSync("git diff --name-only origin/main...HEAD 2>/dev/null || git diff --name-only HEAD~1 HEAD", {
      cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    return pushed.split("\n").filter(Boolean);
  } catch { return []; }
}

function findRepoRoot() {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch { return process.cwd(); }
}
