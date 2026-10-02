// Função da Vercel que envia os e-mails do helpdesk pelo SMTP da empresa.
// Chamada pelo Supabase (pg_cron + pg_net) com o cabeçalho x-hd-segredo.
// Variáveis de ambiente na Vercel: SMTP_USER, SMTP_PASS, HD_SEGREDO
// (opcionais: SMTP_HOST, SMTP_PORT, SMTP_FROM_NAME)
import nodemailer from 'nodemailer'
import { timingSafeEqual } from 'node:crypto'

let transporte

function segredoValido(recebido) {
  const esperado = process.env.HD_SEGREDO || ''
  if (!esperado || typeof recebido !== 'string') return false
  const a = Buffer.from(recebido), b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' })
  if (!segredoValido(req.headers['x-hd-segredo'])) return res.status(401).json({ erro: 'Não autorizado' })
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return res.status(500).json({ erro: 'SMTP_USER/SMTP_PASS não configurados na Vercel' })

  const { para, assunto, html, responder_para: responderPara } = req.body || {}
  const destinos = (Array.isArray(para) ? para : [para]).filter((e) => typeof e === 'string' && /^[^@\s]+@[^@\s]+$/.test(e))
  if (!destinos.length || !assunto || !html) return res.status(400).json({ erro: 'Dados incompletos' })

  transporte ||= nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.emailexchangeonline.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    requireTLS: Number(process.env.SMTP_PORT || 587) === 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })

  try {
    const texto = html.replace(/<br>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').trim()
    const info = await transporte.sendMail({
      from: { name: process.env.SMTP_FROM_NAME || 'Zerbini Helpdesk', address: process.env.SMTP_USER },
      to: destinos,
      subject: String(assunto).slice(0, 200),
      html,
      text: texto,
      // solicitantes sem acesso ao sistema respondem direto para o responsável
      ...(typeof responderPara === 'string' && /^[^@\s]+@[^@\s]+$/.test(responderPara) ? { replyTo: responderPara } : {}),
    })
    return res.status(200).json({ ok: true, id: info.messageId })
  } catch (e) {
    transporte = null
    return res.status(502).json({ erro: String(e?.message || e).slice(0, 300) })
  }
}
