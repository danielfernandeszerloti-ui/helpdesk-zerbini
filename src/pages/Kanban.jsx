import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor,
  useDraggable, useDroppable, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core'
import { Plus, Search, CalendarClock, ListChecks, Clock, AlertTriangle, RefreshCw, X, Hourglass } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import {
  codigo, nomeDeEmail, PRIORIDADE, PRIORIDADE_ORDEM, previsaoAtrasada, dataCurta, duracaoHoras, mensagemErro,
} from '../lib/util'
import { Avatar } from '../components/ui'

const DIAS_CONCLUIDOS = 30

function Cartao({ c, tarefas, atrasado, arrastando, overlay }) {
  const feitas = tarefas.filter((t) => t.feita).length
  const p = PRIORIDADE[c.prioridade]
  return (
    <div className={'kb-cartao' + (arrastando ? ' fantasma' : '') + (overlay ? ' overlay' : '') + (!c.lido_agente ? ' nao-lido' : '')}>
      <div className="kb-topo">
        <span className="codigo">{codigo(c.id)}</span>
        <span className={`prio prio-${p?.cor}`}><i />{p?.rotulo}</span>
      </div>
      <strong className="kb-titulo">{c.titulo}</strong>
      <div className="kb-solicitante">{c.solicitante_nome || nomeDeEmail(c.solicitante_email)}{c.setor ? ` · ${c.setor}` : ''}</div>
      {tarefas.length > 0 && (
        <div className="kb-progresso" title={`${feitas} de ${tarefas.length} tarefas`}>
          <div><span style={{ width: `${(feitas / tarefas.length) * 100}%` }} /></div>
          <small><ListChecks size={13} /> {feitas}/{tarefas.length}</small>
        </div>
      )}
      <div className="kb-rodape">
        {c.previsao_entrega ? (
          <span className={'kb-data' + (atrasado ? ' atrasado' : '')} title="Previsão de entrega">
            {atrasado ? <AlertTriangle size={13} /> : <CalendarClock size={13} />} {dataCurta(c.previsao_entrega)}
          </span>
        ) : <span className="kb-data vazio">Sem previsão</span>}
        {c.atribuido_email
          ? <span title={nomeDeEmail(c.atribuido_email)}><Avatar nome={nomeDeEmail(c.atribuido_email)} pequeno /></span>
          : <span className="kb-sem-resp" title="Sem responsável">?</span>}
      </div>
    </div>
  )
}

function CartaoArrastavel({ c, ...props }) {
  const navegar = useNavigate()
  const { attributes, listeners, setNodeRef: refArraste, isDragging } = useDraggable({ id: `card-${c.id}` })
  const { setNodeRef: refAlvo, isOver } = useDroppable({ id: `alvo-${c.id}` })
  return (
    <div ref={refAlvo} className={'kb-slot' + (isOver ? ' sobre' : '')}>
      <div ref={refArraste} {...attributes} {...listeners}
        onClick={() => navegar(`/chamado/${c.id}`)}
        onKeyDown={(e) => { if (e.key === 'Enter') navegar(`/chamado/${c.id}`) }}>
        <Cartao c={c} arrastando={isDragging} {...props} />
      </div>
    </div>
  )
}

function Coluna({ etapa, itens, metrica, children, ocultos, onMostrar }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${etapa.id}` })
  return (
    <section className={`kb-coluna cor-${etapa.cor}` + (isOver ? ' sobre' : '')}>
      <header>
        <div className="kb-col-titulo">
          <i />
          <strong>{etapa.nome}</strong>
          <span className="contagem">{itens.length}</span>
        </div>
        {etapa.aprovacao && <small className="kb-aprov-dica"><Hourglass size={12} /> Gerência aprova ou recusa</small>}
        <small className="kb-media" title="Tempo médio que os projetos ficam nesta etapa (últimos 180 dias)">
          <Clock size={12} /> {metrica ? `média ${duracaoHoras(Number(metrica.media_horas))}` : 'sem histórico'}
        </small>
      </header>
      <div ref={setNodeRef} className="kb-lista">
        {children}
        {itens.length === 0 && <div className="kb-vazio">{etapa.aprovacao ? 'Nada aguardando aprovação' : 'Arraste um cartão para cá'}</div>}
        {ocultos > 0 && <button className="btn-link kb-mais" onClick={onMostrar}>Mostrar {ocultos} concluídos antigos</button>}
      </div>
    </section>
  )
}

export default function Kanban() {
  const { perfil, etapas, responsaveis, avisar } = useSessao()
  const [chamados, setChamados] = useState(null)
  const [tarefas, setTarefas] = useState([])
  const [metricas, setMetricas] = useState([])
  const [arrastado, setArrastado] = useState(null)
  const [verAntigos, setVerAntigos] = useState(false)
  const [busca, setBusca] = useState('')
  const [resp, setResp] = useState('')
  const [prio, setPrio] = useState('')
  const [atualizando, setAtualizando] = useState(false)
  const arrastandoRef = useRef(false)

  const ativas = useMemo(() => etapas.filter((e) => e.ativa), [etapas])
  const etapaFinal = useMemo(() => etapas.find((e) => e.finaliza)?.id, [etapas])
  const etapaAprov = useMemo(() => etapas.find((e) => e.aprovacao && e.ativa)?.id, [etapas])

  const carregar = useCallback(async () => {
    if (arrastandoRef.current) return
    setAtualizando(true)
    const { data: cats } = await supabase.from('hd_categorias').select('id').eq('kanban', true)
    const ids = (cats || []).map((c) => c.id)
    if (!ids.length) { setChamados([]); setAtualizando(false); return }
    const [c, m] = await Promise.all([
      supabase.from('hd_chamados').select('*, categoria:hd_categorias(nome)').in('categoria_id', ids)
        .neq('status', 'cancelado').not('etapa_id', 'is', null).order('kanban_ordem').limit(1000),
      supabase.rpc('hd_kanban_metricas'),
    ])
    const lista = c.data || []
    setChamados(lista)
    setMetricas(m.data || [])
    if (lista.length) {
      const t = await supabase.from('hd_tarefas').select('id,chamado_id,feita').in('chamado_id', lista.map((x) => x.id))
      setTarefas(t.data || [])
    } else setTarefas([])
    setAtualizando(false)
  }, [])

  useEffect(() => {
    carregar()
    let t
    const recarregar = () => { clearTimeout(t); t = setTimeout(carregar, 500) }
    const canal = supabase.channel('kanban')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hd_chamados' }, recarregar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hd_tarefas' }, recarregar)
      .subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(canal) }
  }, [carregar])

  const tarefasPor = useMemo(() => {
    const m = {}
    for (const t of tarefas) (m[t.chamado_id] ||= []).push(t)
    return m
  }, [tarefas])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase().replace(/^#0*/, '')
    return (chamados || []).filter((c) => {
      if (prio && c.prioridade !== prio) return false
      if (resp === 'eu' && c.atribuido_email !== perfil.email) return false
      if (resp === 'ninguem' && c.atribuido_email) return false
      if (resp && !['eu', 'ninguem'].includes(resp) && c.atribuido_email !== resp) return false
      if (termo && !`${c.id} ${c.titulo} ${c.descricao} ${c.solicitante_nome} ${c.solicitante_email} ${c.setor}`.toLowerCase().includes(termo)) return false
      return true
    })
  }, [chamados, busca, resp, prio, perfil.email])

  const limiteAntigos = Date.now() - DIAS_CONCLUIDOS * 86400000
  const porEtapa = useMemo(() => {
    const m = {}
    for (const e of ativas) m[e.id] = { visiveis: [], ocultos: 0 }
    for (const c of filtrados) {
      const g = m[c.etapa_id]
      if (!g) continue
      if (c.etapa_id === etapaFinal && !verAntigos && c.resolvido_em && new Date(c.resolvido_em).getTime() < limiteAntigos) { g.ocultos++; continue }
      g.visiveis.push(c)
    }
    return m
  }, [filtrados, ativas, etapaFinal, verAntigos, limiteAntigos])

  const resumo = useMemo(() => {
    const abertos = (chamados || []).filter((c) => c.etapa_id !== etapaFinal)
    return {
      aprovacao: abertos.filter((c) => c.etapa_id === etapaAprov).length,
      andamento: abertos.length,
      atrasados: abertos.filter((c) => previsaoAtrasada(c, etapaFinal)).length,
      semResp: abertos.filter((c) => !c.atribuido_email).length,
      meus: abertos.filter((c) => c.atribuido_email === perfil.email).length,
    }
  }, [chamados, etapaFinal, etapaAprov, perfil.email])

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )

  async function aoSoltar({ active, over }) {
    arrastandoRef.current = false
    setArrastado(null)
    if (!over) return
    const id = Number(String(active.id).replace('card-', ''))
    const atual = chamados.find((c) => c.id === id)
    if (!atual) return
    let etapaDestino, novaOrdem
    const alvo = String(over.id)
    if (alvo.startsWith('alvo-')) {
      const idAlvo = Number(alvo.replace('alvo-', ''))
      if (idAlvo === id) return
      const cAlvo = chamados.find((c) => c.id === idAlvo)
      etapaDestino = cAlvo.etapa_id
      const coluna = chamados.filter((c) => c.etapa_id === etapaDestino && c.id !== id).sort((a, b) => a.kanban_ordem - b.kanban_ordem)
      const i = coluna.findIndex((c) => c.id === idAlvo)
      const anterior = coluna[i - 1]
      novaOrdem = anterior ? (anterior.kanban_ordem + cAlvo.kanban_ordem) / 2 : cAlvo.kanban_ordem - 1
    } else {
      etapaDestino = Number(alvo.replace('col-', ''))
      const coluna = chamados.filter((c) => c.etapa_id === etapaDestino && c.id !== id)
      novaOrdem = coluna.length ? Math.max(...coluna.map((c) => c.kanban_ordem)) + 1 : Date.now() / 1000
    }
    if (etapaDestino === atual.etapa_id && novaOrdem === atual.kanban_ordem) return
    if (etapaDestino !== atual.etapa_id && (atual.etapa_id === etapaAprov || etapaDestino === etapaAprov) && !perfil.pode_aprovar) {
      avisar('Só a gerência aprova projetos. Abra o cartão para ver a situação.', 'erro'); return
    }
    if (atual.etapa_id === etapaAprov && etapaDestino !== etapaAprov && etapaDestino !== etapaFinal &&
        !window.confirm(`Aprovar ${codigo(id)}? O dev e ${atual.solicitante_nome || 'o solicitante'} serão avisados por e-mail.`)) return
    if (etapaDestino === etapaFinal && atual.etapa_id !== etapaFinal &&
        !window.confirm(`${(() => { const n = (tarefasPor[id] || []).filter((t) => !t.feita).length; return n ? `${codigo(id)} tem ${n} tarefa${n > 1 ? 's' : ''} do checklist em aberto.\n\n` : '' })()}Mover ${codigo(id)} para "Concluído" finaliza o chamado e avisa ${atual.solicitante_nome || 'o solicitante'} por e-mail. Continuar?`)) return

    const anterior = chamados
    setChamados(chamados.map((c) => (c.id === id ? { ...c, etapa_id: etapaDestino, kanban_ordem: novaOrdem } : c)))
    const campos = { kanban_ordem: novaOrdem }
    if (etapaDestino !== atual.etapa_id) campos.etapa_id = etapaDestino
    const { error } = await supabase.from('hd_chamados').update(campos).eq('id', id)
    if (error) { setChamados(anterior); avisar(mensagemErro(error), 'erro'); return }
    if (campos.etapa_id) {
      const nome = etapas.find((e) => e.id === etapaDestino)?.nome
      avisar(atual.etapa_id === etapaAprov ? `${codigo(id)} aprovado e enviado para ${nome}` : `${codigo(id)} movido para ${nome}`)
    }
    carregar()
  }

  const metricaDe = (etapaId) => metricas.find((m) => m.etapa_id === etapaId)
  const cArrastado = arrastado && chamados?.find((c) => c.id === arrastado)

  return (
    <div className="pagina pagina-kanban">
      <div className="cabecalho-pagina">
        <div>
          <h1>Desenvolvimento</h1>
          <p className="texto-suave">Projetos novos passam pela aprovação da gerência antes do Backlog. Arraste os cartões para atualizar a etapa — o solicitante é avisado por e-mail.</p>
        </div>
        <div className="acoes">
          <button className="btn btn-leve" onClick={carregar} aria-label="Atualizar" title="Atualizar">
            <RefreshCw size={16} className={atualizando ? 'girando' : ''} />
          </button>
          <Link to="/novo?kanban=1" className="btn btn-primario"><Plus size={17} /> Nova solicitação</Link>
        </div>
      </div>

      <div className="kb-resumo">
        <button onClick={() => { setResp(''); setPrio(''); setBusca('') }}>
          <strong>{resumo.andamento}</strong><span>em andamento</span>
        </button>
        {etapaAprov && (
          <div className={resumo.aprovacao && perfil.pode_aprovar ? 'destaque' : ''}>
            <strong>{resumo.aprovacao}</strong><span>aguardando aprovação</span>
          </div>
        )}
        <button onClick={() => setResp(resp === 'eu' ? '' : 'eu')} className={resp === 'eu' ? 'ativo' : ''}>
          <strong>{resumo.meus}</strong><span>comigo</span>
        </button>
        <button onClick={() => setResp(resp === 'ninguem' ? '' : 'ninguem')} className={resp === 'ninguem' ? 'ativo' : ''}>
          <strong>{resumo.semResp}</strong><span>sem responsável</span>
        </button>
        <div className={resumo.atrasados ? 'alerta' : ''}>
          <strong>{resumo.atrasados}</strong><span>com entrega atrasada</span>
        </div>
      </div>

      <div className="barra-filtros kb-filtros cartao">
        <div className="busca">
          <Search size={16} />
          <input placeholder="Buscar por código, título, solicitante…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <select value={resp} onChange={(e) => setResp(e.target.value)} aria-label="Responsável">
          <option value="">Qualquer responsável</option>
          <option value="eu">Comigo</option>
          <option value="ninguem">Sem responsável</option>
          {responsaveis(true).filter((a) => a !== perfil.email).map((a) => <option key={a} value={a}>{nomeDeEmail(a)}</option>)}
        </select>
        <select value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Prioridade">
          <option value="">Todas as prioridades</option>
          {PRIORIDADE_ORDEM.map((p) => <option key={p} value={p}>{PRIORIDADE[p].rotulo}</option>)}
        </select>
        {(busca || resp || prio) && <button className="btn-link" onClick={() => { setBusca(''); setResp(''); setPrio('') }}><X size={14} /> Limpar</button>}
      </div>

      {chamados === null ? <div className="cartao carregando-bloco"><div className="spinner" /></div> : (
        <DndContext sensors={sensores} collisionDetection={closestCorners}
          onDragStart={({ active }) => { arrastandoRef.current = true; setArrastado(Number(String(active.id).replace('card-', ''))) }}
          onDragCancel={() => { arrastandoRef.current = false; setArrastado(null) }}
          onDragEnd={aoSoltar}>
          <div className="kb-quadro">
            {ativas.map((e) => {
              const g = porEtapa[e.id] || { visiveis: [], ocultos: 0 }
              return (
                <Coluna key={e.id} etapa={e} itens={g.visiveis} metrica={metricaDe(e.id)} ocultos={g.ocultos} onMostrar={() => setVerAntigos(true)}>
                  {g.visiveis.map((c) => (
                    <CartaoArrastavel key={c.id} c={c} tarefas={tarefasPor[c.id] || []} atrasado={previsaoAtrasada(c, etapaFinal)} />
                  ))}
                </Coluna>
              )
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {cArrastado ? <Cartao c={cArrastado} tarefas={tarefasPor[cArrastado.id] || []} atrasado={previsaoAtrasada(cArrastado, etapaFinal)} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}
