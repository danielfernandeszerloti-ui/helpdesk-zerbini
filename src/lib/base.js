// Base de conhecimento: tipos, busca, prints e renderização segura do texto
import { supabase, BUCKET } from './supabase'
import { comprimirImagem, nomeSeguro, LIMITE_ARQUIVO } from './util'

export const TIPOS_ARTIGO = {
  procedimento: { rotulo: 'Procedimento', cor: 'azul', desc: 'passo a passo para resolver ou executar algo' },
  erro: { rotulo: 'Erro conhecido', cor: 'rosa', desc: 'sintoma, causa e correção de um erro que se repete' },
  configuracao: { rotulo: 'Configuração', cor: 'roxo', desc: 'como algo está ou deve ser configurado' },
  acesso: { rotulo: 'Acesso', cor: 'turquesa', desc: 'onde e como acessar sistemas, portais e recursos' },
  faq: { rotulo: 'Pergunta frequente', cor: 'amarelo', desc: 'resposta curta para dúvidas comuns' },
}

export const MODELOS = {
  procedimento: '## Quando usar\n\n\n## Passo a passo\n1. \n2. \n3. \n\n## Como confirmar que deu certo\n',
  erro: '## Sintoma\n\n\n## Causa\n\n\n## Solução\n1. \n2. \n\n## Como evitar\n',
  configuracao: '## Onde fica\n\n\n## Configuração atual\n- \n\n## Como alterar\n1. \n',
  acesso: '## Endereço / sistema\n\n\n## Quem tem acesso\n\n\n## Como pedir ou liberar\n1. \n\n> Não registre senhas aqui. Indique onde a senha está guardada (cofre, responsável).\n',
  faq: '## Resposta\n\n',
}

const STOP = new Set(['para', 'com', 'que', 'nao', 'uma', 'por', 'dos', 'das', 'como', 'meu', 'minha', 'esta', 'esse', 'essa', 'isso', 'tem', 'ter', 'nos', 'nas', 'mais', 'mas', 'sem', 'pra', 'pelo', 'pela', 'ele', 'ela', 'seu', 'sua', 'ao', 'aos', 'favor', 'bom', 'dia', 'tarde', 'ola', 'oi', 'preciso', 'consigo', 'conseguir', 'estou', 'quando', 'sobre', 'the'])

export const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
export const termos = (s) => [...new Set(normalizar(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t)))]

// pontuação simples: título e tags valem mais que o corpo; prefixo conta (impressora ~ impressoras)
export function pontuar(a, ts, categoriaId) {
  if (!ts.length) return 0
  const tit = normalizar(a.titulo), tags = normalizar((a.tags || []).join(' ')), res = normalizar(a.resumo), cor = normalizar(a.conteudo)
  let p = 0, achou = 0
  for (const t of ts) {
    const raiz = t.length > 5 ? t.slice(0, t.length - 1) : t
    let v = 0
    if (tit.includes(raiz)) v += 4
    if (tags.includes(raiz)) v += 3
    if (res.includes(raiz)) v += 2
    if (cor.includes(raiz)) v += 1
    if (v) achou++
    p += v
  }
  if (!achou) return 0
  p *= achou / ts.length // prioriza quem casa com mais palavras
  if (categoriaId && a.categoria_id === categoriaId) p += 2
  return p
}

export function buscar(artigos, consulta, { categoriaId, minimo = 0.5 } = {}) {
  const ts = termos(consulta)
  return artigos.map((a) => ({ a, p: pontuar(a, ts, categoriaId) })).filter((x) => x.p >= minimo)
    .sort((x, y) => y.p - x.p).map((x) => x.a)
}

// sugestões para um chamado: palavras do título e da descrição + categoria
export function sugerirParaChamado(artigos, chamado, limite = 3, excluir = []) {
  const pub = artigos.filter((a) => a.status === 'publicado' && !excluir.includes(a.id))
  const ts = termos(`${chamado.titulo} ${chamado.titulo} ${String(chamado.descricao || '').slice(0, 600)}`).slice(0, 18)
  const porTexto = pub.map((a) => ({ a, p: pontuar(a, ts, chamado.categoria_id) })).filter((x) => x.p >= 3)
  const daCategoria = pub.filter((a) => chamado.categoria_id && a.categoria_id === chamado.categoria_id).map((a) => ({ a, p: 2 }))
  const m = new Map()
  for (const x of [...porTexto, ...daCategoria]) if (!m.has(x.a.id) || m.get(x.a.id).p < x.p) m.set(x.a.id, x)
  return [...m.values()].sort((x, y) => y.p - x.p).slice(0, limite).map((x) => x.a)
}

export async function enviarPrint(arquivo) {
  const f = await comprimirImagem(arquivo)
  if (f.size > LIMITE_ARQUIVO) throw new Error(`"${arquivo.name}" passa de 10 MB`)
  const caminho = `kb/${crypto.randomUUID().slice(0, 8)}/${nomeSeguro(f.name || 'print.png')}`
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, f, { contentType: f.type || undefined })
  if (error) throw new Error('Falha ao enviar a imagem: ' + error.message)
  return caminho
}

export async function urlsAssinadas(caminhos) {
  if (!caminhos.length) return {}
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(caminhos, 3600)
  const m = {}
  for (const x of data || []) if (x.signedUrl) m[x.path] = x.signedUrl
  return m
}

export const imagensDoTexto = (t) => [...String(t || '').matchAll(/!\[[^\]]*\]\((kb\/[^)\s]+)\)/g)].map((m) => m[1])

// ----------------------------------------------------------------- texto → HTML (sempre escapado antes)
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(t, { urls, equipe }) {
  const codigos = []
  let s = esc(t).replace(/`([^`]+)`/g, (_, c) => { codigos.push(c); return `\u0000${codigos.length - 1}\u0000` })
  s = s.replace(/!\[([^\]]*)\]\((kb\/[^)\s]+)\)/g, (_, alt, cam) => {
    const u = urls[cam]
    return u ? `<a href="${u}" target="_blank" rel="noopener" class="kb-img"><img src="${u}" alt="${alt}" loading="lazy"></a>`
      : `<span class="kb-img-carregando">🖼 ${alt || 'imagem'}</span>`
  })
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, txt, u) => `<a href="${u}" target="_blank" rel="noopener">${txt}</a>`)
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, u) => `${pre}<a href="${u}" target="_blank" rel="noopener">${u}</a>`)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  if (equipe) s = s.replace(/(^|[\s(])#(\d{3,6})\b/g, (_, pre, n) => `${pre}<a href="/chamado/${Number(n)}">#${n}</a>`)
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codigos[Number(i)]}</code>`)
}

export function renderizar(texto, opts = {}) {
  const o = { urls: {}, equipe: false, ...opts }
  const linhas = String(texto || '').replace(/\r/g, '').split('\n')
  let html = '', lista = null, para = []
  const fecharPara = () => { if (para.length) html += `<p>${para.map((l) => inline(l, o)).join('<br>')}</p>`; para = [] }
  const fecharLista = () => { if (lista) html += `<${lista.tag}>${lista.itens.map((i) => `<li>${inline(i, o)}</li>`).join('')}</${lista.tag}>`; lista = null }
  const fechar = () => { fecharPara(); fecharLista() }
  for (let k = 0; k < linhas.length; k++) {
    const l = linhas[k]
    if (/^```/.test(l.trim())) {
      fechar()
      const bloco = []
      for (k++; k < linhas.length && !/^```/.test(linhas[k].trim()); k++) bloco.push(linhas[k])
      html += `<pre><code>${esc(bloco.join('\n'))}</code></pre>`
      continue
    }
    const t = l.trim()
    if (!t) { fechar(); continue }
    let m
    if ((m = t.match(/^(#{1,3})\s+(.*)$/))) { fechar(); const n = Math.min(4, m[1].length + 1); html += `<h${n}>${inline(m[2], o)}</h${n}>`; continue }
    if ((m = t.match(/^>\s?(.*)$/))) { fechar(); html += `<div class="kb-aviso">${inline(m[1], o)}</div>`; continue }
    if ((m = t.match(/^[-*•]\s+(.*)$/))) { fecharPara(); if (lista?.tag !== 'ul') { fecharLista(); lista = { tag: 'ul', itens: [] } } lista.itens.push(m[1]); continue }
    if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { fecharPara(); if (lista?.tag !== 'ol') { fecharLista(); lista = { tag: 'ol', itens: [] } } lista.itens.push(m[1]); continue }
    if (/^!\[[^\]]*\]\(kb\/[^)]+\)$/.test(t)) { fechar(); html += `<figure>${inline(t, o)}</figure>`; continue }
    fecharLista()
    para.push(l)
  }
  fechar()
  return html
}

// texto puro para cartões/listas
export const textoPlano = (t) => String(t || '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#>*`]/g, '').replace(/\s+/g, ' ').trim()

export const parecesenha = (t) => /\b(senha|password|pwd|pass)\s*[:=]\s*\S{3,}/i.test(String(t || ''))
