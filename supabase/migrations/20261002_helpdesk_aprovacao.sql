-- Aprovação da gerência antes do Backlog — já aplicado no projeto (5 migrações menores).
--
-- hd_equipe: papel 'gestor' (vê o Kanban e aprova) e coluna aprova (admin que recebe e aprova projetos).
-- hd_etapas: coluna aprovacao; etapa "Aguardando aprovação" (ordem 0) passa a ser a etapa inicial.
-- hd_eh_dev(): inclui 'gestor'. hd_pode_aprovar(): admin, gestor ou aprova = true.
-- hd_etapa_aprovacao(): id da etapa de aprovação ativa (desativar a etapa desliga o fluxo).
-- hd_chamado_antes_atualizar: só quem aprova tira/coloca um projeto da etapa de aprovação
--   ou o finaliza/cancela enquanto está nela (o solicitante ainda pode cancelar o próprio).
-- Notificações: projeto novo → 'aprovacao' para quem aprova + TI que atende (dev não);
--   aprovado → 'aprovado' para os devs e "Solicitação aprovada" ao solicitante;
--   recusado (cancelado na etapa de aprovação) → "não aprovada" com o motivo ao solicitante.
-- hd_equipe_detalhe_v2(): inclui a coluna aprova.

alter table public.hd_equipe drop constraint hd_equipe_papel_check;
alter table public.hd_equipe add constraint hd_equipe_papel_check check (papel in ('admin','ti','dev','gestor'));
alter table public.hd_equipe add column if not exists aprova boolean not null default false;
alter table public.hd_etapas add column if not exists aprovacao boolean not null default false;
insert into public.hd_etapas (nome, ordem, cor, finaliza, ativa, aprovacao)
select 'Aguardando aprovação', 0, 'amarelo', false, true, true
where not exists (select 1 from public.hd_etapas where aprovacao);
update public.hd_equipe set aprova = true where email = 'amanda.alencar@grupozerbini.com.br';
