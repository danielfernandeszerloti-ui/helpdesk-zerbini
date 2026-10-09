// Sincroniza as fotos de perfil do Microsoft 365 (as mesmas do Teams) para o helpdesk.
// Chamada pelo Supabase (pg_cron diário + botão em Configurações) com o cabeçalho x-hd-segredo.
//
// Variáveis na Vercel:
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET  → app registrado no Entra ID com User.Read.All (aplicativo)
//   SUPABASE_SECRET_KEY                           → para gravar as fotos no Storage
//   HD_SEGREDO                                    → já existe
import { createHash, timingSafeEqual } from 'node:crypto'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gybdgrfklukgrsfomrey.supabase.co'
const CHAVE_PUBLICA = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_gNqnWw9w3gPL9ZaUQJiSvA_DqgjmDak'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const LIMITE_MS = 50_000
const PARALELO = 8

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

async function tokenGraph() {
  const { MS_TENANT_ID: t, MS_CLIENT_ID: id, MS_CLIENT_SECRET: seg } = process.env
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(t)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: seg, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error('Microsoft recusou o acesso: ' + (j.error_description || j.error || r.status).toString().split('\r\n')[0].slice(0, 250))
  return j.access_token
}

async function listarUsuarios(token) {
  const usuarios = []
  let url = `${GRAPH}/users?$select=id,displayName,mail,userPrincipalName,proxyAddresses,accountEnabled&$top=999`
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const j = await r.json()
    if (!r.ok) throw new Error('Erro ao listar usuários do 365: ' + (j.error?.message || r.status) + (r.status === 403 ? ' (falta a permissão User.Read.All com consentimento do administrador)' : ''))
    usuarios.push(...(j.value || []))
    url = j['@odata.nextLink']
  }
  return usuarios.filter((u) => u.accountEnabled !== false)
}

function emailsDo(u) {
  const s = new Set()
  for (const e of [u.mail, u.userPrincipalName]) if (e && e.includes('@')) s.add(e.toLowerCase())
  for (const p of u.proxyAddresses || []) if (/^smtp:/i.test(p)) s.add(p.slice(5).toLowerCase())
  return [...s].filter((e) => !e.endsWith('.onmicrosoft.com') || s.size === 1)
}

async function baixarFoto(token, id) {
  for (const caminho of [`/users/${id}/photos/120x120/$value`, `/users/${id}/photos/96x96/$value`, `/users/${id}/photo/$value`]) {
    const r = await fetch(GRAPH + caminho, { headers: { Authorization: `Bearer ${token}` } })
    if (r.status === 404) continue
    if (!r.ok) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > 500_000) continue
    return { buf, tipo: r.headers.get('content-type') || 'image/jpeg' }
  }
  return null
}

async function subir(caminho, buf, tipo) {
  const chave = process.env.SUPABASE_SECRET_KEY
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/fotos/${caminho}`, {
    method: 'POST',
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': tipo, 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' },
    body: buf,
  })
  if (!r.ok) throw new Error(`upload ${r.status} ${(await r.text()).slice(0, 200)}`)
  return `${SUPABASE_URL}/storage/v1/object/public/fotos/${caminho}`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST' })
  if (!segredoValido(req.headers['x-hd-segredo'])) return res.status(401).json({ erro: 'Não autorizado' })
  const faltando = ['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'SUPABASE_SECRET_KEY'].filter((k) => !process.env[k])
  if (faltando.length) return res.status(500).json({ erro: 'Faltam variáveis na Vercel: ' + faltando.join(', ') })

  const inicio = Date.now()
  try {
    const token = await tokenGraph()
    const [usuarios, atuais] = await Promise.all([listarUsuarios(token), rpc('hd_fotos_hashes', {})])
    const lista = []
    let novas = 0, semFoto = 0, completa = true
    const fila = [...usuarios]

    async function trabalhar() {
      while (fila.length) {
        if (Date.now() - inicio > LIMITE_MS) { completa = false; return }
        const u = fila.shift()
        const emails = emailsDo(u)
        if (!emails.length) continue
        const foto = await baixarFoto(token, u.id).catch(() => null)
        if (!foto) { semFoto++; continue }
        const hash = createHash('sha1').update(foto.buf).digest('hex')
        const anterior = emails.map((e) => atuais[e]).find(Boolean)
        let url = anterior?.hash === hash ? anterior.url : null
        if (!url) {
          const nome = createHash('sha1').update(u.id).digest('hex').slice(0, 20) + '-' + hash.slice(0, 8) + (foto.tipo.includes('png') ? '.png' : '.jpg')
          url = await subir(nome, foto.buf, foto.tipo)
          novas++
        }
        for (const email of emails) lista.push({ email, url, hash })
      }
    }
    await Promise.all(Array.from({ length: PARALELO }, trabalhar))
    const resumo = `${usuarios.length} contas · ${new Set(lista.map((x) => x.url)).size} com foto · ${novas} atualizadas${completa ? '' : ' · incompleta (tempo)'}`
    await rpc('hd_fotos_salvar', { p_lista: lista, p_completa: completa, p_resumo: resumo })
    return res.status(200).json({ ok: true, resumo, semFoto })
  } catch (e) {
    return res.status(502).json({ erro: String(e?.message || e).slice(0, 400) })
  }
}
