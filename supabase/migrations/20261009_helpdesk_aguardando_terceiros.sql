-- "Pausado" vira "Aguardando terceiros" — já aplicado no projeto.
-- hd_chamados.aguardando (quem) e retomar_em (quando cobrar); hd_tarefas.automatica ('cobrar_retorno').
-- hd_chamado_antes_atualizar: SLA pausa em 'em_espera' e em 'pausado'.
-- hd_chamado_terceiros (after update): registra "Aguardando X · retorno previsto para dd/mm", cria a tarefa
--   "Cobrar retorno …" para o responsável na data; ao sair do status, conclui a tarefa.
-- hd_rotulo_status('pausado') = 'Aguardando terceiros'. Chamados que já estavam pausados passaram a ter o SLA pausado.
alter table public.hd_chamados add column if not exists aguardando text, add column if not exists retomar_em date;
alter table public.hd_tarefas add column if not exists automatica text;
