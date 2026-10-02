import { supabase, BUCKET } from './supabase'

export const TZ = 'America/Sao_Paulo'

export const STATUS = {
  novo: { rotulo: 'Novo', cor: 'turquesa' },
  aberto: { rotulo: 'Aberto', cor: 'roxo' },
  em_espera: { rotulo: 'Em espera', cor: 'amarelo' },
  pausado: { rotulo: 'Pausado', cor: 'cinza' },
  resolvido: { rotulo: 'Resolvido', cor: 'verde' },
  cancelado: { rotulo: 'Cancelado', cor: 'cinza' },
}
export const STATUS_ORDEM = ['novo', 'aberto', 'em_espera', 'pausado', 'resolvido', 'cancelado']
export const FINALIZADOS = ['resolvido', 'cancelado']
export const emAndamento = (c) => !FINALIZADOS.includes(c.status)

export const PRIORIDADE = {
  baixa: { rotulo: 'Baixa', cor: 'cinza', peso: 1 },
  media: { rotulo: 'Média', cor: 'azul', peso: 2 },
  alta: { rotulo: 'Alta', cor: 'laranja', peso: 3 },
  urgente: { rotulo: 'Urgente', cor: 'vermelho', peso: 4 },
}
export const PRIORIDADE_ORDEM = ['baixa', 'media', 'alta', 'urgente']

export const codigo = (id) => '#' + String(id).padStart(4, '0')

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export const dataHora = (iso) => (iso ? fmtDataHora.format(new Date(iso)).replace(',', '') : '—')
export const diaSP = (d) => fmtDia.format(d instanceof Date ? d : new Date(d))

export function hojeExtenso() {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function tempoRelativo(iso) {
  if (!iso) return ''
  const seg = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seg < 60) return 'agora'
  const min = Math.round(seg / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h} h`
  const d = Math.round(h / 24)
  if (d < 30) return `há ${d} dia${d > 1 ? 's' : ''}`
  return dataHora(iso).slice(0, 10)
}

// Situação do SLA: sem | atrasado | hoje | ok
export function situacaoSla(c) {
  if (!c.prazo_sla) return 'sem'
  if (!emAndamento(c)) return 'ok'
  if (c.status === 'em_espera') return 'pausado'
  const prazo = new Date(c.prazo_sla)
  if (prazo < new Date()) return 'atrasado'
  if (diaSP(prazo) === diaSP(new Date())) return 'hoje'
  return 'ok'
}

// "daniel.zerloti@grupozerbini.com.br" -> "Daniel Zerloti"
export function nomeDeEmail(email) {
  if (!email) return ''
  return email.split('@')[0].split(/[._-]+/).filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

export function iniciais(nome) {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

export function tamanhoLegivel(b) {
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB'
  return (b / 1024 / 1024).toFixed(1) + ' MB'
}

export const LIMITE_ARQUIVO = 10 * 1024 * 1024

// Reduz fotos grandes antes de enviar (economiza espaço no Supabase)
async function comprimirImagem(arquivo) {
  if (!/^image\/(jpeg|png|webp)$/.test(arquivo.type) || arquivo.size < 800 * 1024) return arquivo
  try {
    const bmp = await createImageBitmap(arquivo)
    const max = 1920
    const escala = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * escala)
    canvas.height = Math.round(bmp.height * escala)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82))
    if (!blob || blob.size >= arquivo.size) return arquivo
    const nome = arquivo.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg'
    return new File([blob], nome, { type: 'image/jpeg' })
  } catch {
    return arquivo
  }
}

function nomeSeguro(nome) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)
}

export async function enviarAnexos(chamadoId, arquivos, mensagemId = null) {
  for (const original of arquivos) {
    const arquivo = await comprimirImagem(original)
    if (arquivo.size > LIMITE_ARQUIVO) throw new Error(`"${original.name}" passa de 10 MB`)
    const caminho = `${chamadoId}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`
    const up = await supabase.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type || undefined })
    if (up.error) throw new Error('Falha ao enviar ' + original.name + ': ' + up.error.message)
    const { error } = await supabase.from('hd_anexos').insert({
      chamado_id: chamadoId, mensagem_id: mensagemId, caminho, nome: original.name,
      tamanho: arquivo.size, tipo_mime: arquivo.type || '',
    })
    if (error) throw error
  }
}

export async function abrirAnexo(anexo) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(anexo.caminho, 120)
  if (error) throw error
  window.open(data.signedUrl, '_blank', 'noopener')
}

export function baixarCsv(nomeArquivo, linhas) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const csv = '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: nomeArquivo })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function mensagemErro(e) {
  const m = e?.message || String(e)
  if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para esta ação.'
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão. Verifique a internet e tente de novo.'
  return m
}

// Cores das etapas do Kanban (nome salvo no banco -> classe CSS)
export const CORES_ETAPA = ['cinza', 'azul', 'roxo', 'turquesa', 'amarelo', 'laranja', 'rosa', 'verde']

export function previsaoAtrasada(c, etapaFinalId) {
  if (!c.previsao_entrega || c.etapa_id === etapaFinalId || !emAndamento(c)) return false
  return c.previsao_entrega < diaSP(new Date())
}

export function dataCurta(isoDia) {
  if (!isoDia) return ''
  const [a, m, d] = isoDia.split('-')
  return `${d}/${m}/${a}`
}

export function duracaoHoras(h) {
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 48) return `${Math.round(h)} h`
  return `${(h / 24).toFixed(1).replace('.', ',')} dias`
}

// Texto da previsão de atendimento para o colaborador (sem alarme quando vence)
export function previsaoColaborador(c) {
  if (!c.prazo_sla || !emAndamento(c) || c.etapa_id) return null
  if (c.status === 'em_espera') return { tipo: 'pausado', texto: 'Prazo pausado — aguardando sua resposta' }
  const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    .format(new Date(c.prazo_sla)).replace(/,/g, '').replace(/ (\d{2}:\d{2})$/, ' às $1')
  if (new Date(c.prazo_sla) < new Date()) return { tipo: 'vencido', texto: `Em atendimento — a previsão era ${quando}` }
  return { tipo: 'ok', texto: `Previsão de atendimento: até ${quando}` }
}

export const EXPEDIENTE = 'seg a sex, das 8h às 17h45'

// Por onde o pedido chegou (chamados registrados pela TI em nome de alguém)
export const ORIGENS = {
  sistema: 'Helpdesk',
  email: 'E-mail',
  telefone: 'Telefone',
  teams: 'Teams',
  whatsapp: 'WhatsApp',
  presencial: 'Pessoalmente',
}
export const ehExterno = (email) => !!email && !String(email).toLowerCase().endsWith('@grupozerbini.com.br')

// valor para <input type="datetime-local"> no fuso local
export function agoraLocal(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
