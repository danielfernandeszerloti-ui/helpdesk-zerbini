# Zerbini Helpdesk

Sistema interno de chamados do Grupo Zerbini — substituto do Auvodesk.

- **Colaboradores** entram com o e-mail `@grupozerbini.com.br` (link de acesso, sem senha), abrem chamados com anexos e acompanham as respostas.
- **Equipe de TI** (membros `admin`/`editor` da Gestão de Ativos) usa o painel com contadores (Não lidos, Abertos, Em espera, Em atraso, Pausados, Não atribuídos, Encerram hoje), atribuição, prioridade, SLA por categoria, notas internas, vínculo com equipamentos e exportação para Excel.

**Stack:** React + Vite · Supabase (banco, login, arquivos, tempo real) · Vercel · domínio `chamados.grupozerbini.com.br`.

O banco fica no mesmo projeto Supabase da Gestão de Ativos (`gestao-ativos-ti`), em tabelas com prefixo `hd_`.

---

## Publicar (uma vez só)

### 1. Vercel
1. Acesse <https://vercel.com> e entre com a conta do GitHub.
2. **Add New → Project** → importe `helpdesk-zerbini`.
3. Framework: **Vite** (detecta sozinho). Não precisa de variáveis de ambiente.
4. **Deploy**. A cada `git push` na `main` o site é atualizado automaticamente.

### 2. Domínio no Registro.br
1. Na Vercel: projeto → **Settings → Domains** → adicione `chamados.grupozerbini.com.br`.
2. No Registro.br: `grupozerbini.com.br` → **Editar zona** → nova entrada:
   - Tipo: **CNAME** · Nome: `chamados` · Dados: `cname.vercel-dns.com.`
3. Aguarde a propagação (minutos a algumas horas). O HTTPS é automático.

### 3. Supabase — login
No painel do projeto `gestao-ativos-ti`:
1. **Authentication → URL Configuration → Redirect URLs**: adicione
   `https://chamados.grupozerbini.com.br/**` (e `http://localhost:5173/**` para testes).
   Não altere a *Site URL* se ela já for usada pela Gestão de Ativos.
2. **Authentication → Emails → SMTP Settings** (**obrigatório**): o envio de e-mail padrão do Supabase tem limite de poucos e-mails por hora — não aguenta a empresa toda entrando. Configure um SMTP próprio, por exemplo:
   - Microsoft 365: host `smtp.office365.com`, porta `587`, usuário/senha de uma caixa como `helpdesk@grupozerbini.com.br` (com *SMTP AUTH* habilitado no admin do M365); ou
   - Resend / Brevo (planos gratuitos), verificando o domínio.
3. (Opcional) **Authentication → Emails → Magic Link**: incluir `{{ .Token }}` no modelo para o colaborador também poder digitar o código de 6 dígitos.

### 4. Quem é da TI
Atendentes são os e-mails da tabela `membros` com papel `admin` ou `editor` (a mesma da Gestão de Ativos). Para adicionar alguém da TI, cadastre na Gestão de Ativos ou:
```sql
insert into membros (email, papel) values ('nome.sobrenome@grupozerbini.com.br', 'editor');
```

---

## Desenvolvimento local
```bash
npm install
npm run dev   # http://localhost:5173
```

## Banco de dados
As migrações estão em `supabase/migrations/` (já aplicadas no projeto):
- `helpdesk_inicial` — tabelas `hd_categorias`, `hd_chamados`, `hd_mensagens`, `hd_anexos`, bucket `helpdesk` (privado, 10 MB/arquivo), regras de acesso (RLS), gatilhos de histórico e funções do app.
- `bloquear_cadastro_externo` — impede criar contas fora de `@grupozerbini.com.br` (exceto e-mails em `membros`). Vale para o projeto todo.
- `helpdesk_permissoes` — ajustes do Security Advisor.

### Regras principais
| Quem | Pode |
|---|---|
| Colaborador | abrir chamado, ver/responder só os próprios, anexar, cancelar enquanto estiver "Novo" |
| TI (admin/editor) | ver todos, mudar status/prioridade/responsável/categoria/SLA, notas internas, vincular equipamento |
| Admin | excluir chamado |

- Resposta do colaborador em chamado **Em espera** ou **Resolvido** volta para **Aberto**.
- Primeira resposta da TI em chamado **Novo** muda para **Aberto**.
- O prazo de SLA vem das horas configuradas na categoria (tela *Categorias*).
- Imagens acima de 800 KB são reduzidas no navegador antes do envio.
