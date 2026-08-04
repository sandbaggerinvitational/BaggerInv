const DEFAULT_DELAYS = [180, 420];
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const transientStatus = (status) => status === 408 || status === 429 || status >= 500;

export async function fetchWithTransientRetry(input, init = {}, { delays = DEFAULT_DELAYS, fetcher = fetch } = {}) {
  let lastResponse;
  let lastError;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      const response = await fetcher(input, init);
      lastResponse = response;
      if (!transientStatus(response.status) || attempt === delays.length) return response;
    } catch (error) {
      lastError = error;
      if (attempt === delays.length) throw error;
    }
    await wait(delays[attempt]);
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error("Request failed.");
}
