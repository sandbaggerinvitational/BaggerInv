import { createHash } from "node:crypto";

const identity = new Set(["Node Type", "Parent Relationship", "Relation Name", "Alias",
  "Index Name", "Join Type", "Scan Direction", "Sort Method", "Sort Space Type"]);
const shape = node => Object.fromEntries(Object.entries(node).flatMap(([key, value]) =>
  key === "Plans" ? [[key, value.map(shape)]] : identity.has(key) ? [[key, value]] : []));
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function ranges(node, path = "root", output = {}) {
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "number") output[`${path}.${key}`] = value;
  }
  for (const [index, child] of (node.Plans || []).entries()) ranges(child, `${path}.${index}`, output);
  return output;
}

// Repeated PL/pgSQL execution can log thousands of identical plan shapes.
// Retain every distinct query/shape, invocation counts and metric ranges,
// not a 100-MB transient log. Nested durations/buffers must not be summed
// into request duration or unique rows because parent/child work overlaps.
export function summarizePlanStatements(statements) {
  const groups = new Map();
  for (const statement of statements) {
    const shapeSha256 = hash(shape(statement.plan));
    const key = `${statement.querySha256}:${shapeSha256}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        querySha256: statement.querySha256, shapeSha256, invocations: 0,
        durationMinMsWithPlanLogging: statement.durationMsWithPlanLogging,
        durationMaxMsWithPlanLogging: statement.durationMsWithPlanLogging,
        sequentialScans: statement.sequentialScans, relations: statement.relations,
        maximumTemporaryWrittenBlocks: 0, nodeMetricRanges: {},
        representative: "highest-duration observation of this query/shape; not baseline timing",
        plan: statement.plan,
      };
      groups.set(key, group);
    }
    group.invocations++;
    group.durationMinMsWithPlanLogging = Math.min(group.durationMinMsWithPlanLogging, statement.durationMsWithPlanLogging);
    if (statement.durationMsWithPlanLogging >= group.durationMaxMsWithPlanLogging) group.plan = statement.plan;
    group.durationMaxMsWithPlanLogging = Math.max(group.durationMaxMsWithPlanLogging, statement.durationMsWithPlanLogging);
    group.maximumTemporaryWrittenBlocks = Math.max(group.maximumTemporaryWrittenBlocks, statement.temporaryWrittenBlocks || 0);
    for (const [metric, value] of Object.entries(ranges(statement.plan))) {
      const range = group.nodeMetricRanges[metric] || { min: value, max: value };
      range.min = Math.min(range.min, value); range.max = Math.max(range.max, value);
      group.nodeMetricRanges[metric] = range;
    }
  }
  return [...groups.values()];
}
