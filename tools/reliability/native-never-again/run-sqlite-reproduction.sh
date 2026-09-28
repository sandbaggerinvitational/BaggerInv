#!/bin/sh
set -eu

MODE=${1:-defect}
CANDIDATE_ROOT=${2:-${BAGGER_NATIVE_CANDIDATE_ROOT:-}}
case "$MODE" in
  defect) REOPEN_COMMAND=reopen-defect ;;
  fixed) REOPEN_COMMAND=verify-fixed ;;
  *) echo "usage: run-sqlite-reproduction.sh defect | fixed NATIVE_ROOT" >&2; exit 2 ;;
esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
COMMITTED_PACKAGE="$SCRIPT_DIR/sqlite"
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/bagger-native-sqlite.XXXXXX")
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT HUP INT TERM

SWIFT_CACHE="$WORK_DIR/swift-cache"
SWIFT_CONFIG="$WORK_DIR/swift-config"
SWIFT_SECURITY="$WORK_DIR/swift-security"
SWIFT_MODULE_CACHE="$WORK_DIR/swift-module-cache"
mkdir -p "$SWIFT_CACHE" "$SWIFT_CONFIG" "$SWIFT_SECURITY" "$SWIFT_MODULE_CACHE"
export CLANG_MODULE_CACHE_PATH="$SWIFT_MODULE_CACHE"
export SWIFTPM_MODULECACHE_OVERRIDE="$SWIFT_MODULE_CACHE"

PACKAGE_DIR=$COMMITTED_PACKAGE
if [ "$MODE" = fixed ]; then
  [ -n "$CANDIDATE_ROOT" ] || {
    echo "fixed mode requires a candidate native Git checkout" >&2
    exit 2
  }
  [ -d "$CANDIDATE_ROOT/.git" ] || [ -f "$CANDIDATE_ROOT/.git" ] || {
    echo "candidate native root is not a Git checkout" >&2
    exit 2
  }
  git -C "$CANDIDATE_ROOT" diff --quiet -- ios
  git -C "$CANDIDATE_ROOT" diff --cached --quiet -- ios
  PACKAGE_DIR="$WORK_DIR/candidate-package"
  ditto "$COMMITTED_PACKAGE" "$PACKAGE_DIR"
  cp "$CANDIDATE_ROOT/ios/BaggerInv/ScoringQueue/ScoringQueueModels.swift" \
    "$PACKAGE_DIR/Sources/Build10SQLiteHarness/Vendor/ScoringQueueModels.swift"
  cp "$CANDIDATE_ROOT/ios/BaggerInv/ScoringQueue/ScoringQueuePolicies.swift" \
    "$PACKAGE_DIR/Sources/Build10SQLiteHarness/Vendor/ScoringQueuePolicies.swift"
  cp "$CANDIDATE_ROOT/ios/BaggerInv/ScoringQueue/SQLiteScoringQueueRepository.swift" \
    "$PACKAGE_DIR/Sources/Build10SQLiteHarness/Vendor/SQLiteScoringQueueRepository.swift"
  printf '%s\n' "native-sqlite-candidate sha=$(git -C "$CANDIDATE_ROOT" rev-parse HEAD)" >&2
fi

swift build \
  --disable-sandbox \
  --package-path "$PACKAGE_DIR" \
  --scratch-path "$WORK_DIR/build" \
  --cache-path "$SWIFT_CACHE" \
  --config-path "$SWIFT_CONFIG" \
  --security-path "$SWIFT_SECURITY" \
  >/dev/null
BIN_DIR=$(swift build \
  --disable-sandbox \
  --package-path "$PACKAGE_DIR" \
  --scratch-path "$WORK_DIR/build" \
  --cache-path "$SWIFT_CACHE" \
  --config-path "$SWIFT_CONFIG" \
  --security-path "$SWIFT_SECURITY" \
  --show-bin-path)
HARNESS="$BIN_DIR/build10-sqlite-harness"
DATABASE="$WORK_DIR/queue.sqlite3"
STATE="$WORK_DIR/witness.json"

"$HARNESS" prepare "$DATABASE" "$STATE"
"$HARNESS" "$REOPEN_COMMAND" "$DATABASE" "$STATE"
