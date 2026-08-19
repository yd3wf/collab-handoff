export class HubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (message) => new HubError(400, message);
export const unauthorized = () => new HubError(401, "unauthorized");
export const forbidden = () => new HubError(403, "forbidden");
export const notFound = (message = "not found") => new HubError(404, message);
export const conflict = (message) => new HubError(409, message);
