-- Ajustes de segurança apontados pelo Security Advisor do Supabase
alter function public.hd_rotulo_status(text) set search_path = public;
alter function public.hd_rotulo_prioridade(text) set search_path = public;

-- Funções de gatilho: ninguém chama direto pela API
revoke execute on function public.hd_chamado_antes_inserir(), public.hd_chamado_antes_atualizar(),
  public.hd_chamado_registrar_eventos(), public.hd_mensagem_antes_inserir(),
  public.hd_mensagem_depois_inserir(), public.hd_anexo_antes_inserir(),
  public.bloquear_cadastro_externo()
  from public, anon, authenticated;

-- Funções do app e das regras de acesso: só usuários logados
revoke execute on function public.hd_email(), public.hd_eh_agente(), public.hd_pode_abrir(),
  public.hd_pode_ver_chamado(bigint), public.hd_pode_ver_caminho(text),
  public.hd_meu_perfil(), public.hd_meus_ativos(), public.hd_marcar_lido(bigint),
  public.hd_cancelar_meu_chamado(bigint)
  from public, anon;
grant execute on function public.hd_email(), public.hd_eh_agente(), public.hd_pode_abrir(),
  public.hd_pode_ver_chamado(bigint), public.hd_pode_ver_caminho(text),
  public.hd_meu_perfil(), public.hd_meus_ativos(), public.hd_marcar_lido(bigint),
  public.hd_cancelar_meu_chamado(bigint)
  to authenticated;
