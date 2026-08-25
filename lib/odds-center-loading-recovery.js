const RELOAD_GUARD_KEY = "sbi:odds-center-loading-reload";

export function claimOddsCenterLoadingReload(storage) {
  if (storage.getItem(RELOAD_GUARD_KEY) === "1") return false;
  storage.setItem(RELOAD_GUARD_KEY, "1");
  return true;
}

export function clearOddsCenterLoadingReload(storage) {
  storage.removeItem(RELOAD_GUARD_KEY);
}
