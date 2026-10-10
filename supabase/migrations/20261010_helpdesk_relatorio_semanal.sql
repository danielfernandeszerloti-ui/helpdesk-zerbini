-- Relatório Gerencial Semanal de TI
--
-- Período: segunda a sexta (horário de São Paulo).
-- Toda sexta ~16h o pg_cron gera o rascunho da semana e avisa o revisor (responsavel_padrao)
-- por e-mail. O revisor ajusta o texto em /relatorio/:id e clica em Enviar → e-mail para
-- hd_config 'relatorio_destinatarios' (padrão: Amanda). Nada é enviado sem revisão.
--
-- hd_relatorios         → um registro por semana (inicio = segunda)
--   dados               → snapshot calculado (indicadores atual × anterior, listas, sugestões)
--   resumo, atividades  → textos editáveis (começam com o rascunho automático)
--   itens               → pontos de atenção / decisões detectados [{chave, secao, nivel, texto, chamados, incluir, editado}]
--   notas_atencao, notas_decisao → texto livre extra
--   plano               → plano de ação da próxima semana [{texto}]
--   plano_anterior      → itens do plano da semana anterior com acompanhamento [{texto, feito: true|false|null}]
-- hd_rel_metricas(a,b)  → números de um período
-- hd_rel_dados(inicio)  → monta o jsonb completo
-- hd_relatorio_gerar(inicio)       RPC (TI) — cria/atualiza o rascunho
-- hd_relatorio_salvar(id, jsonb)   RPC (TI)
-- hd_relatorio_enviar(id, assunto, html) RPC (TI) — enfileira o e-mail
-- hd_relatorio_cron()               pg_cron sexta 18:52 UTC (15:52 SP)

create table if not exists public.hd_relatorios (
  id bigint generated always as identity primary key,
  inicio date not null unique check (extract(isodow from inicio) = 1),
  fim date not null,
  dados jsonb not null default '{}'::jsonb,
  gerado_em timestamptz,
  resumo text not null default '',
  atividades text not null default '',
  itens jsonb not null default '[]'::jsonb,
  notas_atencao text not null default '',
  notas_decisao text not null default '',
  plano jsonb not null default '[]'::jsonb,
  plano_anterior jsonb not null default '[]'::jsonb,
  status text not null default 'rascunho' check (status in ('rascunho','enviado')),
  enviado_em timestamptz,
  enviado_por text,
  destinatarios text[],
  envios int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
alter table public.hd_relatorios enable row level security;
create policy hd_relatorios_ler on public.hd_relatorios for select to authenticated using (public.hd_eh_agente());
revoke insert, update, delete on public.hd_relatorios from anon, authenticated;

insert into public.hd_config (chave, valor) values ('relatorio_destinatarios', 'amanda.alencar@grupozerbini.com.br')
on conflict (chave) do nothing;

create or replace function public.hd_cod(p bigint) returns text language sql immutable
as $$ select '#' || lpad(p::text, 4, '0') $$;

create or replace function public.hd_brl(p numeric) returns text language sql immutable
as $$ select case when p is null then '' else 'R$ ' || translate(to_char(p, 'FM999G999G990D00'), ',.', '.,') end $$;

-- ------------------------------------------------------------------ números de um período
create or replace function public.hd_rel_metricas(p_a timestamptz, p_b timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  with ref as (select least(p_b, now()) r),
  rec as (select * from hd_chamados where criado_em >= p_a and criado_em < p_b),
  con as (select * from hd_chamados where status = 'resolvido' and resolvido_em >= p_a and resolvido_em < p_b),
  pen as (select c.* from hd_chamados c, ref
          where c.criado_em < ref.r and c.status <> 'cancelado' and not (c.status = 'resolvido' and c.resolvido_em < ref.r)),
  resp as (select c.criado_em,
             (select min(m.criado_em) from hd_mensagens m where m.chamado_id = c.id and m.tipo = 'mensagem'
               and not m.interna and m.autor_email <> c.solicitante_email) pr
           from rec c),
  av as (select avaliacao from hd_chamados where avaliado_em >= p_a and avaliado_em < p_b and avaliacao is not null)
  select jsonb_build_object(
    'recebidos', (select count(*) from rec),
    'incidentes', (select count(*) from rec where tipo = 'incidente'),
    'solicitacoes', (select count(*) from rec where tipo = 'solicitacao'),
    'cancelados', (select count(*) from rec where status = 'cancelado'),
    'criticos', (select count(*) from rec where prioridade in ('alta','urgente')),
    'concluidos', (select count(*) from con),
    'pendentes', (select count(*) from pen),
    'criticos_pendentes', (select count(*) from pen where prioridade in ('alta','urgente')),
    'fora_concluidos', (select count(*) from con where prazo_sla is not null and resolvido_em > prazo_sla),
    'fora_pendentes', (select count(*) from pen, ref where pen.prazo_sla < ref.r
                         and pen.status not in ('em_espera','pausado') and coalesce(pen.aprovacao,'') <> 'pendente'),
    'com_sla', (select count(*) from con where prazo_sla is not null),
    'sla_pct', (select round(100.0 * count(*) filter (where resolvido_em <= prazo_sla) / nullif(count(*), 0))
                from con where prazo_sla is not null),
    'resp_h', (select round(avg(hd_horas_uteis_entre(criado_em, pr)), 1) from resp where pr is not null),
    'resol_h', (select round(avg(hd_horas_uteis_entre(criado_em, resolvido_em)), 1) from con),
    'aval_media', (select round(avg(avaliacao), 1) from av),
    'aval_qtd', (select count(*) from av)
  )
$$;

-- ------------------------------------------------------------------ relatório completo
create or replace function public.hd_rel_dados(p_inicio date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'America/Sao_Paulo';
  v_a  timestamptz := (p_inicio::timestamp) at time zone tz;
  v_b  timestamptz := ((p_inicio + 5)::timestamp) at time zone tz;
  v_a0 timestamptz := ((p_inicio - 7)::timestamp) at time zone tz;
  v_b0 timestamptz := ((p_inicio - 2)::timestamp) at time zone tz;
  v_r  timestamptz := least(((p_inicio + 5)::timestamp) at time zone tz, now());
  v_hoje date := (now() at time zone tz)::date;
  v_prox date := p_inicio + 7;
  v_atual jsonb; v_ant jsonb;
  v_itens jsonb := '[]'; v_sug jsonb := '[]';
  x record; v_txt text := ''; v_bloco text; v_resumo text; v_n int; v_m int; v_aprov bigint := public.hd_etapa_aprovacao();
begin
  v_atual := hd_rel_metricas(v_a, v_b);
  v_ant := hd_rel_metricas(v_a0, v_b0);

  -- ===== PONTOS DE ATENÇÃO =====
  -- críticos em aberto
  select count(*) n, string_agg(lin, '; ' order by o) filter (where rn <= 5) txt, jsonb_agg(id order by o) ids into x
  from (select id, criado_em o, row_number() over (order by criado_em) rn,
          format('%s %s (%s)', hd_cod(id), left(titulo, 70), coalesce(hd_nome(atribuido_email), 'sem responsável')) lin
        from hd_chamados where status not in ('resolvido','cancelado') and prioridade in ('alta','urgente')) s;
  if x.n > 0 then
    v_itens := v_itens || jsonb_build_object('chave', 'criticos', 'secao', 'atencao', 'nivel', 'alto', 'chamados', x.ids,
      'texto', format('%s chamado(s) crítico(s) em aberto: %s%s', x.n, x.txt, case when x.n > 5 then format(' e mais %s', x.n - 5) else '' end));
  end if;

  -- fora do prazo
  select count(*) n, string_agg(lin, '; ' order by o) filter (where rn <= 5) txt, jsonb_agg(id order by o) ids into x
  from (select id, prazo_sla o, row_number() over (order by prazo_sla) rn,
          format('%s %s (%s, venceu em %s)', hd_cod(id), left(titulo, 70), coalesce(hd_nome(atribuido_email), 'sem responsável'),
                 to_char(prazo_sla at time zone tz, 'DD/MM')) lin
        from hd_chamados where status in ('novo','aberto') and coalesce(aprovacao,'') <> 'pendente' and prazo_sla < now()) s;
  if x.n > 0 then
    v_itens := v_itens || jsonb_build_object('chave', 'atrasados', 'secao', 'atencao', 'nivel', 'alto', 'chamados', x.ids,
      'texto', format('%s chamado(s) fora do prazo: %s%s', x.n, x.txt, case when x.n > 5 then format(' e mais %s', x.n - 5) else '' end));
  end if;

  -- SLA abaixo da meta
  if coalesce((v_atual->>'com_sla')::int, 0) >= 3 and (v_atual->>'sla_pct')::int < 85 then
    v_itens := v_itens || jsonb_build_object('chave', 'sla', 'secao', 'atencao', 'nivel', 'alto', 'chamados', '[]'::jsonb,
      'texto', format('SLA cumprido em %s%% dos chamados concluídos na semana (%s fora do prazo de %s).',
        v_atual->>'sla_pct', v_atual->>'fora_concluidos', v_atual->>'com_sla'));
  end if;

  -- fila crescendo
  v_n := (v_atual->>'pendentes')::int; v_m := (v_ant->>'pendentes')::int;
  if v_n - v_m >= 3 then
    v_itens := v_itens || jsonb_build_object('chave', 'fila', 'secao', 'atencao', 'nivel', 'medio', 'chamados', '[]'::jsonb,
      'texto', format('A fila de pendentes cresceu de %s para %s: entraram %s chamados e saíram %s.', v_m, v_n,
        v_atual->>'recebidos', v_atual->>'concluidos'));
  end if;

  -- pendentes antigos (fora os já listados como atrasados)
  select count(*) n, string_agg(lin, '; ' order by o) filter (where rn <= 5) txt, jsonb_agg(id order by o) ids into x
  from (select id, criado_em o, row_number() over (order by criado_em) rn,
          format('%s %s (%s dias, %s)', hd_cod(id), left(titulo, 70), (v_hoje - (criado_em at time zone tz)::date), hd_rotulo_status(status)) lin
        from hd_chamados
        where status not in ('resolvido','cancelado') and criado_em < now() - interval '15 days'
          and not (status in ('novo','aberto') and coalesce(aprovacao,'') <> 'pendente' and prazo_sla < now())
          and coalesce(aprovacao,'') <> 'pendente') s;
  if x.n > 0 then
    v_itens := v_itens || jsonb_build_object('chave', 'antigos', 'secao', 'atencao', 'nivel', 'medio', 'chamados', x.ids,
      'texto', format('Chamados abertos há mais de 15 dias: %s%s', x.txt, case when x.n > 5 then format(' e mais %s', x.n - 5) else '' end));
  end if;

  -- aguardando terceiros com retorno vencido
  select count(*) n, string_agg(lin, '; ' order by o) filter (where rn <= 5) txt, jsonb_agg(id order by o) ids into x
  from (select id, coalesce(retomar_em, (criado_em at time zone tz)::date) o, row_number() over (order by coalesce(retomar_em, (criado_em at time zone tz)::date)) rn,
          format('%s %s — %s, %s', hd_cod(id), left(titulo, 60), coalesce(nullif(aguardando, ''), 'terceiro não informado'),
                 case when retomar_em is null then 'sem data de retorno' else 'retorno previsto ' || to_char(retomar_em, 'DD/MM') end) lin
        from hd_chamados where status = 'pausado' and (retomar_em is null or retomar_em < v_hoje)) s;
  if x.n > 0 then
    v_itens := v_itens || jsonb_build_object('chave', 'terceiros', 'secao', 'atencao', 'nivel', 'medio', 'chamados', x.ids,
      'texto', format('Aguardando terceiros com retorno vencido: %s%s', x.txt, case when x.n > 5 then format(' e mais %s', x.n - 5) else '' end));
  end if;

  -- equipamento com chamados repetidos (30 dias)
  for x in
    select c.ativo_id, count(*) n, jsonb_agg(c.id order by c.id) ids, string_agg(hd_cod(c.id), ', ' order by c.id) cods,
      max(concat_ws(' ', a.dispositivo, nullif(a.modelo, ''))) nome, max(coalesce(nullif(a.usuario, ''), a.setor)) dono
    from hd_chamados c left join ativos a on a.id = c.ativo_id
    where c.ativo_id is not null and c.criado_em >= v_r - interval '30 days' and c.criado_em < v_r
    group by c.ativo_id having count(*) >= 2 order by 2 desc limit 5
  loop
    v_itens := v_itens || jsonb_build_object('chave', 'ativo:' || x.ativo_id, 'secao', 'atencao', 'nivel', 'medio', 'chamados', x.ids,
      'texto', format('Equipamento %s%s com %s chamados nos últimos 30 dias (%s) — avaliar manutenção ou troca.',
        coalesce(nullif(x.nome, ''), x.ativo_id), coalesce(' (' || x.dono || ')', ''), x.n, x.cods));
  end loop;

  -- mesmo setor + mesma categoria repetidos na semana
  for x in
    select c.setor, k.nome cat, count(*) n, jsonb_agg(c.id order by c.id) ids
    from hd_chamados c left join hd_categorias k on k.id = c.categoria_id
    where c.criado_em >= v_a and c.criado_em < v_b and coalesce(c.setor, '') <> ''
    group by 1, 2 having count(*) >= 3 order by 3 desc limit 5
  loop
    v_itens := v_itens || jsonb_build_object('chave', 'setorcat:' || x.setor || ':' || coalesce(x.cat, ''), 'secao', 'atencao', 'nivel', 'medio', 'chamados', x.ids,
      'texto', format('%s abriu %s chamados de %s na semana — verificar se há causa comum.', x.setor, x.n, coalesce(x.cat, 'sem categoria')));
  end loop;

  -- categoria em alta
  for x in
    select k.nome cat, c.categoria_id,
      count(*) filter (where c.criado_em >= v_a) n, count(*) filter (where c.criado_em < v_b0) m
    from hd_chamados c left join hd_categorias k on k.id = c.categoria_id
    where (c.criado_em >= v_a and c.criado_em < v_b) or (c.criado_em >= v_a0 and c.criado_em < v_b0)
    group by 1, 2
    having count(*) filter (where c.criado_em >= v_a) >= 4
       and count(*) filter (where c.criado_em >= v_a) >= 2 * count(*) filter (where c.criado_em < v_b0)
    order by 3 desc limit 3
  loop
    v_itens := v_itens || jsonb_build_object('chave', 'cat:' || coalesce(x.categoria_id::text, '0'), 'secao', 'atencao', 'nivel', 'medio', 'chamados', '[]'::jsonb,
      'texto', format('Aumento em %s: %s chamados na semana (semana anterior: %s).', coalesce(x.cat, 'sem categoria'), x.n, x.m));
  end loop;

  -- setor concentrando a demanda
  for x in
    select setor, count(*) n, round(100.0 * count(*) / nullif((v_atual->>'recebidos')::int, 0)) p
    from hd_chamados where criado_em >= v_a and criado_em < v_b and coalesce(setor, '') <> ''
    group by 1 having count(*) >= 5 and count(*) * 100 >= 40 * (v_atual->>'recebidos')::int
  loop
    v_itens := v_itens || jsonb_build_object('chave', 'setor:' || x.setor, 'secao', 'atencao', 'nivel', 'baixo', 'chamados', '[]'::jsonb,
      'texto', format('%s concentrou %s%% dos chamados da semana (%s de %s).', x.setor, x.p, x.n, v_atual->>'recebidos'));
  end loop;

  -- mesmo solicitante várias vezes
  for x in
    select solicitante_email, max(coalesce(nullif(solicitante_nome, ''), solicitante_email)) nome, max(setor) setor, count(*) n, jsonb_agg(id order by id) ids
    from hd_chamados where criado_em >= v_a and criado_em < v_b
    group by 1 having count(*) >= 3 order by 4 desc limit 3
  loop
    v_itens := v_itens || jsonb_build_object('chave', 'sol:' || x.solicitante_email, 'secao', 'atencao', 'nivel', 'baixo', 'chamados', x.ids,
      'texto', format('%s%s abriu %s chamados na semana — vale entender se há algo recorrente (treinamento, equipamento ou sistema).',
        x.nome, coalesce(' (' || nullif(x.setor, '') || ')', ''), x.n));
  end loop;

  -- sem responsável
  select count(*) n, jsonb_agg(id order by id) ids, string_agg(hd_cod(id), ', ' order by id) cods into x
  from hd_chamados where status not in ('resolvido','cancelado') and atribuido_email is null and coalesce(aprovacao,'') <> 'pendente';
  if x.n > 0 then
    v_itens := v_itens || jsonb_build_object('chave', 'semresp', 'secao', 'atencao', 'nivel', 'baixo', 'chamados', x.ids,
      'texto', format('%s chamado(s) em aberto sem responsável: %s.', x.n, x.cods));
  end if;

  -- avaliações baixas
  for x in
    select id, titulo, avaliacao, avaliacao_comentario, coalesce(nullif(solicitante_nome, ''), solicitante_email) nome
    from hd_chamados where avaliado_em >= v_a and avaliado_em < v_b and avaliacao <= 2 order by avaliado_em
  loop
    v_itens := v_itens || jsonb_build_object('chave', 'aval:' || x.id, 'secao', 'atencao', 'nivel', 'medio', 'chamados', jsonb_build_array(x.id),
      'texto', format('Avaliação %s de 5 em %s %s (%s)%s', x.avaliacao, hd_cod(x.id), left(x.titulo, 60), x.nome,
        coalesce(': "' || left(nullif(trim(x.avaliacao_comentario), ''), 200) || '"', '.')));
  end loop;

  -- ===== DECISÕES DA GERÊNCIA =====
  for x in
    select c.id, c.titulo, c.valor_estimado, c.setor, k.nome cat, c.criado_em,
      coalesce(nullif(c.solicitante_nome, ''), c.solicitante_email) nome
    from hd_chamados c left join hd_categorias k on k.id = c.categoria_id
    where c.status not in ('resolvido','cancelado')
      and (c.aprovacao = 'pendente' or (v_aprov is not null and c.etapa_id = v_aprov))
    order by c.criado_em
  loop
    v_itens := v_itens || jsonb_build_object('chave', 'aprov:' || x.id, 'secao', 'decisao', 'nivel', 'alto', 'chamados', jsonb_build_array(x.id),
      'texto', format('Aprovar ou recusar %s %s (%s%s%s) — aguardando há %s dia(s).', hd_cod(x.id), left(x.titulo, 80),
        coalesce(x.cat, 'sem categoria'), coalesce(', ' || nullif(x.setor, ''), ''),
        case when x.valor_estimado is not null then ', ' || hd_brl(x.valor_estimado) else '' end,
        greatest(0, v_hoje - (x.criado_em at time zone tz)::date)));
  end loop;

  -- ===== ATIVIDADES (rascunho do texto) =====
  v_bloco := '';
  for x in
    select coalesce(k.nome, 'Sem categoria') cat, count(*) n,
      string_agg(left(s.titulo, 70), '; ' order by s.resolvido_em) filter (where s.rn <= 4) tit
    from (select c.*, row_number() over (partition by c.categoria_id order by c.resolvido_em) rn from hd_chamados c
          where c.status = 'resolvido' and c.resolvido_em >= v_a and c.resolvido_em < v_b) s
    left join hd_categorias k on k.id = s.categoria_id
    group by 1 order by 2 desc, 1
  loop
    v_bloco := v_bloco || format(E'• %s (%s): %s%s\n', x.cat, x.n, x.tit, case when x.n > 4 then format('; e mais %s', x.n - 4) else '' end);
  end loop;
  if v_bloco <> '' then v_txt := v_txt || format(E'Chamados concluídos (%s)\n', v_atual->>'concluidos') || v_bloco; end if;

  v_bloco := '';
  for x in
    select distinct on (h.chamado_id) h.chamado_id, c.titulo, e.nome etapa, e.finaliza
    from hd_etapas_hist h join hd_chamados c on c.id = h.chamado_id join hd_etapas e on e.id = h.etapa_id
    where h.entrou_em >= v_a and h.entrou_em < v_b
    order by h.chamado_id, h.entrou_em desc
  loop
    v_bloco := v_bloco || format(E'• %s %s → %s\n', hd_cod(x.chamado_id), left(x.titulo, 70), case when x.finaliza then 'concluído' else x.etapa end);
  end loop;
  if v_bloco <> '' then v_txt := v_txt || case when v_txt <> '' then E'\n' else '' end || E'Projetos de desenvolvimento\n' || v_bloco; end if;

  v_bloco := '';
  for x in
    select texto from hd_tarefas
    where feita and feita_em >= v_a and feita_em < v_b and chamado_id is null and automatica is null
    order by feita_em limit 12
  loop
    v_bloco := v_bloco || format(E'• %s\n', left(x.texto, 120));
  end loop;
  if v_bloco <> '' then v_txt := v_txt || case when v_txt <> '' then E'\n' else '' end || E'Outras atividades da TI\n' || v_bloco; end if;

  -- ===== RESUMO (rascunho) =====
  v_resumo := format('Semana com %s chamado(s) recebido(s) e %s concluído(s). ', v_atual->>'recebidos', v_atual->>'concluidos')
    || case when v_n > v_m then format('A fila de pendentes subiu de %s para %s', v_m, v_n)
            when v_n < v_m then format('A fila de pendentes caiu de %s para %s', v_m, v_n)
            else format('A fila de pendentes ficou estável (%s)', v_n) end
    || case when (v_atual->>'sla_pct') is not null then format(' e o SLA foi cumprido em %s%% dos atendimentos.', v_atual->>'sla_pct') else '.' end;

  -- ===== SUGESTÕES PARA O PLANO =====
  select coalesce(jsonb_agg(t order by o), '[]') into v_sug from (
    select format('Resolver %s %s (fora do prazo)', hd_cod(id), left(titulo, 70)) t, 1 o
      from (select * from hd_chamados where status in ('novo','aberto') and coalesce(aprovacao,'') <> 'pendente' and prazo_sla < now()
            order by prazo_sla limit 5) s1
    union all
    select format('Cobrar retorno em %s %s (%s)', hd_cod(id), left(titulo, 60), coalesce(nullif(aguardando, ''), 'terceiro')), 2
      from hd_chamados where status = 'pausado' and (retomar_em is null or retomar_em < v_prox + 5)
    union all
    select format('Entregar %s %s (previsão %s)', hd_cod(c.id), left(c.titulo, 70), to_char(c.previsao_entrega, 'DD/MM')), 3
      from hd_chamados c where c.status not in ('resolvido','cancelado') and c.previsao_entrega between v_prox and v_prox + 4
    union all
    select format('%s%s', left(texto, 110), case when prazo < v_prox then ' (atrasada)' else ' (' || to_char(prazo, 'DD/MM') || ')' end), 4
      from hd_tarefas where not feita and prazo is not null and prazo <= v_prox + 4 and automatica is null
  ) s;

  return jsonb_build_object(
    'inicio', p_inicio, 'fim', p_inicio + 4, 'calculado_em', now(),
    'atual', v_atual, 'anterior', v_ant,
    'por_categoria', (select coalesce(jsonb_agg(z order by z.recebidos desc, z.concluidos desc), '[]') from (
        select coalesce(k.nome, 'Sem categoria') categoria,
          count(*) filter (where c.criado_em >= v_a and c.criado_em < v_b) recebidos,
          count(*) filter (where c.status = 'resolvido' and c.resolvido_em >= v_a and c.resolvido_em < v_b) concluidos
        from hd_chamados c left join hd_categorias k on k.id = c.categoria_id
        where (c.criado_em >= v_a and c.criado_em < v_b) or (c.status = 'resolvido' and c.resolvido_em >= v_a and c.resolvido_em < v_b)
        group by 1) z),
    'por_responsavel', (select coalesce(jsonb_agg(z order by z.concluidos desc), '[]') from (
        select c.atribuido_email email, hd_nome(c.atribuido_email) nome,
          count(*) filter (where c.status = 'resolvido' and c.resolvido_em >= v_a and c.resolvido_em < v_b) concluidos,
          count(*) filter (where c.status not in ('resolvido','cancelado')) pendentes
        from hd_chamados c where c.atribuido_email is not null
          and ((c.status = 'resolvido' and c.resolvido_em >= v_a and c.resolvido_em < v_b) or c.status not in ('resolvido','cancelado'))
        group by 1) z),
    'itens', v_itens,
    'atividades_texto', rtrim(v_txt, E'\n'),
    'resumo_texto', v_resumo,
    'sugestoes_plano', v_sug
  );
end $$;

-- ------------------------------------------------------------------ gerar / atualizar rascunho
create or replace function public.hd_relatorio_gerar_interno(p_inicio date, p_por text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_ini date := date_trunc('week', coalesce(p_inicio, (now() at time zone 'America/Sao_Paulo')::date))::date;
  v_rel public.hd_relatorios; v_dados jsonb; v_ant jsonb; v_itens jsonb;
begin
  select * into v_rel from hd_relatorios where inicio = v_ini;
  if found and v_rel.status = 'enviado' then return v_rel.id; end if;
  v_dados := hd_rel_dados(v_ini);

  if v_rel.id is null then
    select coalesce(jsonb_agg(jsonb_build_object('texto', p->>'texto', 'feito', null)), '[]') into v_ant
    from hd_relatorios r, jsonb_array_elements(r.plano) p where r.inicio = v_ini - 7 and coalesce(p->>'texto', '') <> '';
    insert into hd_relatorios (inicio, fim, dados, gerado_em, resumo, atividades, itens, plano_anterior, atualizado_por)
    values (v_ini, v_ini + 4, v_dados - 'itens', now(), v_dados->>'resumo_texto', v_dados->>'atividades_texto',
            (select coalesce(jsonb_agg(i || '{"incluir": true}'), '[]') from jsonb_array_elements(v_dados->'itens') i),
            v_ant, p_por)
    returning * into v_rel;
    return v_rel.id;
  end if;

  -- atualização: mantém o que foi desmarcado/editado
  select coalesce(jsonb_agg(
           case when o.x is null then n || '{"incluir": true}'
                when coalesce((o.x->>'editado')::boolean, false) then n || jsonb_build_object('texto', o.x->'texto', 'editado', true, 'incluir', o.x->'incluir')
                else n || jsonb_build_object('incluir', o.x->'incluir') end), '[]')
    into v_itens
  from jsonb_array_elements(v_dados->'itens') n
  left join lateral (select y x from jsonb_array_elements(v_rel.itens) y where y->>'chave' = n->>'chave' limit 1) o on true;

  update hd_relatorios set dados = v_dados - 'itens', gerado_em = now(), itens = v_itens,
    resumo = case when trim(resumo) = '' then v_dados->>'resumo_texto' else resumo end,
    atividades = case when trim(atividades) = '' then v_dados->>'atividades_texto' else atividades end,
    atualizado_em = now(), atualizado_por = coalesce(p_por, atualizado_por)
  where id = v_rel.id;
  return v_rel.id;
end $$;

create or replace function public.hd_relatorio_gerar(p_inicio date default null)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  if not public.hd_eh_agente() then raise exception 'Sem permissão'; end if;
  return public.hd_relatorio_gerar_interno(p_inicio, public.hd_email());
end $$;

create or replace function public.hd_relatorio_salvar(p_id bigint, p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.hd_eh_agente() then raise exception 'Sem permissão'; end if;
  update hd_relatorios set
    resumo = coalesce(p->>'resumo', resumo),
    atividades = coalesce(p->>'atividades', atividades),
    itens = case when jsonb_typeof(p->'itens') = 'array' then p->'itens' else itens end,
    notas_atencao = coalesce(p->>'notas_atencao', notas_atencao),
    notas_decisao = coalesce(p->>'notas_decisao', notas_decisao),
    plano = case when jsonb_typeof(p->'plano') = 'array' then p->'plano' else plano end,
    plano_anterior = case when jsonb_typeof(p->'plano_anterior') = 'array' then p->'plano_anterior' else plano_anterior end,
    atualizado_em = now(), atualizado_por = public.hd_email()
  where id = p_id;
  if not found then raise exception 'Relatório não encontrado'; end if;
end $$;

create or replace function public.hd_relatorio_enviar(p_id bigint, p_assunto text, p_html text)
returns text[] language plpgsql security definer set search_path = public as $$
declare v_para text[];
begin
  if not public.hd_eh_agente() then raise exception 'Sem permissão'; end if;
  if coalesce(length(p_html), 0) < 50 or length(p_html) > 400000 then raise exception 'Conteúdo do e-mail inválido'; end if;
  if not exists (select 1 from hd_relatorios where id = p_id) then raise exception 'Relatório não encontrado'; end if;
  select array_agg(distinct lower(trim(e))) into v_para
  from unnest(string_to_array(coalesce(nullif(public.hd_cfg('relatorio_destinatarios'), ''), 'amanda.alencar@grupozerbini.com.br'), ',')) e
  where trim(e) ~ '^[^@\s]+@[^@\s]+$';
  if v_para is null then raise exception 'Nenhum destinatário configurado'; end if;
  insert into hd_notificacoes (chamado_id, tipo, destinatarios, assunto, html)
  values (null, 'relatorio', v_para, left(p_assunto, 200), p_html);
  update hd_relatorios set status = 'enviado', enviado_em = now(), enviado_por = public.hd_email(),
    destinatarios = v_para, envios = envios + 1 where id = p_id;
  return v_para;
end $$;

-- ------------------------------------------------------------------ sexta-feira: rascunho + aviso ao revisor
create or replace function public.hd_relatorio_cron()
returns text language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_rel hd_relatorios; v_para text := coalesce(nullif(public.hd_cfg('relatorio_revisor'), ''), public.hd_cfg('responsavel_padrao'));
  v_url text; d jsonb;
begin
  v_id := public.hd_relatorio_gerar_interno(null, null);
  select * into v_rel from hd_relatorios where id = v_id;
  if v_rel.status = 'enviado' or v_para is null then return 'nada a avisar'; end if;
  v_url := public.hd_cfg('site_url') || '/relatorio/' || v_id;
  d := v_rel.dados->'atual';
  insert into hd_notificacoes (chamado_id, tipo, destinatarios, assunto, html) values (null, 'relatorio_rascunho', array[v_para],
    'Relatório semanal de TI pronto para revisão (' || to_char(v_rel.inicio, 'DD/MM') || ' a ' || to_char(v_rel.fim, 'DD/MM') || ')',
    '<div style="background:#f3f4f8;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;color:#1f2233">'
    || '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e3e4ec">'
    || '<div style="height:4px;background:#212f96"></div><div style="padding:22px 26px">'
    || '<div style="font-size:12px;color:#6b7085;margin-bottom:6px">Zerbini Helpdesk · Relatório semanal</div>'
    || '<h2 style="margin:0 0 8px;font-size:19px;color:#0f2c66">O rascunho da semana está pronto</h2>'
    || '<p style="margin:0 0 14px;font-size:14px;color:#3b4255">' || coalesce(d->>'recebidos','0') || ' recebidos · '
    || coalesce(d->>'concluidos','0') || ' concluídos · ' || coalesce(d->>'pendentes','0') || ' pendentes · '
    || jsonb_array_length(v_rel.itens) || ' ponto(s) de atenção detectado(s).</p>'
    || '<p style="margin:0 0 16px;font-size:14px;color:#3b4255">Revise o texto, escreva o plano de ação e envie para a gerência.</p>'
    || '<a href="' || v_url || '" style="display:inline-block;background:#212f96;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">Revisar relatório</a>'
    || '</div></div></div>');
  return 'rascunho ' || v_id;
end $$;

revoke execute on function public.hd_rel_metricas(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.hd_rel_dados(date) from public, anon, authenticated;
revoke execute on function public.hd_relatorio_gerar_interno(date, text) from public, anon, authenticated;
revoke execute on function public.hd_relatorio_cron() from public, anon, authenticated;
revoke execute on function public.hd_relatorio_gerar(date) from public, anon;
revoke execute on function public.hd_relatorio_salvar(bigint, jsonb) from public, anon;
revoke execute on function public.hd_relatorio_enviar(bigint, text, text) from public, anon;
grant execute on function public.hd_relatorio_gerar(date) to authenticated;
grant execute on function public.hd_relatorio_salvar(bigint, jsonb) to authenticated;
grant execute on function public.hd_relatorio_enviar(bigint, text, text) to authenticated;

select cron.schedule('hd-relatorio-semanal', '52 18 * * 5', 'select public.hd_relatorio_cron()');

alter function public.hd_cod(bigint) set search_path = public;
alter function public.hd_brl(numeric) set search_path = public;
