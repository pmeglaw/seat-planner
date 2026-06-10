-- REFERENCE ONLY / DO NOT APPLY TO PRODUCTION WITHOUT FINAL UI APPROVAL.
-- This file shows the approximate coordinate migration that corresponds to
-- the preview transform x' = 0.925*x + 0.0279, y' = 0.979*y + 0.0262.
--
-- This preview branch keeps the transform out of app code and out of
-- migrations, so Supabase data remains unchanged while UI/UX is reviewed.
--
-- If the final decision is to make the v2 image permanent by migrating data,
-- this script should be reviewed, backed up, tested on a copy, and adjusted
-- from the final approved alignment before being applied.

begin;

with proposed(label, x, y) as (
  values
    ('C01', 0.416922::numeric, 0.550664::numeric),
    ('C02', 0.477660::numeric, 0.551635::numeric),
    ('C03', 0.516769::numeric, 0.551635::numeric),
    ('C04', 0.571286::numeric, 0.551635::numeric),
    ('C05', 0.423143::numeric, 0.694407::numeric),
    ('C06', 0.477660::numeric, 0.694407::numeric),
    ('C07', 0.516769::numeric, 0.694407::numeric),
    ('C08', 0.571286::numeric, 0.694407::numeric),
    ('CW01', 0.304629::numeric, 0.394296::numeric),
    ('CW02', 0.347294::numeric, 0.394296::numeric),
    ('CW03', 0.304037::numeric, 0.455484::numeric),
    ('CW04', 0.347294::numeric, 0.455484::numeric),
    ('CW05', 0.310555::numeric, 0.563290::numeric),
    ('CW06', 0.340184::numeric, 0.563290::numeric),
    ('CW07', 0.310555::numeric, 0.721600::numeric),
    ('CW08', 0.341369::numeric, 0.721600::numeric),
    ('E01', 0.571582::numeric, 0.402066::numeric),
    ('E02', 0.648913::numeric, 0.401095::numeric),
    ('E03', 0.682096::numeric, 0.401095::numeric),
    ('E04', 0.742538::numeric, 0.401095::numeric),
    ('E05', 0.571879::numeric, 0.469081::numeric),
    ('E06', 0.648913::numeric, 0.469081::numeric),
    ('E07', 0.682096::numeric, 0.469081::numeric),
    ('E08', 0.742538::numeric, 0.469081::numeric),
    ('N01', 0.295148::numeric, 0.091272::numeric),
    ('N02', 0.347294::numeric, 0.091272::numeric),
    ('N03', 0.403589::numeric, 0.091272::numeric),
    ('N04', 0.455142::numeric, 0.091272::numeric),
    ('N05', 0.295148::numeric, 0.161201::numeric),
    ('N06', 0.347294::numeric, 0.161201::numeric),
    ('N07', 0.403589::numeric, 0.161201::numeric),
    ('N08', 0.455142::numeric, 0.161201::numeric),
    ('N09', 0.295148::numeric, 0.232100::numeric),
    ('N10', 0.347294::numeric, 0.232100::numeric),
    ('N11', 0.403589::numeric, 0.232100::numeric),
    ('N12', 0.455142::numeric, 0.232100::numeric),
    ('NE01', 0.741945::numeric, 0.092243::numeric),
    ('NE02', 0.797647::numeric, 0.092243::numeric),
    ('NE03', 0.837942::numeric, 0.092243::numeric),
    ('NE04', 0.891866::numeric, 0.092243::numeric),
    ('NE05', 0.740168::numeric, 0.166057::numeric),
    ('NE06', 0.797054::numeric, 0.166057::numeric),
    ('NE07', 0.837942::numeric, 0.167999::numeric),
    ('NE08', 0.891866::numeric, 0.167028::numeric),
    ('SE01', 0.846830::numeric, 0.563290::numeric),
    ('SE02', 0.887717::numeric, 0.563290::numeric),
    ('SE03', 0.863422::numeric, 0.642931::numeric),
    ('SE04', 0.897198::numeric, 0.625449::numeric),
    ('W01', 0.101971::numeric, 0.401095::numeric),
    ('W02', 0.135155::numeric, 0.401095::numeric),
    ('W03', 0.193819::numeric, 0.401095::numeric),
    ('W04', 0.101971::numeric, 0.470052::numeric),
    ('W05', 0.135155::numeric, 0.470052::numeric),
    ('W06', 0.193819::numeric, 0.470052::numeric),
    ('W07', 0.090712::numeric, 0.564261::numeric),
    ('W08', 0.144044::numeric, 0.564261::numeric),
    ('W09', 0.197375::numeric, 0.564261::numeric),
    ('W10', 0.090712::numeric, 0.733255::numeric),
    ('W11', 0.141080::numeric, 0.733255::numeric),
    ('W12', 0.197968::numeric, 0.733255::numeric)
)
update public.seats s
set x = proposed.x,
    y = proposed.y
from proposed
where s.label = proposed.label
  and s.layer in ('draft', 'published');

-- Safety check only. Review results before commit.
select layer, count(*) as updated_rows
from public.seats
where label in (select label from proposed)
group by layer
order by layer;

rollback;
