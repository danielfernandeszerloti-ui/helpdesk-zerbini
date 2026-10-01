-- Dados para o dashboard de indicadores (só TI/admin)
create or replace function public.hd_dash_chamados(p_desde timestamptz)
returns table (
  id bigint, titulo text, criado_em timestamptz, resolvido_em timestamptz, status text, prioridade text,
  categoria_id bigint, categoria text, setor text, solicitante text, atribuido_email text,
  prazo_sla timestamptz, primeira_resposta_em timestamptz
)
language sql stable security definer set search_path = public as $$
  select c.id, c.titulo, c.criado_em, c.resolvido_em, c.status, c.prioridade,
    c.categoria_id, k.nome, c.setor, coalesce(nullif(c.solicitante_nome,''), c.solicitante_email), c.atribuido_email,
    c.prazo_sla,
    (select min(m.criado_em) from public.hd_mensagens m
      where m.chamado_id = c.id and m.tipo = 'mensagem' and not m.interna and m.autor_email <> c.solicitante_email)
  from public.hd_chamados c left join public.hd_categorias k on k.id = c.categoria_id
  where public.hd_eh_agente()
    and (c.criado_em >= p_desde or c.resolvido_em >= p_desde or c.status not in ('resolvido','cancelado'))
  order by c.id
$$;
revoke execute on function public.hd_dash_chamados(timestamptz) from public, anon;
grant execute on function public.hd_dash_chamados(timestamptz) to authenticated;
create index if not exists hd_mensagens_chamado_tipo_idx on public.hd_mensagens (chamado_id, criado_em) where tipo = 'mensagem' and not interna;
