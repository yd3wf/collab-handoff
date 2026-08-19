import { createServer } from "node:http";
import { HubError, unauthorized } from "./errors.mjs";

function json(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("request body exceeds 1 MB");
  }
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    throw new HubError(400, "request body must be valid JSON");
  }
}

function bearer(request) {
  return request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
}

export function createHubServer({ service, bootstrapToken }) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ok: true });
      if (request.method === "POST" && url.pathname === "/v1/bootstrap") {
        if (!bootstrapToken || request.headers["x-bootstrap-token"] !== bootstrapToken) throw unauthorized();
        return json(response, 201, await service.bootstrap(await readBody(request)));
      }
      const user = await service.authenticate(bearer(request));

      if (request.method === "POST" && url.pathname === "/v1/handoffs") {
        return json(response, 201, await service.createHandoff(user, await readBody(request)));
      }
      if (request.method === "GET" && url.pathname === "/v1/handoffs") {
        const handoffs = await service.listHandoffs(user, {
          projectKey: url.searchParams.get("projectKey"),
          subject: url.searchParams.get("subject") || undefined,
          status: url.searchParams.get("status") || undefined,
          limit: url.searchParams.get("limit") || undefined
        });
        return json(response, 200, { handoffs });
      }
      if (request.method === "POST" && url.pathname === "/v1/tokens") return json(response, 201, await service.createToken(user, await readBody(request)));
      if (request.method === "POST" && url.pathname === "/v1/projects") return json(response, 201, await service.createProject(user, await readBody(request)));
      const memberMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/members$/);
      if (request.method === "POST" && memberMatch) return json(response, 201, await service.addMember(user, decodeURIComponent(memberMatch[1]), await readBody(request)));
      const repositoryMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/repositories$/);
      if (request.method === "POST" && repositoryMatch) return json(response, 201, await service.registerRepository(user, decodeURIComponent(repositoryMatch[1]), await readBody(request)));
      const handoffMatch = url.pathname.match(/^\/v1\/handoffs\/([^/]+)$/);
      if (request.method === "GET" && handoffMatch) {
        return json(response, 200, await service.getHandoff(user, decodeURIComponent(handoffMatch[1])));
      }
      const contractMatch = url.pathname.match(/^\/v1\/handoffs\/([^/]+)\/contract$/);
      if (request.method === "GET" && contractMatch) return json(response, 200, await service.getContract(user, decodeURIComponent(contractMatch[1])));
      const replyMatch = url.pathname.match(/^\/v1\/handoffs\/([^/]+)\/replies$/);
      if (request.method === "POST" && replyMatch) {
        return json(response, 201, await service.reply(user, decodeURIComponent(replyMatch[1]), await readBody(request)));
      }
      const resolveMatch = url.pathname.match(/^\/v1\/handoffs\/([^/]+)\/resolve$/);
      if (request.method === "POST" && resolveMatch) {
        return json(response, 201, await service.resolve(user, decodeURIComponent(resolveMatch[1]), await readBody(request)));
      }
      return json(response, 404, { error: "not found" });
    } catch (error) {
      return json(response, error instanceof HubError ? error.status : 500, { error: error instanceof HubError ? error.message : "internal server error" });
    }
  });
}
