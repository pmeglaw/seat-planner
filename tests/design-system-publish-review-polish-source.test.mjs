import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readSource(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

function publishReviewSourceFrom(seatMapSource) {
  const publishReviewSource = seatMapSource.match(/\{publishReviewOpen && \([\s\S]*?<SeatInspector/)?.[0] ?? "";
  assert.ok(publishReviewSource, "Publish Review dialog should remain source-visible.");
  return publishReviewSource;
}

test("publish review polish uses shared status and focus primitives without migrating buttons", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const publishReviewSource = publishReviewSourceFrom(seatMapSource);

  const designSystemImport = seatMapSource.match(/^import \{\s*([^}]*)\s*\} from "@\/components\/ui\/design-system";/m);
  assert.ok(designSystemImport, "SeatMap should keep the scoped design-system import.");
  assert.match(designSystemImport[1], /\bStatusBadge\b/);
  assert.match(designSystemImport[1], /\bfocusRingClass\b/);
  assert.doesNotMatch(designSystemImport[1], /\bButton\b|\bIconButton\b|\bmarkerStateClassRecipes\b/);

  assert.match(seatMapSource, /const publishReadinessBadgeTone = publishSummary\.hasChanges \? "draft" : "published"/);
  assert.match(seatMapSource, /const publishReadinessBadgeLabel = publishSummary\.hasChanges \? "Ready" : "No changes"/);
  assert.match(publishReviewSource, /<StatusBadge tone=\{publishReadinessBadgeTone\}[\s\S]*\{publishReadinessBadgeLabel\}[\s\S]*<\/StatusBadge>/);
  assert.match(publishReviewSource, /<StatusBadge tone="danger"[\s\S]*>Error<\/StatusBadge>/);
  assert.match(publishReviewSource, /<StatusBadge tone="pending"[\s\S]*>Publishing<\/StatusBadge>/);
  assert.doesNotMatch(publishReviewSource, /inline-flex rounded-full px-2 py-0\.5 text-\[11px\] font-black uppercase tracking-wide ring-1/);

  assert.match(publishReviewSource, /aria-label="Close publish review"[\s\S]*focusRingClass/);
  assert.match(publishReviewSource, /Cancel[\s\S]*className=\{\["w-full", focusRingClass\]\.join\(" "\)\}/);
  assert.match(publishReviewSource, /onClick=\{confirmPublishDraftMap\}[\s\S]*!border-\[var\(--admin-primary-cta\)\] !bg-\[var\(--admin-primary-cta\)\] !text-white[\s\S]*focusRingClass/);
  assert.doesNotMatch(publishReviewSource, /components\/ui\/design-system";[\s\S]*\bButton\b|\bIconButton\b/);
});

test("publish review polish preserves trust copy and publish action boundaries", async () => {
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const actionSource = await readSource("../app/actions.ts");
  const viewerRouteSource = await readSource("../app/page.tsx");
  const managementRouteSource = await readSource("../app/admin/management/page.tsx");
  const publishReviewSource = publishReviewSourceFrom(seatMapSource);
  const confirmPublishFunction = seatMapSource.match(/function confirmPublishDraftMap\(\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  const publishAction = actionSource.match(/export async function publishSeatMapAction\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.ok(confirmPublishFunction, "confirmPublishDraftMap should remain source-visible.");
  assert.ok(publishAction, "publishSeatMapAction should remain source-visible.");

  assert.match(publishReviewSource, /Confirm the saved draft changes before they become visible in the read-only viewer/);
  assert.match(seatMapSource, /This review includes saved draft changes only/);
  assert.match(publishReviewSource, /Publishing copies the saved draft map to the read-only viewer/);
  assert.match(publishReviewSource, /Impact groups can overlap/);
  assert.match(publishReviewSource, /Use Total publish changes below as the unique publish-summary total/);
  assert.match(publishReviewSource, /No draft changes to publish/);
  assert.match(publishReviewSource, /Publish did not complete/);
  assert.match(publishReviewSource, /Retry publish/);
  assert.match(publishReviewSource, /Publishing reviewed draft changes/);
  assert.match(publishReviewSource, /disabled=\{pending \|\| !publishSummary\.hasChanges\}/);

  assert.match(publishReviewSource, /onClick=\{confirmPublishDraftMap\}/);
  assert.match(confirmPublishFunction, /await publishSeatMapAction\(\)/);
  assert.doesNotMatch(confirmPublishFunction, /supabase|\.from\("seats"\)|publish_seat_map/);

  assert.match(publishAction, /const supabase = await requireAdmin\(\)/);
  assert.match(publishAction, /\.rpc\("publish_seat_map"\)/);
  assert.doesNotMatch(viewerRouteSource, /components\/ui\/design-system|StatusBadge|focusRingClass|Map tools|Draft map/);
  assert.doesNotMatch(managementRouteSource, /components\/ui\/design-system|StatusBadge|focusRingClass|markerStateClassRecipes/);
});

test("publish review semantic colors use admin-scoped meaning tokens", async () => {
  const globalsSource = await readSource("../app/globals.css");
  const seatMapSource = await readSource("../components/seat-map/SeatMap.tsx");
  const publishReviewSource = publishReviewSourceFrom(seatMapSource);

  for (const token of [
    "--admin-publish-ready-bg",
    "--admin-publish-no-change-bg",
    "--admin-publish-viewer-impact-bg",
    "--admin-state-dirty-bg",
    "--admin-state-error-bg",
    "--admin-state-saving-bg",
    "--admin-state-danger-bg"
  ]) {
    assert.match(globalsSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(seatMapSource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(publishReviewSource, /!bg-\[var\(--admin-surface\)\]\/80 !text-\[var\(--admin-publish-ready-text\)\]/);
  assert.match(publishReviewSource, /!bg-\[var\(--admin-surface\)\]\/80 !text-\[var\(--admin-publish-no-change-text\)\]/);
  assert.match(publishReviewSource, /border-\[var\(--admin-publish-viewer-impact-border\)\] bg-\[var\(--admin-publish-viewer-impact-bg\)\]/);
  assert.match(publishReviewSource, /border-\[var\(--admin-state-error-border\)\] bg-\[var\(--admin-state-error-bg\)\]/);
  assert.match(publishReviewSource, /border-\[var\(--admin-state-saving-border\)\] bg-\[var\(--admin-state-saving-bg\)\]/);
  assert.match(publishReviewSource, /!border-\[var\(--admin-primary-cta\)\] !bg-\[var\(--admin-primary-cta\)\] !text-white/);
  assert.doesNotMatch(publishReviewSource, /#7E2F24|#6D4712|#244E50|#284C3B/);
  assert.doesNotMatch(publishReviewSource, /sp-color-state-danger|sp-color-state-draft|sp-color-state-info|sp-color-state-success/);
});
