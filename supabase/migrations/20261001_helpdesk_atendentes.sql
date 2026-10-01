-- Atendentes: quem aparece em "Atribuído a" e recebe avisos de chamados novos.
-- Aplicado em partes: helpdesk_atendentes_1, _2 e _3_padrao.
alter table public.hd_equipe add column if not exists atende boolean not null default true;
update public.hd_equipe set atende = false where email in ('amanda.alencar@grupozerbini.com.br', 'danielfernandeszerloti@gmail.com');

-- Responsável padrão para novos chamados fora do Kanban (vazio = ninguém)
insert into public.hd_config (chave, valor) values ('responsavel_padrao', 'daniel.zerloti@grupozerbini.com.br')
on conflict (chave) do nothing;

-- hd_equipe_detalhe(): lista da equipe com o campo "atende"
-- hd_agentes_emails / hd_destinos_equipe: só membros com atende = true
-- hd_chamado_antes_inserir: aplica o responsável padrão (ver migração aplicada no Supabase)
