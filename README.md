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
| Gestor | ver o Kanban e **aprovar ou recusar** projetos |

Em **Equipe → Aprova projetos**, um administrador também pode receber os projetos para aprovar (hoje: Amanda).

### Kanban de desenvolvimento
- Categorias com **Kanban = Sim** (Configurações → Categorias) entram no quadro **Desenvolvimento**.
- Todo projeto novo entra em **Aguardando aprovação**. Quem aprova recebe e-mail, abre o chamado e clica em **Aprovar** (vai para o Backlog e o dev é avisado) ou **Recusar** (com motivo, que vai para o solicitante). Dev e TI não conseguem tirar o projeto dessa etapa. Para desligar o fluxo, desative a etapa em Configurações → Etapas do Kanban.
- Etapas editáveis em Configurações → Etapas do Kanban. A etapa final ("Concluído") finaliza o chamado.
- Cada cartão tem previsão de entrega (alerta de atraso), checklist e histórico de etapas; o quadro mostra o tempo médio em cada etapa (últimos 180 dias).
- O solicitante vê o andamento no chamado e recebe e-mail a cada mudança de etapa.

### Hoje e tarefas
A aba **Hoje** é a página inicial da TI: uma fila única do dia com as suas tarefas e os chamados atribuídos a você (pelo prazo de SLA), em **Atrasadas · Hoje · Próximas (7 dias) · Mais adiante · Sem data · Concluídas (7 dias)**.
- Criação rápida: digite a tarefa, escolha Hoje/Amanhã/Data/Sem data e, se quiser, **Repetir** (todo dia, dias úteis, semanal, mensal). Ao concluir uma recorrente, a próxima é criada sozinha.
- `#0018` no texto liga a tarefa ao chamado. No chamado, o cartão **Tarefas** cria tarefas já ligadas; concluir registra uma nota interna no histórico.
- Finalizar um chamado (ou mover o projeto para Concluído) com tarefas abertas pede confirmação.
- Tarefas avulsas são pessoais (só quem criou e o responsável veem). Tarefas de chamado são vistas por quem atende o chamado. O checklist dos projetos do Kanban usa as mesmas tarefas.

### Tipo e aprovações
- **Tipo**: cada chamado é **Incidente** (algo parou) ou **Solicitação** (pedido de algo novo). Vem da categoria (Configurações → Categorias → Tipo) e pode ser trocado no chamado. Filtro no Painel e nos Indicadores; coluna no Excel.
- **Exige aprovação** (por categoria — hoje *Solicitação de Compra* e *Aquisição de Equipamentos e Serviços de TI*): o chamado entra *Aguardando aprovação*, com campo opcional de **valor estimado**. Quem aprova (Equipe → Aprova projetos, ou perfil Gestor) recebe e-mail e decide no chamado:
  - **Aprovar** → o SLA começa a contar, a TI e o solicitante são avisados.
  - **Recusar** → pede o motivo, que vai por e-mail ao solicitante; o chamado é cancelado.
- Enquanto aguarda, ninguém finaliza o chamado. Painel tem o card *Aguardando aprovação*; o Hoje de quem aprova mostra um atalho; Indicadores mostram aprovadas, recusadas, valor e tempo médio até a decisão.

### Avaliação do atendimento
Ao finalizar, o colaborador vê *Como foi o atendimento?* com 1 a 5 estrelas (um clique) e comentário opcional; o e-mail de finalização traz as estrelas clicáveis. A nota aparece no chamado (lateral), nos Indicadores (card *Satisfação dos usuários* e coluna por responsável) e no Excel. Nota 1 ou 2 avisa o responsável por e-mail.

### Indicadores
Aba **Indicadores** (TI/admin): SLA cumprido, abertos × concluídos, pendentes, tempo médio de 1ª resposta e de resolução (com mediana e comparação com o período anterior), pendentes por idade/prioridade, abertos por setor, tabelas por categoria e por responsável e os pendentes mais antigos. Filtros de período, categoria e responsável.
- **SLA cumprido** = concluídos no período com prazo de SLA que foram resolvidos dentro do prazo.
- **1ª resposta** = primeira mensagem da equipe visível ao colaborador (notas internas não contam).

### Relatório semanal de TI
Botão **Relatório semanal** em Indicadores (`/relatorio`). Período: segunda a sexta.
- **Sexta ~16h** o sistema gera o rascunho da semana e manda um e-mail para o revisor (`responsavel_padrao`, ou `relatorio_revisor` em hd_config). Também aparece em **Hoje** como *Relatório semanal pronto para revisar*.
- O rascunho traz: resumo, **indicadores** (recebidos, concluídos, pendentes, críticos = prioridade alta/urgente, fora do prazo, SLA, 1ª resposta e solução em horário útil, satisfação — todos comparados com a semana anterior), tabelas por categoria e responsável, **atividades** (concluídos por categoria, projetos que mudaram de etapa, tarefas avulsas concluídas), **pontos de atenção** detectados (críticos e atrasados em aberto, SLA < 85%, fila crescendo, pendentes > 15 dias, terceiros com retorno vencido, equipamento com 2+ chamados em 30 dias, setor/categoria repetidos, categoria em alta, mesmo solicitante 3+ vezes, sem responsável, avaliações 1–2) e **decisões da gerência** (aprovações pendentes).
- Tudo é editável; pontos podem ser desmarcados. Salva sozinho. **Atualizar dados** recalcula números e pontos sem apagar seus textos.
- **Plano de ação**: itens livres + sugestões (fora do prazo, terceiros a cobrar, entregas e tarefas da semana seguinte). Na semana seguinte os itens voltam para marcar *Feito / Em andamento / Não feito*, e isso vai no e-mail.
- **Nada é enviado sem revisão**: o botão Enviar manda o e-mail para `relatorio_destinatarios` (padrão Amanda; alterável na própria tela). A gerência recebe o e-mail e um link para a versão online, e o histórico fica em `/relatorio`.

### 5. Notificações por e-mail
O Supabase coloca os e-mails numa fila (`hd_notificacoes`) e, a cada minuto, chama `/api/notificar` (função da Vercel), que envia pelo SMTP da empresa. O envio sai pela Vercel porque as funções do Supabase não podem usar a porta 587.

| Quando | Quem recebe |
|---|---|
| Chamado novo | toda a TI (e os devs, se a categoria for de Kanban) |
| Colaborador responde | o responsável pelo chamado (ou toda a TI, se não atribuído) |
| TI responde (exceto nota interna) | o colaborador |
| Chamado finalizado | o colaborador (junto com a última resposta, num e-mail só) |
| Projeto muda de etapa | o colaborador |
| Pedido registrado pela TI | o solicitante recebe "Recebemos sua solicitação #0000" |

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

- Resposta do colaborador em chamado **Em espera** volta para **Aberto**. Em chamado **Resolvido**, o colaborador vê *Ficou tudo certo?* com **Sim, resolveu** (registra a confirmação) ou **Não, reabrir chamado**. Um simples "Obrigado" (inclusive por e-mail) fica no histórico sem reabrir e sem avisar a TI.
- Primeira resposta da TI em chamado **Novo** muda para **Aberto**.
- O prazo de SLA vem das horas configuradas na categoria (tela *Categorias*).
- Imagens acima de 800 KB são reduzidas no navegador antes do envio.

### Pedidos que chegam por e-mail, telefone ou Teams
- **Painel → Registrar pedido** (ou *Novo chamado → Registrar pedido de outra pessoa*): informe por onde chegou, quando chegou (o SLA conta dali), nome, e-mail e setor/empresa do solicitante e cole o texto do e-mail na descrição.
- Aceita e-mail de **qualquer domínio** (ex.: indústrias com outro domínio). Quem não é `@grupozerbini.com.br` não acessa o sistema: recebe confirmação, respostas e finalização por e-mail, sem botão, e ao responder o e-mail a mensagem vai direto para o responsável (Reply-To).
- Quando o solicitante responder por e-mail, cole a resposta no chamado marcando **Resposta do solicitante** — fica no histórico em nome dele, sem disparar e-mail.
- **Avisar por e-mail** (no cartão Solicitante) liga/desliga os avisos para aquele chamado.
- O Painel exporta a coluna *Origem* no Excel.

### Caixa helpdesk@ → chamados automáticos
A função `/api/receber-emails` (Vercel) lê a caixa por IMAP, chamada pelo Supabase a cada 2 min das 7h às 20h (seg–sáb) e a cada 10 min no resto do tempo.
- E-mail novo → chamado em nome de quem enviou (origem *E-mail*), com anexos, e confirmação "Recebemos sua solicitação #0000".
- Resposta com "Chamado #0000" no assunto → entra no chamado (o histórico citado é removido). Se quem respondeu não é o solicitante nem da equipe, vira nota interna.
- Encaminhado (ENC:/FW:) por alguém da equipe → chamado em nome do remetente original.
- Respostas automáticas (férias), erros de entrega e newsletters são ignorados. Chamado cancelado recebe um chamado novo.
- **Configurações → E-mail**: liga/pausa a leitura, categoria padrão (SLA) e histórico dos e-mails recebidos com o resultado de cada um.

Variáveis na Vercel (além das de notificação):

| Nome | Valor |
|---|---|
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → *Secret key* (só para importar anexos) |
| `IMAP_HOST` (opcional) | padrão `imap.emailexchangeonline.com` |
| `IMAP_PORT` (opcional) | padrão: tenta `993` e depois `143` |
| `IMAP_USER` / `IMAP_PASS` (opcional) | padrão: os mesmos `SMTP_USER` / `SMTP_PASS` |

### Fotos do Teams
As fotos de perfil vêm do Microsoft 365 (as mesmas do Teams) via Microsoft Graph: `/api/sincronizar-fotos` roda todo dia às 6h10 e pelo botão **Configurações → Equipe → Fotos do Teams → Sincronizar agora**. Quem não tem foto aparece com iniciais numa cor fixa.

Requer um app registrado no Entra ID (inquilino único) com a permissão de **aplicativo** `User.Read.All` e consentimento do administrador, e na Vercel: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` (o segredo vence — renove no Entra e atualize a variável) e `SUPABASE_SECRET_KEY`.

### Login
- Padrão: **código por e-mail** (sem senha).
- Opcional: **senha**. Quem quiser cria em *Minha conta* (clicando no próprio nome no topo), já logado pelo código. Regras: 10+ caracteres, maiúscula, minúscula, número e símbolo, sem palavras óbvias, nome/e-mail ou sequências. Na tela de entrada: *Prefiro entrar com senha*. Esqueceu? Entra com o código e cria outra.
- Após 5 senhas erradas em 15 min, o navegador bloqueia por 5 min (além do limite do próprio Supabase).
- Reforço no servidor (recomendado, vale também para a Gestão de Ativos): Supabase → Authentication → Providers → Email → *Minimum password length* 10 e *Password requirements* "Lowercase, uppercase letters, digits and symbols".

### Atendimento e aparência
- **Configurações → Equipe → Atende chamados**: define quem aparece em "Atribuído a" e recebe e-mail de chamado novo. Quem não atende (ex.: gestores) continua vendo tudo.
- **Atribuir novos chamados automaticamente a**: responsável padrão dos chamados novos fora do Kanban (`hd_config.responsavel_padrao`).
- **Tema escuro**: botão de lua/sol no topo (e na tela de login). Na primeira visita segue o tema do sistema; a escolha fica salva no navegador.
