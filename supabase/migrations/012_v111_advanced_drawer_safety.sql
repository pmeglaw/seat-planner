-- v1.1.1 Advanced Drawer polish + safety patch
-- CSV import targets seats by label, so labels must be unique per layer.

do $$
begin
  if exists (
    select 1
    from public.seats
    group by layer, lower(trim(label))
    having count(*) > 1
  ) then
    raise exception 'Cannot create seats_unique_label_per_layer: duplicate seat labels exist within a layer.';
  end if;
end
$$;

create unique index if not exists seats_unique_label_per_layer
on public.seats (layer, lower(trim(label)));
