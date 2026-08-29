import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function assertCacheRestoredAfterMount(component, cacheReader) {
  const componentStart = component.indexOf("export default function");
  const effectStart = component.indexOf("useEffect(() => {", componentStart);
  const cacheRead = component.indexOf(`${cacheReader}()`, componentStart);

  assert.ok(componentStart >= 0, "client component entry point is present");
  assert.ok(effectStart > componentStart, "mount effect is present");
  assert.ok(cacheRead > effectStart, `${cacheReader} runs only after hydration begins`);
  assert.doesNotMatch(component, new RegExp(`useMemo\\(\\(\\) => ${cacheReader}\\(\\)`));
}

test("Participant Home keeps its server and first client render cache-independent", async () => {
  const component = await source("app/ParticipantSupabaseHome.js");

  assert.match(component, /const \[payload, setPayload\] = useState\(null\);/);
  assert.match(component, /const \[state, setState\] = useState\("loading"\);/);
  assert.match(component, /const restoredCache = useRef\(false\);/);
  assertCacheRestoredAfterMount(component, "readParticipantHomeCache");
  assert.match(component, /restoredCache\.current = true;[\s\S]*setPayload\(cached\);[\s\S]*setState\("ready"\);/);
  assert.match(component, /cachedPresentation: restoredCache\.current/);
  assert.equal((component.match(/\/api\/participant\/home/g) || []).length, 2,
    "normal refresh plus the existing recoverable impersonation retry remain intact");
});

test("Tournament keeps its server and first client render cache-independent", async () => {
  const component = await source("app/live/TournamentSupabaseRead.js");

  assert.match(component, /const \[payload, setPayload\] = useState\(null\);/);
  assert.match(component, /const \[state, setState\] = useState\("loading"\);/);
  assert.match(component, /const restoredCache = useRef\(false\);/);
  assertCacheRestoredAfterMount(component, "readTournamentLiveCache");
  assert.match(component, /restoredCache\.current = true;[\s\S]*acceptData\(cached\);/);
  assert.match(component, /cachedPresentation: restoredCache\.current/);
  assert.equal((component.match(/\/api\/tournament\/live/g) || []).length, 3,
    "the canonical Tournament endpoint remains the initial fetch and both presentation refresh sources");
});
