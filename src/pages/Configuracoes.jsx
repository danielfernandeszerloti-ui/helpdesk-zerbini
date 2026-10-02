import { useEffect, useState } from 'react'
import { Plus, Save, Tags, Layers, Users, Mail, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { Link } from 'react-router-dom'
import { mensagemErro, CORES_ETAPA, nomeDeEmail, codigo, dataHora, tempoRelativo } from '../lib/util'

const PAPEIS = {
  admin: { rotulo: 'Administrador', desc: 'TI com acesso total, inclusive equipe e exclusão' },
  ti: { rotulo: 'TI', desc: 'Atende todos os chamados' },
  dev: { rotulo: 'Desenvolvedor', desc: 'Vê e atende só o Kanban de desenvolvimento' },
}

// ---------- Categorias ----------
function LinhaCategoria({ cat, onSalvo }) {
  const { avisar } = useSessao()
  const [f, setF] = useState({ nome: cat.nome, sla_horas: cat.sla_horas ?? '', ordem: cat.ordem, ativa: cat.ativa, kanban: cat.kanban })
  const mudou = f.nome !== cat.nome || String(f.sla_horas) !== String(cat.sla_horas ?? '') || Number(f.ordem) !== cat.ordem

  async function salvar(campos = f) {
    const { error } = await supabase.from('hd_categorias').update({
      nome: campos.nome.trim(), sla_horas: campos.sla_horas === '' ? null : Number(campos.sla_horas),
      ordem: Number(campos.ordem) || 0, ativa: campos.ativa, kanban: campos.kanban,
    }).eq('id', cat.id)
    if (error) return avisar(mensagemErro(error), 'erro')
    avisar('Categoria salva')
    onSalvo()
  }
  const alternar = (campo) => (e) => { const n = { ...f, [campo]: e.target.checked }; setF(n); salvar(n) }

  return (
    <tr className={f.ativa ? '' : 'inativa'}>
      <td><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} maxLength={80} aria-label="Nome" /></td>
      <td><input type="number" min="1" placeholder="Sem SLA" value={f.sla_horas} onChange={(e) => setF({ ...f, sla_horas: e.target.value })} aria-label="SLA em horas" /></td>
      <td><input type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} aria-label="Ordem" className="curto" /></td>
      <td><label className="interruptor"><input type="checkbox" checked={f.kanban} onChange={alternar('kanban')} /><span>{f.kanban ? 'Sim' : 'Não'}</span></label></td>
      <td><label className="interruptor"><input type="checkbox" checked={f.ativa} onChange={alternar('ativa')} /><span>{f.ativa ? 'Ativa' : 'Inativa'}</span></label></td>
      <td>{mudou && <button className="btn btn-primario btn-p" onClick={() => salvar()}><Save size={14} /> Salvar</button>}</td>
    </tr>
  )
}

function Categorias() {
  const { categorias, carregarCategorias, avisar } = useSessao()
  const [nova, setNova] = useState({ nome: '', sla_horas: '' })

  async function criar(e) {
    e.preventDefault()
    if (nova.nome.trim().length < 2) return
    const ordem = Math.max(0, ...categorias.filter((c) => c.ordem < 99).map((c) => c.ordem)) + 1
    const { error } = await supabase.from('hd_categorias').insert({
      nome: nova.nome.trim(), sla_horas: nova.sla_horas ? Number(nova.sla_horas) : null, ordem,
    })
    if (error) return avisar(/duplicate/i.test(error.message) ? 'Já existe uma categoria com esse nome' : mensagemErro(error), 'erro')
    setNova({ nome: '', sla_horas: '' })
    avisar('Categoria criada')
    carregarCategorias()
  }

  return (
    <>
      <p className="texto-suave">O SLA (em horas) define o prazo automático dos novos chamados. Categorias marcadas em <b>Kanban</b> aparecem no quadro de Desenvolvimento e ficam visíveis para os desenvolvedores. Inativas somem do formulário.</p>
      <form className="cartao nova-categoria" onSubmit={criar}>
        <input placeholder="Nova categoria" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} maxLength={80} />
        <input type="number" min="1" placeholder="SLA (horas)" value={nova.sla_horas} onChange={(e) => setNova({ ...nova, sla_horas: e.target.value })} />
        <button className="btn btn-primario" disabled={nova.nome.trim().length < 2}><Plus size={16} /> Adicionar</button>
      </form>
      <div className="cartao tabela-cartao">
        <div className="tabela-rolagem">
          <table className="tabela tabela-edicao">
            <thead><tr><th>Nome</th><th>SLA (horas)</th><th>Ordem</th><th>Kanban</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {categorias.map((c) => <LinhaCategoria key={[c.id, c.nome, c.sla_horas, c.ordem, c.ativa, c.kanban].join(':')} cat={c} onSalvo={carregarCategorias} />)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ---------- Etapas ----------
function LinhaEtapa({ etapa, onSalvo }) {
  const { avisar } = useSessao()
  const [f, setF] = useState({ nome: etapa.nome, ordem: etapa.ordem, cor: etapa.cor, ativa: etapa.ativa })
  const mudou = f.nome !== etapa.nome || Number(f.ordem) !== etapa.ordem || f.cor !== etapa.cor

  async function salvar(campos = f) {
    const { error } = await supabase.from('hd_etapas').update({
      nome: campos.nome.trim(), ordem: Number(campos.ordem) || 0, cor: campos.cor, ativa: campos.ativa,
    }).eq('id', etapa.id)
    if (error) return avisar(/duplicate/i.test(error.message) ? 'Já existe uma etapa com esse nome' : mensagemErro(error), 'erro')
    avisar('Etapa salva')
    onSalvo()
  }

  return (
    <tr className={f.ativa ? '' : 'inativa'}>
      <td>
        <div className="etapa-nome">
          <i className={`bolinha cor-${f.cor}`} />
          <input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} maxLength={40} aria-label="Nome da etapa" />
        </div>
      </td>
      <td>
        <select value={f.cor} onChange={(e) => setF({ ...f, cor: e.target.value })} aria-label="Cor">
          {CORES_ETAPA.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td><input type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} aria-label="Ordem" className="curto" /></td>
      <td>
        {etapa.finaliza ? <span className="badge badge-verde">Finaliza o chamado</span> : (
          <label className="interruptor">
            <input type="checkbox" checked={f.ativa} onChange={(e) => { const n = { ...f, ativa: e.target.checked }; setF(n); salvar(n) }} />
            <span>{f.ativa ? 'Ativa' : 'Inativa'}</span>
          </label>
        )}
      </td>
      <td>{mudou && <button className="btn btn-primario btn-p" onClick={() => salvar()}><Save size={14} /> Salvar</button>}</td>
    </tr>
  )
}

function Etapas() {
  const { etapas, carregarEtapas, avisar } = useSessao()
  const [nome, setNome] = useState('')
  const final = etapas.find((e) => e.finaliza)

  async function criar(e) {
    e.preventDefault()
    if (nome.trim().length < 2) return
    // nova etapa entra antes de "Concluído"
    const ordem = Math.max(0, ...etapas.filter((x) => !x.finaliza).map((x) => x.ordem)) + 1
    if (final && final.ordem <= ordem) await supabase.from('hd_etapas').update({ ordem: ordem + 1 }).eq('id', final.id)
    const { error } = await supabase.from('hd_etapas').insert({ nome: nome.trim(), ordem, cor: 'azul' })
    if (error) return avisar(/duplicate/i.test(error.message) ? 'Já existe uma etapa com esse nome' : mensagemErro(error), 'erro')
    setNome('')
    avisar('Etapa criada')
    carregarEtapas()
  }

  return (
    <>
      <p className="texto-suave">Colunas do Kanban de Desenvolvimento, da esquerda para a direita pela ordem. A etapa final finaliza o chamado e avisa o solicitante. Inativar uma etapa só a esconde de novos movimentos.</p>
      <form className="cartao nova-categoria" onSubmit={criar}>
        <input placeholder="Nova etapa (ex.: Aguardando aprovação)" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} />
        <button className="btn btn-primario" disabled={nome.trim().length < 2}><Plus size={16} /> Adicionar</button>
      </form>
      <div className="cartao tabela-cartao">
        <div className="tabela-rolagem">
          <table className="tabela tabela-edicao">
            <thead><tr><th>Etapa</th><th>Cor</th><th>Ordem</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {etapas.map((e) => <LinhaEtapa key={[e.id, e.nome, e.ordem, e.cor, e.ativa].join(':')} etapa={e} onSalvo={carregarEtapas} />)}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ---------- Equipe ----------
function Equipe() {
  const { perfil, equipe, carregarEquipe, avisar } = useSessao()
  const [novo, setNovo] = useState({ email: '', papel: 'ti' })
  const [padrao, setPadrao] = useState('')
  const admin = perfil.papel === 'admin'

  useEffect(() => {
    supabase.from('hd_config').select('valor').eq('chave', 'responsavel_padrao').maybeSingle()
      .then(({ data }) => setPadrao(data?.valor || ''))
  }, [])

  async function salvarPadrao(valor) {
    const { error } = await supabase.from('hd_config').upsert({ chave: 'responsavel_padrao', valor })
    if (error) return avisar(mensagemErro(error), 'erro')
    setPadrao(valor)
    avisar(valor ? `Novos chamados serão atribuídos a ${nomeDeEmail(valor)}` : 'Novos chamados ficarão sem responsável')
  }
  const atendentesTI = equipe.filter((m) => m.ativo && m.atende && m.papel !== 'dev')

  async function adicionar(e) {
    e.preventDefault()
    const email = novo.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return avisar('Digite um e-mail válido', 'erro')
    const { error } = await supabase.from('hd_equipe').upsert({ email, papel: novo.papel, ativo: true })
    if (error) return avisar(mensagemErro(error), 'erro')
    setNovo({ email: '', papel: novo.papel })
    avisar(`${nomeDeEmail(email)} adicionado à equipe`)
    carregarEquipe()
  }
  async function alterar(email, campos, msg) {
    if (email === perfil.email && (campos.ativo === false || (campos.papel && campos.papel !== 'admin'))) {
      if (!window.confirm('Você vai perder o acesso de administrador. Continuar?')) return
    }
    const { error } = await supabase.from('hd_equipe').update(campos).eq('email', email)
    if (error) return avisar(mensagemErro(error), 'erro')
    avisar(msg)
    carregarEquipe()
  }

  return (
    <>
      <p className="texto-suave">Quem atende no helpdesk. <b>Atende chamados</b> define quem aparece em "Atribuído a" e recebe e-mail de chamado novo; quem não atende continua vendo tudo. Esta lista é só do helpdesk — não dá acesso à Gestão de Ativos. Qualquer pessoa com e-mail @grupozerbini.com.br pode abrir chamados sem estar aqui.</p>
      {admin && (
        <form className="cartao nova-categoria" onSubmit={adicionar}>
          <input type="email" placeholder="nome.sobrenome@grupozerbini.com.br" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
          <select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value })} aria-label="Perfil">
            {Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </select>
          <button className="btn btn-primario"><Plus size={16} /> Adicionar</button>
        </form>
      )}
      <div className="cartao config-linha">
        <div>
          <strong>Atribuir novos chamados automaticamente a</strong>
          <small className="sub">Vale para chamados fora do Kanban. A pessoa precisa estar marcada em "Atende chamados".</small>
        </div>
        <select value={atendentesTI.some((m) => m.email === padrao) ? padrao : ''} disabled={!admin}
          onChange={(e) => salvarPadrao(e.target.value)} aria-label="Responsável padrão">
          <option value="">Ninguém (fica "Não atribuído")</option>
          {atendentesTI.map((m) => <option key={m.email} value={m.email}>{m.nome || nomeDeEmail(m.email)}</option>)}
        </select>
      </div>
      <div className="cartao tabela-cartao">
        <div className="tabela-rolagem">
          <table className="tabela tabela-edicao">
            <thead><tr><th>Pessoa</th><th>Perfil</th><th>Atende chamados</th><th>Situação</th></tr></thead>
            <tbody>
              {equipe.map((m) => (
                <tr key={m.email} className={m.ativo ? '' : 'inativa'}>
                  <td><strong>{m.nome || nomeDeEmail(m.email)}</strong><small className="sub">{m.email}</small></td>
                  <td>
                    {admin ? (
                      <select value={m.papel} onChange={(e) => alterar(m.email, { papel: e.target.value }, 'Perfil atualizado')} aria-label="Perfil">
                        {Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
                      </select>
                    ) : PAPEIS[m.papel]?.rotulo}
                    <small className="sub">{PAPEIS[m.papel]?.desc}</small>
                  </td>
                  <td>
                    {admin ? (
                      <label className="interruptor" title="Aparece em &quot;Atribuído a&quot; e recebe e-mail de chamados novos">
                        <input type="checkbox" checked={!!m.atende} onChange={(e) => alterar(m.email, { atende: e.target.checked }, e.target.checked ? 'Agora aparece em "Atribuído a"' : 'Removido de "Atribuído a"')} />
                        <span>{m.atende ? 'Sim' : 'Não'}</span>
                      </label>
                    ) : (m.atende ? 'Sim' : 'Não')}
                    <small className="sub">{m.atende ? 'aparece em "Atribuído a"' : 'só acompanha'}</small>
                  </td>
                  <td>
                    {admin ? (
                      <label className="interruptor">
                        <input type="checkbox" checked={m.ativo} onChange={(e) => alterar(m.email, { ativo: e.target.checked }, e.target.checked ? 'Acesso reativado' : 'Acesso removido')} />
                        <span>{m.ativo ? 'Ativo' : 'Sem acesso'}</span>
                      </label>
                    ) : (m.ativo ? 'Ativo' : 'Sem acesso')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ---------- E-mail (caixa helpdesk@) ----------
const ACOES_EMAIL = {
  novo: { rotulo: 'Novo chamado', classe: 'ok' },
  resposta: { rotulo: 'Resposta', classe: 'ok' },
  nota: { rotulo: 'Nota interna', classe: 'info' },
  ignorado: { rotulo: 'Ignorado', classe: 'neutro' },
  erro: { rotulo: 'Erro', classe: 'erro' },
}

function EmailEntrada() {
  const { perfil, categorias, avisar } = useSessao()
  const [d, setD] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const admin = perfil.papel === 'admin'

  async function carregar() {
    setCarregando(true)
    const { data, error } = await supabase.rpc('hd_email_entrada_painel')
    setCarregando(false)
    if (error) return avisar(mensagemErro(error), 'erro')
    setD(data)
  }
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function salvar(chave, valor, msg) {
    const { error } = await supabase.from('hd_config').upsert({ chave, valor })
    if (error) return avisar(mensagemErro(error), 'erro')
    avisar(msg)
    carregar()
  }

  if (!d) return <div className="cartao carregando-bloco"><div className="spinner" /></div>
  const u = d.ultima
  const okLeitura = u && u.status >= 200 && u.status < 300
  let detalheErro = ''
  if (u && !okLeitura) { try { detalheErro = JSON.parse(u.resposta).erro } catch { detalheErro = u.resposta || 'sem resposta' } }

  return (
    <>
      <p className="texto-suave">
        E-mails enviados para a caixa do helpdesk viram chamados sozinhos. Respostas com "Chamado #0000" no assunto entram no chamado.
        Pedidos que você <b>encaminhar</b> (ENC:) ficam em nome de quem enviou o e-mail original.
      </p>
      <div className="cartao config-linha">
        <div>
          <strong>Ler a caixa automaticamente</strong>
          <small className="sub">A cada 2 min das 7h às 20h (seg a sáb) e a cada 10 min no resto do tempo.</small>
        </div>
        <label className="interruptor">
          <input type="checkbox" checked={d.ativa} disabled={!admin}
            onChange={(e) => salvar('email_entrada_ativa', e.target.checked ? 'sim' : 'nao', e.target.checked ? 'Leitura da caixa ligada' : 'Leitura da caixa pausada')} />
          <span>{d.ativa ? 'Ligada' : 'Pausada'}</span>
        </label>
      </div>
      <div className="cartao config-linha">
        <div>
          <strong>Categoria dos chamados por e-mail</strong>
          <small className="sub">Define o SLA. Deixe "Sem categoria" para classificar cada um ao atender.</small>
        </div>
        <select value={d.categoria || ''} disabled={!admin} aria-label="Categoria dos chamados por e-mail"
          onChange={(e) => salvar('categoria_email', e.target.value, 'Categoria salva')}>
          <option value="">Sem categoria</option>
          {categorias.filter((c) => c.ativa && !c.kanban).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
      <div className={'cartao config-linha ' + (u ? (okLeitura ? 'status-ok' : 'status-erro') : '')}>
        <div>
          <strong>Última leitura</strong>
          <small className="sub">
            {!u ? 'Ainda não houve leitura — confira as variáveis na Vercel.' : okLeitura ? `Funcionando · ${tempoRelativo(u.quando)}` : `Falhou ${tempoRelativo(u.quando)}: ${detalheErro}`}
          </small>
        </div>
        <button className="btn btn-leve" onClick={carregar} disabled={carregando}><RefreshCw size={15} className={carregando ? 'girando' : ''} /> Atualizar</button>
      </div>
      <div className="cartao tabela-cartao">
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>Recebido</th><th>De</th><th>Assunto</th><th>Resultado</th></tr></thead>
            <tbody>
              {d.recentes.length === 0 && <tr><td colSpan={4} className="texto-suave centro">Nenhum e-mail recebido ainda.</td></tr>}
              {d.recentes.map((r) => (
                <tr key={r.id}>
                  <td title={dataHora(r.recebido_em)}>{tempoRelativo(r.recebido_em)}</td>
                  <td>{r.remetente || '—'}</td>
                  <td>{r.assunto || '(sem assunto)'}{r.detalhe && <small className="sub">{r.detalhe}</small>}</td>
                  <td>
                    <span className={'selo-acao ' + (ACOES_EMAIL[r.acao]?.classe || '')}>{ACOES_EMAIL[r.acao]?.rotulo || r.acao}</span>
                    {r.chamado_id && <> <Link to={`/chamado/${r.chamado_id}`}>{codigo(r.chamado_id)}</Link></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

const ABAS = [
  { id: 'categorias', rotulo: 'Categorias', icone: Tags, comp: Categorias },
  { id: 'etapas', rotulo: 'Etapas do Kanban', icone: Layers, comp: Etapas },
  { id: 'equipe', rotulo: 'Equipe', icone: Users, comp: Equipe },
  { id: 'email', rotulo: 'E-mail', icone: Mail, comp: EmailEntrada },
]

export default function Configuracoes() {
  const [aba, setAba] = useState('categorias')
  const Atual = ABAS.find((a) => a.id === aba).comp
  return (
    <div className="pagina pagina-estreita">
      <div className="cabecalho-pagina"><h1>Configurações</h1></div>
      <div className="segmentos" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} className={aba === a.id ? 'ativo' : ''} onClick={() => setAba(a.id)}>
            <a.icone size={15} /> {a.rotulo}
          </button>
        ))}
      </div>
      <div className="config-conteudo"><Atual /></div>
    </div>
  )
}
