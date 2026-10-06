-- Tarefas + tela Hoje — já aplicado no projeto.
-- hd_tarefas passa a servir para tarefas avulsas e de chamados (o checklist dos projetos usa a mesma tabela):
--   chamado_id opcional, responsavel_email, prazo (date), prazo_hora, notas, prioridade (normal|alta),
--   recorrencia ('' | diaria | dias_uteis | semanal | mensal), recorrencia_gerada.
-- Acesso (hd_pode_tarefa): tarefa de chamado → quem atende o chamado; tarefa avulsa → quem criou ou o responsável.
-- hd_tarefa_antes: responsável padrão (quem criou; em chamado, o responsável do chamado);
--   ao concluir: evento interno "Tarefa concluída" no chamado e, se recorrente, cria a próxima
--   (hd_proxima_data: sempre depois de hoje; dias úteis pulam fim de semana e hd_feriados).

alter table public.hd_tarefas alter column chamado_id drop not null;
alter table public.hd_tarefas
  add column if not exists responsavel_email text,
  add column if not exists prazo date,
  add column if not exists prazo_hora time,
  add column if not exists notas text not null default '',
  add column if not exists prioridade text not null default 'normal' check (prioridade in ('normal','alta')),
  add column if not exists recorrencia text not null default '' check (recorrencia in ('','diaria','dias_uteis','semanal','mensal')),
  add column if not exists recorrencia_gerada boolean not null default false;
create index if not exists hd_tarefas_resp on public.hd_tarefas (responsavel_email, feita, prazo);
create index if not exists hd_tarefas_chamado on public.hd_tarefas (chamado_id);
