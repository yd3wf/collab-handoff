import { badRequest, conflict, forbidden, notFound, unauthorized } from "./errors.mjs";
import { assistanceReplyResult, compatibility, createPersonalToken, filePath, hashToken, id, projectKey, projectRole, replyResult, sha256, string, stringArray } from "./validation.mjs";

const allowed = {
  create: new Set(["owner", "backend"]),
  reply: new Set(["owner", "backend", "frontend"]),
  resolve: new Set(["owner", "backend"]),
  assistanceCreate: new Set(["owner", "frontend"]),
  assistanceReply: new Set(["owner", "backend", "frontend"]),
  assistanceResolve: new Set(["owner", "backend", "frontend"]),
  manage: new Set(["owner"])
};

function statusFor(result) {
  return {
    accepted: "acknowledged",
    "changes-required": "changes_requested",
    "decision-needed": "decision_needed",
    "cannot-verify": "cannot_verify"
  }[result];
}

function assistanceStatusFor(result) {
  return {
    acknowledged: "acknowledged",
    answered: "answered",
    "decision-needed": "decision_needed"
  }[result];
}

export class HubService {
  constructor({ sql, contractSource }) {
    this.sql = sql;
    this.contractSource = contractSource;
  }

  async authenticate(rawToken) {
    if (!rawToken?.startsWith("ch_")) throw unauthorized();
    const tokenHash = hashToken(rawToken);
    const [row] = await this.sql`
      SELECT u.id, u.email, u.display_name, u.is_admin, t.id AS token_id
      FROM personal_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ${tokenHash} AND t.revoked_at IS NULL
    `;
    if (!row) throw unauthorized();
    await this.sql`UPDATE personal_tokens SET last_used_at = now() WHERE id = ${row.token_id}`;
    return { id: row.id, email: row.email, displayName: row.display_name, isAdmin: row.is_admin };
  }

  async bootstrap(input) {
    const [admin] = await this.sql`SELECT id FROM users WHERE is_admin = true LIMIT 1`;
    if (admin) throw conflict("bootstrap has already completed");
    const email = string(input.email, "email", { max: 320 }).toLowerCase();
    if (!email.includes("@")) throw badRequest("email is invalid");
    const displayName = string(input.displayName, "displayName", { max: 120 });
    const token = createPersonalToken();
    const userId = id();
    await this.sql.begin(async (tx) => {
      await tx`INSERT INTO users (id, email, display_name, is_admin) VALUES (${userId}, ${email}, ${displayName}, true)`;
      await tx`INSERT INTO personal_tokens (id, user_id, label, token_prefix, token_hash) VALUES (${id()}, ${userId}, 'bootstrap', ${token.slice(0, 10)}, ${hashToken(token)})`;
    });
    return { user: { id: userId, email, displayName, isAdmin: true }, token };
  }

  async createToken(user, input) {
    const token = createPersonalToken();
    const label = string(input.label, "label", { max: 120 });
    await this.sql`INSERT INTO personal_tokens (id, user_id, label, token_prefix, token_hash) VALUES (${id()}, ${user.id}, ${label}, ${token.slice(0, 10)}, ${hashToken(token)})`;
    return { token, label };
  }

  async createProject(user, input) {
    const key = projectKey(input.projectKey);
    const name = string(input.name, "name", { max: 200 });
    const projectId = id();
    try {
      await this.sql.begin(async (tx) => {
        await tx`INSERT INTO projects (id, project_key, name) VALUES (${projectId}, ${key}, ${name})`;
        await tx`INSERT INTO project_members (project_id, user_id, role) VALUES (${projectId}, ${user.id}, 'owner')`;
      });
    } catch (error) {
      if (error.code === "23505") throw conflict("projectKey already exists");
      throw error;
    }
    return { id: projectId, projectKey: key, name };
  }

  async memberFor(user, key, action) {
    const [member] = await this.sql`
      SELECT p.id AS project_id, p.project_key, p.name, pm.role
      FROM projects p JOIN project_members pm ON pm.project_id = p.id
      WHERE p.project_key = ${projectKey(key)} AND pm.user_id = ${user.id}
    `;
    if (!member) throw notFound("project not found");
    if (action && !allowed[action].has(member.role)) throw forbidden();
    return member;
  }

  async addMember(user, key, input) {
    const project = await this.memberFor(user, key, "manage");
    const email = string(input.email, "email", { max: 320 }).toLowerCase();
    const displayName = string(input.displayName, "displayName", { max: 120 });
    const role = projectRole(input.role);
    let [memberUser] = await this.sql`SELECT id, email, display_name FROM users WHERE email = ${email}`;
    let token;
    if (!memberUser) {
      token = createPersonalToken();
      const userId = id();
      await this.sql.begin(async (tx) => {
        await tx`INSERT INTO users (id, email, display_name) VALUES (${userId}, ${email}, ${displayName})`;
        await tx`INSERT INTO personal_tokens (id, user_id, label, token_prefix, token_hash) VALUES (${id()}, ${userId}, 'invited', ${token.slice(0, 10)}, ${hashToken(token)})`;
      });
      memberUser = { id: userId, email, display_name: displayName };
    }
    await this.sql`
      INSERT INTO project_members (project_id, user_id, role) VALUES (${project.project_id}, ${memberUser.id}, ${role})
      ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role
    `;
    return { user: { id: memberUser.id, email: memberUser.email, displayName: memberUser.display_name }, role, token };
  }

  async registerRepository(user, key, input) {
    const project = await this.memberFor(user, key, "manage");
    const owner = string(input.owner, "owner", { max: 100 });
    const repository = string(input.repository, "repository", { max: 100 });
    const repositoryId = id();
    try {
      await this.sql`
        INSERT INTO repositories (id, project_id, provider, owner, repository)
        VALUES (${repositoryId}, ${project.project_id}, 'github', ${owner}, ${repository})
      `;
    } catch (error) {
      if (error.code === "23505") throw conflict("repository is already registered for this project");
      throw error;
    }
    return { id: repositoryId, provider: "github", owner, repository };
  }

  async createHandoff(user, input) {
    const project = await this.memberFor(user, input.projectKey, "create");
    const owner = string(input.repository?.owner, "repository.owner", { max: 100 });
    const repository = string(input.repository?.name, "repository.name", { max: 100 });
    const revision = string(input.revision, "revision", { max: 128 });
    const path = filePath(input.path);
    const subject = string(input.subject, "subject", { max: 200 });
    const summary = string(input.summary, "summary", { max: 10_000 });
    const compatibilityValue = compatibility(input.compatibility);
    const idempotencyKey = input.idempotencyKey === undefined ? null : string(input.idempotencyKey, "idempotencyKey", { max: 200 });
    const [existing] = idempotencyKey ? await this.sql`
      SELECT h.id FROM handoff_events e JOIN handoffs h ON h.id = e.handoff_id
      WHERE e.actor_user_id = ${user.id} AND e.idempotency_key = ${idempotencyKey}
    ` : [];
    if (existing) return this.getHandoff(user, existing.id);
    const [repo] = await this.sql`
      SELECT id FROM repositories WHERE project_id = ${project.project_id} AND provider = 'github' AND owner = ${owner} AND repository = ${repository}
    `;
    if (!repo) throw badRequest("repository is not registered for this project");
    const source = await this.contractSource.readFile({ owner, repository, path, revision });
    const handoffId = id();
    const contractId = id();
    await this.sql.begin(async (tx) => {
      const stored = await tx`
        INSERT INTO contract_versions (id, repository_id, git_revision, file_path, content_sha256, content_type, content)
        VALUES (${contractId}, ${repo.id}, ${revision}, ${path}, ${sha256(source.content)}, ${source.contentType}, ${source.content})
        ON CONFLICT (repository_id, git_revision, file_path) DO NOTHING
        RETURNING id
      `;
      const contractVersionId = stored[0]?.id || (await tx`
        SELECT id FROM contract_versions WHERE repository_id = ${repo.id} AND git_revision = ${revision} AND file_path = ${path}
      `)[0].id;
      await tx`
        INSERT INTO handoffs (id, project_id, contract_version_id, subject, summary, compatibility, status, created_by)
        VALUES (${handoffId}, ${project.project_id}, ${contractVersionId}, ${subject}, ${summary}, ${compatibilityValue}, 'open', ${user.id})
      `;
      await tx`
        INSERT INTO handoff_events (id, handoff_id, actor_user_id, event_type, payload, idempotency_key)
        VALUES (${id()}, ${handoffId}, ${user.id}, 'created', ${tx.json({ frontendChecks: stringArray(input.frontendChecks, "frontendChecks"), decisionNeeded: stringArray(input.decisionNeeded, "decisionNeeded") })}, ${idempotencyKey})
      `;
    });
    return this.getHandoff(user, handoffId);
  }

  async handoffRow(user, handoffId) {
    const [handoff] = await this.sql`
      SELECT h.id, h.subject, h.summary, h.compatibility, h.status, h.created_at, h.resolved_at,
             p.project_key, p.name AS project_name, pm.role,
             r.owner AS repository_owner, r.repository, cv.git_revision, cv.file_path, cv.content_sha256,
             creator.email AS created_by_email
      FROM handoffs h
      JOIN projects p ON p.id = h.project_id
      JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ${user.id}
      JOIN repositories r ON r.id = (SELECT repository_id FROM contract_versions WHERE id = h.contract_version_id)
      JOIN contract_versions cv ON cv.id = h.contract_version_id
      JOIN users creator ON creator.id = h.created_by
      WHERE h.id = ${handoffId}
    `;
    if (!handoff) throw notFound("handoff not found");
    return handoff;
  }

  async getHandoff(user, handoffId) {
    const handoff = await this.handoffRow(user, handoffId);
    const events = await this.sql`
      SELECT e.id, e.event_type, e.payload, e.created_at, u.email AS actor_email, u.display_name AS actor_name
      FROM handoff_events e JOIN users u ON u.id = e.actor_user_id WHERE e.handoff_id = ${handoff.id} ORDER BY e.created_at
    `;
    return { handoff, events };
  }

  async listHandoffs(user, input) {
    const project = await this.memberFor(user, input.projectKey);
    const status = input.status;
    if (status && !["open", "acknowledged", "changes_requested", "decision_needed", "cannot_verify", "resolved"].includes(status)) throw badRequest("status is invalid");
    const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100);
    return this.sql`
      SELECT h.id, h.subject, h.summary, h.compatibility, h.status, h.created_at, p.project_key,
             r.owner AS repository_owner, r.repository, cv.git_revision, cv.file_path
      FROM handoffs h JOIN projects p ON p.id = h.project_id
      JOIN contract_versions cv ON cv.id = h.contract_version_id
      JOIN repositories r ON r.id = cv.repository_id
      WHERE h.project_id = ${project.project_id}
        AND (${status || null}::text IS NULL OR h.status = ${status || null})
        AND (${input.subject || null}::text IS NULL OR h.subject = ${input.subject || null})
      ORDER BY h.created_at DESC LIMIT ${limit}
    `;
  }

  async getContract(user, handoffId) {
    const handoff = await this.handoffRow(user, handoffId);
    const [contract] = await this.sql`
      SELECT cv.git_revision, cv.file_path, cv.content_sha256, cv.content_type, cv.content
      FROM handoffs h JOIN contract_versions cv ON cv.id = h.contract_version_id WHERE h.id = ${handoff.id}
    `;
    return { repository: `${handoff.repository_owner}/${handoff.repository}`, revision: contract.git_revision, path: contract.file_path, sha256: contract.content_sha256, contentType: contract.content_type, content: contract.content };
  }

  async reply(user, handoffId, input) {
    const handoff = await this.handoffRow(user, handoffId);
    if (!allowed.reply.has(handoff.role)) throw forbidden();
    if (handoff.status === "resolved") throw conflict("handoff is already resolved");
    const result = replyResult(input.result);
    const idempotencyKey = input.idempotencyKey === undefined ? null : string(input.idempotencyKey, "idempotencyKey", { max: 200 });
    const payload = { result, findings: input.findings || [], requestedChanges: stringArray(input.requestedChanges, "requestedChanges"), accepted: stringArray(input.accepted, "accepted") };
    await this.sql.begin(async (tx) => {
      if (idempotencyKey) {
        const [existing] = await tx`SELECT id FROM handoff_events WHERE actor_user_id = ${user.id} AND idempotency_key = ${idempotencyKey}`;
        if (existing) return;
      }
      await tx`INSERT INTO handoff_events (id, handoff_id, actor_user_id, event_type, payload, idempotency_key) VALUES (${id()}, ${handoff.id}, ${user.id}, 'reply', ${tx.json(payload)}, ${idempotencyKey})`;
      await tx`UPDATE handoffs SET status = ${statusFor(result)} WHERE id = ${handoff.id}`;
    });
    return this.getHandoff(user, handoff.id);
  }

  async resolve(user, handoffId, input) {
    const handoff = await this.handoffRow(user, handoffId);
    if (!allowed.resolve.has(handoff.role)) throw forbidden();
    if (handoff.status === "resolved") throw conflict("handoff is already resolved");
    const summary = string(input.summary, "summary", { max: 10_000 });
    await this.sql.begin(async (tx) => {
      await tx`INSERT INTO handoff_events (id, handoff_id, actor_user_id, event_type, payload) VALUES (${id()}, ${handoff.id}, ${user.id}, 'resolved', ${tx.json({ summary })})`;
      await tx`UPDATE handoffs SET status = 'resolved', resolved_at = now() WHERE id = ${handoff.id}`;
    });
    return this.getHandoff(user, handoff.id);
  }

  async createAssistanceRequest(user, input) {
    const project = await this.memberFor(user, input.projectKey, "assistanceCreate");
    const subject = string(input.subject, "subject", { max: 200 });
    const summary = string(input.summary, "summary", { max: 10_000 });
    const requestedHelp = stringArray(input.requestedHelp, "requestedHelp");
    const idempotencyKey = input.idempotencyKey === undefined ? null : string(input.idempotencyKey, "idempotencyKey", { max: 200 });
    if (idempotencyKey) {
      const [existing] = await this.sql`
        SELECT ar.id FROM assistance_request_events e JOIN assistance_requests ar ON ar.id = e.assistance_request_id
        WHERE e.actor_user_id = ${user.id} AND e.idempotency_key = ${idempotencyKey}
      `;
      if (existing) return this.getAssistanceRequest(user, existing.id);
    }
    const requestId = id();
    await this.sql.begin(async (tx) => {
      await tx`
        INSERT INTO assistance_requests (id, project_id, subject, summary, status, created_by)
        VALUES (${requestId}, ${project.project_id}, ${subject}, ${summary}, 'open', ${user.id})
      `;
      await tx`
        INSERT INTO assistance_request_events (id, assistance_request_id, actor_user_id, event_type, payload, idempotency_key)
        VALUES (${id()}, ${requestId}, ${user.id}, 'created', ${tx.json({ requestedHelp })}, ${idempotencyKey})
      `;
    });
    return this.getAssistanceRequest(user, requestId);
  }

  async assistanceRequestRow(user, requestId) {
    const [request] = await this.sql`
      SELECT ar.id, ar.subject, ar.summary, ar.status, ar.created_at, ar.resolved_at,
             p.project_key, p.name AS project_name, pm.role, creator.email AS created_by_email
      FROM assistance_requests ar
      JOIN projects p ON p.id = ar.project_id
      JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ${user.id}
      JOIN users creator ON creator.id = ar.created_by
      WHERE ar.id = ${requestId}
    `;
    if (!request) throw notFound("assistance request not found");
    return request;
  }

  async getAssistanceRequest(user, requestId) {
    const request = await this.assistanceRequestRow(user, requestId);
    const events = await this.sql`
      SELECT e.id, e.event_type, e.payload, e.created_at, u.email AS actor_email, u.display_name AS actor_name
      FROM assistance_request_events e JOIN users u ON u.id = e.actor_user_id
      WHERE e.assistance_request_id = ${request.id} ORDER BY e.created_at
    `;
    return { request, events };
  }

  async listAssistanceRequests(user, input) {
    const project = await this.memberFor(user, input.projectKey);
    const status = input.status;
    if (status && !["open", "acknowledged", "answered", "decision_needed", "resolved"].includes(status)) throw badRequest("status is invalid");
    const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100);
    return this.sql`
      SELECT ar.id, ar.subject, ar.summary, ar.status, ar.created_at, p.project_key, creator.email AS created_by_email
      FROM assistance_requests ar
      JOIN projects p ON p.id = ar.project_id
      JOIN users creator ON creator.id = ar.created_by
      WHERE ar.project_id = ${project.project_id}
        AND (${status || null}::text IS NULL OR ar.status = ${status || null})
      ORDER BY ar.created_at DESC LIMIT ${limit}
    `;
  }

  async replyToAssistanceRequest(user, requestId, input) {
    const request = await this.assistanceRequestRow(user, requestId);
    if (!allowed.assistanceReply.has(request.role)) throw forbidden();
    if (request.status === "resolved") throw conflict("assistance request is already resolved");
    const result = assistanceReplyResult(input.result);
    const message = string(input.message, "message", { max: 10_000 });
    const idempotencyKey = input.idempotencyKey === undefined ? null : string(input.idempotencyKey, "idempotencyKey", { max: 200 });
    await this.sql.begin(async (tx) => {
      if (idempotencyKey) {
        const [existing] = await tx`SELECT id FROM assistance_request_events WHERE actor_user_id = ${user.id} AND idempotency_key = ${idempotencyKey}`;
        if (existing) return;
      }
      await tx`
        INSERT INTO assistance_request_events (id, assistance_request_id, actor_user_id, event_type, payload, idempotency_key)
        VALUES (${id()}, ${request.id}, ${user.id}, 'reply', ${tx.json({ result, message })}, ${idempotencyKey})
      `;
      await tx`UPDATE assistance_requests SET status = ${assistanceStatusFor(result)} WHERE id = ${request.id}`;
    });
    return this.getAssistanceRequest(user, request.id);
  }

  async resolveAssistanceRequest(user, requestId, input) {
    const request = await this.assistanceRequestRow(user, requestId);
    if (!allowed.assistanceResolve.has(request.role)) throw forbidden();
    if (request.status === "resolved") throw conflict("assistance request is already resolved");
    const summary = string(input.summary, "summary", { max: 10_000 });
    const idempotencyKey = input.idempotencyKey === undefined ? null : string(input.idempotencyKey, "idempotencyKey", { max: 200 });
    await this.sql.begin(async (tx) => {
      if (idempotencyKey) {
        const [existing] = await tx`SELECT id FROM assistance_request_events WHERE actor_user_id = ${user.id} AND idempotency_key = ${idempotencyKey}`;
        if (existing) return;
      }
      await tx`
        INSERT INTO assistance_request_events (id, assistance_request_id, actor_user_id, event_type, payload, idempotency_key)
        VALUES (${id()}, ${request.id}, ${user.id}, 'resolved', ${tx.json({ summary })}, ${idempotencyKey})
      `;
      await tx`UPDATE assistance_requests SET status = 'resolved', resolved_at = now() WHERE id = ${request.id}`;
    });
    return this.getAssistanceRequest(user, request.id);
  }
}
