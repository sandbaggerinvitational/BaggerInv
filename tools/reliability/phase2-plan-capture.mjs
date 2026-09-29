// POSTGRESQL plan extraction shared by Phase2 isolated benchmark; never connects externally.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {sqlResult} from "../../test/support/reliability/postgres17.mjs";
import {validateBenchmarkResult} from "../../test/support/reliability/benchmark-result-validation.mjs";
import {summarizePlanStatements} from "../../test/support/reliability/plan-evidence.mjs";
const digest = value => createHash("sha256").update(value).digest("hex");
function balancedObject(text, start) {
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error("Truncated auto_explain JSON");
}

function extractPlans(text) {
  const plans = [];
  for (const match of text.matchAll(/duration:\s+([0-9.]+)\s+ms\s+plan:\s*/g)) {
    const start = match.index + match[0].length;
    assert.equal(text[start], "{", "auto_explain JSON required");
    const plan = JSON.parse(balancedObject(text, start));
    plans.push({ durationMs: Number(match[1]), ...plan });
  }
  return plans;
}

function compactPlan(node) {
  const keep = ["Node Type", "Parent Relationship", "Relation Name", "Alias", "Index Name",
    "Join Type", "Scan Direction", "Plan Rows", "Plan Width", "Total Cost",
    "Actual Rows", "Actual Loops", "Rows Removed by Filter", "Rows Removed by Index Recheck",
    "Rows Removed by Join Filter", "Shared Hit Blocks", "Shared Read Blocks",
    "Temp Read Blocks", "Temp Written Blocks", "Sort Method", "Sort Space Used", "Sort Space Type"];
  return Object.fromEntries([
    ...keep.filter(key => node[key] !== undefined).map(key => [key, node[key]]),
    ...(node.Plans ? [["Plans", node.Plans.map(compactPlan)]] : []),
  ]);
}

function scanNodes(node, result = []) {
  if (node["Relation Name"] || /Sort|Aggregate|Join/.test(node["Node Type"] || "")) result.push(node);
  for (const child of node.Plans || []) scanNodes(child, result);
  return result;
}


export function capturePhase2Plan(cluster,database,operation) {
 const result=sqlResult(cluster,database,`begin; ${operation.setupSql || ""}
 load 'auto_explain'; set local client_min_messages=log;
 set local auto_explain.log_min_duration=0; set local auto_explain.log_analyze=on;
 set local auto_explain.log_buffers=on; set local auto_explain.log_timing=off;
 set local auto_explain.log_nested_statements=on; set local auto_explain.log_format=json;
 ${operation.sql}; set local auto_explain.log_min_duration=-1; rollback;`);
 assert.equal(result.status,0,result.stderr?.slice(-2000));
 if (operation.validateResult) operation.validateResult(result.stdout);
 else validateBenchmarkResult(operation,result.stdout);
 const plans=extractPlans(result.stderr || ""); assert.ok(plans.length);
 const statements=plans.map(entry=>{
  const plan=compactPlan(entry.Plan),nodes=scanNodes(plan);
  return {querySha256:digest(entry["Query Text"] || ""),durationMsWithPlanLogging:entry.durationMs,
   sequentialScans:nodes.filter(n=>n["Node Type"]==="Seq Scan").map(n=>n["Relation Name"]),
   relations:[...new Set(nodes.map(n=>n["Relation Name"]).filter(Boolean))],
   temporaryWrittenBlocks:entry.Plan["Temp Written Blocks"]??0,plan};
 });
 return {proofLayer:"POSTGRESQL",environment:"LOCAL_SOCKET_ONLY",loggedStatements:statements.length,
  derivedRelations:[...new Set(statements.flatMap(s=>s.relations).filter(r=>/calcutta|net_skins|competition_recalculation/.test(r)))],
  shapes:summarizePlanStatements(statements),limitations:["Instrumented nested durations overlap; not latency benchmark or distinct rows."]};
}
