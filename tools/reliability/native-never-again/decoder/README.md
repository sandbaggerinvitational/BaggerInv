# Retained Build10 decoder compatibility

Run `node tools/reliability/native-never-again/decoder/run.mjs` after the recovery integration suite generates a passing `docs/reliability/phase2c/evidence/recovery-proof.json`.

The runner verifies vendored source hashes, copies the minimum model dependency closure to an owned temporary directory, compiles it with local Swift, and decodes actual candidate mobile score responses. It runs the unchanged `MobileScoringHoleResponse.isContractCompatible(for:)` against Best Ball, Scramble and Singles accepted/replayed acknowledgements, plus wrong mutation/gross and missing-field negatives. It makes no network requests and removes its temporary compilation directory.

The 12 vendor files are byte-exact retained native sources. The preserved 2026 promo provenance report identified Build10 `e7652b9b65595861f4f7cdf0b8326491581a27b8`, compared 495 tracked iOS files and recorded only two DEBUG fixture differences. Models were unchanged. Independent preserved recovery-audit copies match the key model hashes. The pinned Git object is unavailable now: Build10 lineage is STRONGLY SUPPORTED by that retained report, not newly PROVEN by Git verification. Current source hashes and executed model behavior are directly recorded.

Proof layer: native model integration on macOS. This is not the full MobileAPIClient/session/HTTP stack, simulator, physical iPhone, native queue reconciliation, deployment or Tournament Ready proof. Build10 does not automatically adopt the additive recovery endpoint. No shipping native files are changed.
