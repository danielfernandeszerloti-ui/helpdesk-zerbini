import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  BookOpen, Search, Plus, ArrowLeft, Pencil, Lock, Globe, Eye, ThumbsUp, ThumbsDown, Link2, X, Copy, Archive, Trash2,
  Heading2, List, ListOrdered, Bold, Code, AlertTriangle, ImagePlus, Save, Send, Lightbulb, Ticket,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { codigo, mensagemErro, nomeDeEmail, tempoRelativo, dataHora } from '../lib/util'
import { StatusBadge, arquivosDoEvento } from '../components/ui'
import {
  TIPOS_ARTIGO, MODELOS, buscar, renderizar, textoPlano, enviarPrint, urlsAssinadas, imagensDoTexto, parecesenha,
} from '../lib/base'

const CAMPOS_LISTA = 'id,titulo,tipo,categoria_id,tags,resumo,conteudo,visibilidade,status,autor_email,atualizado_em,atualizado_por,visualizacoes,uteis,nao_uteis'

export function TipoArtigo({ tipo }) {
  const t = TIPOS_ARTIGO[tipo] || TIPOS_ARTIGO.procedimento
  return <span className={'badge badge-' + t.cor}>{t.rotulo}</span>
}

function Conteudo({ texto, equipe }) {
  const [urls, setUrls] = useState({})
  const caminhos = useMemo(() => imagensDoTexto(texto), [texto])
  useEffect(() => {
    const faltam = caminhos.filter((c) => !urls[c])
    if (faltam.length) urlsAssinadas(faltam).then((m) => setUrls((u) => ({ ...u, ...m })))
  }, [caminhos]) // eslint-disable-line react-hooks/exhaustive-deps
  const html = useMemo(() => renderizar(texto, { urls, equipe }), [texto, urls, equipe])
  return <div className="kb-conteudo" dangerouslySetInnerHTML={{ __html: html }} />
}

// ------------------------------------------------------------------ lista
function ListaBase() {
  const { perfil, categorias, avisar } = useSessao()
  const equipe = perfil.eh_agente || perfil.eh_dev
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [artigos, setArtigos] = useState(null)
  const [usos, setUsos] = useState({})
  const [demanda, setDemanda] = useState([])
  const q = params.get('q') || ''
  const tipo = params.get('tipo') || ''
  const cat = params.get('cat') || ''
  const situacao = params.get('situacao') || 'publicado'
  const mudar = (k, v) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }) }

  useEffect(() => {
    supabase.from('hd_artigos').select(CAMPOS_LISTA).order('atualizado_em', { ascending: false }).limit(2000)
      .then(({ data, error }) => { if (error) avisar(mensagemErro(error), 'erro'); setArtigos(data || []) })
    if (equipe) {
      supabase.from('hd_artigo_chamados').select('artigo_id').limit(10000).then(({ data }) => {
        const m = {}; for (const x of data || []) m[x.artigo_id] = (m[x.artigo_id] || 0) + 1; setUsos(m)
      })
      // o que mais gera chamado nos últimos 30 dias
      supabase.from('hd_chamados').select('categoria_id').gte('criado_em', new Date(Date.now() - 30 * 864e5).toISOString()).limit(3000)
        .then(({ data }) => {
          const m = {}; for (const c of data || []) if (c.categoria_id) m[c.categoria_id] = (m[c.categoria_id] || 0) + 1
          setDemanda(Object.entries(m).map(([id, n]) => ({ id: Number(id), n })).sort((a, b) => b.n - a.n))
        })
    }
  }, [equipe, avisar])

  const lista = useMemo(() => {
    let l = artigos || []
    if (equipe && situacao !== 'todos') l = l.filter((a) => a.status === situacao)
    if (tipo) l = l.filter((a) => a.tipo === tipo)
    if (cat) l = l.filter((a) => String(a.categoria_id) === cat)
    return q.trim() ? buscar(l, q) : l
  }, [artigos, equipe, situacao, tipo, cat, q])

  const nomeCat = (id) => categorias.find((c) => c.id === id)?.nome
  const contagem = (s) => (artigos || []).filter((a) => a.status === s).length
  const semArtigo = useMemo(() => {
    if (!artigos) return []
    const comArtigo = new Set(artigos.filter((a) => a.status === 'publicado').map((a) => a.categoria_id))
    return demanda.filter((d) => d.n >= 2 && !comArtigo.has(d.id) && nomeCat(d.id)).slice(0, 4)
  }, [artigos, demanda, categorias]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pagina pagina-base">
      <div className="cabecalho-pagina">
        <div>
          <h1>{equipe ? 'Base de conhecimento' : 'Ajuda'}</h1>
          <p className="texto-suave">{equipe
            ? 'Procedimentos, configurações, acessos e erros conhecidos da TI — vinculados aos chamados.'
            : 'Soluções e orientações da TI. Se não encontrar o que precisa, abra um chamado.'}</p>
        </div>
        {equipe ? <Link to="/base/novo" className="btn btn-primario"><Plus size={16} /> Novo artigo</Link>
          : <Link to="/novo" className="btn btn-primario"><Plus size={16} /> Abrir chamado</Link>}
      </div>

      <div className="cartao kb-busca">
        <Search size={18} />
        <input type="search" value={q} onChange={(e) => mudar('q', e.target.value)} autoFocus
          placeholder={equipe ? 'Buscar por erro, sistema, procedimento… (ex.: xml shopee, vpn, impressora)' : 'Descreva o problema (ex.: impressora, outlook, acesso)'} aria-label="Buscar artigos" />
      </div>

      <div className="kb-filtros">
        <div className="chips">
          <button className={'chip' + (!tipo ? ' ativo' : '')} onClick={() => mudar('tipo', '')}>Todos</button>
          {Object.entries(TIPOS_ARTIGO).map(([k, t]) => <button key={k} className={'chip' + (tipo === k ? ' ativo' : '')} onClick={() => mudar('tipo', tipo === k ? '' : k)}>{t.rotulo}</button>)}
        </div>
        <div className="kb-filtros-dir">
          <select value={cat} onChange={(e) => mudar('cat', e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {equipe && (
            <select value={situacao} onChange={(e) => mudar('situacao', e.target.value === 'publicado' ? '' : e.target.value)} aria-label="Situação">
              <option value="publicado">Publicados ({contagem('publicado')})</option>
              <option value="rascunho">Rascunhos ({contagem('rascunho')})</option>
              <option value="arquivado">Arquivados ({contagem('arquivado')})</option>
              <option value="todos">Todos</option>
            </select>
          )}
        </div>
      </div>

      {equipe && semArtigo.length > 0 && !q && (
        <div className="cartao kb-demanda">
          <Lightbulb size={18} />
          <div>
            <strong>O que vale documentar</strong>
            <span className="texto-suave">Categorias com mais chamados nos últimos 30 dias e ainda sem artigo:</span>
            <div className="chips">
              {semArtigo.map((d) => (
                <button key={d.id} className="chip" onClick={() => navigate(`/base/novo?categoria=${d.id}`)}>
                  <Plus size={13} /> {nomeCat(d.id)} <small>{d.n} chamados</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {artigos === null ? <div className="cartao carregando-bloco"><div className="spinner" /></div>
        : !lista.length ? (
          <div className="cartao vazio">
            <BookOpen size={30} />
            {artigos.length === 0 ? (
              <>
                <strong>{equipe ? 'A base ainda está vazia' : 'Nenhum artigo publicado ainda'}</strong>
                <p>{equipe ? 'Comece pelo erro que mais se repete. Dentro de um chamado resolvido, use "Criar artigo a partir deste chamado".' : 'Abra um chamado e a TI ajuda você.'}</p>
                {equipe && <Link to="/base/novo" className="btn btn-primario"><Plus size={16} /> Escrever o primeiro artigo</Link>}
              </>
            ) : (
              <>
                <strong>Nada encontrado{q ? ` para "${q}"` : ''}</strong>
                <p>{equipe ? 'Tente outras palavras ou crie um artigo sobre isso.' : 'Tente outras palavras ou abra um chamado.'}</p>
                {equipe && q && <Link to={`/base/novo?titulo=${encodeURIComponent(q)}`} className="btn btn-leve"><Plus size={16} /> Criar artigo "{q}"</Link>}
              </>
            )}
          </div>
        ) : (
          <div className="kb-lista">
            {lista.map((a) => (
              <Link key={a.id} to={'/base/' + a.id} className="cartao kb-cartao">
                <div className="kb-cartao-topo">
                  <TipoArtigo tipo={a.tipo} />
                  {nomeCat(a.categoria_id) && <span className="kb-cat">{nomeCat(a.categoria_id)}</span>}
                  {equipe && (a.visibilidade === 'publica'
                    ? <span className="kb-vis publica" title="Colaboradores também veem"><Globe size={13} /> Pública</span>
                    : <span className="kb-vis" title="Só a equipe de TI vê"><Lock size={13} /> Interna</span>)}
                  {a.status !== 'publicado' && <span className="badge badge-cinza">{a.status === 'rascunho' ? 'Rascunho' : 'Arquivado'}</span>}
                </div>
                <h3>{a.titulo}</h3>
                <p>{textoPlano(a.resumo || a.conteudo).slice(0, 220)}</p>
                <div className="kb-cartao-meta">
                  {(a.tags || []).slice(0, 5).map((t) => <span key={t} className="kb-tag">{t}</span>)}
                  <span className="kb-cartao-info">
                    {equipe && usos[a.id] ? <span title="Chamados vinculados"><Ticket size={13} /> {usos[a.id]}</span> : null}
                    {a.uteis > 0 && <span title="Marcaram como útil"><ThumbsUp size={13} /> {a.uteis}</span>}
                    <span>atualizado {tempoRelativo(a.atualizado_em)}</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
    </div>
  )
}

// ------------------------------------------------------------------ ver artigo
function VerArtigo({ id }) {
  const { perfil, categorias, avisar } = useSessao()
  const equipe = perfil.eh_agente || perfil.eh_dev
  const navigate = useNavigate()
  const [a, setA] = useState(undefined)
  const [vinculos, setVinculos] = useState([])
  const [novoVinc, setNovoVinc] = useState('')
  const [votou, setVotou] = useState(() => { try { return localStorage.getItem('hd_kb_voto_' + id) } catch { return null } })

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('hd_artigos').select('*').eq('id', id).maybeSingle()
    setA(data || null)
    if (data && equipe) {
      const { data: v } = await supabase.from('hd_artigo_chamados').select('chamado_id,criado_em,vinculado_por,chamado:hd_chamados(id,titulo,status,solicitante_nome,solicitante_email,criado_em)')
        .eq('artigo_id', id).order('criado_em', { ascending: false })
      setVinculos(v || [])
    }
  }, [id, equipe])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const chave = 'hd_kb_visto_' + id
    try { if (sessionStorage.getItem(chave)) return; sessionStorage.setItem(chave, '1') } catch { /* ignora */ }
    supabase.rpc('hd_artigo_contar', { p_id: id, p_evento: 'visto' }).then(() => {})
  }, [id])

  if (a === undefined) return <div className="pagina"><div className="cartao carregando-bloco"><div className="spinner" /></div></div>
  if (a === null) return (
    <div className="pagina pagina-estreita"><div className="cartao cartao-aviso">
      <h2>Artigo não encontrado</h2><p className="texto-suave">Ele não existe ou não está disponível para você.</p>
      <Link to="/base" className="btn btn-primario">Voltar</Link>
    </div></div>
  )

  async function votar(util) {
    if (votou) return
    await supabase.rpc('hd_artigo_contar', { p_id: id, p_evento: util ? 'util' : 'nao_util' })
    try { localStorage.setItem('hd_kb_voto_' + id, util ? 'sim' : 'nao') } catch { /* ignora */ }
    setVotou(util ? 'sim' : 'nao')
  }
  async function vincular(e) {
    e.preventDefault()
    const n = Number(String(novoVinc).replace(/\D/g, ''))
    if (!n) return
    const { error } = await supabase.from('hd_artigo_chamados').insert({ artigo_id: id, chamado_id: n })
    if (error) return avisar(/duplicate/.test(error.message) ? 'Esse chamado já está vinculado.' : /foreign key/.test(error.message) ? `Chamado ${codigo(n)} não existe.` : mensagemErro(error), 'erro')
    setNovoVinc(''); carregar(); avisar(`Vinculado ao chamado ${codigo(n)}`)
  }
  async function desvincular(cid) {
    const { error } = await supabase.from('hd_artigo_chamados').delete().eq('artigo_id', id).eq('chamado_id', cid)
    if (error) return avisar(mensagemErro(error), 'erro')
    carregar()
  }
  function copiarLink() {
    navigator.clipboard?.writeText(`${window.location.origin}/base/${id}`).then(() => avisar('Link copiado'), () => {})
  }

  const cat = categorias.find((c) => c.id === a.categoria_id)?.nome
  return (
    <div className="pagina pagina-artigo">
      <div className="kb-artigo-grade">
        <article className="cartao kb-artigo">
          <Link to="/base" className="voltar"><ArrowLeft size={15} /> {equipe ? 'Base de conhecimento' : 'Ajuda'}</Link>
          <div className="kb-cartao-topo">
            <TipoArtigo tipo={a.tipo} />
            {cat && <span className="kb-cat">{cat}</span>}
            {a.status !== 'publicado' && <span className="badge badge-cinza">{a.status === 'rascunho' ? 'Rascunho' : 'Arquivado'}</span>}
          </div>
          <h1>{a.titulo}</h1>
          {a.resumo?.trim() && <p className="kb-resumo">{a.resumo}</p>}
          <Conteudo texto={a.conteudo} equipe={equipe} />
          <div className="kb-util">
            {votou ? <span className="texto-suave">Obrigado pelo retorno!</span> : (
              <>
                <span>Este artigo ajudou?</span>
                <button className="btn btn-leve" onClick={() => votar(true)}><ThumbsUp size={15} /> Sim</button>
                <button className="btn btn-leve" onClick={() => votar(false)}><ThumbsDown size={15} /> Não</button>
                {!equipe && <Link to="/novo" className="btn-link">Ainda preciso de ajuda → abrir chamado</Link>}
              </>
            )}
          </div>
        </article>

        {equipe && (
          <aside className="lateral">
            <div className="cartao painel-lateral">
              <div className="kb-acoes">
                <button className="btn btn-primario" onClick={() => navigate(`/base/${id}/editar`)}><Pencil size={15} /> Editar</button>
                <button className="btn btn-leve" onClick={copiarLink} title="Copiar link do artigo"><Copy size={15} /> Link</button>
              </div>
              <dl className="detalhes">
                <dt>Visibilidade</dt>
                <dd>{a.visibilidade === 'publica' ? <span className="kb-vis publica"><Globe size={13} /> Pública</span> : <span className="kb-vis"><Lock size={13} /> Interna (só TI)</span>}</dd>
                <dt>Autor</dt><dd>{nomeDeEmail(a.autor_email || '') || '—'}</dd>
                <dt>Atualizado</dt><dd>{dataHora(a.atualizado_em)}{a.atualizado_por && a.atualizado_por !== a.autor_email ? ` por ${nomeDeEmail(a.atualizado_por)}` : ''}</dd>
                <dt>Leituras</dt><dd><Eye size={13} /> {a.visualizacoes}</dd>
                <dt>Ajudou</dt><dd><ThumbsUp size={13} /> {a.uteis} · <ThumbsDown size={13} /> {a.nao_uteis}</dd>
              </dl>
              {(a.tags || []).length > 0 && <div className="kb-tags">{a.tags.map((t) => <Link key={t} to={`/base?q=${encodeURIComponent(t)}`} className="kb-tag">{t}</Link>)}</div>}
            </div>

            <div className="cartao painel-lateral">
              <h3 className="rotulo-linha"><Ticket size={15} /> Chamados relacionados <small>{vinculos.length}</small></h3>
              {vinculos.length ? (
                <ul className="kb-vinculos">
                  {vinculos.map((v) => (
                    <li key={v.chamado_id}>
                      <Link to={'/chamado/' + v.chamado_id}><b>{codigo(v.chamado_id)}</b> {v.chamado?.titulo}</Link>
                      <span>{v.chamado && <StatusBadge status={v.chamado.status} />}<button className="btn-icone" onClick={() => desvincular(v.chamado_id)} aria-label="Desvincular"><X size={14} /></button></span>
                    </li>
                  ))}
                </ul>
              ) : <p className="texto-suave">Nenhum chamado vinculado ainda.</p>}
              <form className="nova-tarefa" onSubmit={vincular}>
                <input value={novoVinc} onChange={(e) => setNovoVinc(e.target.value)} placeholder="Nº do chamado (ex.: 42)" inputMode="numeric" aria-label="Número do chamado" />
                <button className="btn btn-leve" disabled={!novoVinc.trim()} aria-label="Vincular"><Link2 size={16} /></button>
              </form>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ editor
function Editor({ id }) {
  const { perfil, categorias, avisar } = useSessao()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const chamadoOrigem = Number(params.get('chamado')) || null
  const [a, setA] = useState(null)
  const [tagsTxt, setTagsTxt] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [enviandoImg, setEnviandoImg] = useState(0)
  const [aba, setAba] = useState('escrever')
  const [semelhantes, setSemelhantes] = useState([])
  const todos = useRef([])
  const area = useRef(null)
  const cursor = useRef(null) // última posição do cursor no texto (null = fim)
  const alterado = useRef(false)

  useEffect(() => {
    (async () => {
      const { data: lista } = await supabase.from('hd_artigos').select('id,titulo,tags,resumo,conteudo,categoria_id,status,tipo').neq('status', 'arquivado').limit(2000)
      todos.current = lista || []
      if (id) {
        const { data } = await supabase.from('hd_artigos').select('*').eq('id', id).maybeSingle()
        if (!data) { setA(false); return }
        setA(data); setTagsTxt((data.tags || []).join(', '))
        return
      }
      const novo = {
        titulo: params.get('titulo') || '', tipo: 'procedimento', categoria_id: Number(params.get('categoria')) || null,
        tags: [], resumo: '', conteudo: MODELOS.procedimento, visibilidade: 'interna', status: 'publicado',
      }
      if (chamadoOrigem) {
        const [c, m] = await Promise.all([
          supabase.from('hd_chamados').select('id,titulo,descricao,categoria_id,tipo,solicitante_email').eq('id', chamadoOrigem).maybeSingle(),
          supabase.from('hd_mensagens').select('corpo,autor_email,tipo,interna,do_solicitante').eq('chamado_id', chamadoOrigem).eq('tipo', 'mensagem').order('criado_em'),
        ])
        if (c.data) {
          const ch = c.data
          const daTi = (m.data || []).filter((x) => x.autor_email !== ch.solicitante_email && !x.do_solicitante && String(x.corpo || '').trim()).map((x) => x.corpo.trim())
          novo.titulo = ch.titulo
          novo.categoria_id = ch.categoria_id
          novo.tipo = ch.tipo === 'incidente' ? 'erro' : 'procedimento'
          novo.resumo = String(ch.descricao || '').replace(/\s+/g, ' ').trim().slice(0, 280)
          novo.conteudo = ch.tipo === 'incidente'
            ? `## Sintoma\n${String(ch.descricao || '').trim()}\n\n## Causa\n\n\n## Solução\n${daTi.join('\n\n') || '1. '}\n\n## Como evitar\n`
            : `## Quando usar\n${String(ch.descricao || '').trim()}\n\n## Passo a passo\n${daTi.join('\n\n') || '1. '}\n`
        }
      }
      setA(novo)
    })()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // artigos parecidos (evita duplicar)
  useEffect(() => {
    if (!a || id) return
    const t = setTimeout(() => setSemelhantes(buscar(todos.current, a.titulo, { minimo: 4 }).slice(0, 3)), 300)
    return () => clearTimeout(t)
  }, [a?.titulo, id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const aviso = (e) => { if (alterado.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [])

  if (a === null) return <div className="pagina"><div className="cartao carregando-bloco"><div className="spinner" /></div></div>
  if (a === false) return <div className="pagina pagina-estreita"><div className="alerta alerta-erro">Artigo não encontrado.</div></div>

  const set = (campos) => { alterado.current = true; setA((x) => ({ ...x, ...campos })) }
  const modeloVazio = Object.values(MODELOS).includes(a.conteudo) || !a.conteudo.trim()

  function inserir(antes, depois = '', linha = false) {
    const el = area.current
    const focado = el && document.activeElement === el
    const selecao = focado ? [el.selectionStart, el.selectionEnd] : cursor.current
    alterado.current = true
    setA((x) => {
      const c = x.conteudo
      const ini = Math.min(selecao?.[0] ?? c.length, c.length), fim = Math.min(selecao?.[1] ?? c.length, c.length)
      const sel = c.slice(ini, fim)
      const pre = linha && ini > 0 && c[ini - 1] !== '\n' ? '\n' + antes : antes
      const p = ini + pre.length + sel.length
      cursor.current = [p, p]
      return { ...x, conteudo: c.slice(0, ini) + pre + sel + depois + c.slice(fim) }
    })
    requestAnimationFrame(() => { if (el && cursor.current) { el.focus(); el.setSelectionRange(cursor.current[0], cursor.current[1]) } })
  }

  async function subirImagens(arquivos) {
    const imgs = arquivos.filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return avisar('Só imagens podem ir no corpo do artigo.', 'erro')
    setEnviandoImg((n) => n + imgs.length)
    for (const f of imgs) {
      try {
        const cam = await enviarPrint(f)
        inserir(`![${f.name.replace(/\.[a-z]+$/i, '')}](${cam})\n`, '', true)
      } catch (e) { avisar(e.message, 'erro') }
      setEnviandoImg((n) => n - 1)
    }
  }
  const aoColar = (e) => { const fs = arquivosDoEvento(e, 'colar'); if (fs.length) subirImagens(fs) }
  const aoSoltar = (e) => { const fs = arquivosDoEvento(e, 'soltar'); if (fs.length) subirImagens(fs) }

  async function salvar(status) {
    if (a.titulo.trim().length < 3) return avisar('Dê um título ao artigo.', 'erro')
    if (parecesenha(a.conteudo) && !window.confirm('O texto parece conter uma senha. A base não é lugar para senhas — indique onde ela está guardada.\n\nSalvar mesmo assim?')) return
    setSalvando(true)
    const dados = {
      titulo: a.titulo, tipo: a.tipo, categoria_id: a.categoria_id || null, resumo: a.resumo,
      conteudo: a.conteudo, visibilidade: a.visibilidade, status,
      tags: tagsTxt.split(/[,;]+/).map((t) => t.trim()).filter(Boolean).slice(0, 15),
    }
    const r = id ? await supabase.from('hd_artigos').update(dados).eq('id', id).select('id').single()
      : await supabase.from('hd_artigos').insert(dados).select('id').single()
    if (r.error) { setSalvando(false); return avisar(mensagemErro(r.error), 'erro') }
    if (!id && chamadoOrigem) await supabase.from('hd_artigo_chamados').insert({ artigo_id: r.data.id, chamado_id: chamadoOrigem })
    alterado.current = false
    setSalvando(false)
    avisar(status === 'rascunho' ? 'Rascunho salvo' : status === 'arquivado' ? 'Artigo arquivado' : id ? 'Artigo atualizado' : 'Artigo publicado')
    navigate('/base/' + r.data.id, { replace: !id })
  }
  async function excluir() {
    if (!window.confirm('Excluir este artigo definitivamente? Prefira "Arquivar" se ele só ficou desatualizado.')) return
    const { error } = await supabase.from('hd_artigos').delete().eq('id', id)
    if (error) return avisar(mensagemErro(error), 'erro')
    alterado.current = false
    avisar('Artigo excluído'); navigate('/base', { replace: true })
  }

  const ferramentas = [
    { ic: Heading2, t: 'Subtítulo', f: () => inserir('## ', '', true) },
    { ic: List, t: 'Lista', f: () => inserir('- ', '', true) },
    { ic: ListOrdered, t: 'Passo a passo numerado', f: () => inserir('1. ', '', true) },
    { ic: Bold, t: 'Negrito', f: () => inserir('**', '**') },
    { ic: Code, t: 'Código / caminho / comando', f: () => inserir('`', '`') },
    { ic: AlertTriangle, t: 'Aviso em destaque', f: () => inserir('> ', '', true) },
  ]

  return (
    <div className="pagina pagina-artigo">
      <div className="cabecalho-pagina">
        <div>
          <Link to={id ? '/base/' + id : '/base'} className="voltar"><ArrowLeft size={15} /> {id ? 'Voltar ao artigo' : 'Base de conhecimento'}</Link>
          <h1>{id ? 'Editar artigo' : 'Novo artigo'}</h1>
          {chamadoOrigem && !id && <p className="texto-suave">A partir do chamado <Link to={'/chamado/' + chamadoOrigem}>{codigo(chamadoOrigem)}</Link> — o artigo fica vinculado a ele.</p>}
        </div>
      </div>

      <div className="kb-artigo-grade">
        <div className="cartao kb-editor">
          <label className="campo">
            <span>Título <em>*</em></span>
            <input value={a.titulo} onChange={(e) => set({ titulo: e.target.value })} maxLength={200} autoFocus={!id && !a.titulo}
              placeholder="Ex.: XML da Shopee não carrega no ERP" />
          </label>
          {semelhantes.length > 0 && (
            <div className="alerta alerta-aviso kb-semelhantes">
              Já existe algo parecido — talvez seja melhor atualizar:
              {semelhantes.map((s) => <Link key={s.id} to={`/base/${s.id}/editar`}>{s.titulo}</Link>)}
            </div>
          )}

          <div className="campo">
            <span>Tipo</span>
            <div className="kb-tipos">
              {Object.entries(TIPOS_ARTIGO).map(([k, t]) => (
                <button key={k} type="button" className={'kb-tipo' + (a.tipo === k ? ' ativo' : '')} title={t.desc}
                  onClick={() => set({ tipo: k, ...(modeloVazio ? { conteudo: MODELOS[k] } : {}) })}>{t.rotulo}</button>
              ))}
            </div>
            <small className="dica">{TIPOS_ARTIGO[a.tipo]?.desc}</small>
          </div>

          <label className="campo">
            <span>Resumo <small className="texto-suave">— sintoma ou quando usar (aparece na busca)</small></span>
            <textarea rows={2} value={a.resumo} onChange={(e) => set({ resumo: e.target.value })} maxLength={400}
              placeholder="Ex.: Notas da Shopee aparecem sem XML no ERP depois da emissão." />
          </label>

          <div className="campo">
            <span className="kb-editor-rotulo">
              Conteúdo
              <span className="segmentos compacto">
                <button type="button" className={aba === 'escrever' ? 'ativo' : ''} onClick={() => setAba('escrever')}>Escrever</button>
                <button type="button" className={aba === 'ver' ? 'ativo' : ''} onClick={() => setAba('ver')}>Pré-visualizar</button>
              </span>
            </span>
            {aba === 'escrever' ? (
              <>
                <div className="kb-ferramentas">
                  {ferramentas.map(({ ic: Ic, t, f }) => <button key={t} type="button" className="btn-icone" title={t} aria-label={t} onClick={f}><Ic size={16} /></button>)}
                  <label className="btn-icone" title="Inserir imagem (ou cole um print com Ctrl+V)" aria-label="Inserir imagem">
                    <ImagePlus size={16} />
                    <input type="file" accept="image/*" multiple hidden onChange={(e) => { subirImagens([...e.target.files]); e.target.value = '' }} />
                  </label>
                  {enviandoImg > 0 && <span className="texto-suave kb-enviando">Enviando imagem…</span>}
                </div>
                <textarea ref={area} className="kb-texto" value={a.conteudo} onChange={(e) => set({ conteudo: e.target.value })}
                  onPaste={aoColar} onDrop={aoSoltar} rows={18} spellCheck
                  onSelect={(e) => { cursor.current = [e.target.selectionStart, e.target.selectionEnd] }} />
                <small className="dica">Cole prints com <b>Ctrl+V</b>. <code>## Subtítulo</code> · <code>1. passo</code> · <code>- item</code> · <code>**negrito**</code> · <code>`caminho`</code> · <code>&gt; aviso</code> · <code>#0042</code> vira link do chamado.</small>
              </>
            ) : <div className="kb-previa"><Conteudo texto={a.conteudo} equipe /></div>}
          </div>
          {parecesenha(a.conteudo) && <div className="alerta alerta-erro"><Lock size={14} /> Parece haver uma senha no texto. Não registre senhas na base — indique onde ela está guardada.</div>}
        </div>

        <aside className="lateral">
          <div className="cartao painel-lateral">
            <h3>Publicação</h3>
            <div className="kb-vis-opcoes">
              <label className={'kb-vis-opcao' + (a.visibilidade === 'interna' ? ' ativo' : '')}>
                <input type="radio" name="vis" checked={a.visibilidade === 'interna'} onChange={() => set({ visibilidade: 'interna' })} />
                <Lock size={16} /><span><b>Interna</b><small>Só a equipe de TI vê.</small></span>
              </label>
              <label className={'kb-vis-opcao' + (a.visibilidade === 'publica' ? ' ativo' : '')}>
                <input type="radio" name="vis" checked={a.visibilidade === 'publica'} onChange={() => set({ visibilidade: 'publica' })} />
                <Globe size={16} /><span><b>Pública</b><small>Colaboradores veem em Ajuda e como sugestão ao abrir chamado.</small></span>
              </label>
            </div>
            <label className="campo">
              <span>Categoria</span>
              <select value={a.categoria_id || ''} onChange={(e) => set({ categoria_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Sem categoria</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
            <label className="campo">
              <span>Palavras-chave</span>
              <input value={tagsTxt} onChange={(e) => { alterado.current = true; setTagsTxt(e.target.value) }} placeholder="shopee, xml, nota fiscal" />
              <small className="dica">Separe por vírgula. Use as palavras que as pessoas usam para descrever o problema.</small>
            </label>
            <div className="kb-salvar">
              <button className="btn btn-primario btn-bloco" disabled={salvando || enviandoImg > 0} onClick={() => salvar('publicado')}>
                <Send size={15} /> {salvando ? 'Salvando…' : id && a.status === 'publicado' ? 'Salvar alterações' : 'Publicar'}
              </button>
              <button className="btn btn-leve btn-bloco" disabled={salvando || enviandoImg > 0} onClick={() => salvar('rascunho')}><Save size={15} /> Salvar como rascunho</button>
              {id && a.status !== 'arquivado' && <button className="btn btn-leve btn-bloco" disabled={salvando} onClick={() => salvar('arquivado')}><Archive size={15} /> Arquivar (desatualizado)</button>}
              {id && perfil.eh_agente && <button className="btn btn-perigo-leve btn-bloco" onClick={excluir}><Trash2 size={15} /> Excluir</button>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default function Base({ modo }) {
  const { id } = useParams()
  const { perfil } = useSessao()
  const equipe = perfil.eh_agente || perfil.eh_dev
  if (modo === 'novo') return equipe ? <Editor key="novo" /> : <ListaBase />
  if (modo === 'editar') return equipe ? <Editor key={'e' + id} id={Number(id)} /> : <VerArtigo id={Number(id)} />
  if (id) return <VerArtigo key={id} id={Number(id)} />
  return <ListaBase />
}
