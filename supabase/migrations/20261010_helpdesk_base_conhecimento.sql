-- Base de conhecimento da TI
--
-- hd_artigos           → procedimentos, configurações, instruções de acesso, erros conhecidos, perguntas frequentes
--   visibilidade        'interna' (só equipe de TI/dev) | 'publica' (qualquer colaborador logado vê, se publicado)
--   status              'rascunho' | 'publicado' | 'arquivado'
-- hd_artigo_chamados   → vínculo artigo × chamado (só equipe)
-- Prints do artigo     → bucket 'helpdesk', caminho kb/<pasta>/<arquivo>. Equipe vê tudo; colaborador só vê
--                        imagens citadas em artigo público publicado.
-- hd_artigo_contar(id, evento) → 'visto' | 'util' | 'nao_util' (contadores)

create table if not exists public.hd_artigos (
  id bigint generated always as identity primary key,
  titulo text not null check (char_length(trim(titulo)) between 3 and 200),
  tipo text not null default 'procedimento' check (tipo in ('procedimento','configuracao','acesso','erro','faq')),
  categoria_id bigint references public.hd_categorias(id) on delete set null,
  tags text[] not null default '{}',
  resumo text not null default '',
  conteudo text not null default '',
  visibilidade text not null default 'interna' check (visibilidade in ('interna','publica')),
  status text not null default 'publicado' check (status in ('rascunho','publicado','arquivado')),
  autor_email text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text,
  visualizacoes int not null default 0,
  uteis int not null default 0,
  nao_uteis int not null default 0
);
create index if not exists hd_artigos_categoria on public.hd_artigos (categoria_id);

create table if not exists public.hd_artigo_chamados (
  artigo_id bigint not null references public.hd_artigos(id) on delete cascade,
  chamado_id bigint not null references public.hd_chamados(id) on delete cascade,
  vinculado_por text,
  criado_em timestamptz not null default now(),
  primary key (artigo_id, chamado_id)
);
create index if not exists hd_artigo_chamados_chamado on public.hd_artigo_chamados (chamado_id);

create or replace function public.hd_artigo_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.titulo := trim(new.titulo);
  new.tags := coalesce((select array_agg(distinct lower(trim(t))) from unnest(new.tags) t where trim(t) <> ''), '{}');
  if tg_op = 'INSERT' then
    new.autor_email := coalesce(public.hd_email(), new.autor_email);
    new.criado_em := now();
    new.visualizacoes := 0; new.uteis := 0; new.nao_uteis := 0;
  else
    new.autor_email := old.autor_email;
    new.criado_em := old.criado_em;
    -- contadores só mudam pelo hd_artigo_contar
    if current_setting('hd.contador', true) is distinct from 'sim' then
      new.visualizacoes := old.visualizacoes; new.uteis := old.uteis; new.nao_uteis := old.nao_uteis;
    end if;
  end if;
  if current_setting('hd.contador', true) is distinct from 'sim' then
    new.atualizado_em := now();
    new.atualizado_por := coalesce(public.hd_email(), new.atualizado_por);
  end if;
  return new;
end $$;
create or replace trigger hd_artigo_antes before insert or update on public.hd_artigos
for each row execute function public.hd_artigo_antes();

create or replace function public.hd_vinculo_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.vinculado_por := coalesce(public.hd_email(), new.vinculado_por);
  new.criado_em := now();
  return new;
end $$;
create or replace trigger hd_vinculo_antes before insert on public.hd_artigo_chamados
for each row execute function public.hd_vinculo_antes();

alter table public.hd_artigos enable row level security;
alter table public.hd_artigo_chamados enable row level security;

create policy hd_artigos_ler on public.hd_artigos for select to authenticated
  using (public.hd_eh_equipe() or (status = 'publicado' and visibilidade = 'publica' and public.hd_pode_abrir()));
create policy hd_artigos_criar on public.hd_artigos for insert to authenticated with check (public.hd_eh_equipe());
create policy hd_artigos_editar on public.hd_artigos for update to authenticated using (public.hd_eh_equipe()) with check (public.hd_eh_equipe());
create policy hd_artigos_excluir on public.hd_artigos for delete to authenticated using (public.hd_eh_agente());

create policy hd_artigo_chamados_ler on public.hd_artigo_chamados for select to authenticated using (public.hd_eh_equipe());
create policy hd_artigo_chamados_criar on public.hd_artigo_chamados for insert to authenticated with check (public.hd_eh_equipe());
create policy hd_artigo_chamados_excluir on public.hd_artigo_chamados for delete to authenticated using (public.hd_eh_equipe());

grant select, insert, update, delete on public.hd_artigos, public.hd_artigo_chamados to authenticated;

-- contadores (qualquer um que enxerga o artigo)
create or replace function public.hd_artigo_contar(p_id bigint, p_evento text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from hd_artigos a where a.id = p_id
                 and (public.hd_eh_equipe() or (a.status = 'publicado' and a.visibilidade = 'publica' and public.hd_pode_abrir()))) then
    return;
  end if;
  perform set_config('hd.contador', 'sim', true);
  update hd_artigos set
    visualizacoes = visualizacoes + (p_evento = 'visto')::int,
    uteis = uteis + (p_evento = 'util')::int,
    nao_uteis = nao_uteis + (p_evento = 'nao_util')::int
  where id = p_id;
  perform set_config('hd.contador', '', true);
end $$;
revoke execute on function public.hd_artigo_contar(bigint, text) from public, anon;
grant execute on function public.hd_artigo_contar(bigint, text) to authenticated;

-- prints dos artigos no Storage
create or replace function public.hd_pode_ver_kb(p_nome text)
returns boolean language sql stable security definer set search_path = public as $$
  select split_part(p_nome, '/', 1) = 'kb' and (
    public.hd_eh_equipe()
    or exists (select 1 from public.hd_artigos a where a.status = 'publicado' and a.visibilidade = 'publica'
               and public.hd_pode_abrir() and position(p_nome in a.conteudo) > 0))
$$;
create policy hd_kb_ler on storage.objects for select to authenticated
  using (bucket_id = 'helpdesk' and public.hd_pode_ver_kb(name));
create policy hd_kb_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'helpdesk' and split_part(name, '/', 1) = 'kb' and public.hd_eh_equipe());

-- relatório semanal: artigos novos/atualizados entram em "Principais atividades"
-- (âncora em código, porque os comentários não ficam no corpo salvo da função)
do $$ declare d text := pg_get_functiondef('public.hd_rel_dados(date)'::regprocedure); a text := $a$v_resumo := format('Semana com$a$; begin
  if position('Base de conhecimento' in d) > 0 then return; end if;
  if position(a in d) = 0 then raise exception 'âncora não encontrada'; end if;
  d := replace(d, a, $b$v_bloco := '';
  for x in
    select titulo, criado_em >= v_a novo from hd_artigos
    where status = 'publicado' and atualizado_em >= v_a and atualizado_em < v_b
    order by criado_em limit 10
  loop
    v_bloco := v_bloco || format(E'• %s%s\n', left(x.titulo, 100), case when x.novo then '' else ' (atualizado)' end);
  end loop;
  if v_bloco <> '' then v_txt := v_txt || case when v_txt <> '' then E'\n' else '' end || E'Base de conhecimento\n' || v_bloco; end if;

  $b$ || a);
  execute d;
end $$;
