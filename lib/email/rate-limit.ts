type RateEntry = { count: number; resetAt: number };
const attempts = new Map<string, RateEntry>();

export function allowSignupAttempt(key: string, now = Date.now(), limit = 5, windowMs = 60_000) {
  const current = attempts.get(key);
  if (!current || now >= current.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}
