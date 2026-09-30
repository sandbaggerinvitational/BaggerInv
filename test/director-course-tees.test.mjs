import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Mission Control exposes one active-year Course Tees bulk editor", async () => {
  const [consoleSource, editor] = await Promise.all([
    read("app/admin/director/DirectorOperationsConsole.js"),
    read("app/admin/director/DirectorOperationEditors.js"),
  ]);
  assert.match(consoleSource, /CourseTeesManagement/);
  assert.match(consoleSource, />Course Tees</);
  assert.match(editor, /configuration\.year.*Sandbagger Invitational/s);
  assert.match(editor, /Save Tee Selections/);
  assert.match(editor, /changed\.map\(\(course\) => \(\{ courseId: course\.id, tee: draft\[course\.id\] \}\)\)/);
  assert.match(editor, /Set the tees used by each tournament course\./);
  assert.match(editor, /Round \{course\.round\} • \{formatName\(course\.format\)\}/);
  assert.match(editor, /Reopen Round \{course\.round\} to change tees\./);
  assert.match(editor, /className=\{styles\.changedTeeStatus\}>Changed/);
  assert.doesNotMatch(editor, /Course ID:/);
  assert.doesNotMatch(editor, /Selected Setup/);
  assert.doesNotMatch(editor, /Active Tee/);
});

test("Course Tees mobile cards separate finalized and editable presentation", async () => {
  const styles = await read("app/admin/director/director.module.css");
  assert.match(styles, /\.courseTeeList article\[data-finalized=true\]/);
  assert.match(styles, /\.currentTeeSetup\{[^}]*grid-template-columns:auto minmax\(0,1fr\)/s);
  assert.match(styles, /\.courseTeeSelector select\{[^}]*min-height:48px/s);
  assert.match(styles, /\.finalizedTeeStatus,\.changedTeeStatus/);
  assert.match(styles, /\.newTeeSetup\{[^}]*grid-template-columns:auto minmax\(0,1fr\)/s);
});

test("course tee writes remain year-scoped, field-scoped, and use verified existing configurations", async () => {
  const writer = await read("lib/google-sheets-write.js");
  assert.match(writer, /export async function updateDirectorCourseTees/);
  assert.match(writer, /Number\(record\.Year\) === year/);
  assert.match(writer, /teeHoles\.length !== 18/);
  assert.match(writer, /"Tee Played": tee/);
  for (const field of ["Rating", "Slope", "Yardage", "Par"]) assert.match(writer, new RegExp(`${field}:`));
  assert.match(writer, /belongs to a finalized round and cannot be changed here/);
  assert.match(writer, /Course Tee Configuration Updated/);
  assert.doesNotMatch(writer, /"Active Tee"/);
});

// Proof layer: UNIT/SOURCE. Actual PostgreSQL capability proof is indexed in CAPABILITY-GAPS.md.
test("UNIT canonical course/tee mutation requires all holes and explicit prepared-context readback", async () => {
  const { buildTournamentSetupMutation } = await import("../lib/production-tournament-setup-contract.js");
  const input = { expectedRevision: 7, operationRequestId: "11111111-1111-4111-8111-111111111111", roundNumber: 1,
    courseId: "SYNTHETIC", courseName: "Synthetic", city: "", state: "", tee: "Blue", rating: "72.1", slope: 123, par: 72,
    holes: Array.from({length:18}, (_,i) => ({number:i+1,par:4,strokeIndex:i+1,yardage:400})) };
  const mutation=buildTournamentSetupMutation("upsert-course",input);
  assert.equal(mutation.operation,"UPSERT_COURSE");assert.equal(mutation.tee,"Blue");assert.equal(mutation.holes.length,18);
  assert.equal(mutation.expected_revision,7);
  assert.throws(()=>buildTournamentSetupMutation("upsert-course",{...input,holes:input.holes.slice(1)}),{code:"TOURNAMENT_SETUP_HOLES_INCOMPLETE"});
  const prepare=buildTournamentSetupMutation("prepare-scoring-context",{...input,matchId:"SYNTHETIC-R1-1"});
  assert.equal(prepare.operation,"PREPARE_SCORING_CONTEXT");
  const server=await read("lib/production-tournament-setup-server.js");
  assert.match(server,/read_production_tournament_setup_v1/);assert.doesNotMatch(server,/google-sheets-write|readWorkbook/);
});
