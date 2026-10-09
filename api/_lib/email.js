// Funções puras para interpretar e-mails recebidos na caixa do helpdesk.
import { convert } from 'html-to-text'

const EMAIL_RE = /[\w.+'-]+@[\w-]+(?:\.[\w-]+)+/

export function primeiroEndereco(campo) {
  const v = campo?.value?.[0]
  return { email: (v?.address || '').trim().toLowerCase(), nome: (v?.name || '').trim() }
}

// E-mails automáticos (férias, erro de entrega, newsletters) não viram chamado
export function ehAutomatico(parsed, remetente, caixa) {
  const h = parsed.headers
  const auto = String(h.get('auto-submitted') || '').toLowerCase()
  if (auto && auto !== 'no') return 'resposta automática'
  if (h.has('x-autoreply') || h.has('x-autorespond')) return 'resposta automática'
  if (/^(bulk|junk|list|auto_reply)$/i.test(String(h.get('precedence') || '').trim())) return 'lista/automático'
  if (h.has('list') || h.has('list-unsubscribe') || h.has('list-id')) return 'newsletter'
  if (/^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|naoresponda|nao-?responda)@/i.test(remetente)) return 'remetente automático'
  if (caixa && remetente === caixa.toLowerCase()) return 'enviado pela própria caixa'
  const assunto = parsed.subject || ''
  if (/^(resposta autom[aá]tica|automatic reply|out of office|aus[eê]ncia|fora do escrit[oó]rio)/i.test(assunto)) return 'resposta automática'
  if (/^(undeliverable|n[aã]o (foi poss[ií]vel )?entreg|delivery status notification|returned mail)/i.test(assunto)) return 'erro de entrega'
  return null
}

export function textoDoEmail(parsed) {
  let t = parsed.text
  if (!t || !t.trim()) {
    t = parsed.html ? convert(parsed.html, {
      wordwrap: false,
      selectors: [{ selector: 'img', format: 'skip' }, { selector: 'a', options: { ignoreHref: true } }],
    }) : ''
  }
  return normalizar(t)
}

export function normalizar(t) {
  return String(t || '')
    // sujeira do Outlook em texto puro: "nome@x <mailto:nome@x>" e "texto <https://link>"
    .replace(/\s*<mailto:[^>\s]+>/gi, '')
    .replace(/\s*<tel:[^>]+>/gi, '')
    .replace(/<(https?:\/\/[^>\s]+)>/gi, ' $1 ')
    .replace(/(https?:\/\/\S+)\s+\1(?=\s|$)/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/(\S) {2,}(?=\S)/g, '$1 ')
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .split('\n').map((l) => l.replace(/[ \t]+$/, '')).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Remove o histórico citado de uma resposta (Outlook, Gmail, etc.)
export function limparResposta(texto) {
  const linhas = texto.split('\n')
  let corte = linhas.length
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim()
    const proximas = linhas.slice(i + 1, i + 6).join('\n')
    if (/^-{2,}\s*(original message|mensagem original|mensaje original)\s*-{2,}/i.test(l)) { corte = i; break }
    if (/^_{8,}$/.test(l) && /^\s*\*?(de|from)\s*:/im.test(proximas)) { corte = i; break }
    if (/^\*?(de|from)\s*:\*?\s+\S/i.test(l) && /^\s*\*?(enviad[oa]|sent|date|data|para|to|assunto|subject)\s*:/im.test(proximas)) { corte = i; break }
    if (/^(em|on)\s.+(escreveu|wrote)\s*:\s*$/i.test(l)) { corte = i; break }
    if (/^(em|on)\s.+/i.test(l) && /^.*(escreveu|wrote)\s*:\s*$/i.test(linhas[i + 1]?.trim() || '')) { corte = i; break }
    if (/^>/.test(l) && linhas.slice(i).every((x) => !x.trim() || /^>/.test(x.trim()))) { corte = i; break }
  }
  const limpo = normalizar(linhas.slice(0, corte).join('\n'))
  return limpo || texto
}

// Encaminhado (ENC:/FW:): descobre quem mandou o e-mail original
export function remetenteEncaminhado(assunto, texto) {
  if (!/^\s*(enc|fw|fwd|tr|rv|wg)\s*:/i.test(assunto || '')) return null
  const linhas = texto.split('\n')
  for (const linha of linhas) {
    const m = linha.trim().match(/^\*?(de|from)\s*:\*?\s*(.+)$/i)
    if (!m) continue
    const valor = m[2].trim()
    const email = valor.match(/<\s*([^>\s]+@[^>\s]+)\s*>/)?.[1] || valor.match(/mailto:([^\]\s]+)/i)?.[1] || valor.match(EMAIL_RE)?.[0]
    if (!email) continue
    let nome = valor.replace(/<[^>]*>|\[mailto:[^\]]*\]/gi, '').replace(EMAIL_RE, '').replace(/["']/g, '').trim()
    return { email: email.toLowerCase(), nome }
  }
  return null
}

// Anexos que valem importar (descarta logos de assinatura e afins)
export function anexosUteis(parsed, limite = 10 * 1024 * 1024) {
  const ok = [], grandes = []
  for (const a of parsed.attachments || []) {
    const tipo = (a.contentType || '').toLowerCase()
    if (tipo === 'message/delivery-status' || tipo === 'text/calendar' && !a.filename) continue
    if (tipo.startsWith('image/') && (a.contentDisposition === 'inline' || a.related) && a.size < 30 * 1024) continue
    if (a.size > limite) { grandes.push(a.filename || 'arquivo'); continue }
    ok.push(a)
  }
  return { ok: ok.slice(0, 10), grandes }
}

export function nomeSeguro(nome) {
  return String(nome || 'anexo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80) || 'anexo'
}
