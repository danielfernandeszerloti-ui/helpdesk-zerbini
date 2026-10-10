import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Send, RefreshCw, Eye, PencilLine, Plus, X, FileText, Check, Wand2, Mail, CalendarDays } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { dataHora, mensagemErro, nomeDeEmail } from '../lib/util'
import { ACOMPANHAMENTO, NIVEL, ORDEM_NIVEL, assuntoRelatorio, htmlRelatorio, indicadores, periodoTexto, valorTexto, variacao } from '../lib/relatorio'

const EDITAVEIS = ['resumo', 'atividades', 'itens', 'notas_atencao', 'notas_decisao', 'plano', 'plano_anterior']
const SITE = typeof window !== 'undefined' ? window.location.origin : 'https://chamados.grupozerbini.com.br'

function segunda(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  const p = (n) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`
}
const menos7 = (iso) => { const [a, m, d] = iso.split('-').map(Number); const x = new Date(a, m - 1, d - 7); return segunda(x) }

function TextoAuto({ value, onChange, minRows = 2, ...props }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'
  }, [value])
  return <textarea ref={ref} rows={minRows} value={value} onChange={(e) => onChange(e.target.value)} {...props} />
}

function Previa({ html }) {
  const ref = useRef(null)
  const ajustar = () => { const f = ref.current; if (f?.contentDocument?.body) f.style.height = f.contentDocument.documentElement.scrollHeight + 'px' }
  return <iframe ref={ref} title="Prévia do e-mail" className="rel-previa" srcDoc={html} onLoad={ajustar}
    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" />
}

// ------------------------------------------------------------------ lista de semanas
function ListaRelatorios() {
  const { avisar } = useSessao()
  const navigate = useNavigate()
  const [lista, setLista] = useState(null)
  const [gerando, setGerando] = useState('')

  useEffect(() => {
    supabase.from('hd_relatorios').select('id,inicio,fim,status,enviado_em,enviado_por,itens,atualizado_em').order('inicio', { ascending: false }).limit(60)
      .then(({ data, error }) => { if (error) avisar(mensagemErro(error), 'erro'); setLista(data || []) })
  }, [avisar])

  async function abrir(inicio) {
    setGerando(inicio)
    const { data, error } = await supabase.rpc('hd_relatorio_gerar', { p_inicio: inicio })
    setGerando('')
    if (error) return avisar(mensagemErro(error), 'erro')
    navigate('/relatorio/' + data)
  }

  const atual = segunda(), anterior = menos7(atual)
  const tem = (ini) => lista?.find((r) => r.inicio === ini)
  return (
    <div className="pagina pagina-estreita">
      <div className="cabecalho-pagina">
        <div>
          <Link to="/indicadores" className="voltar"><ArrowLeft size={15} /> Indicadores</Link>
          <h1>Relatório semanal de TI</h1>
          <p className="texto-suave">Rascunho automático toda sexta às 16h (segunda a sexta). Você revisa e envia para a gerência.</p>
        </div>
      </div>
      <div className="rel-atalhos">
        {[{ ini: atual, rot: 'Semana atual' }, { ini: anterior, rot: 'Semana passada' }].map(({ ini, rot }) => {
          const r = tem(ini)
          return (
            <button key={ini} className="cartao rel-atalho" onClick={() => (r ? navigate('/relatorio/' + r.id) : abrir(ini))} disabled={!!gerando}>
              <CalendarDays size={20} />
              <span><b>{rot}</b><small>{periodoTexto({ inicio: ini, fim: (() => { const [a, m, d] = ini.split('-').map(Number); const x = new Date(a, m - 1, d + 4); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` })() })}</small></span>
              <span className={'badge ' + (r?.status === 'enviado' ? 'badge-verde' : r ? 'badge-amarelo' : 'badge-cinza')}>
                {gerando === ini ? 'Gerando…' : r?.status === 'enviado' ? 'Enviado' : r ? 'Rascunho' : 'Gerar rascunho'}
              </span>
            </button>
          )
        })}
      </div>
      <div className="cartao tabela-cartao">
        {lista === null ? <div className="vazio"><div className="spinner" /></div> : !lista.length ? (
          <div className="vazio"><FileText size={28} /><strong>Nenhum relatório ainda</strong><p>Gere o rascunho da semana atual para começar.</p></div>
        ) : (
          <table className="tabela">
            <thead><tr><th>Semana</th><th>Situação</th><th>Pontos de atenção</th><th>Atualizado</th></tr></thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id} onClick={() => navigate('/relatorio/' + r.id)}>
                  <td><Link to={'/relatorio/' + r.id} onClick={(e) => e.stopPropagation()}><b>{periodoTexto(r)}</b></Link></td>
                  <td>{r.status === 'enviado'
                    ? <span className="badge badge-verde">Enviado {dataHora(r.enviado_em)}</span>
                    : <span className="badge badge-amarelo">Rascunho</span>}</td>
                  <td>{(r.itens || []).filter((i) => i.incluir !== false).length}</td>
                  <td className="texto-suave">{dataHora(r.atualizado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ editor de um relatório
function ItemAtencao({ item, onChange, onRemover }) {
  const n = NIVEL[item.nivel] || NIVEL.baixo
  return (
    <div className={'rel-item' + (item.incluir === false ? ' fora' : '')}>
      <label className="rel-item-check" title={item.incluir === false ? 'Fora do relatório (clique para incluir)' : 'Incluído no relatório'}>
        <input type="checkbox" checked={item.incluir !== false} onChange={(e) => onChange({ ...item, incluir: e.target.checked })} />
      </label>
      <select className={'rel-nivel nivel-' + (item.nivel || 'baixo')} value={item.nivel || 'baixo'} onChange={(e) => onChange({ ...item, nivel: e.target.value })}
        aria-label="Relevância" title={'Relevância ' + n.rotulo.toLowerCase()}>
        {Object.entries(NIVEL).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
      </select>
      <div className="rel-item-texto">
        <TextoAuto minRows={1} value={item.texto} onChange={(t) => onChange({ ...item, texto: t, editado: true })} aria-label="Texto do ponto" />
        {!!item.chamados?.length && (
          <div className="rel-item-links">
            {item.chamados.slice(0, 8).map((id) => <Link key={id} to={'/chamado/' + id} target="_blank">#{String(id).padStart(4, '0')}</Link>)}
            {item.chamados.length > 8 && <span>+{item.chamados.length - 8}</span>}
          </div>
        )}
      </div>
      {item.manual && <button className="btn-icone" onClick={onRemover} aria-label="Remover"><X size={15} /></button>}
    </div>
  )
}

function Secao({ n, titulo, dica, acao, children }) {
  return (
    <section className="cartao rel-secao">
      <header><h2><span className="rel-num">{n}</span>{titulo}</h2>{acao}</header>
      {dica && <p className="texto-suave rel-dica">{dica}</p>}
      {children}
    </section>
  )
}

function EditorRelatorio({ id }) {
  const { avisar, equipe } = useSessao()
  const [r, setRestado] = useState(null)
  const rRef = useRef(null)
  const setR = (v) => { rRef.current = v; setRestado(v) }
  const [erro, setErro] = useState('')
  const [modo, setModo] = useState('editar')
  const [estado, setEstado] = useState('') // '', 'salvando', 'salvo'
  const [atualizando, setAtualizando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [destinos, setDestinos] = useState('')
  const [editDest, setEditDest] = useState(false)
  const sujo = useRef(false)
  const timer = useRef(null)

  const carregar = useCallback(async (preservarModo) => {
    const { data, error } = await supabase.from('hd_relatorios').select('*').eq('id', id).maybeSingle()
    if (error || !data) { setErro(error ? mensagemErro(error) : 'Relatório não encontrado.'); return }
    sujo.current = false
    rRef.current = data
    setRestado(data)
    if (!preservarModo) setModo(data.status === 'enviado' ? 'previa' : 'editar')
  }, [id])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    supabase.from('hd_config').select('valor').eq('chave', 'relatorio_destinatarios').maybeSingle()
      .then(({ data }) => setDestinos(data?.valor || 'amanda.alencar@grupozerbini.com.br'))
  }, [])

  const salvar = useCallback(async (dados) => {
    setEstado('salvando')
    const p = {}; EDITAVEIS.forEach((k) => { p[k] = dados[k] })
    const { error } = await supabase.rpc('hd_relatorio_salvar', { p_id: dados.id, p })
    if (error) { setEstado(''); avisar(mensagemErro(error), 'erro'); return false }
    sujo.current = false
    setEstado('salvo')
    return true
  }, [avisar])

  // salvamento automático
  function mudar(campos) {
    const novo = { ...rRef.current, ...campos }
    setR(novo)
    sujo.current = true
    setEstado('')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => salvar(novo), 1200)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    const aviso = (e) => { if (sujo.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [])

  const nomesDestino = useMemo(() => destinos.split(',').map((e) => e.trim()).filter(Boolean)
    .map((e) => equipe.find((m) => m.email === e)?.nome || nomeDeEmail(e)), [destinos, equipe])
  const saudacao = nomesDestino.length === 1 ? `Olá, ${nomesDestino[0].split(' ')[0]}!` : 'Olá!'
  const html = useMemo(() => (r ? htmlRelatorio(r, { site: SITE, saudacao }) : ''), [r, saudacao])

  if (erro) return <div className="pagina pagina-estreita"><div className="alerta alerta-erro">{erro}</div></div>
  if (!r) return <div className="pagina"><div className="vazio"><div className="spinner" /></div></div>

  const d = r.dados || {}
  const ind = indicadores(d)
  const itens = r.itens || []
  const atencao = itens.map((it, k) => ({ it, k })).filter(({ it }) => it.secao !== 'decisao')
    .sort((a, b) => (ORDEM_NIVEL[a.it.nivel] ?? 3) - (ORDEM_NIVEL[b.it.nivel] ?? 3))
  const decisoes = itens.map((it, k) => ({ it, k })).filter(({ it }) => it.secao === 'decisao')
  const mudarItem = (k, novo) => mudar({ itens: itens.map((x, j) => (j === k ? novo : x)) })
  const removerItem = (k) => mudar({ itens: itens.filter((_, j) => j !== k) })
  const novoItem = (secao) => mudar({ itens: [...itens, { chave: 'manual:' + Date.now(), secao, nivel: secao === 'decisao' ? 'alto' : 'medio', texto: '', incluir: true, manual: true, editado: true, chamados: [] }] })
  const plano = r.plano || []
  const planoAnt = r.plano_anterior || []
  const sugestoes = (d.sugestoes_plano || []).filter((s) => !plano.some((p) => p.texto === s))

  async function atualizarDados() {
    if (sujo.current) { clearTimeout(timer.current); if (!(await salvar(r))) return }
    setAtualizando(true)
    const { error } = await supabase.rpc('hd_relatorio_gerar', { p_inicio: r.inicio })
    setAtualizando(false)
    if (error) return avisar(mensagemErro(error), 'erro')
    await carregar(true)
    avisar('Números e pontos de atenção atualizados. Seus textos foram mantidos.')
  }

  async function enviar() {
    const vazio = !plano.some((p) => String(p.texto || '').trim())
    const msg = `Enviar o relatório da semana ${periodoTexto(r)} para ${nomesDestino.join(', ')}?`
      + (vazio ? '\n\nAtenção: o plano de ação está vazio.' : '')
      + (r.status === 'enviado' ? '\n\nEste relatório já foi enviado — será enviada uma nova versão.' : '')
    if (!window.confirm(msg)) return
    clearTimeout(timer.current)
    if (!(await salvar(r))) return
    setEnviando(true)
    const { error } = await supabase.rpc('hd_relatorio_enviar', { p_id: r.id, p_assunto: assuntoRelatorio(r), p_html: html })
    setEnviando(false)
    if (error) return avisar(mensagemErro(error), 'erro')
    avisar('Relatório enviado. O e-mail sai em até 1 minuto.')
    await carregar()
  }

  async function salvarDestinos(valor) {
    const limpo = valor.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
    if (!limpo.length) return avisar('Informe pelo menos um e-mail válido.', 'erro')
    const { error } = await supabase.from('hd_config').upsert({ chave: 'relatorio_destinatarios', valor: limpo.join(',') })
    if (error) return avisar(mensagemErro(error), 'erro')
    setDestinos(limpo.join(',')); setEditDest(false)
  }

  const enviado = r.status === 'enviado'
  return (
    <div className="pagina pagina-relatorio">
      <div className="cabecalho-pagina">
        <div>
          <Link to="/relatorio" className="voltar"><ArrowLeft size={15} /> Relatórios semanais</Link>
          <h1>Relatório semanal · {periodoTexto(r)}</h1>
          <p className="texto-suave rel-status">
            {enviado
              ? <span className="badge badge-verde"><Check size={13} /> Enviado {dataHora(r.enviado_em)}{r.enviado_por ? ' por ' + nomeDeEmail(r.enviado_por) : ''}</span>
              : <span className="badge badge-amarelo">Rascunho</span>}
            <span>Dados de {dataHora(r.gerado_em)}</span>
            {estado === 'salvando' && <span>Salvando…</span>}
            {estado === 'salvo' && <span className="ok"><Check size={13} /> Salvo</span>}
          </p>
        </div>
        <div className="rel-acoes">
          <div className="segmentos compacto" role="tablist">
            <button role="tab" aria-selected={modo === 'editar'} className={modo === 'editar' ? 'ativo' : ''} onClick={() => setModo('editar')}><PencilLine size={15} /> Revisar</button>
            <button role="tab" aria-selected={modo === 'previa'} className={modo === 'previa' ? 'ativo' : ''} onClick={() => setModo('previa')}><Eye size={15} /> Como a gerência vai ver</button>
          </div>
          {!enviado && <button className="btn btn-leve" onClick={atualizarDados} disabled={atualizando} title="Recalcula indicadores e pontos de atenção sem apagar seus textos">
            <RefreshCw size={15} className={atualizando ? 'girando' : ''} /> Atualizar dados</button>}
          <button className="btn btn-primario" onClick={enviar} disabled={enviando}>
            <Send size={15} /> {enviando ? 'Enviando…' : enviado ? 'Enviar nova versão' : 'Enviar'}
          </button>
        </div>
      </div>

      <div className="cartao rel-para">
        <Mail size={16} />
        {editDest ? (
          <form onSubmit={(e) => { e.preventDefault(); salvarDestinos(new FormData(e.currentTarget).get('d')) }} className="rel-para-form">
            <input name="d" defaultValue={destinos.split(',').join(', ')} autoFocus aria-label="Destinatários" />
            <button className="btn btn-primario">Salvar</button>
            <button type="button" className="btn btn-leve" onClick={() => setEditDest(false)}>Cancelar</button>
          </form>
        ) : (
          <>
            <span>Para: <b>{nomesDestino.join(', ')}</b> <small className="texto-suave">({destinos.split(',').join(', ')})</small></span>
            <button className="btn-link" onClick={() => setEditDest(true)}>alterar</button>
          </>
        )}
        <span className="rel-para-assunto texto-suave">Assunto: {assuntoRelatorio(r)}</span>
      </div>

      {modo === 'previa' ? <Previa html={html} /> : (
        <div className="rel-editor">
          <section className="cartao rel-secao">
            <header><h2>Resumo da semana</h2></header>
            <p className="texto-suave rel-dica">Uma ou duas frases no topo do e-mail — muitas vezes é a única parte lida com atenção.</p>
            <TextoAuto value={r.resumo} onChange={(v) => mudar({ resumo: v })} aria-label="Resumo" />
          </section>

          <Secao n={1} titulo="Indicadores de atendimento" dica="Calculados automaticamente (segunda a sexta), comparados com a semana anterior.">
            <div className="rel-tiles">
              {ind.map((i) => {
                const v = variacao(i)
                return (
                  <div key={i.id} className="tile">
                    <span className="tile-rotulo">{i.rotulo}</span>
                    <strong className="tile-valor">{valorTexto(i)}</strong>
                    <span className={'delta ' + v.tom}>{v.texto}</span>
                    <span className="tile-sub">{i.sub}</span>
                  </div>
                )
              })}
            </div>
            <div className="rel-tabelas">
              <table className="tabela tabela-dash">
                <thead><tr><th>Categoria</th><th>Recebidos</th><th>Concluídos</th></tr></thead>
                <tbody>{(d.por_categoria || []).slice(0, 8).map((c) => <tr key={c.categoria}><td>{c.categoria}</td><td>{c.recebidos}</td><td>{c.concluidos}</td></tr>)}</tbody>
              </table>
              <table className="tabela tabela-dash">
                <thead><tr><th>Responsável</th><th>Concluídos</th><th>Pendentes</th></tr></thead>
                <tbody>{(d.por_responsavel || []).map((x) => <tr key={x.email}><td>{x.nome || x.email}</td><td>{x.concluidos}</td><td>{x.pendentes}</td></tr>)}</tbody>
              </table>
            </div>
          </Secao>

          <Secao n={2} titulo="Principais atividades da semana"
            dica="Montado a partir dos chamados concluídos, projetos e tarefas. Corte, junte e reescreva à vontade — linhas com • viram lista."
            acao={<button className="btn-link" onClick={() => { if (!r.atividades.trim() || window.confirm('Substituir o texto atual pelo rascunho gerado a partir dos dados?')) mudar({ atividades: d.atividades_texto || '' }) }}>
              <Wand2 size={14} /> Recriar a partir dos dados</button>}>
            <TextoAuto minRows={6} value={r.atividades} onChange={(v) => mudar({ atividades: v })} aria-label="Atividades" className="rel-texto-longo" />
          </Secao>

          <Secao n={3} titulo="Pontos de atenção"
            dica="Detectados automaticamente: atrasos, recorrências, terceiros parados, fila crescendo, avaliações baixas. Desmarque o que não deve ir no e-mail."
            acao={<button className="btn-link" onClick={() => novoItem('atencao')}><Plus size={14} /> Adicionar ponto</button>}>
            {atencao.length ? atencao.map(({ it, k }) => <ItemAtencao key={it.chave + k} item={it} onChange={(n) => mudarItem(k, n)} onRemover={() => removerItem(k)} />)
              : <p className="texto-suave">Nada detectado nesta semana.</p>}
            <label className="campo rel-notas"><span>Observações (opcional)</span>
              <TextoAuto value={r.notas_atencao} onChange={(v) => mudar({ notas_atencao: v })} placeholder="Algo que os dados não mostram: um fornecedor difícil, um risco, uma renovação próxima…" />
            </label>
          </Secao>

          <Secao n={4} titulo="Decisões que dependem da gerência"
            dica="Aprovações pendentes entram sozinhas. Some aqui o que precisa de uma resposta da Amanda."
            acao={<button className="btn-link" onClick={() => novoItem('decisao')}><Plus size={14} /> Adicionar decisão</button>}>
            {decisoes.length ? decisoes.map(({ it, k }) => <ItemAtencao key={it.chave + k} item={it} onChange={(n) => mudarItem(k, n)} onRemover={() => removerItem(k)} />)
              : <p className="texto-suave">Nenhuma aprovação pendente.</p>}
            <label className="campo rel-notas"><span>Outras decisões (opcional)</span>
              <TextoAuto value={r.notas_decisao} onChange={(v) => mudar({ notas_decisao: v })} placeholder="Ex.: aprovar a compra de licenças, definir prioridade entre dois projetos…" />
            </label>
          </Secao>

          <Secao n={5} titulo="Plano de ação para a próxima semana">
            {!!planoAnt.length && (
              <div className="rel-plano-ant">
                <h3>Como foi o plano da semana anterior?</h3>
                {planoAnt.map((p, k) => (
                  <div key={k} className="rel-plano-ant-item">
                    <span className="rel-plano-ant-texto">{p.texto}</span>
                    <div className="segmentos compacto">
                      {Object.entries(ACOMPANHAMENTO).map(([chave, a]) => (
                        <button key={chave} className={p.feito === chave ? 'ativo' : ''} aria-pressed={p.feito === chave}
                          onClick={() => mudar({ plano_anterior: planoAnt.map((x, j) => (j === k ? { ...x, feito: x.feito === chave ? null : chave } : x)) })}>
                          {a.simbolo} {a.rotulo}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="rel-plano">
              {plano.map((p, k) => (
                <div key={k} className="rel-plano-item">
                  <span className="rel-plano-n">{k + 1}.</span>
                  <input value={p.texto} placeholder="O que a TI vai fazer na próxima semana" aria-label={`Ação ${k + 1}`}
                    onChange={(e) => mudar({ plano: plano.map((x, j) => (j === k ? { ...x, texto: e.target.value } : x)) })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); mudar({ plano: [...plano.slice(0, k + 1), { texto: '' }, ...plano.slice(k + 1)] }); setTimeout(() => document.querySelector(`[aria-label="Ação ${k + 2}"]`)?.focus(), 30) } }} />
                  <button className="btn-icone" onClick={() => mudar({ plano: plano.filter((_, j) => j !== k) })} aria-label="Remover ação"><X size={15} /></button>
                </div>
              ))}
              <button className="btn btn-leve rel-plano-add" onClick={() => { mudar({ plano: [...plano, { texto: '' }] }); setTimeout(() => document.querySelector(`[aria-label="Ação ${plano.length + 1}"]`)?.focus(), 30) }}>
                <Plus size={15} /> Adicionar ação</button>
            </div>
            {!!sugestoes.length && (
              <div className="rel-sugestoes">
                <span className="texto-suave">Sugestões a partir de tarefas, prazos e terceiros:</span>
                <div className="chips">
                  {sugestoes.map((s) => <button key={s} className="chip" onClick={() => mudar({ plano: [...plano.filter((p) => p.texto.trim()), { texto: s }] })}><Plus size={13} /> {s}</button>)}
                </div>
              </div>
            )}
            <p className="texto-suave rel-dica">Na semana seguinte, estes itens voltam para você marcar se foram feitos — e isso aparece no relatório.</p>
          </Secao>

          <div className="rel-rodape">
            <button className="btn btn-leve" onClick={() => setModo('previa')}><Eye size={15} /> Ver como a gerência vai receber</button>
            <button className="btn btn-primario" onClick={enviar} disabled={enviando}><Send size={15} /> {enviando ? 'Enviando…' : enviado ? 'Enviar nova versão' : `Enviar para ${nomesDestino.join(', ')}`}</button>
          </div>
        </div>
      )}
      {modo === 'previa' && !enviado && (
        <div className="rel-rodape">
          <button className="btn btn-leve" onClick={() => setModo('editar')}><PencilLine size={15} /> Voltar a revisar</button>
          <button className="btn btn-primario" onClick={enviar} disabled={enviando}><Send size={15} /> {enviando ? 'Enviando…' : `Enviar para ${nomesDestino.join(', ')}`}</button>
        </div>
      )}
    </div>
  )
}

export default function Relatorio() {
  const { id } = useParams()
  return id ? <EditorRelatorio key={id} id={Number(id)} /> : <ListaRelatorios />
}
