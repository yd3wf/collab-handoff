import assert from "node:assert/strict";
import test from "node:test";
import { createHubServer } from "../src/server.mjs";
import { unauthorized } from "../src/errors.mjs";

async function startServer(overrides = {}) {
  const service = {
    async authenticate(token) {
      if (token !== "ch_test") throw unauthorized();
      return { id: "user-1" };
    },
    async bootstrap(input) { return { input, token: "ch_bootstrap" }; },
    async createProject(_user, input) { return { projectKey: input.projectKey }; },
    ...overrides
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

test("routes frontend assistance requests through the authenticated Hub", async (t) => {
  const calls = [];
  const { server, url } = await startServer({
    async createAssistanceRequest(_user, input) {
      calls.push(input);
      return { request: { id: "request-1", subject: input.subject, status: "open" }, events: [] };
    },
    async listAssistanceRequests(_user, input) {
      calls.push(input);
      return [{ id: "request-1", status: "open" }];
    },
    async getAssistanceRequest(_user, requestId) {
      calls.push({ requestId });
      return { request: { id: requestId, status: "open" }, events: [] };
    },
    async replyToAssistanceRequest(_user, requestId, input) {
      calls.push({ requestId, ...input });
      return { request: { id: requestId, status: "answered" }, events: [] };
    },
    async resolveAssistanceRequest(_user, requestId, input) {
      calls.push({ requestId, ...input });
      return { request: { id: requestId, status: "resolved" }, events: [] };
    }
  });
  t.after(() => server.close());
  const create = await fetch(`${url}/v1/assistance-requests`, {
    method: "POST",
    headers: { authorization: "Bearer ch_test", "content-type": "application/json" },
    body: JSON.stringify({ projectKey: "orders", subject: "orders.payment", summary: "Need terminal-state query." })
  });
  assert.equal(create.status, 201);
  assert.deepEqual((await create.json()).request, { id: "request-1", subject: "orders.payment", status: "open" });
  const list = await fetch(`${url}/v1/assistance-requests?projectKey=orders&status=open&limit=5`, {
    headers: { authorization: "Bearer ch_test" }
  });
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), { requests: [{ id: "request-1", status: "open" }] });
  const get = await fetch(`${url}/v1/assistance-requests/request-1`, { headers: { authorization: "Bearer ch_test" } });
  assert.equal(get.status, 200);
  assert.deepEqual((await get.json()).request, { id: "request-1", status: "open" });
  const reply = await fetch(`${url}/v1/assistance-requests/request-1/replies`, {
    method: "POST",
    headers: { authorization: "Bearer ch_test", "content-type": "application/json" },
    body: JSON.stringify({ result: "answered", message: "Use GET /v1/orders/{id}." })
  });
  assert.equal(reply.status, 201);
  assert.deepEqual((await reply.json()).request, { id: "request-1", status: "answered" });
  const resolve = await fetch(`${url}/v1/assistance-requests/request-1/resolve`, {
    method: "POST",
    headers: { authorization: "Bearer ch_test", "content-type": "application/json" },
    body: JSON.stringify({ summary: "Frontend verified the terminal state." })
  });
  assert.equal(resolve.status, 201);
  assert.deepEqual((await resolve.json()).request, { id: "request-1", status: "resolved" });
  assert.deepEqual(calls, [
    { projectKey: "orders", subject: "orders.payment", summary: "Need terminal-state query." },
    { projectKey: "orders", status: "open", limit: "5" },
    { requestId: "request-1" },
    { requestId: "request-1", result: "answered", message: "Use GET /v1/orders/{id}." },
    { requestId: "request-1", summary: "Frontend verified the terminal state." }
  ]);
});
