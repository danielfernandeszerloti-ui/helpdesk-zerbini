import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Check, Plus, Repeat, Ticket, Pencil, Trash2, ArrowRight, CalendarDays, Flag, ShieldCheck, ChevronDown, ChevronRight, Inbox, RefreshCw, FileText,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { codigo, hojeExtenso, emAndamento, diaSP, dataHora, mensagemErro, nomeDeEmail } from '../lib/util'
import { RECORRENCIAS, hojeISO, somarDias, proximoUtil, rotuloPrazo, lerTextoRapido, diasEntre } from '../lib/tarefas'
import { StatusBadge } from '../components/ui'

const GRUPOS = [
  { chave: 'atrasadas', rotulo: 'Atrasadas', cor: 'vermelho' },
  { chave: 'hoje', rotulo: 'Hoje', cor: 'laranja' },
  { chave: 'proximas', rotulo: 'Próximas', cor: 'azul', dica: 'próximos 7 dias' },
  { chave: 'futuras', rotulo: 'Mais adiante', cor: 'cinza', recolhido: true },
  { chave: 'semdata', rotulo: 'Sem data', cor: 'cinza' },
  { chave: 'concluidas', rotulo: 'Concluídas', cor: 'verde', dica: 'últimos 7 dias', recolhido: true },
]

function grupoDaTarefa(t, hoje) {
  if (t.feita) return 'concluidas'
  if (!t.prazo) return 'semdata'
  if (t.prazo < hoje) return 'atrasadas'
  if (t.prazo === hoje) return 'hoje'
  return diasEntre(hoje, t.prazo) <= 7 ? 'proximas' : 'futuras'
}

function grupoDoChamado(c, hoje) {
  if (!c.prazo_sla) return 'semdata'
  if (new Date(c.prazo_sla) < new Date()) return 'atrasadas'
  const dia = diaSP(c.prazo_sla)
  if (dia === hoje) return 'hoje'
  return diasEntre(hoje, dia) <= 7 ? 'proximas' : null
}

// ---------- criação rápida ----------
function NovaTarefa({ onCriada, avisar }) {
  const [texto, setTexto] = useState('')
  const [prazo, setPrazo] = useState(hojeISO())
  const [rec, setRec] = useState('')
  const [enviando, setEnviando] = useState(false)
  const hoje = hojeISO()
  const amanha = somarDias(hoje, 1)

  async function criar(e) {
    e.preventDefault()
    if (!texto.trim()) return
    const { texto: limpo, chamado } = lerTextoRapido(texto)
    setEnviando(true)
    const { error } = await supabase.from('hd_tarefas').insert({ texto: limpo, chamado_id: chamado, prazo: prazo || null, recorrencia: rec })
    setEnviando(false)
    if (error) return avisar(/foreign key|violates/i.test(error.message) && chamado ? `Chamado ${codigo(chamado)} não encontrado` : mensagemErro(error), 'erro')
    setTexto(''); setRec('')
    onCriada()
  }

  const chip = (valor, rotulo) => (
    <button type="button" className={'chip' + (prazo === valor ? ' ativo' : '')} onClick={() => setPrazo(valor)}>{rotulo}</button>
  )
  const outraData = prazo && ![hoje, amanha].includes(prazo)

  return (
    <form className="cartao nova-tarefa-hoje" onSubmit={criar}>
      <div className="nt-linha">
        <Plus size={18} className="nt-icone" />
        <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} disabled={enviando}
          placeholder='Nova tarefa — ex.: "Testar API do PDA" ou "Cobrar terceirizada #0018"' aria-label="Nova tarefa" />
        <button className="btn btn-primario" disabled={enviando || !texto.trim()}>Adicionar</button>
      </div>
      <div className="nt-opcoes">
        {chip(hoje, 'Hoje')}
        {chip(amanha, 'Amanhã')}
        <label className={'chip chip-data' + (outraData ? ' ativo' : '')}>
          <CalendarDays size={14} />
          <span>{outraData ? rotuloPrazo(prazo) : 'Data…'}</span>
          <input type="date" value={outraData ? prazo : ''} min={hoje} onChange={(e) => e.target.value && setPrazo(e.target.value)} aria-label="Escolher data" />
        </label>
        {chip('', 'Sem data')}
        <span className="nt-sep" />
        <label className={'chip chip-select' + (rec ? ' ativo' : '')}>
          <Repeat size={14} />
          <select value={rec} onChange={(e) => setRec(e.target.value)} aria-label="Repetir">
            {Object.entries(RECORRENCIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <small className="nt-dica">Use <b>#número</b> para ligar a um chamado</small>
      </div>
    </form>
  )
}

// ---------- edição ----------
function EditorTarefa({ t, onFechar, onSalvo, avisar }) {
  const [f, setF] = useState({ texto: t.texto, prazo: t.prazo || '', prazo_hora: t.prazo_hora?.slice(0, 5) || '', recorrencia: t.recorrencia, prioridade: t.prioridade, notas: t.notas || '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function salvar(e) {
    e.preventDefault()
    if (!f.texto.trim()) return
    const { error } = await supabase.from('hd_tarefas').update({
      texto: f.texto, prazo: f.prazo || null, prazo_hora: f.prazo && f.prazo_hora ? f.prazo_hora : null,
      recorrencia: f.recorrencia, prioridade: f.prioridade, notas: f.notas,
    }).eq('id', t.id)
    if (error) return avisar(mensagemErro(error), 'erro')
    onSalvo()
  }
  async function excluir() {
    if (!window.confirm(`Excluir a tarefa "${t.texto}"?`)) return
    const { error } = await supabase.from('hd_tarefas').delete().eq('id', t.id)
    if (error) return avisar(mensagemErro(error), 'erro')
    avisar('Tarefa excluída')
    onSalvo()
  }

  return (
    <form className="editor-tarefa" onSubmit={salvar}>
      <input value={f.texto} onChange={set('texto')} maxLength={300} autoFocus aria-label="Tarefa" />
      <div className="et-grade">
        <label className="campo"><span>Data</span><input type="date" value={f.prazo} onChange={set('prazo')} /></label>
        <label className="campo"><span>Hora</span><input type="time" value={f.prazo_hora} onChange={set('prazo_hora')} disabled={!f.prazo} /></label>
        <label className="campo"><span>Repetir</span>
          <select value={f.recorrencia} onChange={set('recorrencia')}>
            {Object.entries(RECORRENCIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="campo"><span>Prioridade</span>
          <select value={f.prioridade} onChange={set('prioridade')}><option value="normal">Normal</option><option value="alta">Alta</option></select>
        </label>
      </div>
      <textarea rows={2} value={f.notas} onChange={set('notas')} maxLength={4000} placeholder="Anotações (opcional)" />
      <div className="et-botoes">
        <button type="button" className="btn btn-perigo-leve" onClick={excluir}><Trash2 size={15} /> Excluir</button>
        <span />
        <button type="button" className="btn btn-leve" onClick={onFechar}>Cancelar</button>
        <button className="btn btn-primario">Salvar</button>
      </div>
    </form>
  )
}

// ---------- itens ----------
function ItemTarefa({ t, chamado, grupo, editando, onEditar, onFechar, recarregar, avisar }) {
  const [saindo, setSaindo] = useState(false)
  async function alternar() {
    setSaindo(!t.feita)
    const { error } = await supabase.from('hd_tarefas').update({ feita: !t.feita }).eq('id', t.id)
    if (error) { setSaindo(false); return avisar(mensagemErro(error), 'erro') }
    if (!t.feita) avisar(t.recorrencia ? 'Concluída — a próxima já foi agendada' : 'Tarefa concluída')
    recarregar()
  }
  async function adiar(dias) {
    const novo = dias === 'util' ? proximoUtil() : somarDias(hojeISO(), dias)
    const { error } = await supabase.from('hd_tarefas').update({ prazo: novo }).eq('id', t.id)
    if (error) return avisar(mensagemErro(error), 'erro')
    avisar(`Adiada para ${rotuloPrazo(novo).toLowerCase()}`)
    recarregar()
  }

  if (editando) return <li className="item-hoje editando"><EditorTarefa t={t} onFechar={onFechar} onSalvo={() => { onFechar(); recarregar() }} avisar={avisar} /></li>

  return (
    <li className={'item-hoje tarefa' + (t.feita ? ' feita' : '') + (saindo ? ' saindo' : '')}>
      <button className="caixa-hoje" onClick={alternar} aria-label={t.feita ? 'Reabrir tarefa' : 'Concluir tarefa'}>
        {(t.feita || saindo) && <Check size={14} strokeWidth={3} />}
      </button>
      <div className="ih-corpo" onDoubleClick={onEditar}>
        <span className="ih-texto">{t.prioridade === 'alta' && <Flag size={13} className="ih-alta" aria-label="Prioridade alta" />}{t.texto}</span>
        <span className="ih-meta">
          {grupo !== 'hoje' && grupo !== 'semdata' && grupo !== 'concluidas' && <span className={'ih-prazo' + (grupo === 'atrasadas' ? ' atrasado' : '')}>{rotuloPrazo(t.prazo, t.prazo_hora)}</span>}
          {grupo === 'hoje' && t.prazo_hora && <span className="ih-prazo">{t.prazo_hora.slice(0, 5)}</span>}
          {t.recorrencia && <span title="Tarefa recorrente"><Repeat size={12} /> {RECORRENCIAS[t.recorrencia]}</span>}
          {t.chamado_id && (
            <Link to={`/chamado/${t.chamado_id}`} className="ih-chamado" title={chamado?.titulo}>
              <Ticket size={12} /> {codigo(t.chamado_id)}{chamado ? ` · ${chamado.titulo}` : ''}
            </Link>
          )}
          {t.notas && <span className="ih-notas" title={t.notas}>{t.notas.split('\n')[0]}</span>}
          {t.feita && t.feita_em && <span>concluída {diaSP(t.feita_em) === hojeISO() ? 'hoje às ' + dataHora(t.feita_em).slice(11) : 'em ' + dataHora(t.feita_em).slice(0, 5)}</span>}
        </span>
      </div>
      {!t.feita && (
        <div className="ih-acoes">
          {(grupo === 'atrasadas' || grupo === 'hoje') && (
            <button className="btn-icone" onClick={() => adiar(1)} title="Passar para amanhã" aria-label="Passar para amanhã"><ArrowRight size={16} /></button>
          )}
          <button className="btn-icone" onClick={onEditar} title="Editar" aria-label="Editar"><Pencil size={15} /></button>
        </div>
      )}
    </li>
  )
}

function ItemChamado({ c, grupo }) {
  const navegar = useNavigate()
  const vence = c.prazo_sla ? (grupo === 'hoje' ? 'SLA às ' + dataHora(c.prazo_sla).slice(11) : grupo === 'atrasadas' ? 'SLA venceu ' + (diaSP(c.prazo_sla) === hojeISO() ? 'às ' + dataHora(c.prazo_sla).slice(11) : dataHora(c.prazo_sla).slice(0, 5)) : 'SLA ' + rotuloPrazo(diaSP(c.prazo_sla))) : 'Sem SLA'
  return (
    <li className="item-hoje chamado" onClick={() => navegar(`/chamado/${c.id}`)} role="link" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navegar(`/chamado/${c.id}`)}>
      <span className="ih-tipo" aria-hidden><Ticket size={15} /></span>
      <div className="ih-corpo">
        <span className="ih-texto"><span className="codigo">{codigo(c.id)}</span> {c.titulo}</span>
        <span className="ih-meta">
          <span className={'ih-prazo' + (grupo === 'atrasadas' ? ' atrasado' : '')}>{vence}</span>
          <span>{c.solicitante_nome || nomeDeEmail(c.solicitante_email)}</span>
          {!c.lido_agente && (
            // só é "Nova resposta" se o solicitante escreveu algo depois de abrir o chamado
            (c.msgs || []).some((m) => m.tipo === 'mensagem' && m.autor_email === c.solicitante_email)
              ? <span className="pilula-nova">Nova resposta</span>
              : <span className="pilula-nova">Não lido</span>
          )}
        </span>
      </div>
      <StatusBadge status={c.status} />
    </li>
  )
}

export default function Hoje() {
  const { perfil, avisar, etapas, equipe } = useSessao()
  const [aprovar, setAprovar] = useState({ compras: 0, projetos: 0 })
  const [relatorio, setRelatorio] = useState(null)
  const atendo = equipe.some((m) => m.email === perfil.email && m.atende && m.papel !== 'dev')
  const etapaAprov = etapas.find((e) => e.aprovacao && e.ativa)?.id
  const [tarefas, setTarefas] = useState(null)
  const [chamados, setChamados] = useState([])
  const [semResp, setSemResp] = useState(0)
  const [editando, setEditando] = useState(null)
  const [abertos, setAbertos] = useState({})
  const [atualizando, setAtualizando] = useState(false)
  const hoje = hojeISO()

  const carregar = useCallback(async () => {
    setAtualizando(true)
    const desde = new Date(Date.now() - 7 * 864e5).toISOString()
    const [t, c, s, ap] = await Promise.all([
      supabase.from('hd_tarefas').select('*, chamado:hd_chamados(id,titulo,status)')
        .eq('responsavel_email', perfil.email).or(`feita.eq.false,feita_em.gte.${desde}`)
        .order('prazo', { ascending: true, nullsFirst: false }).order('prazo_hora', { ascending: true, nullsFirst: false }).order('ordem').limit(500),
      supabase.from('hd_chamados').select('id,titulo,status,prazo_sla,solicitante_nome,solicitante_email,lido_agente,etapa_id,msgs:hd_mensagens(autor_email,tipo)')
        .eq('atribuido_email', perfil.email).in('status', ['novo', 'aberto']).limit(300),
      perfil.eh_agente
        ? supabase.from('hd_chamados').select('id', { count: 'exact', head: true }).is('atribuido_email', null).in('status', ['novo', 'aberto'])
        : Promise.resolve({ count: 0 }),
      perfil.pode_aprovar
        ? supabase.from('hd_chamados').select('id,aprovacao,etapa_id').in('status', ['novo', 'aberto', 'em_espera', 'pausado'])
            .or(`aprovacao.eq.pendente${etapaAprov ? `,etapa_id.eq.${etapaAprov}` : ''}`).limit(500)
        : Promise.resolve({ data: [] }),
    ])
    if (atendo) {
      // rascunho do relatório semanal esperando revisão (a partir de sexta)
      const { data: rel } = await supabase.from('hd_relatorios').select('id,inicio').eq('status', 'rascunho')
        .lte('inicio', somarDias(hojeISO(), -4)).gte('inicio', somarDias(hojeISO(), -13)).order('inicio', { ascending: false }).limit(1)
      setRelatorio(rel?.[0] || null)
    }
    const lsAp = ap.data || []
    setAprovar({ compras: lsAp.filter((x) => x.aprovacao === 'pendente').length, projetos: lsAp.filter((x) => etapaAprov && x.etapa_id === etapaAprov).length })
    if (t.error) avisar(mensagemErro(t.error), 'erro')
    setTarefas(t.data || [])
    setChamados((c.data || []).filter((x) => emAndamento(x) && !x.etapa_id))
    setSemResp(s.count || 0)
    setAtualizando(false)
  }, [perfil.email, perfil.eh_agente, perfil.pode_aprovar, etapaAprov, avisar, atendo])

  useEffect(() => {
    carregar()
    let tm
    const recarregar = () => { clearTimeout(tm); tm = setTimeout(carregar, 400) }
    const canal = supabase.channel('hoje')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hd_tarefas' }, recarregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hd_chamados' }, recarregar)
      .subscribe()
    // vira o dia com a tela aberta
    const relogio = setInterval(() => { if (hojeISO() !== hoje) carregar() }, 60_000)
    return () => { clearTimeout(tm); clearInterval(relogio); supabase.removeChannel(canal) }
  }, [carregar, hoje])

  const grupos = useMemo(() => {
    const g = Object.fromEntries(GRUPOS.map((x) => [x.chave, []]))
    for (const t of tarefas || []) g[grupoDaTarefa(t, hoje)].push({ tipo: 't', t, prazo: t.prazo, hora: t.prazo_hora })
    for (const c of chamados) {
      const k = grupoDoChamado(c, hoje)
      if (k) g[k].push({ tipo: 'c', c, prazo: c.prazo_sla ? diaSP(c.prazo_sla) : null, hora: c.prazo_sla ? dataHora(c.prazo_sla).slice(11) : null })
    }
    const ordem = (a, b) => (a.prazo || '9') < (b.prazo || '9') ? -1 : (a.prazo || '9') > (b.prazo || '9') ? 1
      : (a.tipo === 't' && a.t.prioridade === 'alta' ? -1 : 0) - (b.tipo === 't' && b.t.prioridade === 'alta' ? -1 : 0)
        || (a.hora || '99') .localeCompare(b.hora || '99')
    for (const k of Object.keys(g)) k === 'concluidas' ? g[k].sort((a, b) => (b.t.feita_em || '').localeCompare(a.t.feita_em || '')) : g[k].sort(ordem)
    return g
  }, [tarefas, chamados, hoje])

  const pendentesHoje = grupos.atrasadas.length + grupos.hoje.length
  const feitasHoje = (tarefas || []).filter((t) => t.feita && t.feita_em && diaSP(t.feita_em) === hoje).length

  return (
    <div className="pagina pagina-estreita pagina-hoje">
      <div className="cabecalho-pagina">
        <div>
          <h1>Hoje</h1>
          <p className="texto-suave">{hojeExtenso()} · {pendentesHoje === 0 ? 'nada pendente para hoje' : `${pendentesHoje} ${pendentesHoje === 1 ? 'item pendente' : 'itens pendentes'}`}{feitasHoje ? ` · ${feitasHoje} concluída${feitasHoje > 1 ? 's' : ''} hoje` : ''}</p>
        </div>
        <div className="acoes">
          <button className="btn btn-leve" onClick={carregar} aria-label="Atualizar" title="Atualizar"><RefreshCw size={16} className={atualizando ? 'girando' : ''} /></button>
        </div>
      </div>

      <div className="hoje-resumo">
        <div className={'hr-item vermelho' + (grupos.atrasadas.length ? '' : ' zero')}><strong>{grupos.atrasadas.length}</strong><span>atrasadas</span></div>
        <div className={'hr-item laranja' + (grupos.hoje.length ? '' : ' zero')}><strong>{grupos.hoje.length}</strong><span>para hoje</span></div>
        <div className="hr-item azul"><strong>{grupos.proximas.length}</strong><span>próximos 7 dias</span></div>
        {aprovar.compras > 0 && <Link to="/painel?card=aprovacao" className="hr-item link aprov"><ShieldCheck size={16} /><span><b>{aprovar.compras}</b> aguardando sua aprovação</span></Link>}
        {aprovar.projetos > 0 && <Link to="/kanban" className="hr-item link aprov"><ShieldCheck size={16} /><span><b>{aprovar.projetos}</b> projeto{aprovar.projetos > 1 ? 's' : ''} para aprovar</span></Link>}
        {relatorio && <Link to={'/relatorio/' + relatorio.id} className="hr-item link aprov"><FileText size={16} /><span>Relatório semanal <b>pronto para revisar</b></span></Link>}
        {semResp > 0 && <Link to="/painel?card=nao_atribuidos" className="hr-item link"><Inbox size={16} /><span><b>{semResp}</b> chamado{semResp > 1 ? 's' : ''} sem responsável</span></Link>}
      </div>

      <NovaTarefa onCriada={carregar} avisar={avisar} />

      {tarefas === null ? <div className="cartao carregando-bloco"><div className="spinner" /></div> : (
        GRUPOS.map((gr) => {
          const itens = grupos[gr.chave]
          if (!itens.length && !['hoje'].includes(gr.chave)) return null
          const aberto = abertos[gr.chave] ?? !gr.recolhido
          return (
            <section key={gr.chave} className={`grupo-hoje cor-${gr.cor}`}>
              <button className="gh-titulo" onClick={() => setAbertos({ ...abertos, [gr.chave]: !aberto })} aria-expanded={aberto}>
                {aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <i />
                <strong>{gr.rotulo}</strong>
                <span className="contagem">{itens.length}</span>
                {gr.dica && <small>{gr.dica}</small>}
              </button>
              {aberto && (
                itens.length === 0 ? <p className="gh-vazio">Nada para hoje. 🎉</p> : (
                  <ul className="lista-hoje cartao">
                    {itens.map((x) => x.tipo === 't'
                      ? <ItemTarefa key={'t' + x.t.id} t={x.t} chamado={x.t.chamado} grupo={gr.chave} editando={editando === x.t.id}
                          onEditar={() => setEditando(x.t.id)} onFechar={() => setEditando(null)} recarregar={carregar} avisar={avisar} />
                      : <ItemChamado key={'c' + x.c.id} c={x.c} grupo={gr.chave} />)}
                  </ul>
                )
              )}
            </section>
          )
        })
      )}
      <p className="dica centro hoje-rodape">Chamados atribuídos a você entram aqui pelo prazo de SLA. Os que estão em espera ou pausados ficam só no Painel.</p>
    </div>
  )
}
