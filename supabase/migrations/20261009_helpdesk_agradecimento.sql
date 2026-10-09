-- Já aplicado no projeto.
-- "Obrigado" depois de finalizado não reabre o chamado.
-- hd_mensagens.reabrir (bool): enviado pela tela quando o colaborador escolhe "Não, reabrir chamado".
-- hd_eh_agradecimento(texto): mensagem curta de agradecimento/confirmação, sem pergunta nem sinal de problema.
-- hd_mensagem_depois_inserir: em chamado resolvido, só reabre se reabrir = true ou se não for agradecimento.
-- hd_notif_mensagem: resposta do solicitante em chamado finalizado não gera e-mail para a TI.
-- hd_confirmar_resolucao(id): botão "Sim, resolveu" registra "Fulano confirmou que o problema foi resolvido".
alter table public.hd_mensagens add column if not exists reabrir boolean;
