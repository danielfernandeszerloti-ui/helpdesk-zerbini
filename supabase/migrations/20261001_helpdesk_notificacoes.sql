-- =====================================================================
-- Notificações por e-mail do Zerbini Helpdesk
-- Gatilhos colocam e-mails numa fila (hd_notificacoes); um job do pg_cron,
-- a cada minuto, envia cada item para a função /api/notificar na Vercel,
-- que dispara o e-mail pelo SMTP da empresa.
-- =====================================================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table public.hd_notificacoes (
  id bigint generated always as identity primary key,
  chamado_id bigint references public.hd_chamados(id) on delete cascade,
  tipo text not null,
  destinatarios text[] not null,
  assunto text not null,
  html text not null,
  status text not null default 'pendente' check (status in ('pendente','enviando','enviado','erro','ignorado')),
  tentativas int not null default 0,
  request_id bigint,
  erro text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index hd_notificacoes_status_idx on public.hd_notificacoes (status, criado_em);
create index hd_notificacoes_chamado_idx on public.hd_notificacoes (chamado_id);
alter table public.hd_notificacoes enable row level security;
create policy hd_notif_ler on public.hd_notificacoes for select to authenticated using (public.hd_eh_agente());

-- Configuração (endereço do site e da função)
create table public.hd_config (chave text primary key, valor text not null);
alter table public.hd_config enable row level security;
create policy hd_config_ler on public.hd_config for select to authenticated using (public.hd_eh_agente());
create policy hd_config_admin on public.hd_config for all to authenticated
  using (public.papel_atual() = 'admin') with check (public.papel_atual() = 'admin');
insert into public.hd_config values
  ('site_url', 'https://chamados.grupozerbini.com.br'),
  ('notificacoes_ativas', 'sim');

-- Segredo compartilhado com a função da Vercel (variável HD_SEGREDO)
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'hd_notif_segredo',
  'Segredo do endpoint /api/notificar do helpdesk');

create or replace function public.hd_cfg(p text) returns text
language sql stable security definer set search_path = public as
$$ select valor from public.hd_config where chave = p $$;

create or replace function public.hd_esc(t text) returns text
language sql immutable set search_path = public as $$
  select replace(replace(replace(replace(replace(coalesce(t,''),
    '&','&amp;'),'<','&lt;'),'>','&gt;'),'"','&quot;'),E'\n','<br>')
$$;

create or replace function public.hd_nome(p_email text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(nome,'') from public.usuarios where lower(login) = split_part(lower(p_email),'@',1) limit 1),
    initcap(replace(replace(split_part(p_email,'@',1),'.',' '),'_',' ')))
$$;

-- Modelo de e-mail
create or replace function public.hd_email_html(p_chamado public.hd_chamados, p_titulo text, p_intro text,
  p_corpo text default null, p_botao text default 'Abrir chamado') returns text
language plpgsql stable security definer set search_path = public as $$
declare v_url text := public.hd_cfg('site_url') || '/chamado/' || p_chamado.id;
  v_cod text := '#' || lpad(p_chamado.id::text, 4, '0');
begin
  return
  '<div style="background:#f3f4f8;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;color:#1f2233">'
  || '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e3e4ec">'
  || '<div style="height:4px;background:linear-gradient(90deg,#4be0db,#212f96,#f9518d);background-color:#212f96"></div>'
  || '<div style="padding:22px 26px">'
  || '<div style="font-size:12px;color:#6b7085;margin-bottom:6px">Zerbini Helpdesk · Chamado ' || v_cod || '</div>'
  || '<h2 style="margin:0 0 6px;font-size:19px;color:#0f2c66">' || public.hd_esc(p_titulo) || '</h2>'
  || '<p style="margin:0 0 14px;font-size:14px;color:#3b4255">' || p_intro || '</p>'
  || case when p_corpo is not null and p_corpo <> '' then
       '<div style="background:#f7f8fe;border-left:3px solid #4be0db;padding:12px 14px;border-radius:6px;font-size:14px;margin-bottom:16px">'
       || public.hd_esc(left(p_corpo, 3000)) || '</div>' else '' end
  || '<a href="' || v_url || '" style="display:inline-block;background:#212f96;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600">'
  || public.hd_esc(p_botao) || '</a>'
  || '</div></div>'
  || '<p style="text-align:center;font-size:11px;color:#9a9db0;margin:14px 0 0">E-mail automático do helpdesk do Grupo Zerbini. Para responder, use o botão acima.</p>'
  || '</div>';
end $$;

create or replace function public.hd_agentes_emails(p_excluir text default '') returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(lower(email) order by email), '{}') from public.membros
  where papel in ('admin','editor') and lower(email) like '%@grupozerbini.com.br'
    and lower(email) <> lower(coalesce(p_excluir,''))
$$;

create or replace function public.hd_enfileirar(p_chamado bigint, p_tipo text, p_para text[], p_assunto text, p_html text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.hd_cfg('notificacoes_ativas'),'sim') <> 'sim' then return; end if;
  if p_para is null or cardinality(p_para) = 0 then return; end if;
  insert into public.hd_notificacoes (chamado_id, tipo, destinatarios, assunto, html)
  values (p_chamado, p_tipo, p_para, p_assunto, p_html);
end $$;

-- Novo chamado -> TI
create or replace function public.hd_notif_novo_chamado() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cat text; v_nome text := coalesce(nullif(new.solicitante_nome,''), public.hd_nome(new.solicitante_email));
begin
  select nome into v_cat from public.hd_categorias where id = new.categoria_id;
  perform public.hd_enfileirar(new.id, 'novo', public.hd_agentes_emails(public.hd_email()),
    'Novo chamado #' || lpad(new.id::text,4,'0') || ': ' || new.titulo,
    public.hd_email_html(new, new.titulo,
      '<b>' || public.hd_esc(v_nome) || '</b>' || case when new.setor <> '' then ' (' || public.hd_esc(new.setor) || ')' else '' end
      || ' abriu um chamado' || case when v_cat is not null then ' em <b>' || public.hd_esc(v_cat) || '</b>' else '' end
      || case when new.anydesk <> '' then '. AnyDesk: <b>' || public.hd_esc(new.anydesk) || '</b>' else '' end || '.',
      new.descricao, 'Ver chamado'));
  return null;
end $$;
create trigger hd_notif_novo_chamado after insert on public.hd_chamados
  for each row execute function public.hd_notif_novo_chamado();

-- Mensagens -> colaborador (resposta da TI) ou TI (resposta do colaborador)
create or replace function public.hd_notif_mensagem() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.hd_chamados; v_para text[]; v_quem text;
begin
  if new.tipo <> 'mensagem' or new.interna then return null; end if;
  select * into c from public.hd_chamados where id = new.chamado_id;
  v_quem := public.hd_nome(new.autor_email);
  if new.autor_email = c.solicitante_email then
    v_para := case when c.atribuido_email is not null and c.atribuido_email like '%@grupozerbini.com.br'
                   then array[lower(c.atribuido_email)] else public.hd_agentes_emails(new.autor_email) end;
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
create trigger hd_notif_mensagem after insert on public.hd_mensagens
  for each row execute function public.hd_notif_mensagem();

-- Chamado finalizado -> colaborador (junta com a resposta enviada no mesmo momento)
create or replace function public.hd_notif_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_msg text; v_pend bigint; v_html text;
begin
  if new.status is not distinct from old.status or new.status <> 'resolvido' then return null; end if;
  if lower(new.solicitante_email) = public.hd_email() then return null; end if;
  select id into v_pend from public.hd_notificacoes
   where chamado_id = new.id and tipo = 'resposta_ti' and status = 'pendente'
     and criado_em > now() - interval '3 minutes' order by id desc limit 1;
  select corpo into v_msg from public.hd_mensagens
   where chamado_id = new.id and tipo = 'mensagem' and not interna and autor_email <> new.solicitante_email
     and criado_em > now() - interval '3 minutes' order by id desc limit 1;
  v_html := public.hd_email_html(new, new.titulo,
    'Seu chamado foi <b>finalizado</b> pela TI.' || case when v_msg is not null then ' Última mensagem:' else '' end
    || '', v_msg, 'Ver chamado');
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
create trigger hd_notif_status after update of status on public.hd_chamados
  for each row execute function public.hd_notif_status();

-- Envio (roda a cada minuto pelo pg_cron)
create or replace function public.hd_processar_notificacoes() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare n public.hd_notificacoes; r record; v_seg text; v_url text; v_req bigint; enviados int := 0;
begin
  -- 1. confere os envios anteriores
  for n in select * from public.hd_notificacoes where status = 'enviando' loop
    select status_code, coalesce(error_msg, left(content, 300)) as msg into r from net._http_response where id = n.request_id;
    if found and r.status_code between 200 and 299 then
      update public.hd_notificacoes set status = 'enviado', enviado_em = now(), erro = null where id = n.id;
    elsif found then
      update public.hd_notificacoes set status = case when n.tentativas >= 5 then 'erro' else 'pendente' end,
        erro = coalesce(r.status_code::text,'') || ' ' || coalesce(r.msg,'') where id = n.id;
    elsif n.criado_em < now() - interval '30 minutes' then
      update public.hd_notificacoes set status = case when n.tentativas >= 5 then 'erro' else 'pendente' end,
        erro = 'sem resposta' where id = n.id;
    end if;
  end loop;

  -- 2. envia os pendentes (espera 20 s para juntar resposta + finalização)
  select decrypted_secret into v_seg from vault.decrypted_secrets where name = 'hd_notif_segredo';
  v_url := public.hd_cfg('site_url') || '/api/notificar';
  for n in select * from public.hd_notificacoes
            where status = 'pendente' and criado_em < now() - interval '20 seconds'
            order by id limit 20 for update skip locked loop
    v_req := net.http_post(
      url := v_url,
      body := jsonb_build_object('id', n.id, 'para', to_jsonb(n.destinatarios), 'assunto', n.assunto, 'html', n.html),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-hd-segredo', v_seg),
      timeout_milliseconds := 20000);
    update public.hd_notificacoes set status = 'enviando', request_id = v_req, tentativas = tentativas + 1 where id = n.id;
    enviados := enviados + 1;
  end loop;
  return enviados || ' enviados';
end $$;

revoke execute on function public.hd_processar_notificacoes(), public.hd_enfileirar(bigint,text,text[],text,text),
  public.hd_notif_novo_chamado(), public.hd_notif_mensagem(), public.hd_notif_status(),
  public.hd_email_html(public.hd_chamados,text,text,text,text), public.hd_agentes_emails(text),
  public.hd_cfg(text), public.hd_nome(text)
  from public, anon, authenticated;

select cron.schedule('hd-notificacoes', '* * * * *', 'select public.hd_processar_notificacoes()');
