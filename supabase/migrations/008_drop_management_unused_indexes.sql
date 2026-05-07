-- The planner loads seats/employees by layer and filters departments/zones on
-- the client, so these management indexes add advisor noise without helping
-- the current query path.

drop index if exists public.employees_department_idx;
drop index if exists public.seats_zone_idx;
