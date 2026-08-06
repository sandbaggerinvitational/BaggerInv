const DEFAULT_DELAYS_MS = [0, 300, 750, 1500];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function verifyDirectorReadBack({
  read,
  verify,
  invalidate,
  summarize = () => ({}),
  delays = DEFAULT_DELAYS_MS,
  onAttempt = () => {},
}) {
  const attempts = [];

  for (let index = 0; index < delays.length; index += 1) {
    const delayMs = Number(delays[index] || 0);
    if (delayMs > 0) await wait(delayMs);

    const invalidationStartedAt = Date.now();
    await invalidate();
    const invalidationCompletedAt = Date.now();
    const readStartedAt = Date.now();

    try {
      const data = await read();
      const readCompletedAt = Date.now();
      const success = Boolean(verify(data));
      const attempt = {
        attempt: index + 1,
        delayMs,
        invalidationStartedAt,
        invalidationCompletedAt,
        readStartedAt,
        readCompletedAt,
        values: summarize(data),
        success,
      };
      attempts.push(attempt);
      onAttempt(attempt);
      if (success) return { success: true, data, attempts };
    } catch (error) {
      const attempt = {
        attempt: index + 1,
        delayMs,
        invalidationStartedAt,
        invalidationCompletedAt,
        readStartedAt,
        readCompletedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
        success: false,
      };
      attempts.push(attempt);
      onAttempt(attempt);
      if (index === delays.length - 1) throw Object.assign(error, { verificationAttempts: attempts });
    }
  }

  return { success: false, data: null, attempts };
}

export const DIRECTOR_READBACK_DELAYS_MS = DEFAULT_DELAYS_MS;
