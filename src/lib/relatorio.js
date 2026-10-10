// Relatório Gerencial Semanal de TI — formatação e HTML do e-mail
import { duracaoHoras } from './util'

export const NIVEL = {
  alto: { rotulo: 'Alta', cor: '#d92d4b' },
  medio: { rotulo: 'Média', cor: '#d97706' },
  baixo: { rotulo: 'Baixa', cor: '#8a8fa3' },
}
export const ORDEM_NIVEL = { alto: 0, medio: 1, baixo: 2 }

export const ACOMPANHAMENTO = {
  sim: { rotulo: 'Feito', simbolo: '✓', cor: '#059669' },
  parcial: { rotulo: 'Em andamento', simbolo: '◐', cor: '#d97706' },
  nao: { rotulo: 'Não feito', simbolo: '✗', cor: '#d92d4b' },
}

const dm = (iso) => { const [, m, d] = String(iso).split('-'); return `${d}/${m}` }
export const periodoTexto = (r) => `${dm(r.inicio)} a ${dm(r.fim)}/${String(r.fim).slice(0, 4)}`
export const assuntoRelatorio = (r) => `Relatório semanal de TI · ${periodoTexto(r)}`

const num = (v) => (v == null ? null : Number(v))

// Indicadores: valor, texto auxiliar e se "subir" é bom (true), ruim (false) ou neutro (null)
export function indicadores(dados) {
  const a = dados?.atual || {}, p = dados?.anterior || {}
  const fora = (x) => (x.fora_concluidos ?? 0) + (x.fora_pendentes ?? 0)
  const saldo = (a.recebidos ?? 0) - (a.concluidos ?? 0)
  return [
    { id: 'recebidos', rotulo: 'Recebidos', valor: num(a.recebidos), ant: num(p.recebidos), subirBom: null,
      sub: `${a.incidentes ?? 0} incidentes · ${a.solicitacoes ?? 0} solicitações` },
    { id: 'concluidos', rotulo: 'Concluídos', valor: num(a.concluidos), ant: num(p.concluidos), subirBom: true,
      sub: saldo > 0 ? `entraram ${saldo} a mais do que saíram` : saldo < 0 ? `saíram ${-saldo} a mais do que entraram` : 'entradas e saídas equilibradas' },
    { id: 'pendentes', rotulo: 'Pendentes', valor: num(a.pendentes), ant: num(p.pendentes), subirBom: false, sub: 'em aberto no fim da semana' },
    { id: 'criticos', rotulo: 'Críticos', valor: num(a.criticos), ant: num(p.criticos), subirBom: false,
      sub: `prioridade alta/urgente · ${a.criticos_pendentes ?? 0} em aberto` },
    { id: 'fora', rotulo: 'Fora do prazo', valor: fora(a), ant: dados?.anterior ? fora(p) : null, subirBom: false,
      sub: `${a.fora_concluidos ?? 0} concluídos com atraso · ${a.fora_pendentes ?? 0} vencidos em aberto` },
    { id: 'sla', rotulo: 'SLA cumprido', valor: num(a.sla_pct), ant: num(p.sla_pct), subirBom: true, sufixo: '%',
      sub: a.com_sla ? `${(a.com_sla ?? 0) - (a.fora_concluidos ?? 0)} de ${a.com_sla} no prazo` : 'sem chamados concluídos' },
    { id: 'resp', rotulo: '1ª resposta (média)', valor: num(a.resp_h), ant: num(p.resp_h), subirBom: false, horas: true, sub: 'em horário útil' },
    { id: 'resol', rotulo: 'Tempo de solução (média)', valor: num(a.resol_h), ant: num(p.resol_h), subirBom: false, horas: true, sub: 'em horário útil' },
    { id: 'aval', rotulo: 'Satisfação', valor: num(a.aval_media), ant: num(p.aval_media), subirBom: true, nota: true,
      sub: a.aval_qtd ? `${a.aval_qtd} avaliação(ões)` : 'nenhuma avaliação na semana' },
  ]
}

export function valorTexto(i, v = i.valor) {
  if (v == null) return '—'
  if (i.horas) return duracaoHoras(v)
  if (i.nota) return `${String(v).replace('.', ',')} ★`
  return `${v}${i.sufixo || ''}`
}

// { texto: '▲ 3', tom: 'bom' | 'ruim' | 'neutro' }
export function variacao(i) {
  if (i.valor == null || i.ant == null) return { texto: 'sem comparação', tom: 'neutro' }
  const dif = i.valor - i.ant
  if (Math.abs(dif) < 0.05) return { texto: '= semana anterior', tom: 'neutro' }
  const seta = dif > 0 ? '▲' : '▼'
  const q = i.horas ? duracaoHoras(Math.abs(dif)) : i.nota ? Math.abs(dif).toFixed(1).replace('.', ',') : `${Math.abs(Math.round(dif))}${i.sufixo === '%' ? ' p.p.' : ''}`
  const tom = i.subirBom == null ? 'neutro' : (dif > 0) === i.subirBom ? 'bom' : 'ruim'
  return { texto: `${seta} ${q} vs semana anterior`, tom }
}

// --------------------------------------------------------------------------- HTML do e-mail
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const COR = { marinho: '#0f2c66', azul: '#212f96', texto: '#1f2233', suave: '#6b7085', linha: '#e3e4ec', fundo: '#f3f4f8', bom: '#059669', ruim: '#d92d4b' }

// #0018 → link para o chamado
function comLinks(texto, site) {
  return esc(texto).replace(/#(\d{3,6})\b/g, (m, n) => `<a href="${site}/chamado/${Number(n)}" style="color:${COR.azul};text-decoration:none;font-weight:600">${m}</a>`)
}

// texto livre: linhas "• x" / "- x" viram lista; demais linhas viram parágrafos/subtítulos
function blocoTexto(texto, site) {
  const linhas = String(texto || '').split(/\r?\n/)
  let html = '', lista = []
  const fechar = () => {
    if (lista.length) html += `<ul style="margin:4px 0 12px;padding-left:20px">${lista.map((l) => `<li style="margin:0 0 5px">${comLinks(l, site)}</li>`).join('')}</ul>`
    lista = []
  }
  linhas.forEach((l, k) => {
    const t = l.trim()
    if (!t) { fechar(); return }
    const m = t.match(/^[•\-*]\s+(.*)$/)
    if (m) { lista.push(m[1]); return }
    fechar()
    const proxLista = /^[•\-*]\s+/.test((linhas[k + 1] || '').trim())
    html += proxLista
      ? `<div style="font-weight:600;color:${COR.marinho};margin:10px 0 2px">${comLinks(t, site)}</div>`
      : `<p style="margin:0 0 10px">${comLinks(t, site)}</p>`
  })
  fechar()
  return html
}

const titulo = (n, t) => `<h3 style="margin:26px 0 10px;font-size:16px;color:${COR.marinho};border-bottom:2px solid ${COR.linha};padding-bottom:6px">${n}. ${esc(t)}</h3>`

function tilesHtml(dados) {
  const lista = indicadores(dados)
  const linhas = []
  for (let k = 0; k < lista.length; k += 3) linhas.push(lista.slice(k, k + 3))
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:8px">${linhas.map((l) => `<tr>${l.map((i) => {
    const v = variacao(i)
    const cor = v.tom === 'bom' ? COR.bom : v.tom === 'ruim' ? COR.ruim : COR.suave
    return `<td width="33%" valign="top" style="background:#f7f8fe;border:1px solid ${COR.linha};border-radius:8px;padding:10px 12px">
      <div style="font-size:12px;color:${COR.suave}">${esc(i.rotulo)}</div>
      <div style="font-size:24px;font-weight:700;color:${COR.marinho};line-height:1.25">${esc(valorTexto(i))}</div>
      <div style="font-size:11px;color:${cor};font-weight:600">${esc(v.texto)}</div>
      <div style="font-size:11px;color:${COR.suave};margin-top:2px">${esc(i.sub)}</div></td>`
  }).join('')}</tr>`).join('')}</table>`
}

function tabela(cab, linhas) {
  if (!linhas.length) return ''
  const th = (t, k) => `<th style="text-align:${k ? 'right' : 'left'};font-size:12px;color:${COR.suave};font-weight:600;padding:6px 8px;border-bottom:1px solid ${COR.linha}">${esc(t)}</th>`
  const td = (t, k) => `<td style="text-align:${k ? 'right' : 'left'};font-size:13px;padding:6px 8px;border-bottom:1px solid #f0f1f5">${esc(t)}</td>`
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:4px 0 8px"><tr>${cab.map(th).join('')}</tr>${linhas.map((l) => `<tr>${l.map(td).join('')}</tr>`).join('')}</table>`
}

function itemHtml(it, site) {
  const n = NIVEL[it.nivel] || NIVEL.baixo
  return `<tr><td width="14" valign="top" style="padding:7px 0 0"><div style="width:9px;height:9px;border-radius:50%;background:${n.cor}"></div></td>
    <td style="padding:3px 0 8px;font-size:14px;line-height:1.45">${comLinks(it.texto, site)}</td></tr>`
}

export function htmlRelatorio(r, { site = 'https://chamados.grupozerbini.com.br', saudacao = 'Olá!' } = {}) {
  const d = r.dados || {}
  const itens = (r.itens || []).filter((i) => i.incluir !== false && String(i.texto || '').trim())
  const ord = (a, b) => (ORDEM_NIVEL[a.nivel] ?? 3) - (ORDEM_NIVEL[b.nivel] ?? 3)
  const atencao = itens.filter((i) => i.secao !== 'decisao').sort(ord)
  const decisoes = itens.filter((i) => i.secao === 'decisao')
  const plano = (r.plano || []).filter((p) => String(p.texto || '').trim())
  const anterior = (r.plano_anterior || []).filter((p) => String(p.texto || '').trim())
  let n = 0
  let corpo = ''

  if (String(r.resumo || '').trim()) {
    corpo += `<div style="background:#eefcfb;border-left:4px solid #4be0db;border-radius:6px;padding:12px 14px;margin:14px 0 4px;font-size:14px;line-height:1.5">${comLinks(r.resumo.trim(), site).replace(/\n/g, '<br>')}</div>`
  }

  corpo += titulo(++n, 'Indicadores de atendimento') + tilesHtml(d)
  const cats = (d.por_categoria || []).slice(0, 6)
  const resp = d.por_responsavel || []
  if (cats.length || resp.length) {
    corpo += `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td valign="top" width="58%" style="padding:6px 10px 0 8px"><div style="font-size:13px;font-weight:600;margin-bottom:2px">Por categoria</div>${tabela(['Categoria', 'Receb.', 'Concl.'], cats.map((c) => [c.categoria, c.recebidos, c.concluidos]))}</td>
      <td valign="top" style="padding:6px 8px 0 10px"><div style="font-size:13px;font-weight:600;margin-bottom:2px">Por responsável</div>${tabela(['Responsável', 'Concl.', 'Pend.'], resp.map((x) => [x.nome || x.email, x.concluidos, x.pendentes]))}</td>
    </tr></table>`
  }

  if (String(r.atividades || '').trim()) corpo += titulo(++n, 'Principais atividades da semana') + `<div style="font-size:14px;line-height:1.5">${blocoTexto(r.atividades, site)}</div>`

  corpo += titulo(++n, 'Pontos de atenção')
  corpo += atencao.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${atencao.map((i) => itemHtml(i, site)).join('')}</table>`
    : (String(r.notas_atencao || '').trim() ? '' : `<p style="margin:0;font-size:14px;color:${COR.suave}">Nenhum ponto de atenção nesta semana.</p>`)
  if (String(r.notas_atencao || '').trim()) corpo += `<div style="font-size:14px;line-height:1.5;margin-top:6px">${blocoTexto(r.notas_atencao, site)}</div>`

  if (decisoes.length || String(r.notas_decisao || '').trim()) {
    corpo += titulo(++n, 'Decisões que dependem da gerência')
    if (decisoes.length) corpo += `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${decisoes.map((i) => itemHtml(i, site)).join('')}</table>`
    if (String(r.notas_decisao || '').trim()) corpo += `<div style="font-size:14px;line-height:1.5;margin-top:6px">${blocoTexto(r.notas_decisao, site)}</div>`
  }

  if (plano.length || anterior.length) {
    corpo += titulo(++n, 'Plano de ação para a próxima semana')
    if (anterior.length) {
      corpo += `<div style="font-size:13px;font-weight:600;color:${COR.marinho};margin:0 0 4px">Acompanhamento do plano anterior</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:12px">${anterior.map((p) => {
          const a = ACOMPANHAMENTO[p.feito]
          return `<tr><td width="22" valign="top" style="font-size:15px;font-weight:700;color:${a ? a.cor : COR.suave};padding:2px 0">${a ? a.simbolo : '•'}</td>
            <td style="font-size:14px;padding:2px 0 5px">${comLinks(p.texto, site)}${a ? ` <span style="font-size:12px;color:${a.cor}">(${a.rotulo.toLowerCase()})</span>` : ''}</td></tr>`
        }).join('')}</table>`
    }
    if (plano.length) {
      if (anterior.length) corpo += `<div style="font-size:13px;font-weight:600;color:${COR.marinho};margin:0 0 4px">Próxima semana</div>`
      corpo += `<ol style="margin:0;padding-left:22px;font-size:14px;line-height:1.5">${plano.map((p) => `<li style="margin:0 0 5px">${comLinks(p.texto, site)}</li>`).join('')}</ol>`
    }
  }

  const link = r.id ? `${site}/relatorio/${r.id}` : site
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:${COR.fundo}">
<div style="background:${COR.fundo};padding:24px 10px;font-family:Segoe UI,Arial,sans-serif;color:${COR.texto}">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid ${COR.linha}">
<div style="height:5px;background:linear-gradient(90deg,#4be0db,#212f96,#f9518d);background-color:#212f96"></div>
<div style="padding:22px 26px 26px">
<div style="font-size:12px;color:${COR.suave};margin-bottom:4px">TI · Grupo Zerbini</div>
<h2 style="margin:0;font-size:21px;color:${COR.marinho}">Relatório semanal de TI</h2>
<div style="font-size:14px;color:${COR.suave};margin-top:2px">Semana de ${esc(periodoTexto(r))}</div>
<p style="margin:16px 0 0;font-size:14px">${esc(saudacao)}<br>Segue o resumo semanal das atividades e indicadores da área de TI.</p>
${corpo}
<p style="margin:26px 0 0;font-size:14px">Atenciosamente,<br><b>TI · Grupo Zerbini</b></p>
<div style="margin-top:18px;padding-top:12px;border-top:1px solid ${COR.linha};font-size:12px;color:${COR.suave}">
<a href="${link}" style="color:${COR.azul}">Ver este relatório no helpdesk</a> · Indicadores calculados automaticamente pelo Zerbini Helpdesk (horário útil: seg a sex, 8h às 17h45).</div>
</div></div></div></body></html>`
}
