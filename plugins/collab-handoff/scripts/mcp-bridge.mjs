#!/usr/bin/env node

const hubUrl = (process.env.COLLAB_HANDOFF_HUB_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const hubToken = process.env.COLLAB_HANDOFF_HUB_TOKEN || "";

const tools = [
  {
    name: "handoff_publish",
    description: "Publish an immutable backend/frontend handoff to the shared Collab Handoff Hub.",
    inputSchema: {
      type: "object",
      required: ["projectKey", "subject", "repository", "revision", "path", "summary"],
      properties: {
        projectKey: { type: "string" },
        subject: { type: "string", description: "Stable integration subject, e.g. orders.list" },
        repository: {
          type: "object",
          required: ["owner", "name"],
          properties: {
            owner: { type: "string" },
            name: { type: "string" }
          }
        },
        revision: { type: "string", description: "Immutable Git commit SHA" },
        path: { type: "string", description: "Repository-relative OpenAPI, DTO, or schema path" },
        summary: { type: "string" },
        compatibility: { type: "string", enum: ["additive", "compatible", "breaking", "unknown"] },
        frontendChecks: { type: "array", items: { type: "string" } },
        decisionNeeded: { type: "array", items: { type: "string" } },
        idempotencyKey: { type: "string" }
      }
    }
  },
  {
    name: "handoff_list",
    description: "List handoffs from the shared Hub. Use this before assuming a chat summary is current.",
    inputSchema: {
      type: "object",
      properties: {
        projectKey: { type: "string" },
        subject: { type: "string" },
        status: { type: "string", enum: ["open", "acknowledged", "resolved"] },
        limit: { type: "integer", minimum: 1, maximum: 100 }
      }
    }
  },
  {
    name: "handoff_get",
    description: "Get one handoff and its immutable reply chain from the shared Hub.",
    inputSchema: {
      type: "object",
      required: ["handoffId"],
      properties: { handoffId: { type: "string" } }
    }
  },
  {
    name: "contract_get",
    description: "Read the immutable contract snapshot attached to a handoff after membership is verified by the Hub.",
    inputSchema: { type: "object", required: ["handoffId"], properties: { handoffId: { type: "string" } } }
  },
  {
    name: "handoff_reply",
    description: "Append a structured frontend, QA, or product reply to a handoff.",
    inputSchema: {
      type: "object",
      required: ["handoffId", "result"],
      properties: {
        handoffId: { type: "string" },
        result: { type: "string", enum: ["accepted", "changes-required", "decision-needed", "cannot-verify"] },
        findings: { type: "array", items: { type: "object" } },
        requestedChanges: { type: "array", items: { type: "string" } },
        accepted: { type: "array", items: { type: "string" } },
        idempotencyKey: { type: "string" }
      }
    }
  },
  {
    name: "handoff_resolve",
    description: "Record that a handoff is resolved after its contract or decision is addressed.",
    inputSchema: {
      type: "object",
      required: ["handoffId", "summary"],
      properties: {
        handoffId: { type: "string" },
        summary: { type: "string" },
        idempotencyKey: { type: "string" }
      }
    }
  }
];

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function callHub(name, args) {
  const routes = {
    handoff_publish: ["POST", "/v1/handoffs"],
    handoff_list: ["GET", "/v1/handoffs"],
    handoff_get: ["GET", `/v1/handoffs/${encodeURIComponent(args.handoffId)}`],
    contract_get: ["GET", `/v1/handoffs/${encodeURIComponent(args.handoffId)}/contract`],
    handoff_reply: ["POST", `/v1/handoffs/${encodeURIComponent(args.handoffId)}/replies`],
    handoff_resolve: ["POST", `/v1/handoffs/${encodeURIComponent(args.handoffId)}/resolve`]
  };
  const [method, path] = routes[name];
  const url = new URL(path, hubUrl);
  let body;
  if (method === "GET") {
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  } else {
    body = JSON.stringify(args);
  }
  const headers = body ? { "content-type": "application/json" } : {};
  if (hubToken) headers.authorization = `Bearer ${hubToken}`;
  const response = await fetch(url, {
    method,
    headers,
    body
  });
  const payload = await response.json().catch(() => ({ error: "Hub returned non-JSON response" }));
  if (!response.ok) throw new Error(payload.error || `Hub returned HTTP ${response.status}`);
  return payload;
}

async function handle(message) {
  if (message.method === "notifications/initialized") return;
  if (message.method === "initialize") {
    return {
      protocolVersion: message.params?.protocolVersion || "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "collab-handoff", version: "0.1.0" }
    };
  }
  if (message.method === "tools/list") return { tools };
  if (message.method === "tools/call") {
    const name = message.params?.name;
    if (!tools.some((tool) => tool.name === name)) throw new Error(`Unknown tool: ${name}`);
    const result = await callHub(name, message.params?.arguments || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
  throw new Error(`Unsupported method: ${message.method}`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }
    handle(message)
      .then((result) => {
        if (message.id !== undefined) send({ jsonrpc: "2.0", id: message.id, result });
      })
      .catch((error) => {
        if (message.id !== undefined) {
          send({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: error.message } });
        }
      });
  }
});
