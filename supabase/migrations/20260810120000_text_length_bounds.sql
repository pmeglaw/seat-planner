-- S-01: length bounds on every user-writable text column.
--
-- lib/schemas.ts has been the ONLY bound on this text, and three write paths
-- reached these columns without calling it: updateSeatAction (trim-only), the
-- CSV import, and the snapshot-restore normalizers. All three now parse, but a
-- bound that exists in one layer only is the failure this finding describes —
-- the next write path added is one `git grep` away from skipping it again. This
-- is the backstop, the same shape as the admin gate: RLS does not trust
-- requireAdmin(), and these columns do not trust the parser.
--
-- LENGTH ONLY, deliberately. The type check and the control-character rule stay
-- in TypeScript because they need per-field nuance a constraint would flatten:
-- seat notes are typed into a textarea and quoted by the CSV export, so a
-- newline there is content, while a newline in a name or a zone can only be a
-- paste accident. Encoding that split in SQL buys nothing — no writer reaches
-- these tables except through the app.
--
-- The numbers mirror lib/schemas.ts (MAX_* exports) and are checked against it
-- by tests/text-length-constraints.test.mjs, which applies these migrations to
-- an in-process Postgres and probes each column at its bound and one past it.
-- Change one side and that test fails.
--
-- char_length(trim(...)) rather than char_length(...): the parsers trim before
-- they measure, so measuring the raw value here would reject padding the
-- TypeScript layer accepts. A null column yields null, which no CHECK treats as
-- a violation, so nullable columns need no explicit `is null` arm.
--
-- Production headroom at the time of writing: the longest stored values are
-- full_name 21, email 34, department_options.name 33, seats.zone 16,
-- seats.notes 22 — roughly 3.5x below the tightest bound here, so this applies
-- without touching a row.
--
-- Validated immediately rather than NOT VALID + a follow-up VALIDATE CONSTRAINT.
-- That pattern exists to keep a long scan from holding a lock on a large table;
-- these five tables hold 209 rows in total (seats 136, employees 31,
-- department_options 18, published_employees 16, zone_options 8), so the scan is
-- the cheap part and NOT VALID would still take the same ACCESS EXCLUSIVE lock
-- to add the constraint. Splitting it would only ship a window where the
-- constraint exists but guarantees nothing. Revisit if any of these tables ever
-- reaches a scale where the scan is measurable.

alter table public.seats
  add constraint seats_seat_key_length check (char_length(trim(seat_key)) <= 80),
  add constraint seats_label_length check (char_length(trim(label)) <= 60),
  add constraint seats_zone_length check (char_length(trim(zone)) <= 120),
  add constraint seats_department_length check (char_length(trim(department)) <= 120),
  add constraint seats_notes_length check (char_length(trim(notes)) <= 1000);

alter table public.employees
  add constraint employees_full_name_length check (char_length(trim(full_name)) <= 120),
  add constraint employees_position_length check (char_length(trim(position)) <= 120),
  add constraint employees_department_length check (char_length(trim(department)) <= 120),
  add constraint employees_phone_extension_length check (char_length(trim(phone_extension)) <= 20),
  add constraint employees_email_length check (char_length(trim(email)) <= 254),
  add constraint employees_avatar_url_length check (char_length(trim(avatar_url)) <= 2048);

-- The published snapshot mirrors employees and is written only by
-- publish_seat_map(). Bounding the source and not the copy would let a value
-- that cannot exist in the directory exist in what viewers read.
alter table public.published_employees
  add constraint published_employees_full_name_length check (char_length(trim(full_name)) <= 120),
  add constraint published_employees_position_length check (char_length(trim(position)) <= 120),
  add constraint published_employees_department_length check (char_length(trim(department)) <= 120),
  add constraint published_employees_phone_extension_length check (char_length(trim(phone_extension)) <= 20),
  add constraint published_employees_email_length check (char_length(trim(email)) <= 254),
  add constraint published_employees_avatar_url_length check (char_length(trim(avatar_url)) <= 2048);

alter table public.department_options
  add constraint department_options_name_length check (char_length(trim(name)) <= 120);

alter table public.zone_options
  add constraint zone_options_name_length check (char_length(trim(name)) <= 120);
