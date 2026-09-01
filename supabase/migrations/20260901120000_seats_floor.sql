-- Multi-floor, step 1 of 4 (2026-09-01): every seat belongs to a floor.
--
-- The firm occupies two floors and the plan only ever drew the 3rd; until now
-- "works on the 2nd floor" was INFERRED from a person having no seat. This
-- column makes the floor a fact on the row. Owner rulings this encodes:
--   * text + CHECK, not an enum and not a floors table — a future floor is a
--     CHECK edit plus a registry entry in lib/floors.ts (lib/floorIds.ts
--     mirrors this list; tests/floor-ids.test.mjs pins the two together);
--   * default '3' — every existing row IS Floor 3, so the add is a metadata-
--     only backfill (non-volatile default, no table rewrite);
--   * seat labels stay building-unique (distinct prefixes per floor), so the
--     seats_unique_label_per_layer index keeps its (layer, label) shape and
--     ?seat= deep links, CSV rows and publish matching are untouched;
--   * publish is whole-building: one draft, one publish, one fence.
-- No index (the table holds ~140 rows), no RLS change (row policies are
-- layer/admin based), no table-grant change (20260727190000 grants the table).
--
-- The three whole-row RPCs are re-created in the following files so the
-- column travels with each copy: 20260901120100 (publish), 20260901120200
-- (snapshot restore), 20260901120300 (reset to published).

alter table public.seats
  add column if not exists floor text not null default '3'
  constraint seats_floor_known check (floor in ('2', '3'));
