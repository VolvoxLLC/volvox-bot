#!/usr/bin/env bash
set -euo pipefail

# Simple dev watchdog:
# - polls http://localhost:${PORT}/api/health
# - if unhealthy for N consecutive checks, runs `pnpm dev:clean`
#
# Intended for macOS launchd or manual terminal use.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3001}"
INTERVAL_SECONDS="${WATCHDOG_INTERVAL_SECONDS:-30}"
FAIL_THRESHOLD="${WATCHDOG_FAIL_THRESHOLD:-3}"

# launchd sessions often have a minimal PATH; resolve pnpm explicitly.
PNPM_BIN="$(command -v pnpm || true)"
if [[ -z "${PNPM_BIN}" && -x "/opt/homebrew/bin/pnpm" ]]; then
  PNPM_BIN="/opt/homebrew/bin/pnpm"
fi
if [[ -z "${PNPM_BIN}" ]]; then
  echo "[dev-watchdog] ERROR: pnpm not found in PATH and /opt/homebrew/bin/pnpm missing" >&2
  exit 1
fi

URL="http://localhost:${PORT}/api/health"

fails=0
LOCK_FILE="${WATCHDOG_LOCK_FILE:-/tmp/veritas-kanban-dev-clean.lock}"

echo "[dev-watchdog] repo=${REPO_ROOT}"
echo "[dev-watchdog] url=${URL} interval=${INTERVAL_SECONDS}s threshold=${FAIL_THRESHOLD}"

while true; do
  http_code="$(curl -s -o /dev/null -w '%{http_code}' "${URL}" || true)"

  if [[ "${http_code}" == "200" ]]; then
    fails=0
  else
    fails=$((fails+1))
    echo "[dev-watchdog] health check failed (http=${http_code}) fails=${fails}/${FAIL_THRESHOLD}"
  fi

  if [[ "${fails}" -ge "${FAIL_THRESHOLD}" ]]; then
    echo "[dev-watchdog] unhealthy threshold reached -> restarting via scripts/dev-clean.sh"
    # Prevent restart storms (e.g., if health endpoint is down for an extended period)
    if [[ -f "${LOCK_FILE}" ]]; then
      lock_pid="$(cat "${LOCK_FILE}" 2>/dev/null || true)"
      if [[ -n "${lock_pid}" ]] && kill -0 "${lock_pid}" 2>/dev/null; then
        echo "[dev-watchdog] restart already in progress (pid=${lock_pid}); waiting"
        fails=0
        sleep "${INTERVAL_SECONDS}"
        continue
      fi
    fi

    cd "${REPO_ROOT}"
    # Run dev-clean in background so the watchdog can keep monitoring.
    (bash "${REPO_ROOT}/scripts/dev-clean.sh") &
    echo $! > "${LOCK_FILE}"
    fails=0
  fi

  sleep "${INTERVAL_SECONDS}"
done
