-- Entrada de e-mails pela caixa helpdesk@ — já aplicado no projeto (6 migrações menores).
-- Fluxo: pg_cron (hd-emails-entrada, todo minuto) → hd_disparar_leitura_emails() decide a cadência
-- (2 min das 7h às 20h seg–sáb; 10 min no resto) → POST /api/receber-emails (Vercel, IMAP)
-- → RPCs abaixo, protegidas pelo segredo hd_notif_segredo do Vault.
--
-- Tabela hd_emails_recebidos: histórico (message_id único evita duplicar), lido em Configurações → E-mail.
-- hd_config: email_entrada_ativa, email_entrada_estado (uidvalidity/uid já lidos), email_entrada_lease,
--            email_entrada_ultimo_req, categoria_email.
--
-- hd_email_entrada_estado(segredo)            → {ativa, livre, estado} e reserva a leitura por 90 s
-- hd_email_entrada_salvar(segredo, estado, liberar)
-- hd_email_receber(segredo, p jsonb)          → novo chamado | resposta | nota interna | duplicado
--   * assunto com "Chamado #0012": entra no chamado (solicitante ou equipe = mensagem; outra pessoa = nota interna)
--   * equipe encaminhando (ENC:) → chamado em nome do remetente original, registrado_por = quem encaminhou
--   * demais → chamado novo em nome do remetente, origem 'email', confirmação "Recebemos sua solicitação"
--   * age como o remetente (request.jwt.claims local) para os gatilhos existentes valerem
-- hd_email_anexo(...)                         → registra anexo já enviado ao Storage
-- hd_email_falha(...)                         → registra erro de leitura
-- hd_email_entrada_painel()                   → dados da aba Configurações → E-mail (só equipe)
-- hd_chamado_antes_inserir / hd_notif_novo_chamado: reconhecem a flag local hd.entrada_email = '1'.

create table if not exists public.hd_emails_recebidos (
  id bigint generated always as identity primary key,
  message_id text not null unique,
  remetente text not null default '',
  assunto text not null default '',
  acao text not null,
  detalhe text,
  chamado_id bigint references public.hd_chamados(id) on delete set null,
  mensagem_id bigint,
  recebido_em timestamptz not null default now()
);
alter table public.hd_emails_recebidos enable row level security;

insert into public.hd_config (chave, valor) values
  ('email_entrada_ativa', 'sim'), ('email_entrada_estado', ''), ('email_entrada_lease', ''),
  ('email_entrada_ultimo_req', ''), ('categoria_email', '')
on conflict (chave) do nothing;

-- select cron.schedule('hd-emails-entrada', '* * * * *', 'select public.hd_disparar_leitura_emails()');
