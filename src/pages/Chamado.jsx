import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Paperclip, Send, Copy, Lock, Monitor, Trash2, UserCheck, AlertTriangle, ListChecks, CalendarClock, Plus, X, Check } from 'lucide-react'
import { supabase, BUCKET } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import {
  codigo, dataHora, tempoRelativo, nomeDeEmail, enviarAnexos, abrirAnexo, tamanhoLegivel, mensagemErro,
  emAndamento, STATUS, STATUS_ORDEM, PRIORIDADE, PRIORIDADE_ORDEM, dataCurta, previsaoAtrasada, previsaoColaborador,
  ORIGENS, ehExterno,
} from '../lib/util'
import { Avatar, StatusBadge, PrioridadeBadge, SlaTexto, SeletorArquivos } from '../components/ui'

const VIA = { email: 'por e-mail', telefone: 'por telefone', teams: 'pelo Teams', whatsapp: 'pelo WhatsApp', presencial: 'pessoalmente' }

function paraInputLocal(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function ListaAnexos({ anexos, onErro }) {
  if (!anexos.length) return null
  return (
    <ul className="anexos">
      {anexos.map((a) => (
        <li key={a.id}>
          <button type="button" onClick={() => abrirAnexo(a).catch((e) => onErro(mensagemErro(e)))}>
            <Paperclip size={14} /> <span>{a.nome}</span> <small>{tamanhoLegivel(a.tamanho)}</small>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Projeto({ chamado, etapas, tarefas, salvando, atualizar, recarregarTarefas, onErro }) {
  const [novaTarefa, setNovaTarefa] = useState('')
  const ativas = etapas.filter((e) => e.ativa || e.id === chamado.etapa_id)
  const final = etapas.find((e) => e.finaliza)?.id
  const feitas = tarefas.filter((t) => t.feita).length
  const atrasado = previsaoAtrasada(chamado, final)

  async function adicionar(e) {
    e.preventDefault()
    if (!novaTarefa.trim()) return
    const { error } = await supabase.from('hd_tarefas').insert({ chamado_id: chamado.id, texto: novaTarefa.trim() })
    if (error) return onErro(mensagemErro(error))
    setNovaTarefa('')
    recarregarTarefas()
  }
  async function alternar(t) {
    const { error } = await supabase.from('hd_tarefas').update({ feita: !t.feita }).eq('id', t.id)
    if (error) return onErro(mensagemErro(error))
    recarregarTarefas()
  }
  async function remover(t) {
    const { error } = await supabase.from('hd_tarefas').delete().eq('id', t.id)
    if (error) return onErro(mensagemErro(error))
    recarregarTarefas()
  }

  return (
    <div className="cartao painel-lateral projeto">
      <h3>Projeto</h3>
      <label className="campo">
        <span>Etapa</span>
        <select value={chamado.etapa_id || ''} disabled={salvando}
          onChange={(e) => {
            const id = Number(e.target.value)
            if (id === final && !window.confirm('Mover para "Concluído" finaliza o chamado e avisa o solicitante por e-mail. Continuar?')) return
            atualizar({ etapa_id: id }, 'Etapa atualizada')
          }}>
          {ativas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </label>
      <label className="campo">
        <span>Previsão de entrega</span>
        <input type="date" defaultValue={chamado.previsao_entrega || ''} key={chamado.previsao_entrega || 'sem'} disabled={salvando}
          onBlur={(e) => { const v = e.target.value || null; if (v !== (chamado.previsao_entrega || null)) atualizar({ previsao_entrega: v }, 'Previsão atualizada') }} />
        {atrasado && <small className="dica erro-texto"><AlertTriangle size={13} /> Entrega atrasada</small>}
      </label>
      <div className="campo">
        <span className="rotulo-linha"><ListChecks size={15} /> Checklist {tarefas.length > 0 && <small>{feitas}/{tarefas.length}</small>}</span>
        {tarefas.length > 0 && <div className="kb-progresso grande"><div><span style={{ width: `${(feitas / tarefas.length) * 100}%` }} /></div></div>}
        <ul className="checklist">
          {tarefas.map((t) => (
            <li key={t.id} className={t.feita ? 'feita' : ''}>
              <button type="button" className="caixa" onClick={() => alternar(t)} aria-label={t.feita ? 'Desmarcar' : 'Marcar como feita'}>
                {t.feita && <Check size={13} strokeWidth={3} />}
              </button>
              <span>{t.texto}</span>
              <button type="button" className="btn-icone" onClick={() => remover(t)} aria-label="Remover tarefa"><X size={14} /></button>
            </li>
          ))}
        </ul>
        <form className="nova-tarefa" onSubmit={adicionar}>
          <input value={novaTarefa} onChange={(e) => setNovaTarefa(e.target.value)} maxLength={300} placeholder="Nova tarefa…" />
          <button className="btn btn-leve" disabled={!novaTarefa.trim()} aria-label="Adicionar tarefa"><Plus size={16} /></button>
        </form>
      </div>
    </div>
  )
}

function Andamento({ chamado, etapas }) {
  const ativas = etapas.filter((e) => e.ativa)
  const idx = ativas.findIndex((e) => e.id === chamado.etapa_id)
  return (
    <div className="cartao painel-lateral">
      <h3>Andamento do projeto</h3>
      <ol className="stepper">
        {ativas.map((e, i) => (
          <li key={e.id} className={i < idx ? 'feito' : i === idx ? 'atual' : ''}>
            <i>{i < idx ? <Check size={12} strokeWidth={3} /> : i + 1}</i>
            <span>{e.nome}</span>
          </li>
        ))}
      </ol>
      {chamado.previsao_entrega && (
        <p className="previsao"><CalendarClock size={15} /> Previsão de entrega: <b>{dataCurta(chamado.previsao_entrega)}</b></p>
      )}
    </div>
  )
}

export default function Chamado() {
  const { id } = useParams()
  const chamadoId = Number(id)
  const { perfil, categorias, etapas, responsaveis, avisar } = useSessao()
  const navegar = useNavigate()
  const daEquipe = perfil.eh_agente || perfil.eh_dev

  const [chamado, setChamado] = useState(undefined)
  const [mensagens, setMensagens] = useState([])
  const [anexos, setAnexos] = useState([])
  const [ativos, setAtivos] = useState([])
  const [texto, setTexto] = useState('')
  const [interna, setInterna] = useState(false)
  const [doSolicitante, setDoSolicitante] = useState(false)
  const [novoStatus, setNovoStatus] = useState('')
  const [arquivos, setArquivos] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [tarefas, setTarefas] = useState([])

  const carregar = useCallback(async () => {
    const [c, m, a] = await Promise.all([
      supabase.from('hd_chamados').select('*, categoria:hd_categorias(nome)').eq('id', chamadoId).maybeSingle(),
      supabase.from('hd_mensagens').select('*').eq('chamado_id', chamadoId).order('criado_em').order('id'),
      supabase.from('hd_anexos').select('*').eq('chamado_id', chamadoId).order('id'),
    ])
    setChamado(c.data || null)
    setMensagens(m.data || [])
    setAnexos(a.data || [])
    if (c.data && ((daEquipe && !c.data.lido_agente) || (c.data.solicitante_email === perfil.email && !c.data.lido_solicitante))) {
      supabase.rpc('hd_marcar_lido', { p_id: chamadoId }).then(() => {})
    }
  }, [chamadoId, daEquipe, perfil.email])

  useEffect(() => {
    if (!Number.isFinite(chamadoId)) { setChamado(null); return }
    carregar()
    let t
    const recarregar = () => { clearTimeout(t); t = setTimeout(carregar, 300) }
    const canal = supabase.channel('chamado-' + chamadoId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hd_mensagens', filter: `chamado_id=eq.${chamadoId}` }, recarregar)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hd_chamados', filter: `id=eq.${chamadoId}` }, recarregar)
      .subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(canal) }
  }, [chamadoId, carregar])

  useEffect(() => {
    supabase.rpc(daEquipe ? 'hd_ativos_lista' : 'hd_meus_ativos').then(({ data }) => setAtivos(data || []))
  }, [daEquipe])

  const ehProjeto = !!chamado?.etapa_id
  const atende = !!chamado && (perfil.eh_agente || (perfil.eh_dev && ehProjeto))
  const carregarTarefas = useCallback(async () => {
    const { data } = await supabase.from('hd_tarefas').select('*').eq('chamado_id', chamadoId).order('ordem').order('id')
    setTarefas(data || [])
  }, [chamadoId])
  useEffect(() => {
    if (!atende || !ehProjeto) return
    carregarTarefas()
    const canal = supabase.channel('tarefas-' + chamadoId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hd_tarefas', filter: `chamado_id=eq.${chamadoId}` }, carregarTarefas)
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [atende, ehProjeto, chamadoId, carregarTarefas])

  const anexosPorMensagem = useMemo(() => {
    const mapa = {}
    for (const a of anexos) (mapa[a.mensagem_id ?? 'inicio'] ||= []).push(a)
    return mapa
  }, [anexos])

  if (chamado === undefined) return <div className="pagina"><div className="cartao carregando-bloco"><div className="spinner" /></div></div>
  if (chamado === null) {
    return (
      <div className="pagina pagina-estreita">
        <div className="cartao cartao-aviso">
          <h2>Chamado não encontrado</h2>
          <p className="texto-suave">Ele não existe ou você não tem acesso a ele.</p>
          <Link to="/" className="btn btn-primario">Voltar</Link>
        </div>
      </div>
    )
  }

  const agente = atende
  const souSolicitante = chamado.solicitante_email === perfil.email
  const nomeSolicitante = chamado.solicitante_nome || nomeDeEmail(chamado.solicitante_email)
  const ativo = ativos.find((a) => a.id === chamado.ativo_id)
  const podeResponder = agente || chamado.status !== 'cancelado'
  const erro = (m) => avisar(m, 'erro')

  async function atualizar(campos, msgOk) {
    setSalvando(true)
    const { error } = await supabase.from('hd_chamados').update(campos).eq('id', chamadoId)
    setSalvando(false)
    if (error) return erro(mensagemErro(error))
    if (msgOk) avisar(msgOk)
    carregar()
  }

  async function responder(e) {
    e.preventDefault()
    if (!texto.trim() && !arquivos.length) return
    setEnviando(true)
    try {
      const corpo = texto.trim() || (arquivos.length === 1 ? 'Anexo enviado' : `${arquivos.length} anexos enviados`)
      const { data, error } = await supabase.from('hd_mensagens')
        .insert({ chamado_id: chamadoId, corpo, interna: agente && interna && !doSolicitante, do_solicitante: agente && doSolicitante })
        .select('id').single()
      if (error) throw error
      if (arquivos.length) await enviarAnexos(chamadoId, arquivos, data.id)
      if (agente && novoStatus) {
        const { error: e2 } = await supabase.from('hd_chamados').update({ status: novoStatus }).eq('id', chamadoId)
        if (e2) throw e2
      }
      setTexto(''); setArquivos([]); setNovoStatus(''); setInterna(false); setDoSolicitante(false)
      avisar(doSolicitante ? 'Resposta do solicitante registrada' : interna ? 'Nota interna salva' : 'Resposta enviada')
      carregar()
    } catch (err) {
      erro(mensagemErro(err))
    }
    setEnviando(false)
  }

  async function cancelar() {
    if (!confirm('Cancelar este chamado?')) return
    const { error } = await supabase.rpc('hd_cancelar_meu_chamado', { p_id: chamadoId })
    if (error) return erro(mensagemErro(error))
    avisar('Chamado cancelado')
    carregar()
  }

  async function excluir() {
    if (!confirm(`Excluir o chamado ${codigo(chamadoId)} e todos os anexos? Isso não pode ser desfeito.`)) return
    if (anexos.length) await supabase.storage.from(BUCKET).remove(anexos.map((a) => a.caminho))
    const { error } = await supabase.from('hd_chamados').delete().eq('id', chamadoId)
    if (error) return erro(mensagemErro(error))
    avisar('Chamado excluído')
    navegar('/painel')
  }

  const copiar = (v) => navigator.clipboard?.writeText(v).then(() => avisar('AnyDesk copiado'))

  return (
    <div className="pagina">
      <div className="cabecalho-pagina">
        <div className="titulo-chamado">
          <button className="btn-icone" onClick={() => navegar(-1)} aria-label="Voltar"><ArrowLeft size={20} /></button>
          <div>
            <div className="migalha">
              <Link to={perfil.eh_agente ? '/painel' : perfil.eh_dev && ehProjeto ? '/kanban' : '/meus'}>{perfil.eh_dev && ehProjeto ? 'Desenvolvimento' : 'Chamados'}</Link> › {codigo(chamado.id)}
            </div>
            <h1>{chamado.titulo}</h1>
          </div>
        </div>
        <div className="acoes">
          <StatusBadge status={chamado.status} />
          {agente && <PrioridadeBadge prioridade={chamado.prioridade} />}
        </div>
      </div>

      <div className="grade-chamado">
        <section className="linha-tempo">
          <article className="mensagem mensagem-inicial cartao">
            <header>
              <Avatar nome={nomeSolicitante} />
              <div>
                <strong>{nomeSolicitante}</strong>
                <small>
                  {chamado.registrado_por ? `pediu ${VIA[chamado.origem] || ''}` : 'abriu o chamado'} · {dataHora(chamado.criado_em)}
                  {chamado.registrado_por && agente && <> · registrado por {nomeDeEmail(chamado.registrado_por)}</>}
                </small>
              </div>
            </header>
            <div className="corpo">{chamado.descricao}</div>
            <ListaAnexos anexos={anexosPorMensagem.inicio || []} onErro={erro} />
          </article>

          {mensagens.map((m) => m.tipo === 'evento' ? (
            <div key={m.id} className={'evento' + (m.interna ? ' evento-interno' : '')}>
              <span>{m.corpo.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (e) => nomeDeEmail(e))}</span>
              <small>{m.autor_email ? nomeDeEmail(m.autor_email) + ' · ' : ''}{tempoRelativo(m.criado_em)}</small>
            </div>
          ) : (
            <article key={m.id} className={'mensagem cartao' + (m.interna ? ' interna' : '') + (m.autor_email === chamado.solicitante_email ? '' : ' da-ti')}>
              <header>
                <Avatar nome={m.autor_email === chamado.solicitante_email ? nomeSolicitante : (m.autor_nome || nomeDeEmail(m.autor_email))} />
                <div>
                  <strong>
                    {m.autor_email === chamado.solicitante_email ? nomeSolicitante : (m.autor_nome || nomeDeEmail(m.autor_email))}
                    {m.autor_email !== chamado.solicitante_email && <span className="tag-ti">TI</span>}
                  </strong>
                  <small title={dataHora(m.criado_em)}>{dataHora(m.criado_em)}</small>
                  {m.registrado_por && agente && <small className="msg-registrada">resposta recebida fora do sistema · registrada por {nomeDeEmail(m.registrado_por)}</small>}
                </div>
                {m.interna && <span className="tag-interna"><Lock size={12} /> Nota interna</span>}
              </header>
              <div className="corpo">{m.corpo}</div>
              <ListaAnexos anexos={anexosPorMensagem[m.id] || []} onErro={erro} />
            </article>
          ))}

          {chamado.status === 'resolvido' && souSolicitante && (
            <div className="alerta alerta-ok">Chamado resolvido. Se o problema voltar, responda abaixo que ele é reaberto.</div>
          )}

          {podeResponder && (
            <form className={'cartao resposta' + (interna && !doSolicitante ? ' interna' : '')} onSubmit={responder}>
              <textarea rows={4} value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder={doSolicitante ? `Cole aqui a resposta que ${nomeSolicitante.split(' ')[0]} enviou por e-mail…` : interna ? 'Nota interna — só a equipe vê' : agente && !souSolicitante ? `Responder para ${nomeSolicitante.split(' ')[0]}…` : 'Escreva uma mensagem para a TI…'}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) responder(e) }} />
              <div className="resposta-rodape">
                <SeletorArquivos compacto arquivos={arquivos} setArquivos={setArquivos} onErro={erro} />
                {agente && (
                  <>
                    <label className="check">
                      <input type="checkbox" checked={interna} onChange={(e) => { setInterna(e.target.checked); if (e.target.checked) setDoSolicitante(false) }} /> Nota interna
                    </label>
                    {!souSolicitante && (
                      <label className="check" title="Registra no histórico uma resposta que o solicitante mandou por e-mail, telefone ou Teams. Não envia e-mail.">
                        <input type="checkbox" checked={doSolicitante} onChange={(e) => { setDoSolicitante(e.target.checked); if (e.target.checked) setInterna(false) }} /> Resposta do solicitante
                      </label>
                    )}
                    <select value={novoStatus} onChange={(e) => setNovoStatus(e.target.value)} aria-label="Mudar status ao enviar">
                      <option value="">Manter status</option>
                      <option value="em_espera">e aguardar colaborador</option>
                      <option value="pausado">e pausar</option>
                      <option value="resolvido">e marcar como resolvido</option>
                    </select>
                  </>
                )}
                <button className="btn btn-primario" disabled={enviando || (!texto.trim() && !arquivos.length)}>
                  <Send size={16} /> {enviando ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </form>
          )}
        </section>

        <aside className="lateral">
          {agente && ehProjeto && (
            <Projeto chamado={chamado} etapas={etapas} tarefas={tarefas} salvando={salvando}
              atualizar={atualizar} recarregarTarefas={carregarTarefas} onErro={erro} />
          )}
          {!agente && ehProjeto && <Andamento chamado={chamado} etapas={etapas} />}
          {agente ? (
            <div className="cartao painel-lateral">
              <h3>Atendimento</h3>
              <label className="campo">
                <span>Status</span>
                <select value={chamado.status} disabled={salvando} onChange={(e) => atualizar({ status: e.target.value }, 'Status atualizado')}>
                  {STATUS_ORDEM.map((s) => <option key={s} value={s}>{STATUS[s].rotulo}</option>)}
                </select>
              </label>
              <label className="campo">
                <span>Prioridade</span>
                <select value={chamado.prioridade} disabled={salvando} onChange={(e) => atualizar({ prioridade: e.target.value }, 'Prioridade atualizada')}>
                  {PRIORIDADE_ORDEM.map((p) => <option key={p} value={p}>{PRIORIDADE[p].rotulo}</option>)}
                </select>
              </label>
              <label className="campo">
                <span>Atribuído a</span>
                <select value={chamado.atribuido_email || ''} disabled={salvando}
                  onChange={(e) => atualizar({ atribuido_email: e.target.value || null }, 'Responsável atualizado')}>
                  <option value="">Não atribuído</option>
                  {[...new Set([...responsaveis(ehProjeto), chamado.atribuido_email].filter(Boolean))].map((a) => <option key={a} value={a}>{nomeDeEmail(a)}</option>)}
                </select>
              </label>
              {chamado.atribuido_email !== perfil.email && emAndamento(chamado) && (
                <button className="btn btn-leve btn-bloco" disabled={salvando}
                  onClick={() => atualizar({ atribuido_email: perfil.email, ...(chamado.status === 'novo' ? { status: 'aberto' } : {}) }, 'Chamado assumido')}>
                  <UserCheck size={16} /> Assumir chamado
                </button>
              )}
              {perfil.eh_agente && <label className="campo">
                <span>Categoria</span>
                <select value={chamado.categoria_id || ''} disabled={salvando}
                  onChange={(e) => atualizar({ categoria_id: e.target.value ? Number(e.target.value) : null }, 'Categoria atualizada')}>
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </label>}
              <label className="campo">
                <span>Prazo de SLA</span>
                <input type="datetime-local" defaultValue={paraInputLocal(chamado.prazo_sla)} key={chamado.prazo_sla || 'vazio'} disabled={salvando}
                  onBlur={(e) => {
                    const novo = e.target.value ? new Date(e.target.value).toISOString() : null
                    if ((novo || null) !== (chamado.prazo_sla ? new Date(chamado.prazo_sla).toISOString() : null)) atualizar({ prazo_sla: novo }, 'Prazo atualizado')
                  }} />
                <small className="dica"><SlaTexto chamado={chamado} /></small>
              </label>
              <label className="campo">
                <span>Equipamento</span>
                <select value={chamado.ativo_id || ''} disabled={salvando}
                  onChange={(e) => atualizar({ ativo_id: e.target.value || null }, 'Equipamento vinculado')}>
                  <option value="">Nenhum</option>
                  {ativos.map((a) => <option key={a.id} value={a.id}>{a.dispositivo}{a.usuario ? ` · ${a.usuario}` : ''}</option>)}
                </select>
              </label>
            </div>
          ) : (
            <div className="cartao painel-lateral">
              <h3>Detalhes</h3>
              <dl className="detalhes">
                <dt>Status</dt><dd><StatusBadge status={chamado.status} /></dd>
                <dt>Categoria</dt><dd>{chamado.categoria?.nome || '—'}</dd>
                <dt>Responsável</dt><dd>{chamado.atribuido_email ? nomeDeEmail(chamado.atribuido_email) : 'Aguardando atendimento'}</dd>
                {previsaoColaborador(chamado) && <><dt>Previsão</dt><dd className={'previsao-col ' + previsaoColaborador(chamado).tipo}>{previsaoColaborador(chamado).texto.replace(/^Previsão de atendimento: /, '')}</dd></>}
                <dt>Aberto em</dt><dd>{dataHora(chamado.criado_em)}</dd>
                {ativo && <><dt>Equipamento</dt><dd>{ativo.dispositivo}</dd></>}
              </dl>
              {souSolicitante && chamado.status === 'novo' && (
                <button className="btn btn-leve btn-bloco" onClick={cancelar}>Cancelar chamado</button>
              )}
            </div>
          )}

          <div className="cartao painel-lateral">
            <h3>Solicitante</h3>
            <div className="solicitante">
              <Avatar nome={nomeSolicitante} />
              <div>
                <strong>{nomeSolicitante}</strong>
                <small>{chamado.solicitante_email}</small>
              </div>
            </div>
            {agente && ehExterno(chamado.solicitante_email) && (
              <p className="dica">Sem acesso ao sistema: recebe os avisos por e-mail e, ao responder, a mensagem vai para {nomeDeEmail(chamado.atribuido_email || chamado.registrado_por || '') || 'o responsável'}.</p>
            )}
            <dl className="detalhes">
              {chamado.origem && chamado.origem !== 'sistema' && <><dt>Pedido via</dt><dd><span className="selo-origem">{ORIGENS[chamado.origem]}</span></dd></>}
              {chamado.setor && <><dt>Setor</dt><dd>{chamado.setor}</dd></>}
              {chamado.anydesk && (
                <><dt>AnyDesk</dt>
                  <dd className="anydesk">
                    <Monitor size={14} /> <b>{chamado.anydesk}</b>
                    <button className="btn-icone" onClick={() => copiar(chamado.anydesk)} aria-label="Copiar AnyDesk"><Copy size={14} /></button>
                  </dd></>
              )}
              {agente && ativo && <><dt>Equipamento</dt><dd>{ativo.dispositivo}{ativo.modelo ? ` — ${ativo.modelo}` : ''}</dd></>}
              {agente && chamado.resolvido_em && <><dt>Resolvido em</dt><dd>{dataHora(chamado.resolvido_em)}</dd></>}
            </dl>
            {perfil.eh_agente && !souSolicitante && (
              <label className="check" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={chamado.avisar_solicitante !== false} disabled={salvando}
                  onChange={(e) => atualizar({ avisar_solicitante: e.target.checked }, e.target.checked ? 'Solicitante volta a receber e-mails' : 'Avisos por e-mail desligados')} />
                Avisar por e-mail
              </label>
            )}
          </div>

          {perfil.papel === 'admin' && (
            <button className="btn btn-perigo-leve btn-bloco" onClick={excluir}><Trash2 size={15} /> Excluir chamado</button>
          )}
          {agente && chamado.status === 'novo' && !chamado.atribuido_email && (
            <p className="dica centro"><AlertTriangle size={13} /> Ninguém assumiu este chamado ainda.</p>
          )}
        </aside>
      </div>
    </div>
  )
}
