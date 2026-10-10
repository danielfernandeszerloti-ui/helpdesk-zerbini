import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { Mail } from 'lucide-react'
import { enviarAnexos, mensagemErro, nomeDeEmail, EXPEDIENTE, ORIGENS, agoraLocal } from '../lib/util'
import { ShieldCheck, Lightbulb } from 'lucide-react'
import { buscar } from '../lib/base'
import { SeletorArquivos, colarArquivos } from '../components/ui'

export default function NovoChamado() {
  const { perfil, categorias, avisar } = useSessao()
  const navegar = useNavigate()
  const agente = perfil.eh_agente
  const [meusAtivos, setMeusAtivos] = useState([])
  const [arquivos, setArquivos] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [params] = useSearchParams()
  const [emNomeDe, setEmNomeDe] = useState(agente && params.get('registro') === '1')
  const [reg, setReg] = useState({ origem: 'email', recebido_em: agoraLocal(), avisar: true })
  const [f, setF] = useState({
    categoria_id: '', titulo: '', descricao: '',
    solicitante_nome: perfil.nome || nomeDeEmail(perfil.email),
    solicitante_email: perfil.email, setor: perfil.setor || '', anydesk: perfil.anydesk || '', ativo_id: '', valor_estimado: '',
    ...(agente && params.get('registro') === '1' ? { solicitante_nome: '', solicitante_email: '', setor: '', anydesk: '' } : {}),
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  useEffect(() => {
    if (params.get('kanban') && !f.categoria_id) {
      const k = categorias.find((c) => c.kanban && c.ativa)
      if (k) setF((v) => ({ ...v, categoria_id: String(k.id) }))
    }
  }, [categorias]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.rpc('hd_meus_ativos').then(({ data }) => setMeusAtivos(data || []))
  }, [])

  const catSel = categorias.find((c) => String(c.id) === String(f.categoria_id))

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    if (!f.categoria_id) return setErro('Escolha a categoria do chamado.')
    if (f.titulo.trim().length < 3) return setErro('Escreva um título (mínimo 3 letras).')
    if (f.descricao.trim().length < 3) return setErro('Descreva o problema ou a solicitação.')
    if (!f.solicitante_nome.trim()) return setErro('Informe o nome.')
    if (agente && emNomeDe && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.solicitante_email.trim())) return setErro('Informe um e-mail válido do solicitante.')
    if (agente && emNomeDe && reg.recebido_em && new Date(reg.recebido_em) > new Date()) return setErro('A data de recebimento não pode ser no futuro.')
    setEnviando(true)
    try {
      const registro = {
        categoria_id: Number(f.categoria_id), titulo: f.titulo, descricao: f.descricao,
        solicitante_nome: f.solicitante_nome.trim(), setor: f.setor.trim(), anydesk: f.anydesk.trim(),
        ativo_id: f.ativo_id || null,
        valor_estimado: catSel?.exige_aprovacao && f.valor_estimado !== '' ? Number(String(f.valor_estimado).replace(/\./g, '').replace(',', '.')) || null : null,
      }
      if (agente && emNomeDe) {
        registro.solicitante_email = f.solicitante_email.trim().toLowerCase()
        registro.origem = reg.origem
        registro.avisar_solicitante = reg.avisar
        if (reg.recebido_em) registro.criado_em = new Date(reg.recebido_em).toISOString()
      }
      const { data, error } = await supabase.from('hd_chamados').insert(registro).select('id').single()
      if (error) throw error
      if (arquivos.length) {
        try { await enviarAnexos(data.id, arquivos) } catch (err) { avisar('Chamado aberto, mas um anexo falhou: ' + mensagemErro(err), 'erro') }
      }
      avisar(catSel?.exige_aprovacao ? 'Solicitação enviada para aprovação da gerência.' : agente && emNomeDe ? `Chamado registrado${reg.avisar ? ' e solicitante avisado por e-mail' : ''}.` : 'Chamado aberto! A TI já foi avisada.')
      navegar(`/chamado/${data.id}`)
    } catch (err) {
      setErro(mensagemErro(err))
      setEnviando(false)
    }
  }

  const ativas = categorias.filter((c) => c.ativa)

  return (
    <div className="pagina pagina-estreita">
      <div className="cabecalho-pagina">
        <div>
          <h1>Novo chamado</h1>
          <div className="migalha"><Link to="/meus">Chamados</Link> › Novo chamado</div>
        </div>
      </div>

      <form className="cartao formulario" onSubmit={enviar}>
        <label className="campo">
          <span>Categoria do chamado <em>*</em></span>
          <select value={f.categoria_id} onChange={set('categoria_id')} autoFocus>
            <option value="">Selecione uma opção</option>
            {ativas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          {(() => {
            const sel = categorias.find((c) => String(c.id) === String(f.categoria_id))
            if (!sel?.sla_horas || sel.kanban) return null
            const h = sel.sla_horas
            if (sel.exige_aprovacao) return <small className="dica">Prazo de atendimento: até {h} {h === 1 ? 'hora útil' : 'horas úteis'} depois da aprovação ({EXPEDIENTE}).</small>
            return <small className="dica">Prazo de atendimento desta categoria: até {h} {h === 1 ? 'hora útil' : 'horas úteis'} ({EXPEDIENTE}).</small>
          })()}
        </label>

        {catSel?.exige_aprovacao && (
          <div className="alerta alerta-aprovacao">
            <ShieldCheck size={18} />
            <div>
              <strong>Esta solicitação passa pela aprovação da gerência.</strong>
              <span>Conte na descrição o que precisa e por quê. Depois de aprovada, a TI dá andamento e você é avisado por e-mail.</span>
            </div>
          </div>
        )}

        <label className="campo">
          <span>Título <em>*</em></span>
          <input value={f.titulo} onChange={set('titulo')} maxLength={200} placeholder="Ex.: Impressora do estoque não imprime etiquetas" />
        </label>
        {!emNomeDe && <SugestoesAjuda texto={`${f.titulo} ${f.titulo} ${f.descricao}`} categoriaId={Number(f.categoria_id) || null} />}

        <label className="campo">
          <span>Descrição <em>*</em></span>
          <textarea rows={5} value={f.descricao} onChange={set('descricao')} maxLength={10000} {...colarArquivos(setArquivos, setErro, (m) => avisar(m))}
            placeholder={agente && emNomeDe ? 'Cole aqui o texto do e-mail ou resuma o pedido.' : catSel?.exige_aprovacao ? 'O que precisa, quantidade e para que vai ser usado.' : 'Conte o que aconteceu, desde quando e se aparece alguma mensagem de erro.'} />
          <small className="dica">Dica: cole prints e arquivos direto aqui com <b>Ctrl+V</b>.</small>
        </label>

        {agente && (
          <label className="check">
            <input type="checkbox" checked={emNomeDe} onChange={(e) => {
              setEmNomeDe(e.target.checked)
              if (!e.target.checked) setF({ ...f, solicitante_email: perfil.email, solicitante_nome: perfil.nome || nomeDeEmail(perfil.email), setor: perfil.setor || '', anydesk: perfil.anydesk || '' })
              else setF({ ...f, solicitante_email: '', solicitante_nome: '', setor: '', anydesk: '' })
            }} />
            Registrar pedido de outra pessoa (recebido por e-mail, telefone, Teams…)
          </label>
        )}

        {agente && emNomeDe && (
          <div className="caixa-registro">
            <div className="grade-2">
              <label className="campo">
                <span>Pedido recebido por</span>
                <select value={reg.origem} onChange={(e) => setReg({ ...reg, origem: e.target.value })}>
                  {Object.entries(ORIGENS).filter(([k]) => k !== 'sistema').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="campo">
                <span>Recebido em</span>
                <input type="datetime-local" value={reg.recebido_em} max={agoraLocal()} onChange={(e) => setReg({ ...reg, recebido_em: e.target.value })} />
                <small className="dica">O prazo de SLA conta a partir daqui.</small>
              </label>
            </div>
            <label className="check">
              <input type="checkbox" checked={reg.avisar} onChange={(e) => setReg({ ...reg, avisar: e.target.checked })} />
              <Mail size={15} /> Avisar o solicitante por e-mail (confirmação, respostas e finalização)
            </label>
            <small className="dica">Aceita e-mails de qualquer domínio. Quem não é @grupozerbini.com.br recebe os avisos sem botão e responde direto pelo e-mail — a resposta chega para o responsável pelo chamado.</small>
          </div>
        )}

        <div className="grade-2">
          <label className="campo">
            <span>Nome <em>*</em></span>
            <input value={f.solicitante_nome} onChange={set('solicitante_nome')} maxLength={120} />
          </label>
          <label className="campo">
            <span>E-mail <em>*</em></span>
            <input type="email" value={f.solicitante_email} onChange={set('solicitante_email')}
              readOnly={!(agente && emNomeDe)} className={!(agente && emNomeDe) ? 'somente-leitura' : ''}
              placeholder={agente && emNomeDe ? 'e-mail de quem fez o pedido' : 'nome.sobrenome@grupozerbini.com.br'} />
          </label>
          <label className="campo">
            <span>{agente && emNomeDe ? 'Setor / empresa' : 'Setor'}</span>
            <input value={f.setor} onChange={set('setor')} maxLength={80} />
          </label>
          <label className="campo">
            <span>AnyDesk</span>
            <input value={f.anydesk} onChange={set('anydesk')} maxLength={40} inputMode="numeric" placeholder="Ex.: 123 456 789" />
            <small className="dica">Ajuda a TI a acessar seu computador remotamente.</small>
          </label>
        </div>

        {meusAtivos.length > 0 && !emNomeDe && (
          <label className="campo">
            <span>Equipamento relacionado</span>
            <select value={f.ativo_id} onChange={set('ativo_id')}>
              <option value="">Nenhum / não se aplica</option>
              {meusAtivos.map((a) => <option key={a.id} value={a.id}>{a.dispositivo}{a.modelo ? ` — ${a.modelo}` : ''}</option>)}
            </select>
          </label>
        )}

        {catSel?.exige_aprovacao && (
          <label className="campo campo-valor">
            <span>Valor estimado (R$)</span>
            <input inputMode="decimal" value={f.valor_estimado} onChange={set('valor_estimado')} placeholder="Ex.: 350,00 — se souber" maxLength={15} />
            <small className="dica">Ajuda na aprovação. Pode deixar em branco.</small>
          </label>
        )}

        <SeletorArquivos arquivos={arquivos} setArquivos={setArquivos} onErro={(m) => setErro(m)} />

        {erro && <div className="alerta alerta-erro">{erro}</div>}

        <div className="rodape-form">
          <button type="button" className="btn btn-perigo" onClick={() => navegar(-1)} disabled={enviando}>Cancelar</button>
          <button className="btn btn-primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar'}</button>
        </div>
      </form>
    </div>
  )
}

// Artigos públicos da base que podem resolver antes de abrir o chamado
function SugestoesAjuda({ texto, categoriaId }) {
  const [artigos, setArtigos] = useState([])
  const [achados, setAchados] = useState([])
  useEffect(() => {
    supabase.from('hd_artigos').select('id,titulo,tags,resumo,conteudo,categoria_id').eq('status', 'publicado').eq('visibilidade', 'publica').limit(1000)
      .then(({ data }) => setArtigos(data || []))
  }, [])
  useEffect(() => {
    if (!artigos.length) return
    const t = setTimeout(() => setAchados(texto.trim().length >= 6 ? buscar(artigos, texto, { categoriaId, minimo: 4 }).slice(0, 3) : []), 350)
    return () => clearTimeout(t)
  }, [texto, categoriaId, artigos])
  if (!achados.length) return null
  return (
    <div className="kb-sugere" role="status">
      <Lightbulb size={18} />
      <div>
        <strong>Isso pode resolver agora</strong>
        <ul>{achados.map((a) => <li key={a.id}><Link to={'/base/' + a.id} target="_blank">{a.titulo}</Link></li>)}</ul>
        <small>Se não resolver, continue abrindo o chamado normalmente.</small>
      </div>
    </div>
  )
}
