-- =====================================================================
-- Zerbini Helpdesk — estrutura inicial
-- Projeto Supabase compartilhado com a Gestão de Ativos (gestao-ativos-ti).
-- Todas as tabelas do helpdesk usam o prefixo hd_.
-- Atendentes = membros da Gestão de Ativos com papel admin ou editor.
-- Colaboradores = qualquer e-mail @grupozerbini.com.br.
-- =====================================================================

-- ---------- Funções auxiliares ----------
create or replace function public.hd_email() returns text
language sql stable set search_path = public as
$$ select lower(coalesce(auth.jwt()->>'email','')) $$;

create or replace function public.hd_eh_agente() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.papel_atual() in ('admin','editor'), false) $$;

create or replace function public.hd_pode_abrir() returns boolean
language sql stable security definer set search_path = public as
$$ select public.hd_email() like '%@grupozerbini.com.br' or public.hd_eh_agente() $$;

create or replace function public.hd_rotulo_status(s text) returns text
language sql immutable as
$$ select case s when 'novo' then 'Novo' when 'aberto' then 'Aberto' when 'em_espera' then 'Em espera'
  when 'pausado' then 'Pausado' when 'resolvido' then 'Resolvido' when 'cancelado' then 'Cancelado' else s end $$;

create or replace function public.hd_rotulo_prioridade(s text) returns text
language sql immutable as
$$ select case s when 'baixa' then 'Baixa' when 'media' then 'Média' when 'alta' then 'Alta' when 'urgente' then 'Urgente' else s end $$;

-- ---------- Tabelas ----------
create table public.hd_categorias (
  id bigint generated always as identity primary key,
  nome text not null unique check (length(btrim(nome)) between 2 and 80),
  sla_horas int check (sla_horas is null or sla_horas > 0),
  ativa boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

create table public.hd_chamados (
  id bigint generated always as identity primary key,
  categoria_id bigint references public.hd_categorias(id) on delete set null,
  titulo text not null check (length(btrim(titulo)) between 3 and 200),
  descricao text not null check (length(btrim(descricao)) between 3 and 10000),
  solicitante_email text not null,
  solicitante_nome text not null default '',
  setor text not null default '',
  anydesk text not null default '',
  ativo_id text references public.ativos(id) on delete set null,
  status text not null default 'novo'
    check (status in ('novo','aberto','em_espera','pausado','resolvido','cancelado')),
  prioridade text not null default 'media'
    check (prioridade in ('baixa','media','alta','urgente')),
  atribuido_email text,
  prazo_sla timestamptz,
  lido_agente boolean not null default false,
  lido_solicitante boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvido_em timestamptz
);
create index hd_chamados_solicitante_idx on public.hd_chamados (solicitante_email);
create index hd_chamados_status_idx on public.hd_chamados (status);
create index hd_chamados_atribuido_idx on public.hd_chamados (atribuido_email);
create index hd_chamados_categoria_idx on public.hd_chamados (categoria_id);
create index hd_chamados_ativo_idx on public.hd_chamados (ativo_id);

create table public.hd_mensagens (
  id bigint generated always as identity primary key,
  chamado_id bigint not null references public.hd_chamados(id) on delete cascade,
  tipo text not null default 'mensagem' check (tipo in ('mensagem','evento')),
  interna boolean not null default false,
  autor_email text not null default '',
  autor_nome text not null default '',
  corpo text not null check (length(corpo) between 1 and 10000),
  criado_em timestamptz not null default now()
);
create index hd_mensagens_chamado_idx on public.hd_mensagens (chamado_id);

create table public.hd_anexos (
  id bigint generated always as identity primary key,
  chamado_id bigint not null references public.hd_chamados(id) on delete cascade,
  mensagem_id bigint references public.hd_mensagens(id) on delete set null,
  caminho text not null unique,
  nome text not null,
  tamanho bigint not null default 0 check (tamanho <= 10485760),
  tipo_mime text not null default '',
  enviado_por text not null default '',
  criado_em timestamptz not null default now()
);
create index hd_anexos_chamado_idx on public.hd_anexos (chamado_id);
create index hd_anexos_mensagem_idx on public.hd_anexos (mensagem_id);

-- ---------- Acesso a um chamado ----------
create or replace function public.hd_pode_ver_chamado(p_id bigint) returns boolean
language sql stable security definer set search_path = public as
$$ select public.hd_eh_agente()
   or exists (select 1 from public.hd_chamados where id = p_id and solicitante_email = public.hd_email()) $$;

create or replace function public.hd_pode_ver_caminho(p_nome text) returns boolean
language sql stable security definer set search_path = public as
$$ select case when split_part(p_nome,'/',1) ~ '^[0-9]+$'
   then public.hd_pode_ver_chamado(split_part(p_nome,'/',1)::bigint) else false end $$;

-- ---------- Regras automáticas: chamados ----------
create or replace function public.hd_chamado_antes_inserir() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_agente boolean := public.hd_eh_agente(); v_sla int;
begin
  if not v_agente or coalesce(btrim(new.solicitante_email),'') = '' then
    new.solicitante_email := public.hd_email();
  end if;
  new.solicitante_email := lower(btrim(new.solicitante_email));
  new.titulo := btrim(new.titulo);
  new.descricao := btrim(new.descricao);
  if not v_agente or new.status in ('resolvido','cancelado') then new.status := 'novo'; end if;
  if not v_agente then new.prioridade := 'media'; new.atribuido_email := null; end if;
  new.lido_agente := v_agente;
  new.lido_solicitante := true;
  new.criado_em := now(); new.atualizado_em := now(); new.resolvido_em := null;
  if new.prazo_sla is null or not v_agente then
    select sla_horas into v_sla from public.hd_categorias where id = new.categoria_id;
    new.prazo_sla := case when v_sla is not null then now() + make_interval(hours => v_sla) end;
  end if;
  -- colaborador só pode vincular equipamento que está com ele
  if new.ativo_id is not null and not v_agente and not exists (
      select 1 from public.ativos where id = new.ativo_id
        and lower(usuario) = split_part(new.solicitante_email,'@',1)) then
    new.ativo_id := null;
  end if;
  return new;
end $$;
create trigger hd_chamado_antes_inserir before insert on public.hd_chamados
  for each row execute function public.hd_chamado_antes_inserir();

create or replace function public.hd_chamado_antes_atualizar() returns trigger
language plpgsql security definer set search_path = public as $$
declare ignorar text[] := array['lido_agente','lido_solicitante','atualizado_em'];
begin
  new.id := old.id; new.criado_em := old.criado_em; new.solicitante_email := old.solicitante_email;
  if new.status is distinct from old.status then
    if new.status = 'resolvido' then new.resolvido_em := now();
    elsif old.status = 'resolvido' then new.resolvido_em := null; end if;
    -- colaborador precisa ver a mudança
    if public.hd_email() <> old.solicitante_email then new.lido_solicitante := false; end if;
  end if;
  if (to_jsonb(new) - ignorar) is distinct from (to_jsonb(old) - ignorar) then
    new.atualizado_em := now();
  end if;
  return new;
end $$;
create trigger hd_chamado_antes_atualizar before update on public.hd_chamados
  for each row execute function public.hd_chamado_antes_atualizar();

create or replace function public.hd_chamado_registrar_eventos() returns trigger
language plpgsql security definer set search_path = public as $$
declare quem text := public.hd_email(); nome_cat text;
begin
  if new.status is distinct from old.status then
    insert into public.hd_mensagens (chamado_id, tipo, interna, autor_email, corpo)
    values (new.id, 'evento', false, quem,
      'Status alterado de ' || public.hd_rotulo_status(old.status) || ' para ' || public.hd_rotulo_status(new.status));
  end if;
  if new.atribuido_email is distinct from old.atribuido_email then
    insert into public.hd_mensagens (chamado_id, tipo, interna, autor_email, corpo)
    values (new.id, 'evento', false, quem,
      case when new.atribuido_email is null then 'Atribuição removida'
           else 'Atribuído a ' || new.atribuido_email end);
  end if;
  if new.prioridade is distinct from old.prioridade then
    insert into public.hd_mensagens (chamado_id, tipo, interna, autor_email, corpo)
    values (new.id, 'evento', true, quem, 'Prioridade alterada para ' || public.hd_rotulo_prioridade(new.prioridade));
  end if;
  if new.categoria_id is distinct from old.categoria_id then
    select nome into nome_cat from public.hd_categorias where id = new.categoria_id;
    insert into public.hd_mensagens (chamado_id, tipo, interna, autor_email, corpo)
    values (new.id, 'evento', false, quem, 'Categoria alterada para ' || coalesce(nome_cat,'(sem categoria)'));
  end if;
  return null;
end $$;
create trigger hd_chamado_registrar_eventos after update on public.hd_chamados
  for each row execute function public.hd_chamado_registrar_eventos();

-- ---------- Regras automáticas: mensagens ----------
create or replace function public.hd_mensagem_antes_inserir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'evento' then return new; end if;   -- eventos vêm só dos gatilhos acima
  new.autor_email := public.hd_email();
  new.corpo := btrim(new.corpo);
  new.criado_em := now();
  if not public.hd_eh_agente() then new.interna := false; end if;
  return new;
end $$;
create trigger hd_mensagem_antes_inserir before insert on public.hd_mensagens
  for each row execute function public.hd_mensagem_antes_inserir();

create or replace function public.hd_mensagem_depois_inserir() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.hd_chamados;
begin
  if new.tipo <> 'mensagem' then return null; end if;
  select * into c from public.hd_chamados where id = new.chamado_id;
  if new.autor_email = c.solicitante_email then
    -- resposta do colaborador: volta para a fila da TI
    update public.hd_chamados set lido_agente = false, atualizado_em = now(),
      status = case when c.status in ('em_espera','resolvido') then 'aberto' else c.status end
    where id = c.id;
  elsif not new.interna then
    -- resposta da TI para o colaborador
    update public.hd_chamados set lido_solicitante = false, lido_agente = true, atualizado_em = now(),
      status = case when c.status = 'novo' then 'aberto' else c.status end
    where id = c.id;
  else
    update public.hd_chamados set atualizado_em = now() where id = c.id;
  end if;
  return null;
end $$;
create trigger hd_mensagem_depois_inserir after insert on public.hd_mensagens
  for each row execute function public.hd_mensagem_depois_inserir();

create or replace function public.hd_anexo_antes_inserir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.enviado_por := public.hd_email();
  new.criado_em := now();
  if split_part(new.caminho,'/',1) <> new.chamado_id::text then
    raise exception 'Caminho do anexo inválido';
  end if;
  return new;
end $$;
create trigger hd_anexo_antes_inserir before insert on public.hd_anexos
  for each row execute function public.hd_anexo_antes_inserir();

-- ---------- Funções chamadas pelo app ----------
-- Dados do colaborador logado (nome/setor vêm do cadastro de usuários da Gestão de Ativos)
create or replace function public.hd_meu_perfil() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'email', public.hd_email(),
    'login', split_part(public.hd_email(),'@',1),
    'nome', coalesce((select nullif(nome,'') from public.usuarios
                      where lower(login) = split_part(public.hd_email(),'@',1) limit 1), ''),
    'setor', coalesce((select nullif(setor,'') from public.usuarios
                       where lower(login) = split_part(public.hd_email(),'@',1) limit 1), ''),
    'anydesk', coalesce((select anydesk from public.hd_chamados
                         where solicitante_email = public.hd_email() and anydesk <> ''
                         order by id desc limit 1), ''),
    'eh_agente', public.hd_eh_agente(),
    'pode_abrir', public.hd_pode_abrir(),
    'papel', public.papel_atual()
  ) $$;

-- Equipamentos que estão com o colaborador logado
create or replace function public.hd_meus_ativos()
returns table (id text, tipo text, dispositivo text, modelo text)
language sql stable security definer set search_path = public as $$
  select a.id, a.tipo, a.dispositivo, coalesce(a.modelo,'') from public.ativos a
  where public.hd_pode_abrir() and lower(a.usuario) = split_part(public.hd_email(),'@',1)
  order by a.dispositivo $$;

-- Marca o chamado como lido por quem está vendo
create or replace function public.hd_marcar_lido(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.hd_eh_agente() then
    update public.hd_chamados set lido_agente = true where id = p_id and not lido_agente;
  end if;
  update public.hd_chamados set lido_solicitante = true
    where id = p_id and solicitante_email = public.hd_email() and not lido_solicitante;
end $$;

-- Colaborador cancela o próprio chamado enquanto ninguém começou a atender
create or replace function public.hd_cancelar_meu_chamado(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.hd_chamados set status = 'cancelado'
   where id = p_id and solicitante_email = public.hd_email() and status = 'novo';
  if not found then raise exception 'Só é possível cancelar chamados que ainda não foram atendidos'; end if;
end $$;

-- ---------- Segurança (RLS) ----------
alter table public.hd_categorias enable row level security;
alter table public.hd_chamados   enable row level security;
alter table public.hd_mensagens  enable row level security;
alter table public.hd_anexos     enable row level security;

create policy hd_cat_ler on public.hd_categorias for select to authenticated using (public.hd_pode_abrir());
create policy hd_cat_gerir on public.hd_categorias for all to authenticated
  using (public.hd_eh_agente()) with check (public.hd_eh_agente());

create policy hd_ch_ler on public.hd_chamados for select to authenticated
  using (public.hd_eh_agente() or solicitante_email = public.hd_email());
create policy hd_ch_criar on public.hd_chamados for insert to authenticated
  with check (public.hd_pode_abrir());
create policy hd_ch_atualizar on public.hd_chamados for update to authenticated
  using (public.hd_eh_agente()) with check (public.hd_eh_agente());
create policy hd_ch_excluir on public.hd_chamados for delete to authenticated
  using (public.papel_atual() = 'admin');

create policy hd_msg_ler on public.hd_mensagens for select to authenticated
  using (public.hd_eh_agente() or (not interna and public.hd_pode_ver_chamado(chamado_id)));
create policy hd_msg_criar on public.hd_mensagens for insert to authenticated
  with check (tipo = 'mensagem' and public.hd_pode_ver_chamado(chamado_id));

create policy hd_anx_ler on public.hd_anexos for select to authenticated
  using (public.hd_eh_agente() or (public.hd_pode_ver_chamado(chamado_id) and not exists (
    select 1 from public.hd_mensagens m where m.id = mensagem_id and m.interna)));
create policy hd_anx_criar on public.hd_anexos for insert to authenticated
  with check (public.hd_pode_ver_chamado(chamado_id));
create policy hd_anx_excluir on public.hd_anexos for delete to authenticated
  using (public.hd_eh_agente());

-- ---------- Arquivos (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('helpdesk', 'helpdesk', false, 10485760)
on conflict (id) do nothing;

create policy hd_arq_ler on storage.objects for select to authenticated
  using (bucket_id = 'helpdesk' and public.hd_pode_ver_caminho(name));
create policy hd_arq_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'helpdesk' and public.hd_pode_ver_caminho(name));
create policy hd_arq_excluir on storage.objects for delete to authenticated
  using (bucket_id = 'helpdesk' and public.hd_eh_agente());

-- ---------- Atualização em tempo real ----------
alter publication supabase_realtime add table public.hd_chamados, public.hd_mensagens;

-- ---------- Categorias iniciais ----------
insert into public.hd_categorias (nome, ordem) values
  ('Manutenção de Equipamento', 1), ('Troca de Aparelho', 2), ('Reset de Senha', 3),
  ('Análise', 4), ('Criação de Usuário', 5), ('Integração', 6), ('Nota Fiscal', 7),
  ('Anymarket', 8), ('Master', 9), ('Integração Marketplace', 10), ('Licença Microsoft', 11),
  ('E-mail', 12), ('Rede', 13), ('Solicitação de Troca', 14), ('Impressora', 15),
  ('Integração de NF', 16), ('Acessos Players', 17), ('Desenvolvimento', 18), ('Outros', 99);
