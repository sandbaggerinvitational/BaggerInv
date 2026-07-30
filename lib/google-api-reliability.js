const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_CODES = new Set(["ECONNRESET", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_SOCKET"]);

export class GoogleReadError extends Error {
  constructor(message, { status = 0, category = "unknown", cause } = {}) {
    super(message, { cause });
    this.name = "GoogleReadError";
    this.status = status;
    this.category = category;
  }
}

export function googleErrorCategory(error) {
  const status = Number(error?.status || error?.cause?.status || 0);
  if (status === 429) return "rate_limit";
  if (TRANSIENT_STATUSES.has(status)) return "upstream";
  if (status === 401 || status === 403) return "permission";
  if (status === 404) return "configuration";
  if (error?.name === "AbortError" || error?.name === "TimeoutError" || TRANSIENT_CODES.has(error?.code) || TRANSIENT_CODES.has(error?.cause?.code)) return "timeout";
  return error?.category || "unknown";
}

export function isTransientGoogleError(error) {
  const status = Number(error?.status || error?.cause?.status || 0);
  return TRANSIENT_STATUSES.has(status) || ["rate_limit", "upstream", "timeout"].includes(googleErrorCategory(error));
}

export async function withTransientGoogleRetry(operation, { maxRetries = 2, delays = [120, 300], onRetry } = {}) {
  let retries = 0;
  while (true) {
    try {
      return await operation(retries);
    } catch (error) {
      if (!isTransientGoogleError(error) || retries >= maxRetries) throw error;
      retries += 1;
      onRetry?.(retries, error);
      await new Promise((resolve) => setTimeout(resolve, delays[retries - 1] ?? 300));
    }
  }
}

export function googleResponseError(label, status) {
  return new GoogleReadError(`${label} returned Google API ${status}.`, {
    status,
    category: googleErrorCategory({ status }),
  });
}
