import assert from "node:assert/strict";
import test from "node:test";
import { createHubServer } from "../src/server.mjs";
import { unauthorized } from "../src/errors.mjs";

async function startServer() {
  const service = {
    async authenticate(token) {
      if (token !== "ch_test") throw unauthorized();
      return { id: "user-1" };
    },
    async bootstrap(input) { return { input, token: "ch_bootstrap" }; },
    async createProject(_user, input) { return { projectKey: input.projectKey }; }
  };
  const server = createHubServer({ service, bootstrapToken: "bootstrap-secret" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test("protects API routes and permits one-time bootstrap credentials", async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());
  assert.deepEqual(await (await fetch(`${url}/health`)).json(), { ok: true });
  assert.equal((await fetch(`${url}/v1/projects`, { method: "POST" })).status, 401);
  const bootstrap = await fetch(`${url}/v1/bootstrap`, {
    method: "POST",
    headers: { "x-bootstrap-token": "bootstrap-secret", "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com" })
  });
  assert.equal(bootstrap.status, 201);
  const project = await fetch(`${url}/v1/projects`, {
    method: "POST",
    headers: { authorization: "Bearer ch_test", "content-type": "application/json" },
    body: JSON.stringify({ projectKey: "orders" })
  });
  assert.equal(project.status, 201);
  assert.deepEqual(await project.json(), { projectKey: "orders" });
});

test("returns 400 rather than leaking a JSON parse exception", async (t) => {
  const { server, url } = await startServer();
  t.after(() => server.close());
  const response = await fetch(`${url}/v1/projects`, {
    method: "POST",
    headers: { authorization: "Bearer ch_test", "content-type": "application/json" },
    body: "not-json"
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "request body must be valid JSON" });
});
