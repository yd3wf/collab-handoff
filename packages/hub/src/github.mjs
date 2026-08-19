import { badRequest } from "./errors.mjs";

export class GitHubContractSource {
  constructor(token = "") {
    this.token = token;
  }

  async readFile({ owner, repository, path, revision }) {
    const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`);
    url.searchParams.set("ref", revision);
    const headers = { accept: "application/vnd.github+json", "user-agent": "collab-handoff" };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const response = await fetch(url, { headers });
    if (response.status === 404) throw badRequest("contract file or revision was not found in GitHub");
    if (!response.ok) throw badRequest(`GitHub contract lookup failed (${response.status})`);
    const payload = await response.json();
    if (payload.type !== "file" || payload.encoding !== "base64" || typeof payload.content !== "string") {
      throw badRequest("GitHub path must reference a text file");
    }
    const content = Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf8");
    if (Buffer.byteLength(content, "utf8") > 1_000_000) throw badRequest("contract file exceeds 1 MB");
    return { content, contentType: "text/plain; charset=utf-8" };
  }
}
