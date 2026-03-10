#!/bin/bash
# ═══════════════════════════════════════════════════════
#  KODA Guard Setup — Instala el pre-push hook localmente
#  Ejecutar UNA SOLA VEZ en cada máquina: bash setup-guard.sh
# ═══════════════════════════════════════════════════════

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║       KODA Guard — Setup Inicial             ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"
echo ""

# ── Verificar que estamos en el repo ──────────────────
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo -e "${RED}❌  No estás dentro de un repositorio Git. Navega al repo de KODA primero.${RESET}"
  exit 1
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
HOOKS_DIR="$REPO_ROOT/.git/hooks"
HOOK_FILE="$HOOKS_DIR/pre-push"

# ── Verificar Node.js ──────────────────────────────────
if ! command -v node &> /dev/null; then
  echo -e "${RED}❌  Node.js no encontrado. Instálalo desde https://nodejs.org${RESET}"
  exit 1
fi

NODE_VERSION=$(node --version)
echo -e "  Node.js : ${CYAN}$NODE_VERSION${RESET} ✓"

# ── Verificar KODA_OWNERSHIP.json ─────────────────────
if [ ! -f "$REPO_ROOT/KODA_OWNERSHIP.json" ]; then
  echo -e "${RED}❌  KODA_OWNERSHIP.json no encontrado en la raíz del repo.${RESET}"
  echo -e "${YELLOW}    Copia KODA_OWNERSHIP.json al root del repositorio primero.${RESET}"
  exit 1
fi

echo -e "  Ownership: ${CYAN}KODA_OWNERSHIP.json${RESET} ✓"

# ── Verificar koda-validate.js ────────────────────────
if [ ! -f "$REPO_ROOT/scripts/koda-validate.js" ]; then
  echo -e "${RED}❌  scripts/koda-validate.js no encontrado.${RESET}"
  exit 1
fi

echo -e "  Validator: ${CYAN}scripts/koda-validate.js${RESET} ✓"
echo ""

# ── Instalar pre-push hook ────────────────────────────
if [ -f "$HOOK_FILE" ]; then
  echo -e "${YELLOW}  ⚠ Ya existe un pre-push hook. ¿Sobreescribir? [s/N]${RESET}"
  read -r answer
  if [ "$answer" != "s" ] && [ "$answer" != "si" ]; then
    echo -e "${YELLOW}  Instalación cancelada.${RESET}"
    exit 0
  fi
fi

cat > "$HOOK_FILE" << 'HOOK_CONTENT'
#!/bin/bash
# KODA Guard — Pre-push hook
# Instalado por setup-guard.sh

REPO_ROOT=$(git rev-parse --show-toplevel)
VALIDATOR="$REPO_ROOT/scripts/koda-validate.js"

if [ ! -f "$VALIDATOR" ]; then
  echo "⚠  koda-validate.js no encontrado. Saltando validación."
  exit 0
fi

if ! command -v node &> /dev/null; then
  echo "⚠  Node.js no encontrado. Saltando validación."
  exit 0
fi

node "$VALIDATOR"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  PUSH CANCELADO por KODA Conflict Guard"
  echo "  Para forzar el push (bajo tu responsabilidad):"
  echo "  git push --no-verify"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi

exit 0
HOOK_CONTENT

chmod +x "$HOOK_FILE"

echo -e "${GREEN}  ✓ Pre-push hook instalado en: $HOOK_FILE${RESET}"
echo ""
echo -e "${BOLD}─── Instalación completada ────────────────────────${RESET}"
echo -e "  ${GREEN}✓${RESET} Cada vez que hagas 'git push', se validará automáticamente."
echo -e "  ${CYAN}→${RESET} Para probar: node scripts/koda-validate.js"
echo -e "  ${CYAN}→${RESET} Para resolver conflictos: node scripts/koda-resolve.js"
echo -e "  ${YELLOW}→${RESET} Para forzar push sin validar: git push --no-verify"
echo ""
echo -e "${YELLOW}  ⚠  Comparte este mismo proceso de setup con tu colega.${RESET}"
echo -e "${YELLOW}     El GitHub Action protege el servidor de todas formas.${RESET}"
echo ""
