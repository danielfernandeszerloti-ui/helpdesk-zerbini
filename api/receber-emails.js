// Lê a caixa do helpdesk (IMAP) e transforma os e-mails em chamados.
// Chamada pelo Supabase (pg_cron + pg_net) com o cabeçalho x-hd-segredo.
//
// Variáveis na Vercel:
//   HD_SEGREDO                       (já existe — mesmo das notificações)
//   SMTP_USER / SMTP_PASS            (a mesma caixa é lida; ou IMAP_USER / IMAP_PASS)
//   SUPABASE_SECRET_KEY              (para importar anexos — Supabase → Settings → API Keys → secret)
//   IMAP_HOST (padrão imap.emailexchangeonline.com), IMAP_PORT (padrão 993)
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import {
  primeiroEndereco, ehAutomatico, textoDoEmail, limparResposta, remetenteEncaminhado, anexosUteis, nomeSeguro,
} from './_lib/email.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gybdgrfklukgrsfomrey.supabase.co'
const CHAVE_PUBLICA = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gNqnWw9w3gPL9ZaUQJiSvA_DqgjmDak'
const BUCKET = 'helpdesk'
const POR_EXECUCAO = 15
const TEMPO_MAX_MS = 40_000

export const config = { maxDuration: 60 }

function segredoValido(recebido) {
  const esperado = process.env.HD_SEGREDO || ''
  if (!esperado || typeof recebido !== 'string') return false
  const a = Buffer.from(recebido), b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function rpc(nome, args) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: CHAVE_PUBLICA, Authorization: `Bearer ${CHAVE_PUBLICA}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_segredo: process.env.HD_SEGREDO, ...args }),
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`${nome}: ${r.status} ${txt.slice(0, 300)}`)
  return txt ? JSON.parse(txt) : null
}

async function subirAnexo(chamadoId, anexo) {
  const chave = process.env.SUPABASE_SECRET_KEY
  const caminho = `${chamadoId}/${randomUUID()}-${nomeSeguro(anexo.filename || 'anexo')}`
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${caminho.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': anexo.contentType || 'application/octet-stream', 'x-upsert': 'false' },
    body: anexo.content,
  })
  if (!r.ok) throw new Error(`upload ${r.status} ${(await r.text()).slice(0, 200)}`)
  return caminho
}

async function processar(fonte, caixa) {
  const parsed = await simpleParser(fonte, { skipImageLinks: true })
  const { email: de, nome } = primeiroEndereco(parsed.from)
  const assunto = (parsed.subject || '').trim()
  const messageId = parsed.messageId || ''

  const motivo = ehAutomatico(parsed, de, caixa)
  if (motivo) return { acao: 'ignorado', motivo, de, assunto }

  const texto = textoDoEmail(parsed)
  const { ok: anexos, grandes } = anexosUteis(parsed)
  const semChave = anexos.length && !process.env.SUPABASE_SECRET_KEY
  const avisos = []
  if (semChave) avisos.push(`(O e-mail tinha ${anexos.length} anexo(s) que não foram importados — falta configurar SUPABASE_SECRET_KEY.)`)
  if (grandes.length) avisos.push(`(Anexo(s) acima de 10 MB não importado(s): ${grandes.join(', ')}.)`)
  const extra = avisos.length ? '\n\n' + avisos.join('\n') : ''

  const enc = remetenteEncaminhado(assunto, texto)
  const res = await rpc('hd_email_receber', {
    p: {
      message_id: messageId, de, de_nome: nome, assunto,
      texto: (texto + extra).slice(0, 10000),
      texto_resposta: (limparResposta(texto) + extra).slice(0, 10000),
      encaminhado_de: enc?.email || null, encaminhado_nome: enc?.nome || null,
    },
  })

  let importados = 0
  if (res?.chamado_id && (res.acao === 'novo' || res.acao === 'resposta' || res.acao === 'nota') && !semChave) {
    for (const a of anexos) {
      try {
        const caminho = await subirAnexo(res.chamado_id, a)
        await rpc('hd_email_anexo', {
          p_chamado: res.chamado_id, p_mensagem: res.mensagem_id || null, p_autor: res.autor || de,
          p_caminho: caminho, p_nome: a.filename || 'anexo', p_tamanho: a.size, p_tipo: a.contentType || '',
        })
        importados++
      } catch (e) {
        console.error('anexo', a.filename, e.message)
      }
    }
  }
  return { ...res, de, assunto, anexos: importados }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' })
  if (!segredoValido(req.headers['x-hd-segredo'])) return res.status(401).json({ erro: 'Não autorizado' })
  const usuario = process.env.IMAP_USER || process.env.SMTP_USER
  const senha = process.env.IMAP_PASS || process.env.SMTP_PASS
  if (!usuario || !senha) return res.status(500).json({ erro: 'Caixa não configurada (SMTP_USER/SMTP_PASS)' })

  const inicio = Date.now()
  const st = await rpc('hd_email_entrada_estado', {})
  if (!st.ativa) return res.status(200).json({ ok: true, pausado: true })
  if (!st.livre) return res.status(200).json({ ok: true, ocupado: true })

  // porta 993 (SSL); se não conectar, tenta 143 com STARTTLS
  const portas = process.env.IMAP_PORT ? [Number(process.env.IMAP_PORT)] : [993, 143]
  let cliente, falhaConexao
  for (const porta of portas) {
    const c = new ImapFlow({
      host: process.env.IMAP_HOST || 'imap.emailexchangeonline.com',
      port: porta, secure: porta === 993, auth: { user: usuario, pass: senha },
      logger: false, socketTimeout: 30_000, connectionTimeout: 10_000,
    })
    try { await c.connect(); cliente = c; break } catch (e) {
      falhaConexao = e
      if (e?.authenticationFailed) break
    }
  }
  if (!cliente) {
    await rpc('hd_email_entrada_salvar', { p_estado: null, p_liberar: true }).catch(() => {})
    const msg = falhaConexao?.authenticationFailed ? 'Usuário ou senha da caixa recusados pelo servidor IMAP' : String(falhaConexao?.message || falhaConexao)
    return res.status(502).json({ erro: msg.slice(0, 300) })
  }

  const resultados = []
  let estado = st.estado
  try {
    const trava = await cliente.getMailboxLock('INBOX')
    try {
      const validade = String(cliente.mailbox.uidValidity)
      let uids
      if (!estado || estado.uidvalidity !== validade) {
        // primeira vez (ou caixa recriada): só e-mails das últimas 24 h
        const ultimos = ((await cliente.search({ all: true }, { uid: true })) || []).sort((a, b) => a - b).slice(-30)
        uids = []
        if (ultimos.length) {
          for await (const m of cliente.fetch(ultimos.join(','), { uid: true, internalDate: true }, { uid: true })) {
            if (m.internalDate && Date.now() - new Date(m.internalDate).getTime() < 864e5) uids.push(m.uid)
          }
        }
        estado = { uidvalidity: validade, uid: 0 }
        if (!uids.length) estado.uid = Math.max(0, Number(cliente.mailbox.uidNext) - 1)
      } else {
        uids = ((await cliente.search({ uid: `${estado.uid + 1}:*` }, { uid: true })) || []).filter((u) => u > estado.uid)
      }
      uids.sort((a, b) => a - b)

      for (const uid of uids.slice(0, POR_EXECUCAO)) {
        if (Date.now() - inicio > TEMPO_MAX_MS) break
        let r
        try {
          const msg = await cliente.fetchOne(String(uid), { source: true }, { uid: true })
          r = await processar(msg.source, usuario)
          await cliente.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {})
        } catch (e) {
          r = { acao: 'erro', erro: String(e?.message || e).slice(0, 300) }
          await rpc('hd_email_falha', { p_message_id: `uid-${validade}-${uid}`, p_de: '', p_assunto: '', p_erro: r.erro }).catch(() => {})
        }
        resultados.push({ uid, ...r })
        estado = { uidvalidity: validade, uid: Math.max(estado.uid, uid) }
        await rpc('hd_email_entrada_salvar', { p_estado: estado, p_liberar: false })
      }
    } finally {
      trava.release()
    }
    await cliente.logout().catch(() => {})
  } catch (e) {
    await rpc('hd_email_entrada_salvar', { p_estado: estado, p_liberar: true }).catch(() => {})
    return res.status(502).json({ erro: String(e?.message || e).slice(0, 300), resultados })
  }
  await rpc('hd_email_entrada_salvar', { p_estado: estado, p_liberar: true })
  return res.status(200).json({ ok: true, resultados })
}
