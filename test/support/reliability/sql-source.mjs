import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export function extractSqlFunction(filename, signature) {
  const source = readFileSync(filename, "utf8");
  const start = source.toLowerCase().indexOf(signature.toLowerCase());
  assert.ok(start >= 0, `SQL function signature not found: ${signature}`);
  const remainder = source.slice(start);
  const delimiter = remainder.match(/\bas\s+(\$[a-zA-Z0-9_]*\$)/i)?.[1];
  assert.ok(delimiter, `SQL function delimiter not found: ${signature}`);
  const bodyStart = remainder.indexOf(delimiter);
  const end = remainder.indexOf(`${delimiter};`, bodyStart + delimiter.length);
  assert.ok(end >= 0, `SQL function end not found: ${signature}`);
  return remainder.slice(0, end + delimiter.length + 1);
}

