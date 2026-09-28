#!/bin/sh
set -eu

PINNED_BUILD10_SHA=e7652b9b65595861f4f7cdf0b8326491581a27b8
NATIVE_ROOT=${BAGGER_NATIVE_BUILD10_ROOT:-}
DESTINATION=${BAGGER_NATIVE_SIMULATOR_DESTINATION:-platform=iOS Simulator,name=iPhone 17 Pro Max,OS=latest}
PACKAGE_CACHE=${BAGGER_NATIVE_PACKAGE_CACHE:-}

usage() {
  cat >&2 <<'USAGE'
usage: run-canonical-reconciliation-harness.sh --native-root PATH
       [--destination XCODE_DESTINATION] [--package-cache SOURCE_PACKAGES]

Runs the exact Build 10 coordinator and SQLite repository in two simulator test
processes. It requires the pinned Build 10 checkout and performs no network call.
USAGE
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --native-root) [ "$#" -ge 2 ] || usage; NATIVE_ROOT=$2; shift 2 ;;
    --destination) [ "$#" -ge 2 ] || usage; DESTINATION=$2; shift 2 ;;
    --package-cache) [ "$#" -ge 2 ] || usage; PACKAGE_CACHE=$2; shift 2 ;;
    *) usage ;;
  esac
done

[ -n "$NATIVE_ROOT" ] || usage
[ -d "$NATIVE_ROOT/.git" ] || [ -f "$NATIVE_ROOT/.git" ] || {
  echo "native root is not a Git checkout" >&2
  exit 2
}
[ -d "$NATIVE_ROOT/ios/BaggerInv.xcodeproj" ] || {
  echo "native root has no ios/BaggerInv.xcodeproj" >&2
  exit 2
}

HEAD_SHA=$(git -C "$NATIVE_ROOT" rev-parse HEAD)
[ "$HEAD_SHA" = "$PINNED_BUILD10_SHA" ] || {
  echo "canonical reconciliation requires $PINNED_BUILD10_SHA, found $HEAD_SHA" >&2
  exit 3
}
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

verify_hash ios/BaggerInv/ScoringQueue/ScoringQueueCoordinator.swift eaa5a17169498a656fbb9f86d2447ae93fc1eb0cccecedbb3b826978d25fc432
verify_hash ios/BaggerInv/ScoringQueue/SQLiteScoringQueueRepository.swift ce9117ba687b441bb1f0e7a0d0c9940c0cfd78ec1f1518d70515c1c6842b8fd8
verify_hash ios/BaggerInv/ScoringQueue/ScoringQueueModels.swift aceb119cce34db8ab87f62b37b2cd21456b81e567a73a95c4cab2b079f190a04
verify_hash ios/BaggerInv/ScoringQueue/ScoringQueuePolicies.swift 55be73c366f286fa5b7b4fb165c3b4dc75ed51dc46aec8854ff165e78c067ae9
verify_hash ios/BaggerInvTests/ScoringQueueCoordinatorTestSupport.swift 1908eadc36b20d8512f167e96a574648a559efe0ae713ffb1a1ea51e7c9860d7

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/bagger-na006-canonical-work.XXXXXX")
STATE_DIR=$(mktemp -d "/private/tmp/bagger-na006-canonical-state.XXXXXX")
cleanup() {
  rm -rf "$WORK_DIR" "$STATE_DIR"
}
trap cleanup EXIT HUP INT TERM

ditto "$NATIVE_ROOT/ios" "$WORK_DIR/ios"
sed "s|__NA006_STATE_ROOT__|$STATE_DIR|g" \
  "$SCRIPT_DIR/canonical/Build10CanonicalAcknowledgementRecoveryTests.swift" \
  > "$WORK_DIR/ios/BaggerInvTests/Build10CanonicalAcknowledgementRecoveryTests.swift"

run_test() {
  method=$1
  bundle=$2
  set -- xcodebuild test \
    -project "$WORK_DIR/ios/BaggerInv.xcodeproj" \
    -scheme BaggerInv \
    -destination "$DESTINATION" \
    -derivedDataPath "$WORK_DIR/DerivedData" \
    -resultBundlePath "$WORK_DIR/$bundle.xcresult" \
    -disableAutomaticPackageResolution \
    "-only-testing:BaggerInvTests/Build10CanonicalAcknowledgementRecoveryTests/$method" \
    CODE_SIGNING_ALLOWED=NO
  if [ -n "$PACKAGE_CACHE" ]; then
    set -- "$@" -clonedSourcePackagesDirPath "$PACKAGE_CACHE"
  fi
  "$@"
}

printf '%s\n' "native-canonical-reconciliation sha=$HEAD_SHA destination=$DESTINATION"
run_test testPreparePersistedAcceptedAcknowledgement prepare
run_test testRecoverPersistedAcknowledgementFromMatchingOfficialReadback recover
