// Service-role REST access to the disposable local stack, shared by the
// mutating specs (publish-flow, draft-dialogs).
//
// Deliberately raw fetch rather than a Supabase client: this tier should not
// depend on the same library the app uses, or a client bug could make the app
// and its own test agree with each other and both be wrong.
//
// The env vars are republished onto process.env by playwright-auth.config.ts
/**
 * Sends an authenticated request to a Supabase REST endpoint.
 *
 * @param path - The REST endpoint path relative to `/rest/v1/`
 * @param init - Request options to apply to the request
 * @returns The parsed JSON response, or `null` for a 204 response
 * @throws An error containing the response status, path, and body when the request fails
 */

export async function db(path: string, init: RequestInit = {}) {
  const supabaseUrl = process.env.E2E_SUPABASE_URL!;
  const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY!;
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${path}: ${await response.text()}`);
  return response.status === 204 ? null : await response.json();
}
