// Reset and cold-start recovery can span several serverless/Sheets requests.
// Keep that work behind one user-facing loading state before declaring failure.
const DEFAULT_DELAYS = [200, 500, 1000, 2000, 3000];
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const transientStatus = (status) => status === 408 || status === 429 || status >= 500;
const aborted = (error, signal) => signal?.aborted || error?.name === "AbortError";

export async function fetchWithTransientRetry(input, init = {}, { delays = DEFAULT_DELAYS, fetcher = fetch, onRetry } = {}) {
  let lastResponse;
  let lastError;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      const response = await fetcher(input, init);
      lastResponse = response;
      if (!transientStatus(response.status) || attempt === delays.length) return response;
    } catch (error) {
      if (aborted(error, init?.signal)) throw error;
      lastError = error;
      if (attempt === delays.length) throw error;
    }
    onRetry?.({ attempt: attempt + 1, delay: delays[attempt], response: lastResponse, error: lastError });
    await wait(delays[attempt]);
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error("Request failed.");
}
