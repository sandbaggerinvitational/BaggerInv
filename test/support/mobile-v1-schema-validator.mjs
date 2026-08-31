import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const contractDirectory = new URL("../../contracts/mobile/v1/", import.meta.url);
const schemaNames = [
  "shared",
  "passport",
  "guide",
  "history",
  "history-detail",
  "records",
  "odds",
];

let validatorsPromise;

async function loadValidators() {
  if (validatorsPromise) return validatorsPromise;
  validatorsPromise = (async () => {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      strictTypes: false,
      allowUnionTypes: true,
    });
    addFormats(ajv);
    const schemas = new Map();
    for (const name of schemaNames) {
      const filename = `${name}.schema.json`;
      const schema = JSON.parse(await readFile(new URL(filename, contractDirectory), "utf8"));
      schema.$id = new URL(filename, contractDirectory).href;
      schemas.set(name, schema);
      ajv.addSchema(schema);
    }
    return new Map([...schemas].map(([name, schema]) => [name, ajv.getSchema(schema.$id)]));
  })();
  return validatorsPromise;
}

export async function assertMobileV1Schema(name, response) {
  const validators = await loadValidators();
  const validate = validators.get(name);
  assert.ok(validate, `Missing JSON Schema validator for ${name}`);
  assert.equal(validate(response), true, ajvErrorMessage(name, validate.errors));
}

function ajvErrorMessage(name, errors = []) {
  const detail = (errors || []).map((error) =>
    `${error.instancePath || "/"} ${error.message}`).join("; ");
  return `${name} response must satisfy its Draft 2020-12 schema: ${detail}`;
}
