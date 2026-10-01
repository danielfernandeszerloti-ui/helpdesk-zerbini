-- =====================================================================
-- Kanban de desenvolvimento + equipe própria do helpdesk
-- * hd_equipe: quem é da equipe do helpdesk (admin | ti | dev),
--   independente da tabela membros da Gestão de Ativos.
-- * Categorias marcadas com kanban=true vão para o quadro de desenvolvimento.
-- * Dev vê e atende só os chamados dessas categorias.
-- =====================================================================

-- ---------- Equipe ----------
create table public.hd_equipe (
  email text primary key check (email = lower(email)),
  papel text not null check (papel in ('admin','ti','dev')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
insert into public.hd_equipe (email, papel) values
  ('daniel.zerloti@grupozerbini.com.br', 'admin'),
  ('danielfernandeszerloti@gmail.com', 'admin'),
  ('amanda.alencar@grupozerbini.com.br', 'admin'),
  ('lucas.santos@grupozerbini.com.br', 'dev');

create or replace function public.hd_papel() returns text
language sql stable security definer set search_path = public as
$$ select papel from public.hd_equipe where email = public.hd_email() and ativo $$;

create or replace function public.hd_eh_agente() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.hd_papel() in ('admin','ti'), false) $$;

create or replace function public.hd_eh_dev() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(public.hd_papel() = 'dev', false) $$;

-- A partir daqui o helpdesk usa só hd_equipe (a tabela membros continua valendo só para a Gestão de Ativos).

-- ---------- Categorias / etapas ----------
alter table public.hd_categorias add column kanban boolean not null default false;
update public.hd_categorias set kanban = true where nome = 'Desenvolvimento';

create table public.hd_etapas (
  id bigint generated always as identity primary key,
  nome text not null unique check (length(btrim(nome)) between 2 and 40),
  ordem int not null default 0,
  cor text not null default 'cinza',
  finaliza boolean not null default false,
  ativa boolean not null default true
);
insert into public.hd_etapas (nome, ordem, cor, finaliza) values
  ('Backlog', 1, 'cinza', false),
  ('Em análise', 2, 'azul', false),
  ('Em desenvolvimento', 3, 'roxo', false),
  ('Em teste / homologação', 4, 'turquesa', false),
  ('Concluído', 5, 'verde', true);

create or replace function public.hd_etapa_inicial() returns bigint
language sql stable security definer set search_path = public as
$$ select id from public.hd_etapas where ativa and not finaliza order by ordem, id limit 1 $$;
create or replace function public.hd_etapa_final() returns bigint
language sql stable security definer set search_path = public as
$$ select id from public.hd_etapas where finaliza order by ordem desc, id limit 1 $$;

alter table public.hd_chamados
  add column etapa_id bigint references public.hd_etapas(id) on delete set null,
  add column kanban_ordem double precision not null default 0,
  add column previsao_entrega date;
create index hd_chamados_etapa_idx on public.hd_chamados (etapa_id);

create table public.hd_tarefas (
  id bigint generated always as identity primary key,
  chamado_id bigint not null references public.hd_chamados(id) on delete cascade,
  texto text not null check (length(btrim(texto)) between 1 and 300),
  feita boolean not null default false,
  ordem double precision not null default 0,
  criado_por text not null default '',
  criado_em timestamptz not null default now(),
  feita_em timestamptz
);
create index hd_tarefas_chamado_idx on public.hd_tarefas (chamado_id);

create table public.hd_etapas_hist (
  id bigint generated always as identity primary key,
  chamado_id bigint not null references public.hd_chamados(id) on delete cascade,
  etapa_id bigint references public.hd_etapas(id) on delete cascade,
  entrou_em timestamptz not null default now(),
  saiu_em timestamptz,
  por text not null default ''
);
create index hd_etapas_hist_chamado_idx on public.hd_etapas_hist (chamado_id);
create index hd_etapas_hist_etapa_idx on public.hd_etapas_hist (etapa_id);

-- ---------- Acesso ----------
create or replace function public.hd_cat_kanban(p_cat bigint) returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select kanban from public.hd_categorias where id = p_cat), false) $$;

-- Quem atende o chamado: TI sempre; Dev só nos chamados de categoria kanban
create or replace function public.hd_atende(p_id bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select public.hd_eh_agente() or (public.hd_eh_dev() and exists (
    select 1 from public.hd_chamados c join public.hd_categorias k on k.id = c.categoria_id
    where c.id = p_id and k.kanban))
$$;

create or replace function public.hd_pode_ver_chamado(p_id bigint) returns boolean
language sql stable security definer set search_path = public as
$$ select public.hd_atende(p_id)
   or exists (select 1 from public.hd_chamados where id = p_id and solicitante_email = public.hd_email()) $$;

alter policy hd_ch_ler on public.hd_chamados
  using (public.hd_eh_agente() or solicitante_email = public.hd_email()
         or (public.hd_eh_dev() and public.hd_cat_kanban(categoria_id)));
alter policy hd_ch_atualizar on public.hd_chamados
  using (public.hd_eh_agente() or (public.hd_eh_dev() and public.hd_cat_kanban(categoria_id)))
  with check (public.hd_eh_agente() or (public.hd_eh_dev() and public.hd_cat_kanban(categoria_id)));
alter policy hd_ch_excluir on public.hd_chamados
  using (public.hd_papel() = 'admin');

alter policy hd_msg_ler on public.hd_mensagens
  using (public.hd_atende(chamado_id) or (not interna and public.hd_pode_ver_chamado(chamado_id)));

alter policy hd_anx_ler on public.hd_anexos
  using (public.hd_atende(chamado_id) or (public.hd_pode_ver_chamado(chamado_id) and not exists (
    select 1 from public.hd_mensagens m where m.id = mensagem_id and m.interna)));

alter policy hd_config_admin on public.hd_config
  using (public.hd_papel() = 'admin') with check (public.hd_papel() = 'admin');

alter table public.hd_equipe enable row level security;
create policy hd_equipe_ler on public.hd_equipe for select to authenticated
  using (public.hd_eh_agente() or public.hd_eh_dev());
create policy hd_equipe_admin on public.hd_equipe for all to authenticated
  using (public.hd_papel() = 'admin') with check (public.hd_papel() = 'admin');

alter table public.hd_etapas enable row level security;
create policy hd_etapas_ler on public.hd_etapas for select to authenticated using (public.hd_pode_abrir());
create policy hd_etapas_gerir on public.hd_etapas for all to authenticated
  using (public.hd_eh_agente()) with check (public.hd_eh_agente());

alter table public.hd_tarefas enable row level security;
create policy hd_tarefas_ler on public.hd_tarefas for select to authenticated using (public.hd_atende(chamado_id));
create policy hd_tarefas_criar on public.hd_tarefas for insert to authenticated with check (public.hd_atende(chamado_id));
create policy hd_tarefas_alterar on public.hd_tarefas for update to authenticated
  using (public.hd_atende(chamado_id)) with check (public.hd_atende(chamado_id));
create policy hd_tarefas_excluir on public.hd_tarefas for delete to authenticated using (public.hd_atende(chamado_id));

alter table public.hd_etapas_hist enable row level security;
create policy hd_hist_ler on public.hd_etapas_hist for select to authenticated using (public.hd_atende(chamado_id));

-- ---------- Gatilhos ----------
create or replace function public.hd_tarefa_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := public.hd_email(); new.criado_em := now(); new.texto := btrim(new.texto);
    if new.ordem = 0 then
      select coalesce(max(ordem), 0) + 1 into new.ordem from public.hd_tarefas where chamado_id = new.chamado_id;
    end if;
  else
    new.chamado_id := old.chamado_id; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
  end if;
  new.feita_em := case when new.feita then coalesce(case when tg_op = 'UPDATE' then old.feita_em end, now()) end;
  return new;
end $$;
create trigger hd_tarefa_antes before insert or update on public.hd_tarefas
  for each row execute function public.hd_tarefa_antes();

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
  if not v_agente then new.prioridade := 'media'; new.atribuido_email := null; new.previsao_entrega := null; end if;
  new.lido_agente := v_agente;
  new.lido_solicitante := true;
  new.criado_em := now(); new.atualizado_em := now(); new.resolvido_em := null;
  if new.prazo_sla is null or not v_agente then
    select sla_horas into v_sla from public.hd_categorias where id = new.categoria_id;
    new.prazo_sla := case when v_sla is not null then now() + make_interval(hours => v_sla) end;
  end if;
  if new.ativo_id is not null and not v_agente and not exists (
      select 1 from public.ativos where id = new.ativo_id
        and lower(usuario) = split_part(new.solicitante_email,'@',1)) then
    new.ativo_id := null;
  end if;
  if public.hd_cat_kanban(new.categoria_id) then
    new.etapa_id := public.hd_etapa_inicial();
    new.kanban_ordem := extract(epoch from now());
  else
    new.etapa_id := null;
  end if;
  return new;
end $$;

create or replace function public.hd_chamado_antes_atualizar() returns trigger
language plpgsql security definer set search_path = public as $$
declare ignorar text[] := array['lido_agente','lido_solicitante','atualizado_em','kanban_ordem'];
  v_final bigint := public.hd_etapa_final(); v_kanban boolean;
begin
  new.id := old.id; new.criado_em := old.criado_em; new.solicitante_email := old.solicitante_email;
  -- Dev não tira o chamado do quadro
  if public.hd_eh_dev() and not public.hd_eh_agente() then new.categoria_id := old.categoria_id; end if;

  v_kanban := public.hd_cat_kanban(new.categoria_id);
  if not v_kanban then
    new.etapa_id := null;
  else
    if new.etapa_id is null then
      new.etapa_id := case when new.status = 'resolvido' then v_final else public.hd_etapa_inicial() end;
    end if;
    if new.etapa_id is distinct from old.etapa_id then
      if new.etapa_id = v_final then
        if new.status not in ('resolvido','cancelado') then new.status := 'resolvido'; end if;
      elsif new.status = 'resolvido' then
        new.status := 'aberto';
      elsif new.status = 'novo' and new.etapa_id <> public.hd_etapa_inicial() then
        new.status := 'aberto';
      end if;
      if public.hd_email() not in ('', old.solicitante_email) then new.lido_solicitante := false; end if;
    elsif new.status is distinct from old.status then
      if new.status = 'resolvido' then new.etapa_id := v_final;
      elsif old.status = 'resolvido' and new.etapa_id = v_final then
        new.etapa_id := coalesce((select h.etapa_id from public.hd_etapas_hist h
          where h.chamado_id = old.id and h.etapa_id <> v_final order by h.id desc limit 1), public.hd_etapa_inicial());
      end if;
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'resolvido' then new.resolvido_em := now();
    elsif old.status = 'resolvido' then new.resolvido_em := null; end if;
    if public.hd_email() not in ('', old.solicitante_email) then new.lido_solicitante := false; end if;
  end if;
  if (to_jsonb(new) - ignorar) is distinct from (to_jsonb(old) - ignorar) then
    new.atualizado_em := now();
  end if;
  return new;
end $$;

-- Histórico de etapas
create or replace function public.hd_registrar_etapa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.etapa_id is not distinct from old.etapa_id then return null; end if;
  update public.hd_etapas_hist set saiu_em = now() where chamado_id = new.id and saiu_em is null;
  if new.etapa_id is not null then
    insert into public.hd_etapas_hist (chamado_id, etapa_id, por) values (new.id, new.etapa_id, public.hd_email());
  end if;
  return null;
end $$;
create or replace trigger hd_registrar_etapa after insert or update on public.hd_chamados
  for each row execute function public.hd_registrar_etapa();

create or replace function public.hd_chamado_registrar_eventos() returns trigger
language plpgsql security definer set search_path = public as $$
declare quem text := public.hd_email(); nome_cat text; nome_etapa text;
begin
  if new.etapa_id is distinct from old.etapa_id and new.etapa_id is not null then
    select nome into nome_etapa from public.hd_etapas where id = new.etapa_id;
    insert into public.hd_mensagens (chamado_id, tipo, interna, autor_email, corpo)
    values (new.id, 'evento', false, quem, 'Etapa do projeto: ' || nome_etapa);
  end if;
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
  if new.previsao_entrega is distinct from old.previsao_entrega then
    insert into public.hd_mensagens (chamado_id, tipo, interna, autor_email, corpo)
    values (new.id, 'evento', false, quem,
      case when new.previsao_entrega is null then 'Previsão de entrega removida'
           else 'Previsão de entrega: ' || to_char(new.previsao_entrega, 'DD/MM/YYYY') end);
  end if;
  if new.categoria_id is distinct from old.categoria_id then
    select nome into nome_cat from public.hd_categorias where id = new.categoria_id;
    insert into public.hd_mensagens (chamado_id, tipo, interna, autor_email, corpo)
    values (new.id, 'evento', false, quem, 'Categoria alterada para ' || coalesce(nome_cat,'(sem categoria)'));
  end if;
  return null;
end $$;

create or replace function public.hd_mensagem_antes_inserir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'evento' then return new; end if;
  new.autor_email := public.hd_email();
  new.corpo := btrim(new.corpo);
  new.criado_em := now();
  if not public.hd_atende(new.chamado_id) then new.interna := false; end if;
  return new;
end $$;

create or replace function public.hd_marcar_lido(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.hd_atende(p_id) then
    update public.hd_chamados set lido_agente = true where id = p_id and not lido_agente;
  end if;
  update public.hd_chamados set lido_solicitante = true
    where id = p_id and solicitante_email = public.hd_email() and not lido_solicitante;
end $$;

-- ---------- Funções do app ----------
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
    'eh_dev', public.hd_eh_dev(),
    'pode_abrir', public.hd_pode_abrir(),
    'papel', public.hd_papel()
  ) $$;

create or replace function public.hd_equipe_lista()
returns table (email text, papel text, nome text, ativo boolean)
language sql stable security definer set search_path = public as $$
  select e.email, e.papel, public.hd_nome(e.email), e.ativo from public.hd_equipe e
  where public.hd_eh_agente() or public.hd_eh_dev()
  order by e.ativo desc, e.papel, e.email $$;

create or replace function public.hd_ativos_lista()
returns table (id text, tipo text, dispositivo text, modelo text, usuario text)
language sql stable security definer set search_path = public as $$
  select a.id, a.tipo, a.dispositivo, coalesce(a.modelo,''), coalesce(a.usuario,'') from public.ativos a
  where public.hd_eh_agente() or public.hd_eh_dev()
  order by a.dispositivo $$;

-- Tempo médio (horas) em cada etapa, considerando os últimos 180 dias
create or replace function public.hd_kanban_metricas()
returns table (etapa_id bigint, media_horas numeric, passagens int)
language sql stable security definer set search_path = public as $$
  select h.etapa_id, round(avg(extract(epoch from (h.saiu_em - h.entrou_em)) / 3600)::numeric, 1), count(*)::int
  from public.hd_etapas_hist h
  where (public.hd_eh_agente() or public.hd_eh_dev())
    and h.saiu_em is not null and h.entrou_em > now() - interval '180 days'
  group by h.etapa_id $$;

-- ---------- Notificações ----------
create or replace function public.hd_agentes_emails(p_excluir text default '') returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(email order by email), '{}') from public.hd_equipe
  where ativo and papel in ('admin','ti') and email like '%@grupozerbini.com.br'
    and email <> lower(coalesce(p_excluir,''))
$$;

create or replace function public.hd_destinos_equipe(p_cat bigint, p_excluir text default '') returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct email), '{}') from public.hd_equipe
  where ativo and email like '%@grupozerbini.com.br' and email <> lower(coalesce(p_excluir,''))
    and (papel in ('admin','ti') or (papel = 'dev' and public.hd_cat_kanban(p_cat)))
$$;

create or replace function public.hd_notif_novo_chamado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cat text; v_nome text := coalesce(nullif(new.solicitante_nome,''), public.hd_nome(new.solicitante_email));
begin
  select nome into v_cat from public.hd_categorias where id = new.categoria_id;
  perform public.hd_enfileirar(new.id, 'novo', public.hd_destinos_equipe(new.categoria_id, public.hd_email()),
    'Novo chamado #' || lpad(new.id::text,4,'0') || ': ' || new.titulo,
    public.hd_email_html(new, new.titulo,
      '<b>' || public.hd_esc(v_nome) || '</b>' || case when new.setor <> '' then ' (' || public.hd_esc(new.setor) || ')' else '' end
      || ' abriu um chamado' || case when v_cat is not null then ' em <b>' || public.hd_esc(v_cat) || '</b>' else '' end
      || case when new.anydesk <> '' then '. AnyDesk: <b>' || public.hd_esc(new.anydesk) || '</b>' else '' end || '.',
      new.descricao, 'Ver chamado'));
  return null;
end $$;

create or replace function public.hd_notif_mensagem() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.hd_chamados; v_para text[]; v_quem text;
begin
  if new.tipo <> 'mensagem' or new.interna then return null; end if;
  select * into c from public.hd_chamados where id = new.chamado_id;
  v_quem := public.hd_nome(new.autor_email);
  if new.autor_email = c.solicitante_email then
    v_para := case when c.atribuido_email is not null and c.atribuido_email like '%@grupozerbini.com.br'
                   then array[lower(c.atribuido_email)] else public.hd_destinos_equipe(c.categoria_id, new.autor_email) end;
    perform public.hd_enfileirar(c.id, 'resposta_colaborador', v_para,
      'Nova resposta no chamado #' || lpad(c.id::text,4,'0') || ': ' || c.titulo,
      public.hd_email_html(c, c.titulo, '<b>' || public.hd_esc(v_quem) || '</b> respondeu no chamado:', new.corpo, 'Ver chamado'));
  else
    perform public.hd_enfileirar(c.id, 'resposta_ti', array[c.solicitante_email],
      'Resposta da TI no chamado #' || lpad(c.id::text,4,'0') || ': ' || c.titulo,
      public.hd_email_html(c, c.titulo, '<b>' || public.hd_esc(v_quem) || '</b>, da TI, respondeu o seu chamado:', new.corpo, 'Ver e responder'));
  end if;
  return null;
end $$;

-- Mudança de etapa -> colaborador (a etapa final já gera o e-mail de finalizado)
create or replace function public.hd_notif_etapa() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nome text; v_pend bigint; v_html text; v_assunto text;
begin
  if new.etapa_id is not distinct from old.etapa_id or new.etapa_id is null or old.etapa_id is null then return null; end if;
  if new.etapa_id = public.hd_etapa_final() or new.status in ('resolvido','cancelado') then return null; end if;
  if lower(new.solicitante_email) = public.hd_email() then return null; end if;
  select nome into v_nome from public.hd_etapas where id = new.etapa_id;
  v_assunto := 'Chamado #' || lpad(new.id::text,4,'0') || ' agora está em "' || v_nome || '": ' || new.titulo;
  v_html := public.hd_email_html(new, new.titulo,
    'Sua solicitação mudou de etapa e agora está em <b>' || public.hd_esc(v_nome) || '</b>.'
    || case when new.previsao_entrega is not null then ' Previsão de entrega: <b>' || to_char(new.previsao_entrega,'DD/MM/YYYY') || '</b>.' else '' end,
    null, 'Acompanhar');
  -- se o dev mover várias vezes em sequência, manda só a última
  select id into v_pend from public.hd_notificacoes
   where chamado_id = new.id and tipo = 'etapa' and status = 'pendente' order by id desc limit 1;
  if v_pend is not null then
    update public.hd_notificacoes set html = v_html, assunto = v_assunto, criado_em = now() where id = v_pend;
  else
    perform public.hd_enfileirar(new.id, 'etapa', array[new.solicitante_email], v_assunto, v_html);
  end if;
  return null;
end $$;
create or replace trigger hd_notif_etapa after update on public.hd_chamados
  for each row execute function public.hd_notif_etapa();

-- Finalizado: descarta e-mail de etapa pendente do mesmo chamado
create or replace trigger hd_notif_status after update on public.hd_chamados
  for each row execute function public.hd_notif_status();

create or replace function public.hd_notif_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_msg text; v_pend bigint; v_html text;
begin
  if new.status is not distinct from old.status or new.status <> 'resolvido' then return null; end if;
  if lower(new.solicitante_email) = public.hd_email() then return null; end if;
  update public.hd_notificacoes set status = 'ignorado'
   where chamado_id = new.id and tipo = 'etapa' and status = 'pendente';
  select id into v_pend from public.hd_notificacoes
   where chamado_id = new.id and tipo = 'resposta_ti' and status = 'pendente'
     and criado_em > now() - interval '3 minutes' order by id desc limit 1;
  select corpo into v_msg from public.hd_mensagens
   where chamado_id = new.id and tipo = 'mensagem' and not interna and autor_email <> new.solicitante_email
     and criado_em > now() - interval '3 minutes' order by id desc limit 1;
  v_html := public.hd_email_html(new, new.titulo,
    'Seu chamado foi <b>finalizado</b> pela TI.' || case when v_msg is not null then ' Última mensagem:' else '' end,
    v_msg, 'Ver chamado');
  if v_pend is not null then
    update public.hd_notificacoes set tipo = 'resolvido', html = v_html,
      assunto = 'Chamado #' || lpad(new.id::text,4,'0') || ' finalizado: ' || new.titulo
    where id = v_pend;
  else
    perform public.hd_enfileirar(new.id, 'resolvido', array[new.solicitante_email],
      'Chamado #' || lpad(new.id::text,4,'0') || ' finalizado: ' || new.titulo, v_html);
  end if;
  return null;
end $$;

-- ---------- Chamados de desenvolvimento já existentes ----------
update public.hd_chamados c set
  etapa_id = case when c.status = 'resolvido' then public.hd_etapa_final() else public.hd_etapa_inicial() end,
  kanban_ordem = extract(epoch from c.criado_em)
where public.hd_cat_kanban(c.categoria_id) and c.etapa_id is null;

-- ---------- Permissões e tempo real ----------
revoke execute on function public.hd_tarefa_antes(), public.hd_registrar_etapa(), public.hd_notif_etapa(),
  public.hd_destinos_equipe(bigint,text), public.hd_etapa_inicial(), public.hd_etapa_final()
  from public, anon, authenticated;
revoke execute on function public.hd_papel(), public.hd_eh_dev(), public.hd_cat_kanban(bigint), public.hd_atende(bigint),
  public.hd_equipe_lista(), public.hd_ativos_lista(), public.hd_kanban_metricas()
  from public, anon;
grant execute on function public.hd_papel(), public.hd_eh_dev(), public.hd_cat_kanban(bigint), public.hd_atende(bigint),
  public.hd_equipe_lista(), public.hd_ativos_lista(), public.hd_kanban_metricas()
  to authenticated;

alter publication supabase_realtime add table public.hd_tarefas;
