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
  assert.doesNotMatch(editor, /Active Tee/);
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

test("course tee read-back includes refreshed handicap lookup verification", async () => {
  const route = await read("app/api/director/route.js");
  assert.match(route, /action === "course-tees"/);
  assert.match(route, /course\.handicapVerified/);
  assert.match(route, /"Courses", "Course Scorecards", "Course Holes", "Live Round Handicaps"/);
  assert.match(route, /updateDirectorCourseTees\(\{ \.\.\.input, year: data\.tournament\.year \}, updatedBy\)/);
});
