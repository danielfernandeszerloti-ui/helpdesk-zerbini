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

### 4. Equipe do helpdesk
A equipe fica em **Configurações → Equipe** (tabela `hd_equipe`), separada da Gestão de Ativos:

| Perfil | Pode |
|---|---|
| Administrador | tudo, inclusive equipe e exclusão de chamados |
| TI | atender todos os chamados, categorias e etapas |
| Desenvolvedor | ver e atender **só** os chamados das categorias marcadas como Kanban |

### Kanban de desenvolvimento
- Categorias com **Kanban = Sim** (Configurações → Categorias) entram no quadro **Desenvolvimento**.
- Etapas editáveis em Configurações → Etapas do Kanban. A etapa final ("Concluído") finaliza o chamado.
- Cada cartão tem previsão de entrega (alerta de atraso), checklist e histórico de etapas; o quadro mostra o tempo médio em cada etapa (últimos 180 dias).
- O solicitante vê o andamento no chamado e recebe e-mail a cada mudança de etapa.

### Indicadores
Aba **Indicadores** (TI/admin): SLA cumprido, abertos × concluídos, pendentes, tempo médio de 1ª resposta e de resolução (com mediana e comparação com o período anterior), pendentes por idade/prioridade, abertos por setor, tabelas por categoria e por responsável e os pendentes mais antigos. Filtros de período, categoria e responsável.
- **SLA cumprido** = concluídos no período com prazo de SLA que foram resolvidos dentro do prazo.
- **1ª resposta** = primeira mensagem da equipe visível ao colaborador (notas internas não contam).

### 5. Notificações por e-mail
O Supabase coloca os e-mails numa fila (`hd_notificacoes`) e, a cada minuto, chama `/api/notificar` (função da Vercel), que envia pelo SMTP da empresa. O envio sai pela Vercel porque as funções do Supabase não podem usar a porta 587.

| Quando | Quem recebe |
|---|---|
| Chamado novo | toda a TI (e os devs, se a categoria for de Kanban) |
| Colaborador responde | o responsável pelo chamado (ou toda a TI, se não atribuído) |
| TI responde (exceto nota interna) | o colaborador |
| Chamado finalizado | o colaborador (junto com a última resposta, num e-mail só) |
| Projeto muda de etapa | o colaborador |

Na Vercel → **Settings → Environment Variables** (Production) cadastre e faça um **Redeploy**:

| Nome | Valor |
|---|---|
| `SMTP_USER` | `helpdesk@grupozerbini.com.br` |
| `SMTP_PASS` | senha dessa caixa |
| `HD_SEGREDO` | segredo `hd_notif_segredo` do Vault do Supabase |
| `SMTP_HOST` (opcional) | padrão `smtp.emailexchangeonline.com` |
| `SMTP_PORT` (opcional) | padrão `587` |

Acompanhar os envios (SQL Editor):
```sql
select id, tipo, destinatarios, status, tentativas, erro, criado_em from hd_notificacoes order by id desc limit 20;
```
Pausar tudo: `update hd_config set valor = 'nao' where chave = 'notificacoes_ativas';`

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

### Atendimento e aparência
- **Configurações → Equipe → Atende chamados**: define quem aparece em "Atribuído a" e recebe e-mail de chamado novo. Quem não atende (ex.: gestores) continua vendo tudo.
- **Atribuir novos chamados automaticamente a**: responsável padrão dos chamados novos fora do Kanban (`hd_config.responsavel_padrao`).
- **Tema escuro**: botão de lua/sol no topo (e na tela de login). Na primeira visita segue o tema do sistema; a escolha fica salva no navegador.
