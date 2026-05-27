-- v1.2.7 Add optional employee phone extensions.

alter table if exists public.employees
  add column if not exists phone_extension text;
