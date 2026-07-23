-- South Offices zone (owner request 2026-07-23): the bottom-band office rooms
-- gained a SEAT_ZONE_RECTS entry in lib/seatZones.ts so Add seat works there;
-- this row surfaces the zone in Management and the map filters. Custom seats
-- placed there label as S01, S02, … via inferSeatPrefixFromZone.
insert into public.zone_options (name, active)
values ('South Offices', true)
on conflict (name) do update set active = true;
