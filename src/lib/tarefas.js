import { diaSP } from './util'

export const RECORRENCIAS = {
  '': 'Não repete',
  diaria: 'Todo dia',
  dias_uteis: 'Dias úteis',
  semanal: 'Toda semana',
  mensal: 'Todo mês',
}

export const hojeISO = () => diaSP(new Date())

export function somarDias(isoDia, n) {
  const [a, m, d] = isoDia.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

// próximo dia útil (seg–sex) a partir de amanhã
export function proximoUtil(isoDia = hojeISO()) {
  let d = somarDias(isoDia, 1)
  while ([0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay())) d = somarDias(d, 1)
  return d
}

export function diasEntre(de, ate) {
  const t = (iso) => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d) }
  return Math.round((t(ate) - t(de)) / 864e5)
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function rotuloPrazo(prazo, hora) {
  if (!prazo) return 'Sem data'
  const hoje = hojeISO()
  const h = hora ? ' ' + String(hora).slice(0, 5) : ''
  if (prazo === hoje) return 'Hoje' + h
  if (prazo === somarDias(hoje, 1)) return 'Amanhã' + h
  if (prazo === somarDias(hoje, -1)) return 'Ontem' + h
  const [a, m, d] = prazo.split('-')
  const dif = diasEntre(hoje, prazo)
  const sem = SEMANA[new Date(prazo + 'T12:00:00Z').getUTCDay()]
  if (dif > 0 && dif < 7) return `${sem}, ${d}/${m}` + h
  return `${d}/${m}${a !== hoje.slice(0, 4) ? '/' + a : ''}` + h
}

// "#1542" no texto liga a tarefa ao chamado
export function lerTextoRapido(texto) {
  let chamado = null
  const limpo = texto.replace(/(^|\s)#0*(\d{1,7})\b/, (_, esp, n) => { chamado = Number(n); return esp }).replace(/\s{2,}/g, ' ').trim()
  return { texto: limpo || texto.trim(), chamado }
}
