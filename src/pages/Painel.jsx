import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Mail, Download, Search, ArrowUpDown, ArrowUp, ArrowDown, Inbox, X, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import {
  codigo, dataHora, emAndamento, situacaoSla, hojeExtenso, nomeDeEmail, baixarCsv,
  STATUS, STATUS_ORDEM, PRIORIDADE, PRIORIDADE_ORDEM, ORIGENS,
} from '../lib/util'
import { StatusBadge, PrioridadeBadge, SlaTexto, Vazio } from '../components/ui'

const CARDS = [
  { chave: 'nao_lidos', rotulo: 'Não lidos', teste: (c) => emAndamento(c) && !c.lido_agente },
  { chave: 'abertos', rotulo: 'Abertos', teste: emAndamento },
  { chave: 'em_espera', rotulo: 'Em espera', teste: (c) => c.status === 'em_espera' },
  { chave: 'atrasados', rotulo: 'Em atraso', teste: (c) => situacaoSla(c) === 'atrasado', alerta: true },
  { chave: 'pausados', rotulo: 'Pausados', teste: (c) => c.status === 'pausado' },
  { chave: 'nao_atribuidos', rotulo: 'Não atribuídos', teste: (c) => emAndamento(c) && !c.atribuido_email },
  { chave: 'hoje', rotulo: 'Encerram hoje', teste: (c) => situacaoSla(c) === 'hoje' },
]

const COLUNAS = [
  { chave: 'id', rotulo: 'Código', valor: (c) => c.id },
  { chave: 'titulo', rotulo: 'Título', valor: (c) => c.titulo.toLowerCase() },
  { chave: 'solicitante', rotulo: 'Solicitante', valor: (c) => (c.solicitante_nome || c.solicitante_email).toLowerCase() },
  { chave: 'categoria', rotulo: 'Categoria', valor: (c) => (c.categoria?.nome || '').toLowerCase() },
  { chave: 'atualizado_em', rotulo: 'Última alteração', valor: (c) => c.atualizado_em },
  { chave: 'criado_em', rotulo: 'Criado em', valor: (c) => c.criado_em },
  { chave: 'atribuido', rotulo: 'Atribuído a', valor: (c) => c.atribuido_email || '~' },
  { chave: 'status', rotulo: 'Status', valor: (c) => STATUS_ORDEM.indexOf(c.status) },
  { chave: 'prioridade', rotulo: 'Prioridade', valor: (c) => PRIORIDADE[c.prioridade]?.peso || 0 },
  { chave: 'prazo', rotulo: 'Prazo de SLA', valor: (c) => c.prazo_sla || '9999' },
]

const POR_PAGINA = 25

export default function Painel() {
  const { perfil, categorias, responsaveis } = useSessao()
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const [lista, setLista] = useState(null)
  const [pagina, setPagina] = useState(0)
  const [atualizando, setAtualizando] = useState(false)

  const filtro = {
    card: params.get('card') || '',
    busca: params.get('q') || '',
    status: params.get('status') || 'andamento',
    categoria: params.get('cat') || '',
    atribuido: params.get('resp') || '',
    prioridade: params.get('prio') || '',
    ordem: params.get('ordem') || 'atualizado_em',
    dir: params.get('dir') || 'desc',
  }
  const mudar = (mudancas) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(mudancas)) v ? p.set(k, v) : p.delete(k)
    setParams(p, { replace: true })
    setPagina(0)
  }

  const carregar = useCallback(async () => {
    setAtualizando(true)
    const { data } = await supabase.from('hd_chamados')
      .select('*, categoria:hd_categorias(nome)').order('atualizado_em', { ascending: false }).limit(3000)
    setLista(data || [])
    setAtualizando(false)
  }, [])

  useEffect(() => {
    carregar()
    let t
    const canal = supabase.channel('painel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hd_chamados' }, () => {
        clearTimeout(t); t = setTimeout(carregar, 400)
      })
      .subscribe()
    const relogio = setInterval(carregar, 5 * 60 * 1000) // SLA muda com o tempo
    return () => { clearTimeout(t); clearInterval(relogio); supabase.removeChannel(canal) }
  }, [carregar])

  const contagens = useMemo(() => {
    const r = {}
    for (const card of CARDS) r[card.chave] = (lista || []).filter(card.teste).length
    return r
  }, [lista])

  const filtrados = useMemo(() => {
    if (!lista) return []
    const card = CARDS.find((c) => c.chave === filtro.card)
    const termo = filtro.busca.trim().toLowerCase().replace(/^#0*/, '')
    let r = lista.filter((c) => {
      if (card && !card.teste(c)) return false
      if (!card) {
        if (filtro.status === 'andamento' && !emAndamento(c)) return false
        if (filtro.status !== 'andamento' && filtro.status !== 'todos' && c.status !== filtro.status) return false
      }
      if (filtro.categoria && String(c.categoria_id) !== filtro.categoria) return false
      if (filtro.prioridade && c.prioridade !== filtro.prioridade) return false
      if (filtro.atribuido === 'eu' && c.atribuido_email !== perfil.email) return false
      if (filtro.atribuido === 'ninguem' && c.atribuido_email) return false
      if (filtro.atribuido && !['eu', 'ninguem'].includes(filtro.atribuido) && c.atribuido_email !== filtro.atribuido) return false
      if (termo) {
        const alvo = `${c.id} ${c.titulo} ${c.descricao} ${c.solicitante_nome} ${c.solicitante_email} ${c.setor} ${c.categoria?.nome || ''}`.toLowerCase()
        if (!alvo.includes(termo)) return false
      }
      return true
    })
    const col = COLUNAS.find((c) => c.chave === filtro.ordem) || COLUNAS[4]
    const m = filtro.dir === 'asc' ? 1 : -1
    r = [...r].sort((a, b) => {
      const va = col.valor(a), vb = col.valor(b)
      return (va < vb ? -1 : va > vb ? 1 : b.id - a.id) * m
    })
    return r
  }, [lista, filtro.card, filtro.busca, filtro.status, filtro.categoria, filtro.prioridade, filtro.atribuido, filtro.ordem, filtro.dir, perfil.email])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtrados.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA)
  const filtrosAtivos = [filtro.card, filtro.busca, filtro.categoria, filtro.atribuido, filtro.prioridade].filter(Boolean).length
    + (filtro.status !== 'andamento' ? 1 : 0)

  function ordenar(chave) {
    if (filtro.ordem === chave) mudar({ dir: filtro.dir === 'asc' ? 'desc' : 'asc' })
    else mudar({ ordem: chave, dir: ['titulo', 'solicitante', 'categoria', 'atribuido'].includes(chave) ? 'asc' : 'desc' })
  }

  function exportar() {
    const linhas = [['Código', 'Título', 'Solicitante', 'E-mail', 'Setor', 'Categoria', 'Status', 'Prioridade',
      'Atribuído a', 'Origem', 'Criado em', 'Última alteração', 'Prazo SLA', 'Resolvido em', 'AnyDesk', 'Descrição']]
    for (const c of filtrados) {
      linhas.push([codigo(c.id), c.titulo, c.solicitante_nome, c.solicitante_email, c.setor, c.categoria?.nome || '',
        STATUS[c.status]?.rotulo, PRIORIDADE[c.prioridade]?.rotulo, c.atribuido_email ? nomeDeEmail(c.atribuido_email) : '',
        ORIGENS[c.origem] || '', dataHora(c.criado_em), dataHora(c.atualizado_em), c.prazo_sla ? dataHora(c.prazo_sla) : '',
        c.resolvido_em ? dataHora(c.resolvido_em) : '', c.anydesk, c.descricao])
    }
    baixarCsv(`chamados-${new Date().toISOString().slice(0, 10)}.csv`, linhas)
  }

  return (
    <div className="pagina">
      <div className="cabecalho-pagina">
        <h1 className="titulo-data">{hojeExtenso()}</h1>
        <div className="acoes">
          <button className="btn btn-leve" onClick={carregar} title="Atualizar" aria-label="Atualizar">
            <RefreshCw size={16} className={atualizando ? 'girando' : ''} />
          </button>
          <button className="btn btn-leve" onClick={exportar} disabled={!filtrados.length}><Download size={16} /> Exportar Excel</button>
          <Link to="/novo?registro=1" className="btn btn-leve" title="Registrar um pedido que chegou por e-mail, telefone ou Teams"><Mail size={16} /> Registrar pedido</Link>
          <Link to="/novo" className="btn btn-primario"><Plus size={17} /> Novo chamado</Link>
        </div>
      </div>

      <div className="cards">
        {CARDS.map((card) => (
          <button key={card.chave}
            className={'card-contador' + (filtro.card === card.chave ? ' ativo' : '') + (card.alerta && contagens[card.chave] ? ' alerta' : '')}
            onClick={() => mudar({ card: filtro.card === card.chave ? '' : card.chave })}>
            <span>{card.rotulo}</span>
            <strong>{lista ? contagens[card.chave] : '–'}</strong>
          </button>
        ))}
      </div>

      <div className="cartao tabela-cartao">
        <div className="barra-filtros">
          <div className="busca">
            <Search size={16} />
            <input placeholder="Buscar por código, título, solicitante…" value={filtro.busca}
              onChange={(e) => mudar({ q: e.target.value })} />
          </div>
          <select value={filtro.card ? '' : filtro.status} disabled={!!filtro.card} onChange={(e) => mudar({ status: e.target.value === 'andamento' ? '' : e.target.value })} aria-label="Status">
            <option value="andamento">Em andamento</option>
            <option value="todos">Todos os status</option>
            {STATUS_ORDEM.map((s) => <option key={s} value={s}>{STATUS[s].rotulo}</option>)}
          </select>
          <select value={filtro.categoria} onChange={(e) => mudar({ cat: e.target.value })} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select value={filtro.atribuido} onChange={(e) => mudar({ resp: e.target.value })} aria-label="Atribuído a">
            <option value="">Qualquer responsável</option>
            <option value="eu">Atribuídos a mim</option>
            <option value="ninguem">Não atribuídos</option>
            {responsaveis(true).filter((a) => a !== perfil.email).map((a) => <option key={a} value={a}>{nomeDeEmail(a)}</option>)}
          </select>
          <select value={filtro.prioridade} onChange={(e) => mudar({ prio: e.target.value })} aria-label="Prioridade">
            <option value="">Todas as prioridades</option>
            {PRIORIDADE_ORDEM.map((p) => <option key={p} value={p}>{PRIORIDADE[p].rotulo}</option>)}
          </select>
          {filtrosAtivos > 0 && (
            <button className="btn-link" onClick={() => { setParams({}, { replace: true }); setPagina(0) }}>
              <X size={14} /> Limpar filtros
            </button>
          )}
        </div>

        {lista === null ? <div className="carregando-bloco"><div className="spinner" /></div> : filtrados.length === 0 ? (
          <Vazio icone={Inbox} titulo="Nenhum chamado encontrado">
            {filtrosAtivos ? 'Tente limpar os filtros.' : 'Quando alguém abrir um chamado, ele aparece aqui.'}
          </Vazio>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  {COLUNAS.map((col) => (
                    <th key={col.chave}>
                      <button onClick={() => ordenar(col.chave)} className={filtro.ordem === col.chave ? 'ordenado' : ''}>
                        {col.rotulo}
                        {filtro.ordem !== col.chave ? <ArrowUpDown size={12} /> : filtro.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visiveis.map((c) => (
                  <tr key={c.id} className={!c.lido_agente && emAndamento(c) ? 'nao-lido' : ''}
                    onClick={() => navegar(`/chamado/${c.id}`)}>
                    <td className="codigo">{codigo(c.id)}</td>
                    <td className="col-titulo">
                      <Link to={`/chamado/${c.id}`} onClick={(e) => e.stopPropagation()}>
                        {!c.lido_agente && emAndamento(c) && <span className="ponto-novo" title="Não lido" />}
                        {c.titulo}
                      </Link>
                    </td>
                    <td>{c.solicitante_nome || nomeDeEmail(c.solicitante_email)}{c.setor && <small className="sub">{c.setor}</small>}</td>
                    <td>{c.categoria?.nome || '—'}</td>
                    <td className="nowrap">{dataHora(c.atualizado_em)}</td>
                    <td className="nowrap">{dataHora(c.criado_em)}</td>
                    <td>{c.atribuido_email ? nomeDeEmail(c.atribuido_email) : <span className="texto-suave">Não atribuído</span>}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td><PrioridadeBadge prioridade={c.prioridade} /></td>
                    <td className="nowrap"><SlaTexto chamado={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="lista-mobile">
              {visiveis.map((c) => (
                <li key={c.id}>
                  <Link to={`/chamado/${c.id}`} className={!c.lido_agente && emAndamento(c) ? 'nao-lido' : ''}>
                    <div className="item-topo">
                      <span className="codigo">{codigo(c.id)}</span>
                      <StatusBadge status={c.status} />
                      <PrioridadeBadge prioridade={c.prioridade} />
                    </div>
                    <strong className="item-titulo">
                      {!c.lido_agente && emAndamento(c) && <span className="ponto-novo" />}{c.titulo}
                    </strong>
                    <div className="item-meta">
                      <span>{c.solicitante_nome || nomeDeEmail(c.solicitante_email)}</span><span>·</span>
                      <span>{c.categoria?.nome || 'Sem categoria'}</span><span>·</span>
                      <span>{c.atribuido_email ? nomeDeEmail(c.atribuido_email) : 'Não atribuído'}</span>
                    </div>
                    <div className="item-meta"><SlaTexto chamado={c} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lista && filtrados.length > 0 && (
          <div className="paginacao">
            <span>Mostrando {paginaAtual * POR_PAGINA + 1}–{Math.min((paginaAtual + 1) * POR_PAGINA, filtrados.length)} de {filtrados.length}
              {filtrados.length !== lista.length && ` (filtrados de ${lista.length})`}</span>
            <div>
              <button className="btn btn-leve" disabled={paginaAtual === 0} onClick={() => setPagina(paginaAtual - 1)}>Anterior</button>
              <button className="btn btn-leve" disabled={paginaAtual >= totalPaginas - 1} onClick={() => setPagina(paginaAtual + 1)}>Próximo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
