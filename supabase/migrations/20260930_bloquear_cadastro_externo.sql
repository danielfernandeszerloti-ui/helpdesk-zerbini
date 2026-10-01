-- Só permite criar contas com e-mail @grupozerbini.com.br
-- (ou e-mails já cadastrados como membros da Gestão de Ativos).
-- Vale para todo o projeto Supabase, inclusive a Gestão de Ativos.
create or replace function public.bloquear_cadastro_externo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(coalesce(new.email,'')) like '%@grupozerbini.com.br'
     or exists (select 1 from public.membros where lower(email) = lower(coalesce(new.email,''))) then
    return new;
  end if;
  raise exception 'Acesso permitido apenas para e-mails @grupozerbini.com.br';
end $$;

create trigger bloquear_cadastro_externo before insert on auth.users
  for each row execute function public.bloquear_cadastro_externo();
