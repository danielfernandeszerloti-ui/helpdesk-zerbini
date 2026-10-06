import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, ArrowDown, Minus, RefreshCw, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { codigo, nomeDeEmail, duracaoHoras, PRIORIDADE, tempoRelativo, mensagemErro, moeda } from '../lib/util'
import { LinhasTempo, BarrasH, COR_ABERTOS, COR_CONCLUIDOS } from '../components/graficos'
import { PrioridadeBadge, StatusBadge } from '../components/ui'

const DIA = 86400000
const PERIODOS = [
  { id: '7', rotulo: 'Últimos 7 dias' },
  { id: '30', rotulo: 'Últimos 30 dias' },
  { id: '90', rotulo: 'Últimos 90 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes_ant', rotulo: 'Mês passado' },
]

function intervalo(id) {
  const agora = new Date()
  if (id === 'mes') return { ini: new Date(agora.getFullYear(), agora.getMonth(), 1), fim: agora }
  if (id === 'mes_ant') return { ini: new Date(agora.getFullYear(), agora.getMonth() - 1, 1), fim: new Date(agora.getFullYear(), agora.getMonth(), 1) }
  const d = Number(id)
  const ini = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - d + 1)
  return { ini, fim: agora }
}

const finalizado = (c) => c.status === 'resolvido' || c.status === 'cancelado'
const entre = (iso, a, b) => iso && new Date(iso) >= a && new Date(iso) < b
const horas = (a, b) => (new Date(b) - new Date(a)) / 3600000
const media = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null)
const mediana = (xs) => {
  if (!xs.length) return null
  const o = [...xs].sort((a, b) => a - b); const k = Math.floor(o.length / 2)
  return o.length % 2 ? o[k] : (o[k - 1] + o[k]) / 2
}
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null)

function calcular(lista, ini, fim) {
  const abertos = lista.filter((c) => entre(c.criado_em, ini, fim))
  const concluidos = lista.filter((c) => c.status === 'resolvido' && entre(c.resolvido_em, ini, fim))
  const comSla = concluidos.filter((c) => c.prazo_sla)
  const noPrazo = comSla.filter((c) => new Date(c.resolvido_em) <= new Date(c.prazo_sla))
  const tResol = concluidos.map((c) => horas(c.criado_em, c.resolvido_em))
  const respondidos = abertos.filter((c) => c.primeira_resposta_em)
  const tResp = respondidos.map((c) => horas(c.criado_em, c.primeira_resposta_em))
  return {
    abertos, concluidos, comSla, noPrazo,
    slaPct: pct(noPrazo.length, comSla.length),
    resolMedia: media(tResol), resolMediana: mediana(tResol),
    respMedia: media(tResp), respMediana: mediana(tResp),
    semResposta: abertos.filter((c) => !c.primeira_resposta_em && !finalizado(c)).length,
  }
}

function Variacao({ atual, anterior, menorMelhor, neutro, sufixo = '' }) {
  if (atual == null || anterior == null) return <span className="delta neutro">sem comparação</span>
  const dif = atual - anterior
  if (Math.abs(dif) < 0.05) return <span className="delta neutro"><Minus size={13} /> igual ao período anterior</span>
  const bom = menorMelhor ? dif < 0 : dif > 0
  const Icone = dif > 0 ? ArrowUp : ArrowDown
  const txt = sufixo === 'h' ? duracaoHoras(Math.abs(dif)) : `${Math.abs(Math.round(dif))}${sufixo}`
  return <span className={'delta ' + (neutro ? 'neutro' : bom ? 'bom' : 'ruim')}><Icone size={13} /> {txt} vs período anterior</span>
}

function Tile({ rotulo, valor, sub, children, destaque, alerta }) {
  return (
    <div className={'tile' + (destaque ? ' destaque' : '') + (alerta ? ' alerta' : '')}>
      <span className="tile-rotulo">{rotulo}</span>
      <strong className="tile-valor">{valor}</strong>
      {sub && <span className="tile-sub">{sub}</span>}
      {children}
    </div>
  )
}

function fmtDia(d) { return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }

export default function Indicadores() {
  const { categorias, equipe } = useSessao()
  const [periodo, setPeriodo] = useState('30')
  const [cat, setCat] = useState('')
  const [resp, setResp] = useState('')
  const [tipo, setTipo] = useState('')
  const [dados, setDados] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const { ini, fim } = useMemo(() => intervalo(periodo), [periodo])
  const iniAnt = useMemo(() => new Date(ini.getTime() - (fim - ini)), [ini, fim])

  async function carregar() {
    setCarregando(true)
    const { data, error } = await supabase.rpc('hd_dash_chamados_v2', { p_desde: iniAnt.toISOString() })
    setCarregando(false)
    if (error) { setErro(mensagemErro(error)); return }
    setErro('')
    setDados(data || [])
  }
  useEffect(() => { carregar() }, [iniAnt.getTime()]) // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => (dados || []).filter((c) => {
    if (cat && String(c.categoria_id) !== cat) return false
    if (tipo && c.tipo !== tipo) return false
    if (resp === 'ninguem' && c.atribuido_email) return false
    if (resp && resp !== 'ninguem' && c.atribuido_email !== resp) return false
    return true
  }), [dados, cat, resp, tipo])

  const atual = useMemo(() => calcular(lista, ini, fim), [lista, ini, fim])
  const anterior = useMemo(() => calcular(lista, iniAnt, ini), [lista, iniAnt, ini])
  const pendentes = useMemo(() => lista.filter((c) => !finalizado(c)), [lista])
  const atrasados = pendentes.filter((c) => c.status !== 'em_espera' && c.prazo_sla && new Date(c.prazo_sla) < new Date())

  // Série no tempo: por dia até 45 dias; por semana acima disso
  const serie = useMemo(() => {
    const dias = Math.ceil((fim - ini) / DIA)
    const semanal = dias > 45
    const baldes = []
    let d = new Date(ini)
    if (semanal) { d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)) }
    while (d < fim) {
      const prox = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (semanal ? 7 : 1))
      baldes.push({ ini: new Date(d), fim: prox })
      d = prox
    }
    return {
      rotulos: baldes.map((b) => fmtDia(b.ini)),
      titulos: baldes.map((b) => (semanal ? `Semana de ${fmtDia(b.ini)}` : b.ini.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }))),
      abertos: baldes.map((b) => atual.abertos.filter((c) => entre(c.criado_em, b.ini, b.fim)).length),
      concluidos: baldes.map((b) => atual.concluidos.filter((c) => entre(c.resolvido_em, b.ini, b.fim)).length),
      semanal,
    }
  }, [atual, ini, fim])

  const idade = useMemo(() => {
    const faixas = [['Até 1 dia', 0, 1], ['1 a 3 dias', 1, 3], ['3 a 7 dias', 3, 7], ['7 a 30 dias', 7, 30], ['Mais de 30 dias', 30, Infinity]]
    return faixas.map(([rotulo, a, b]) => ({
      rotulo, valor: pendentes.filter((c) => { const d = (Date.now() - new Date(c.criado_em)) / DIA; return d >= a && d < b }).length,
    }))
  }, [pendentes])

  const porCategoria = useMemo(() => {
    const m = {}
    for (const c of lista) {
      const k = c.categoria || 'Sem categoria'
      m[k] ||= { nome: k, abertos: 0, concluidos: 0, pendentes: 0, tempos: [], comSla: 0, noPrazo: 0 }
      const g = m[k]
      if (entre(c.criado_em, ini, fim)) g.abertos++
      if (!finalizado(c)) g.pendentes++
      if (c.status === 'resolvido' && entre(c.resolvido_em, ini, fim)) {
        g.concluidos++; g.tempos.push(horas(c.criado_em, c.resolvido_em))
        if (c.prazo_sla) { g.comSla++; if (new Date(c.resolvido_em) <= new Date(c.prazo_sla)) g.noPrazo++ }
      }
    }
    return Object.values(m).filter((g) => g.abertos || g.concluidos || g.pendentes).sort((a, b) => b.abertos - a.abertos || b.pendentes - a.pendentes)
  }, [lista, ini, fim])

  const porResponsavel = useMemo(() => {
    const m = {}
    for (const c of lista) {
      const k = c.atribuido_email || ''
      m[k] ||= { email: k, recebidos: 0, concluidos: 0, pendentes: 0, tempos: [], comSla: 0, noPrazo: 0 }
      const g = m[k]
      if (entre(c.criado_em, ini, fim)) g.recebidos++
      if (!finalizado(c)) g.pendentes++
      if (c.status === 'resolvido' && entre(c.resolvido_em, ini, fim)) {
        g.concluidos++; g.tempos.push(horas(c.criado_em, c.resolvido_em))
        if (c.prazo_sla) { g.comSla++; if (new Date(c.resolvido_em) <= new Date(c.prazo_sla)) g.noPrazo++ }
      }
    }
    return Object.values(m).filter((g) => g.recebidos || g.concluidos || g.pendentes).sort((a, b) => b.concluidos - a.concluidos || b.pendentes - a.pendentes)
  }, [lista, ini, fim])

  const porSetor = useMemo(() => {
    const m = {}
    for (const c of atual.abertos) { const k = c.setor || 'Não informado'; m[k] = (m[k] || 0) + 1 }
    return Object.entries(m).map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8)
  }, [atual])

  const porPrioridade = useMemo(() => ['urgente', 'alta', 'media', 'baixa'].map((p) => ({
    rotulo: PRIORIDADE[p].rotulo, valor: pendentes.filter((c) => c.prioridade === p).length,
  })), [pendentes])

  const porTipo = useMemo(() => [
    { rotulo: 'Incidentes', valor: atual.abertos.filter((c) => c.tipo === 'incidente').length },
    { rotulo: 'Solicitações', valor: atual.abertos.filter((c) => c.tipo !== 'incidente').length },
  ], [atual])

  const aprov = useMemo(() => {
    const comAprov = lista.filter((c) => c.aprovacao)
    const decididas = comAprov.filter((c) => c.aprovado_em && entre(c.aprovado_em, ini, fim))
    const tempos = decididas.map((c) => horas(c.criado_em, c.aprovado_em))
    return {
      pendentes: comAprov.filter((c) => c.aprovacao === 'pendente' && !finalizado(c)),
      aprovadas: decididas.filter((c) => c.aprovacao === 'aprovada'),
      recusadas: decididas.filter((c) => c.aprovacao === 'recusada'),
      media: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null,
      valor: decididas.filter((c) => c.aprovacao === 'aprovada').reduce((s, c) => s + Number(c.valor_estimado || 0), 0),
    }
  }, [lista, ini, fim])

  const antigos = useMemo(() => [...pendentes].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em)).slice(0, 6), [pendentes])

  return (
    <div className={'pagina' + (carregando && dados ? ' recarregando' : '')}>
      <div className="cabecalho-pagina">
        <div>
          <h1>Indicadores</h1>
          <p className="texto-suave">{ini.toLocaleDateString('pt-BR')} a {new Date(fim - 1).toLocaleDateString('pt-BR')} · comparado com o período anterior de mesma duração</p>
        </div>
        <button className="btn btn-leve" onClick={carregar} aria-label="Atualizar"><RefreshCw size={16} className={carregando ? 'girando' : ''} /></button>
      </div>

      <div className="barra-filtros cartao dash-filtros">
        <div className="segmentos compacto" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.id} role="tab" aria-selected={periodo === p.id} className={periodo === p.id ? 'ativo' : ''} onClick={() => setPeriodo(p.id)}>{p.rotulo}</button>
          ))}
        </div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Incidentes e solicitações</option>
          <option value="incidente">Só incidentes</option>
          <option value="solicitacao">Só solicitações</option>
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Responsável">
          <option value="">Todos os responsáveis</option>
          <option value="ninguem">Sem responsável</option>
          {equipe.map((m) => <option key={m.email} value={m.email}>{m.nome || nomeDeEmail(m.email)}</option>)}
        </select>
      </div>

      {erro && <div className="alerta alerta-erro">{erro}</div>}
      {dados === null ? <div className="cartao carregando-bloco"><div className="spinner" /></div> : (
        <>
          <div className="tiles">
            <Tile destaque rotulo="SLA cumprido" valor={atual.slaPct == null ? '—' : `${atual.slaPct}%`}
              sub={atual.comSla.length ? `${atual.noPrazo.length} de ${atual.comSla.length} concluídos dentro do prazo` : 'Nenhum chamado com SLA concluído'}>
              <Variacao atual={atual.slaPct} anterior={anterior.slaPct} sufixo=" p.p." />
            </Tile>
            <Tile rotulo="Abertos" valor={atual.abertos.length}>
              <Variacao atual={atual.abertos.length} anterior={anterior.abertos.length} neutro />
            </Tile>
            <Tile rotulo="Concluídos" valor={atual.concluidos.length}>
              <Variacao atual={atual.concluidos.length} anterior={anterior.concluidos.length} />
            </Tile>
            <Tile rotulo="Pendentes agora" valor={pendentes.length} alerta={atrasados.length > 0}
              sub={atrasados.length ? <><AlertTriangle size={13} /> {atrasados.length} com SLA estourado</> : 'Nenhum com SLA estourado'} />
            <Tile rotulo="1ª resposta (média)" valor={duracaoHoras(atual.respMedia)}
              sub={atual.respMediana != null ? `mediana ${duracaoHoras(atual.respMediana)}${atual.semResposta ? ` · ${atual.semResposta} sem resposta` : ''}` : (atual.semResposta ? `${atual.semResposta} sem resposta` : null)}>
              <Variacao atual={atual.respMedia} anterior={anterior.respMedia} menorMelhor sufixo="h" />
            </Tile>
            <Tile rotulo="Resolução (média)" valor={duracaoHoras(atual.resolMedia)}
              sub={atual.resolMediana != null ? `mediana ${duracaoHoras(atual.resolMediana)}` : null}>
              <Variacao atual={atual.resolMedia} anterior={anterior.resolMedia} menorMelhor sufixo="h" />
            </Tile>
          </div>

          <div className="dash-grade">
            <section className="cartao dash-card largo">
              <h2>Abertos × concluídos {serie.semanal ? 'por semana' : 'por dia'}</h2>
              <LinhasTempo rotulos={serie.rotulos} titulos={serie.titulos}
                series={[{ nome: 'Abertos', cor: COR_ABERTOS, valores: serie.abertos }, { nome: 'Concluídos', cor: COR_CONCLUIDOS, valores: serie.concluidos }]} />
            </section>

            <section className="cartao dash-card">
              <h2>Pendentes por idade</h2>
              <p className="dash-sub">Há quanto tempo os chamados em aberto estão esperando</p>
              <BarrasH itens={idade} vazio="Nenhum chamado pendente" />
            </section>

            <section className="cartao dash-card">
              <h2>Pendentes por prioridade</h2>
              <p className="dash-sub">Chamados em aberto agora</p>
              <BarrasH itens={porPrioridade} vazio="Nenhum chamado pendente" />
            </section>

            <section className="cartao dash-card">
              <h2>Incidentes × solicitações</h2>
              <p className="dash-sub">Abertos no período, pelo tipo do chamado</p>
              <BarrasH itens={porTipo} />
            </section>

            <section className="cartao dash-card">
              <h2>Aprovações da gerência</h2>
              <p className="dash-sub">Solicitações que exigem aprovação (compras etc.)</p>
              <dl className="dash-lista">
                <dt>Aguardando agora</dt><dd className={aprov.pendentes.length ? 'pend-aprov' : ''}>{aprov.pendentes.length}</dd>
                <dt>Aprovadas no período</dt><dd>{aprov.aprovadas.length}{aprov.valor > 0 && <small> · {moeda(aprov.valor)} estimados</small>}</dd>
                <dt>Recusadas no período</dt><dd>{aprov.recusadas.length}</dd>
                <dt>Tempo médio até a decisão</dt><dd>{duracaoHoras(aprov.media)}</dd>
              </dl>
            </section>

            <section className="cartao dash-card">
              <h2>Abertos por setor</h2>
              <p className="dash-sub">Quem mais abriu chamados no período</p>
              <BarrasH itens={porSetor} />
            </section>

            <section className="cartao dash-card largo">
              <h2>Por categoria</h2>
              <div className="tabela-rolagem">
                <table className="tabela tabela-dash">
                  <thead><tr><th>Categoria</th><th>Abertos</th><th>Concluídos</th><th>Pendentes</th><th>Resolução média</th><th>SLA cumprido</th></tr></thead>
                  <tbody>
                    {porCategoria.map((g) => (
                      <tr key={g.nome}>
                        <td>{g.nome}</td>
                        <td><span className="num-barra"><span style={{ width: `${(g.abertos / Math.max(1, porCategoria[0]?.abertos)) * 100}%` }} /></span>{g.abertos}</td>
                        <td>{g.concluidos}</td>
                        <td>{g.pendentes}</td>
                        <td>{duracaoHoras(media(g.tempos))}</td>
                        <td>{g.comSla ? `${pct(g.noPrazo, g.comSla)}%` : <span className="texto-suave">sem SLA</span>}</td>
                      </tr>
                    ))}
                    {!porCategoria.length && <tr><td colSpan={6} className="texto-suave">Sem chamados no período</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="cartao dash-card largo">
              <h2>Por responsável</h2>
              <div className="tabela-rolagem">
                <table className="tabela tabela-dash">
                  <thead><tr><th>Responsável</th><th>Recebidos</th><th>Concluídos</th><th>Pendentes</th><th>Resolução média</th><th>SLA cumprido</th></tr></thead>
                  <tbody>
                    {porResponsavel.map((g) => (
                      <tr key={g.email || 'ninguem'}>
                        <td>{g.email ? nomeDeEmail(g.email) : <span className="texto-suave">Sem responsável</span>}</td>
                        <td>{g.recebidos}</td>
                        <td>{g.concluidos}</td>
                        <td>{g.pendentes}</td>
                        <td>{duracaoHoras(media(g.tempos))}</td>
                        <td>{g.comSla ? `${pct(g.noPrazo, g.comSla)}%` : <span className="texto-suave">sem SLA</span>}</td>
                      </tr>
                    ))}
                    {!porResponsavel.length && <tr><td colSpan={6} className="texto-suave">Sem chamados no período</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="cartao dash-card largo">
              <h2>Pendentes mais antigos</h2>
              {antigos.length ? (
                <ul className="lista-antigos">
                  {antigos.map((c) => (
                    <li key={c.id}>
                      <Link to={`/chamado/${c.id}`}>
                        <span className="codigo">{codigo(c.id)}</span>
                        <span className="titulo">{c.titulo}</span>
                        <span className="texto-suave">{c.solicitante}</span>
                        <PrioridadeBadge prioridade={c.prioridade} />
                        <StatusBadge status={c.status} />
                        <span className="idade">aberto {tempoRelativo(c.criado_em)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="texto-suave vazio-grafico">Nenhum chamado pendente</p>}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
