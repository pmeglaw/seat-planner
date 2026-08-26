// F-ERR-1 (AUDIT-2 §8.3): server actions RETURN their expected failures (the
// rule documented above updateSeatAction in app/actions.ts), so a value that
// reaches a client catch is an unexpected throw — and in production Next.js
// has already replaced its message with an opaque digest sentence. Rendering
// error.message there shows that digest instead of the written recovery copy.
// This helper therefore always surfaces the fallback and keeps the original
// on the console, where it is still the real message in dev.
export function clientActionErrorMessage(error: unknown, fallback: string): string {
  console.error(error);
  return fallback;
}
