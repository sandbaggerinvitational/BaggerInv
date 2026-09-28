#!/bin/sh
set -eu

PINNED_BUILD10_SHA=e7652b9b65595861f4f7cdf0b8326491581a27b8
MODE=reproduce
NATIVE_ROOT=${BAGGER_NATIVE_ROOT:-}
DESTINATION=${BAGGER_NATIVE_SIMULATOR_DESTINATION:-platform=iOS Simulator,name=iPhone 17 Pro Max,OS=latest}
PACKAGE_CACHE=${BAGGER_NATIVE_PACKAGE_CACHE:-}

usage() {
  cat >&2 <<'USAGE'
usage: run-shell-harness.sh --native-root PATH [--mode reproduce|candidate]
                            [--destination XCODE_DESTINATION]
                            [--package-cache SOURCE_PACKAGES]

reproduce requires exact Build 10 e7652b9b65595861f4f7cdf0b8326491581a27b8.
candidate runs the corrected-behavior expected-red test against the supplied checkout.
USAGE
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --native-root) [ "$#" -ge 2 ] || usage; NATIVE_ROOT=$2; shift 2 ;;
    --mode) [ "$#" -ge 2 ] || usage; MODE=$2; shift 2 ;;
    --destination) [ "$#" -ge 2 ] || usage; DESTINATION=$2; shift 2 ;;
    --package-cache) [ "$#" -ge 2 ] || usage; PACKAGE_CACHE=$2; shift 2 ;;
    *) usage ;;
  esac
done

[ -n "$NATIVE_ROOT" ] || usage
[ -d "$NATIVE_ROOT/.git" ] || [ -f "$NATIVE_ROOT/.git" ] || { echo "native root is not a Git checkout" >&2; exit 2; }
[ -d "$NATIVE_ROOT/ios/BaggerInv.xcodeproj" ] || { echo "native root has no ios/BaggerInv.xcodeproj" >&2; exit 2; }
[ "$MODE" = reproduce ] || [ "$MODE" = candidate ] || usage

HEAD_SHA=$(git -C "$NATIVE_ROOT" rev-parse HEAD)
git -C "$NATIVE_ROOT" diff --quiet -- ios
git -C "$NATIVE_ROOT" diff --cached --quiet -- ios

hash_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}
verify_hash() {
  relative=$1
  expected=$2
  actual=$(hash_file "$NATIVE_ROOT/$relative")
  if [ "$actual" != "$expected" ]; then
    echo "pinned source hash mismatch for $relative: $actual" >&2
    exit 3
  fi
}

if [ "$MODE" = reproduce ]; then
  [ "$HEAD_SHA" = "$PINNED_BUILD10_SHA" ] || {
    echo "reproduction requires $PINNED_BUILD10_SHA, found $HEAD_SHA" >&2
    exit 3
  }
  verify_hash ios/BaggerInv/Views/RootView.swift 4d7b65aa7cd1abe79bd3d2bdd2e507d59e42064061d36afbaf3732b0b357c8ac
  verify_hash ios/BaggerInv/Views/AppTabShell.swift aeee686da80ab3a9db2c17a1515005003c0c8140d372f7a53eae979c0b1c4d9c
  verify_hash ios/BaggerInv/Data/MobileReadRepository.swift 8b30af93582bc5dd01eb5ae8f273574a032418e53a6021a2dbe0f25e953ce661
  verify_hash ios/BaggerInv/Data/TournamentDataCoordinator.swift dcc2dc8be5aa42decd38e8d2e801d4f88afbcd2d5e871fafef2853de72e5cadf
  verify_hash ios/BaggerInv/App/AppCoordinator.swift a8cb5bef93c4eaaf6d222418ce3b7ad465abca5bcce7f60a12f4f994d823ce0d
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/bagger-native-shell.XXXXXX")
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT HUP INT TERM

ditto "$NATIVE_ROOT/ios" "$WORK_DIR/ios"
if [ "$MODE" = reproduce ]; then
  FIXTURE="$SCRIPT_DIR/shell/Build10ShellDefectReproductionTests.swift"
  TEST_ID=BaggerInvTests/TodayFallbackAuditTests/testActualShippingRootRecreation
else
  FIXTURE="$SCRIPT_DIR/shell/NativeShellPreservationExpectedRedTests.swift"
  TEST_ID=BaggerInvTests/NativeShellPreservationExpectedRedTests/testFeatureFailurePreservesCurrentShellAndSelectedDestination
fi
cp "$FIXTURE" "$WORK_DIR/ios/BaggerInvTests/"

set -- xcodebuild test \
  -project "$WORK_DIR/ios/BaggerInv.xcodeproj" \
  -scheme BaggerInv \
  -destination "$DESTINATION" \
  -derivedDataPath "$WORK_DIR/DerivedData" \
  -resultBundlePath "$WORK_DIR/results.xcresult" \
  -disableAutomaticPackageResolution \
  "-only-testing:$TEST_ID" \
  CODE_SIGNING_ALLOWED=NO

if [ -n "$PACKAGE_CACHE" ]; then
  set -- "$@" -clonedSourcePackagesDirPath "$PACKAGE_CACHE"
fi

printf '%s\n' "native-shell-harness mode=$MODE sha=$HEAD_SHA destination=$DESTINATION"
"$@"
