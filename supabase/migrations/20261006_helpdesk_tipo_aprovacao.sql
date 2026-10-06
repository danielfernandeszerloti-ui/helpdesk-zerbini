-- Etapa 2: Tipo (incidente/solicitação) e aprovação por categoria — já aplicado no projeto.
-- hd_categorias: tipo_padrao, exige_aprovacao (Solicitação de Compra e Aquisição de Equipamentos e Serviços de TI).
-- hd_chamados: tipo, aprovacao (pendente|aprovada|recusada), aprovado_por, aprovado_em, valor_estimado.
-- Gatilhos:
--   hd_chamado_antes_inserir_tipo     → tipo pela categoria (TI pode escolher); exige aprovação → pendente e SLA nulo
--   hd_chamado_antes_atualizar_aprov  → só quem aprova decide; aprovada inicia o SLA; recusada cancela;
--                                        pendente não pode ser finalizado; troca de categoria ajusta tipo/aprovação
--   hd_chamado_aprov_depois           → eventos no histórico e e-mails (aguardando aprovação, aprovada p/ TI e
--                                        solicitante, recusada com motivo)
-- hd_notif_novo_chamado: quem aprova não recebe "novo chamado" duplicado.
-- hd_atende / políticas de hd_chamados: perfil gestor vê e decide chamados com aprovação.
-- hd_dash_chamados_v2: Indicadores com tipo, aprovação e valor.

alter table public.hd_categorias
  add column if not exists tipo_padrao text not null default 'solicitacao' check (tipo_padrao in ('incidente','solicitacao')),
  add column if not exists exige_aprovacao boolean not null default false;
alter table public.hd_chamados
  add column if not exists tipo text check (tipo in ('incidente','solicitacao')),
  add column if not exists aprovacao text check (aprovacao in ('pendente','aprovada','recusada')),
  add column if not exists aprovado_por text,
  add column if not exists aprovado_em timestamptz,
  add column if not exists valor_estimado numeric(12,2) check (valor_estimado is null or valor_estimado >= 0);
