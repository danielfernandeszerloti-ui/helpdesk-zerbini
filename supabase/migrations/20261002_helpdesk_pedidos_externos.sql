-- Pedidos recebidos fora do sistema (e-mail, telefone, Teams...) — já aplicado no projeto.
-- Resumo (as funções completas estão no banco; aplicadas em 5 migrações menores):
--
-- hd_chamados: origem ('sistema','email','telefone','teams','whatsapp','presencial'),
--              avisar_solicitante (bool), registrado_por (e-mail de quem registrou)
-- hd_mensagens: do_solicitante (bool), registrado_por
--
-- hd_chamado_antes_inserir: agente pode registrar para qualquer e-mail (qualquer domínio);
--   criado_em = data em que o pedido chegou (até 30 dias atrás) e o SLA conta dali.
-- hd_mensagem_antes_inserir: agente pode registrar "resposta do solicitante" (autor = solicitante,
--   registrado_por = agente); essas mensagens não geram e-mail.
-- hd_externo(email): true quando não é @grupozerbini.com.br.
-- hd_email_html_v2(..., p_externo): sem botão para quem não tem acesso ("basta responder este e-mail").
-- hd_email_html_sol(...): versão usada nos e-mails ao solicitante.
-- hd_notif_novo_chamado: aviso à equipe indica "pediu por e-mail — registrado por X" e envia
--   confirmação "Recebemos sua solicitação" ao solicitante (se avisar_solicitante).
-- hd_notif_mensagem / hd_notif_status / hd_notif_etapa: respeitam avisar_solicitante.
-- hd_processar_notificacoes: envia 'responder_para' (responsável do chamado) quando há
--   destinatário externo; /api/notificar usa como Reply-To.

alter table public.hd_chamados
  add column if not exists origem text not null default 'sistema'
    check (origem in ('sistema','email','telefone','teams','whatsapp','presencial')),
  add column if not exists avisar_solicitante boolean not null default true,
  add column if not exists registrado_por text;
alter table public.hd_mensagens
  add column if not exists do_solicitante boolean not null default false,
  add column if not exists registrado_por text;

create or replace function public.hd_externo(p_email text)
 returns boolean language sql immutable as
$$ select coalesce(lower(p_email), '') not like '%@grupozerbini.com.br' $$;
