-- Avaliação do atendimento — já aplicado no projeto.
-- hd_chamados: avaliacao (1–5), avaliacao_comentario, avaliado_em.
-- hd_avaliar(id, nota, comentario): só o solicitante, só chamado resolvido; registra evento no histórico
--   ("Fulano avaliou o atendimento: ★★★★☆ — comentário") e avisa o responsável por e-mail se nota ≤ 2.
-- hd_notif_status: e-mail de finalização com 5 estrelas clicáveis (/chamado/ID?avaliar=N), só para @grupozerbini.
-- hd_dash_chamados_v3: Indicadores com avaliação (card Satisfação e coluna por responsável).
alter table public.hd_chamados
  add column if not exists avaliacao smallint check (avaliacao between 1 and 5),
  add column if not exists avaliacao_comentario text,
  add column if not exists avaliado_em timestamptz;
