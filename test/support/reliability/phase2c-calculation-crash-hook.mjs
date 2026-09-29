// Child-only fault instrumentation. No application file or calculator result is replaced.
// The original module hash and one exact anchor must match before inserting a
// synchronous barrier after an actual validation/calculation step. No sockets.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
const hash = value => createHash('sha256').update(value).digest('hex');
const definitions = [
  {
    "family": "CALCUTTA",
    "file": "lib/production-full-net.js",
    "functionName": "calculateProductionFullNetCalcutta",
    "expectedSha256": "fb854e2036d1082e12a885397f8648c74ab0e31a7126f05b31302b75c629780b",
    "anchor": "  const projection=fullNetAuthority(coreView),core=coreView.tournament?.id?coreView:leaderboardsCoreDataFromSupabaseView(coreView);"
  },
  {
    "family": "COMPETITION",
    "file": "lib/competition-derived-supabase.js",
    "functionName": "calculateCompetitionDerivedFromData",
    "expectedSha256": "7609a613f538e2252314b383305469317803ff23f384fe298ea24e53d40bb241",
    "anchor": "  const momentum = requested.has(\"TEAM_MOMENTUM\") ? getTeamMomentum(data.rounds || []) : null;"
  },
  {
    "family": "INTELLIGENCE",
    "file": "lib/intelligence-derived-supabase.js",
    "functionName": "calculateIntelligenceDerivedFromData",
    "expectedSha256": "aa3d5b53012176ad3ed8ce681758a97770a68e1c18dd38a5cd210f22c636e5e9",
    "anchor": "  const intelligence = tournamentIntelligenceStorylines({ snapshots, playerTeams });"
  }
];
const urls = new Map([
  [new URL('../../../lib/production-full-net.js', import.meta.url).href, definitions[0]],
  [new URL('../../../lib/competition-derived-supabase.js', import.meta.url).href, definitions[1]],
  [new URL('../../../lib/intelligence-derived-supabase.js', import.meta.url).href, definitions[2]],
]);
registerHooks({load(url, context, nextLoad) {
  const loaded = nextLoad(url, context); const definition = urls.get(url);
  if (!definition) return loaded;
  const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString('utf8');
  assert.equal(hash(source), definition.expectedSha256, 'fault target exact original source');
  assert.equal(source.split(definition.anchor).length, 2, 'fault target single exact anchor');
  const originalLine = source.slice(0, source.indexOf(definition.anchor)).split('\n').length;
  const metadata = {family:definition.family, sourceFile:definition.file, functionName:definition.functionName,
    originalSourceSha256:hash(source), anchorSha256:hash(definition.anchor), insertionAfterLine:originalLine};
  // Hash the instrumented bytes without embedding their own digest recursively.
  const statement = '\n  globalThis[Symbol.for("phase2c.calculationDeathBarrier")]?.('+JSON.stringify(metadata)+');';
  const instrumented = source.replace(definition.anchor, definition.anchor + statement);
  globalThis[Symbol.for('phase2c.calculationInstrumentedHashes')] ||= new Map();
  globalThis[Symbol.for('phase2c.calculationInstrumentedHashes')].set(definition.family, hash(instrumented));
  return {...loaded, source:instrumented};
}});
