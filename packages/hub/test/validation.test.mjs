import assert from "node:assert/strict";
import test from "node:test";
import { filePath, projectKey, projectRole, replyResult } from "../src/validation.mjs";

test("accepts a safe project key and repository-relative contract path", () => {
  assert.equal(projectKey("Orders-Api"), "orders-api");
  assert.equal(filePath("contracts/orders/openapi.yaml"), "contracts/orders/openapi.yaml");
  assert.equal(projectRole("frontend"), "frontend");
  assert.equal(replyResult("changes-required"), "changes-required");
});

test("rejects unsafe paths and malformed project keys", () => {
  assert.throws(() => filePath("../secret.env"));
  assert.throws(() => filePath("C:\\secret.env"));
  assert.throws(() => projectKey("Orders API"));
});
