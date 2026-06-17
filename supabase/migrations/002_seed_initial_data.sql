-- Seed data generated from the approved v15 HTML prototype.

do $$
begin
  if not exists (select 1 from public.employees) then
insert into public.employees (id, full_name, position, department, avatar_url, active)
values
  ('00000000-0000-0000-0000-000000000001', 'Alex Shabazian', null, 'Intake', null, true),
  ('00000000-0000-0000-0000-000000000002', 'Maria Lopez', null, 'Case Management', null, true),
  ('00000000-0000-0000-0000-000000000003', 'David Kim', null, 'Litigation', null, true),
  ('00000000-0000-0000-0000-000000000004', 'Nina Patel', null, 'Accounting', null, true),
  ('00000000-0000-0000-0000-000000000005', 'Samantha Reed', null, 'Pre-Litigation', null, true),
  ('00000000-0000-0000-0000-000000000006', 'Daniel Garcia', null, 'IT', null, true),
  ('00000000-0000-0000-0000-000000000007', 'Rachel Nguyen', null, 'Records', null, true),
  ('00000000-0000-0000-0000-000000000008', 'Anthony Cruz', null, 'Litigation', null, true),
  ('00000000-0000-0000-0000-000000000009', 'Jessica Moore', null, 'Case Management', null, true),
  ('00000000-0000-0000-0000-000000000010', 'Victor Chen', null, 'Intake', null, true),
  ('00000000-0000-0000-0000-000000000011', 'Lauren Smith', null, 'Pre-Litigation', null, true),
  ('00000000-0000-0000-0000-000000000012', 'Robert Allen', null, 'Records', null, true)
on conflict (id) do nothing;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from public.seats) then
insert into public.seats (seat_key, label, x, y, status, layer, employee_id, department, notes)
values
  ('N01', 'N01', 0.288917, 0.066468, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'North Pod', ''),
  ('N02', 'N02', 0.345291, 0.066468, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'North Pod', ''),
  ('N03', 'N03', 0.406150, 0.066468, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'North Pod', ''),
  ('N04', 'N04', 0.461883, 0.066468, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'North Pod', ''),
  ('N05', 'N05', 0.288917, 0.137897, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'North Pod', ''),
  ('N06', 'N06', 0.345291, 0.137897, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'North Pod', ''),
  ('N07', 'N07', 0.406150, 0.137897, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'North Pod', ''),
  ('N08', 'N08', 0.461883, 0.137897, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'North Pod', ''),
  ('N09', 'N09', 0.288917, 0.210317, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'North Pod', ''),
  ('N10', 'N10', 0.345291, 0.210317, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'North Pod', ''),
  ('N11', 'N11', 0.406150, 0.210317, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'North Pod', ''),
  ('N12', 'N12', 0.461883, 0.210317, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'North Pod', ''),
  ('NE01', 'NE01', 0.771941, 0.067460, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Northeast Pod', ''),
  ('NE02', 'NE02', 0.832159, 0.067460, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Northeast Pod', ''),
  ('NE03', 'NE03', 0.875721, 0.067460, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Northeast Pod', ''),
  ('NE04', 'NE04', 0.934017, 0.067460, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Northeast Pod', ''),
  ('NE05', 'NE05', 0.770019, 0.142857, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Northeast Pod', ''),
  ('NE06', 'NE06', 0.831518, 0.142857, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Northeast Pod', ''),
  ('NE07', 'NE07', 0.875721, 0.144841, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Northeast Pod', ''),
  ('NE08', 'NE08', 0.934017, 0.143849, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Northeast Pod', ''),
  ('W01', 'W01', 0.080077, 0.382937, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'West Pod', ''),
  ('W02', 'W02', 0.115951, 0.382937, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'West Pod', ''),
  ('W03', 'W03', 0.179372, 0.382937, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'West Pod', ''),
  ('W04', 'W04', 0.080077, 0.453373, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'West Pod', ''),
  ('W05', 'W05', 0.115951, 0.453373, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'West Pod', ''),
  ('W06', 'W06', 0.179372, 0.453373, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'West Pod', ''),
  ('W07', 'W07', 0.067905, 0.549603, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'West Pod', ''),
  ('W08', 'W08', 0.125561, 0.549603, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'West Pod', ''),
  ('W09', 'W09', 0.183216, 0.549603, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'West Pod', ''),
  ('W10', 'W10', 0.067905, 0.722222, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'West Pod', ''),
  ('W11', 'W11', 0.122357, 0.722222, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'West Pod', ''),
  ('W12', 'W12', 0.183857, 0.722222, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'West Pod', ''),
  ('CW01', 'CW01', 0.299167, 0.375992, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center West', ''),
  ('CW02', 'CW02', 0.345291, 0.375992, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center West', ''),
  ('CW03', 'CW03', 0.298527, 0.438492, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center West', ''),
  ('CW04', 'CW04', 0.345291, 0.438492, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center West', ''),
  ('CW05', 'CW05', 0.305573, 0.548611, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center West', ''),
  ('CW06', 'CW06', 0.337604, 0.548611, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center West', ''),
  ('CW07', 'CW07', 0.305573, 0.710317, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center West', ''),
  ('CW08', 'CW08', 0.338885, 0.710317, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center West', ''),
  ('C01', 'C01', 0.426650, 0.536706, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center Desks', ''),
  ('C02', 'C02', 0.486227, 0.536706, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center Desks', ''),
  ('C03', 'C03', 0.528507, 0.536706, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center Desks', ''),
  ('C04', 'C04', 0.587444, 0.536706, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center Desks', ''),
  ('C05', 'C05', 0.427290, 0.682540, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center Desks', ''),
  ('C06', 'C06', 0.486227, 0.682540, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center Desks', ''),
  ('C07', 'C07', 0.528507, 0.682540, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center Desks', ''),
  ('C08', 'C08', 0.587444, 0.682540, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Center Desks', ''),
  ('E01', 'E01', 0.588085, 0.382937, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'East Pod', ''),
  ('E02', 'E02', 0.671365, 0.382937, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'East Pod', ''),
  ('E03', 'E03', 0.707239, 0.382937, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'East Pod', ''),
  ('E04', 'E04', 0.772582, 0.382937, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'East Pod', ''),
  ('E05', 'E05', 0.588085, 0.452381, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'East Pod', ''),
  ('E06', 'E06', 0.671365, 0.452381, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'East Pod', ''),
  ('E07', 'E07', 0.707239, 0.452381, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'East Pod', ''),
  ('E08', 'E08', 0.772582, 0.452381, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'East Pod', ''),
  ('SE01', 'SE01', 0.885330, 0.548611, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Southeast Office', ''),
  ('SE02', 'SE02', 0.929532, 0.548611, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Southeast Office', ''),
  ('SE03', 'SE03', 0.903267, 0.629960, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Southeast Office', ''),
  ('SE04', 'SE04', 0.939782, 0.612103, 'available'::public.seat_status, 'draft'::public.seat_layer, null, 'Southeast Office', '')
on conflict (layer, seat_key) do nothing;


insert into public.seats (
  seat_key,
  label,
  x,
  y,
  status,
  layer,
  employee_id,
  department,
  notes
)
select
  seat_key,
  label,
  x,
  y,
  status,
  'published'::public.seat_layer,
  employee_id,
  department,
  notes
from public.seats
where layer = 'draft'
on conflict (layer, seat_key) do nothing;
  end if;
end
$$;
