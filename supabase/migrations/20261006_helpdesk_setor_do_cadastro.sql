-- Já aplicado no projeto.
-- hd_chamado_antes_inserir: quando o chamado chega sem setor/nome/AnyDesk (e-mail, encaminhado,
-- registro manual), completa pelo cadastro de usuários da Gestão de Ativos (public.usuarios, pelo login
-- do e-mail @grupozerbini.com.br) ou pelo último chamado da pessoa.
-- Correção dos chamados antigos sem setor:
update public.hd_chamados c set setor = u.setor
  from public.usuarios u
 where coalesce(c.setor,'') = '' and c.solicitante_email like '%@grupozerbini.com.br'
   and lower(u.login) = split_part(c.solicitante_email,'@',1) and coalesce(btrim(u.setor),'') <> '';
