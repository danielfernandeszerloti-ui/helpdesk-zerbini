-- Responsável padrão por categoria — já aplicado no projeto.
-- hd_categorias.responsavel_email; hd_resp_categoria(cat) devolve o responsável se estiver ativo e atendendo.
-- Novo chamado: o responsável da categoria vale sobre o padrão geral (inclusive no Kanban).
-- Troca de categoria: se o chamado estava sem responsável ou com o padrão, passa para o da nova categoria.
-- Desenvolvimento / Melhoria → lucas.santos@grupozerbini.com.br.
alter table public.hd_categorias add column if not exists responsavel_email text;
update public.hd_categorias set responsavel_email = 'lucas.santos@grupozerbini.com.br' where kanban and nome ilike 'Desenvolvimento%';
