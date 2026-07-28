// PostgREST caps every response at the project's `max-rows` setting (1000 on
// the local stack, see supabase/config.toml). A plain `.select()` that exceeds
// it comes back TRUNCATED with no error, no warning and no indication in the
// payload — the seat map simply draws a partial floor plan that looks complete.
// That is the failure this module removes.
//
// Rather than detecting truncation and erroring, we page through the rows so it
// cannot happen. The exact count is requested alongside the first page and the
// total is asserted at the end, so the one case pagination cannot fix — a
// server cap SMALLER than our page size, which would make the first short page
// look like the last one — fails loudly instead of silently truncating.

export type RowPage<Row> = {
  data: Row[] | null;
  error: { message: string } | null;
  count?: number | null;
};

export type FetchAllRowsOptions = {
  /**
   * Rows per request. MUST stay at or below the server's `max-rows`, or every
   * page comes back short and the loop would stop after the first one. 500
   * leaves headroom under the default 1000.
   */
  pageSize?: number;
  /** Used in the error message only, e.g. "published seats". */
  label?: string;
};

/**
 * Read every row a query matches, one page at a time.
 *
 * `requestPage` receives an inclusive `[from, to]` range and must apply it to
 * the query (Supabase: `.range(from, to)`) along with `{ count: "exact" }` so
 * the total can be verified.
 */
export async function fetchAllRows<Row>(
  requestPage: (from: number, to: number) => PromiseLike<RowPage<Row>>,
  options: FetchAllRowsOptions = {}
): Promise<Row[]> {
  const pageSize = options.pageSize ?? 500;
  const label = options.label ?? "rows";

  if (pageSize < 1) throw new Error("fetchAllRows pageSize must be at least 1.");

  const rows: Row[] = [];
  let expectedTotal: number | null = null;

  for (let from = 0; ; from += pageSize) {
    const { data, error, count } = await requestPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);

    // PostgREST reports the unpaginated total on every page; take the first
    // one we are given and keep it as the target.
    if (expectedTotal === null && typeof count === "number") expectedTotal = count;

    const batch = data ?? [];
    rows.push(...batch);

    // A short page is the last page — either the data ran out, or the server
    // capped us below pageSize. The count assertion below tells those apart.
    if (batch.length < pageSize) break;
    if (expectedTotal !== null && rows.length >= expectedTotal) break;
  }

  if (expectedTotal !== null && rows.length !== expectedTotal) {
    throw new Error(
      `Loaded ${rows.length} of ${expectedTotal} ${label}. The database returned fewer rows than it reports, ` +
        `which usually means the API row limit is below the page size — lower fetchAllRows' pageSize or raise the limit. ` +
        `Refusing to render a partial map.`
    );
  }

  return rows;
}
