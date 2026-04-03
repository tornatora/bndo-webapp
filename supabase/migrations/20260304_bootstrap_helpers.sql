create or replace function public.is_ops_user()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_role_column boolean;
  role_match boolean := false;
begin
  if auth.role() = 'service_role' then
    return true;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  ) into has_role_column;

  if has_role_column then
    execute $sql$
      select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.role::text in ('ops_admin', 'consultant', 'admin')
      )
    $sql$ into role_match;
  end if;

  return role_match;
end;
$$;

create or replace function public.is_company_member(target_company uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  has_company_column boolean;
  member_match boolean := false;
begin
  if auth.role() = 'service_role' then
    return true;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'company_id'
  ) into has_company_column;

  if has_company_column then
    execute $sql$
      select exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.company_id = $1
      )
    $sql$ into member_match using target_company;
  end if;

  return member_match;
end;
$$;

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
