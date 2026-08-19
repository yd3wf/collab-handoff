import { createHash, randomBytes, randomUUID } from "node:crypto";
import { badRequest } from "./errors.mjs";

const roles = new Set(["owner", "backend", "frontend", "viewer"]);
const compatibilityValues = new Set(["additive", "compatible", "breaking", "unknown"]);
const replyValues = new Set(["accepted", "changes-required", "decision-needed", "cannot-verify"]);

export const id = () => randomUUID();
export const hashToken = (token) => createHash("sha256").update(token).digest("hex");
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const createPersonalToken = () => `ch_${randomBytes(32).toString("base64url")}`;

export function string(value, field, { max = 10_000 } = {}) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw badRequest(`${field} must be a non-empty string`);
  return value.trim();
}

export function projectKey(value) {
  const key = string(value, "projectKey", { max: 64 }).toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(key)) throw badRequest("projectKey must use lowercase letters, digits, and hyphens");
  return key;
}

export function projectRole(value) {
  if (!roles.has(value)) throw badRequest("role is invalid");
  return value;
}

export function compatibility(value = "unknown") {
  if (!compatibilityValues.has(value)) throw badRequest("compatibility is invalid");
  return value;
}

export function replyResult(value) {
  if (!replyValues.has(value)) throw badRequest("result is invalid");
  return value;
}

export function filePath(value) {
  const path = string(value, "path", { max: 500 });
  if (path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) throw badRequest("path must be repository-relative");
  return path;
}

export function stringArray(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw badRequest(`${field} must be an array`);
  return value.map((entry) => string(entry, field, { max: 1000 }));
}
