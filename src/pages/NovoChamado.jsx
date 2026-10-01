import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { enviarAnexos, mensagemErro, nomeDeEmail, EXPEDIENTE } from '../lib/util'
import { SeletorArquivos } from '../components/ui'

export default function NovoChamado() {
  const { perfil, categorias, avisar } = useSessao()
  const navegar = useNavigate()
  const agente = perfil.eh_agente
  const [meusAtivos, setMeusAtivos] = useState([])
  const [arquivos, setArquivos] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [emNomeDe, setEmNomeDe] = useState(false)
  const [f, setF] = useState({
    categoria_id: '', titulo: '', descricao: '',
    solicitante_nome: perfil.nome || nomeDeEmail(perfil.email),
    solicitante_email: perfil.email, setor: perfil.setor || '', anydesk: perfil.anydesk || '', ativo_id: '',
  })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const [params] = useSearchParams()
  useEffect(() => {
    if (params.get('kanban') && !f.categoria_id) {
      const k = categorias.find((c) => c.kanban && c.ativa)
      if (k) setF((v) => ({ ...v, categoria_id: String(k.id) }))
    }
  }, [categorias]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.rpc('hd_meus_ativos').then(({ data }) => setMeusAtivos(data || []))
  }, [])

  async function enviar(e) {
    e.preventDefault()
    setErro('')
    if (!f.categoria_id) return setErro('Escolha a categoria do chamado.')
    if (f.titulo.trim().length < 3) return setErro('Escreva um título (mínimo 3 letras).')
    if (f.descricao.trim().length < 3) return setErro('Descreva o problema ou a solicitação.')
    if (!f.solicitante_nome.trim()) return setErro('Informe o nome.')
    setEnviando(true)
    try {
      const registro = {
        categoria_id: Number(f.categoria_id), titulo: f.titulo, descricao: f.descricao,
        solicitante_nome: f.solicitante_nome.trim(), setor: f.setor.trim(), anydesk: f.anydesk.trim(),
        ativo_id: f.ativo_id || null,
      }
      if (agente && emNomeDe) registro.solicitante_email = f.solicitante_email.trim().toLowerCase()
      const { data, error } = await supabase.from('hd_chamados').insert(registro).select('id').single()
      if (error) throw error
      if (arquivos.length) {
        try { await enviarAnexos(data.id, arquivos) } catch (err) { avisar('Chamado aberto, mas um anexo falhou: ' + mensagemErro(err), 'erro') }
      }
      avisar('Chamado aberto! A TI já foi avisada.')
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
            return <small className="dica">Prazo de atendimento desta categoria: até {h} {h === 1 ? 'hora útil' : 'horas úteis'} ({EXPEDIENTE}).</small>
          })()}
        </label>

        <label className="campo">
          <span>Título <em>*</em></span>
          <input value={f.titulo} onChange={set('titulo')} maxLength={200} placeholder="Ex.: Impressora do estoque não imprime etiquetas" />
        </label>

        <label className="campo">
          <span>Descrição <em>*</em></span>
          <textarea rows={5} value={f.descricao} onChange={set('descricao')} maxLength={10000}
            placeholder="Conte o que aconteceu, desde quando e se aparece alguma mensagem de erro." />
        </label>

        {agente && (
          <label className="check">
            <input type="checkbox" checked={emNomeDe} onChange={(e) => {
              setEmNomeDe(e.target.checked)
              if (!e.target.checked) setF({ ...f, solicitante_email: perfil.email, solicitante_nome: perfil.nome || nomeDeEmail(perfil.email) })
              else setF({ ...f, solicitante_email: '', solicitante_nome: '', setor: '', anydesk: '' })
            }} />
            Abrir em nome de outro colaborador
          </label>
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
              placeholder="nome.sobrenome@grupozerbini.com.br" />
          </label>
          <label className="campo">
            <span>Setor</span>
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
