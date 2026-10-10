import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Link2, X, Plus, Search, Globe, Lock, CornerDownLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { mensagemErro } from '../lib/util'
import { buscar, sugerirParaChamado, TIPOS_ARTIGO } from '../lib/base'

// Cartão lateral do chamado (equipe): artigos vinculados, sugestões e criação a partir do chamado
export default function BaseNoChamado({ chamado, onInserir, avisar }) {
  const [artigos, setArtigos] = useState(null)
  const [vinculados, setVinculados] = useState([])
  const [busca, setBusca] = useState('')
  const [buscando, setBuscando] = useState(false)

  const carregar = useCallback(async () => {
    const [a, v] = await Promise.all([
      supabase.from('hd_artigos').select('id,titulo,tipo,tags,resumo,conteudo,categoria_id,status,visibilidade').neq('status', 'arquivado').limit(2000),
      supabase.from('hd_artigo_chamados').select('artigo_id').eq('chamado_id', chamado.id),
    ])
    setArtigos(a.data || [])
    setVinculados((v.data || []).map((x) => x.artigo_id))
  }, [chamado.id])
  useEffect(() => { carregar() }, [carregar])

  const lista = artigos || []
  const meus = lista.filter((a) => vinculados.includes(a.id))
  const sugestoes = useMemo(() => sugerirParaChamado(lista, chamado, 3, vinculados), [lista, chamado, vinculados])
  const resultados = useMemo(() => (busca.trim().length >= 2 ? buscar(lista.filter((a) => !vinculados.includes(a.id)), busca).slice(0, 6) : []), [lista, busca, vinculados])

  async function vincular(a) {
    const { error } = await supabase.from('hd_artigo_chamados').insert({ artigo_id: a.id, chamado_id: chamado.id })
    if (error && !/duplicate/.test(error.message)) return avisar(mensagemErro(error), 'erro')
    setBusca(''); setBuscando(false)
    setVinculados((v) => [...new Set([...v, a.id])])
  }
  async function desvincular(a) {
    const { error } = await supabase.from('hd_artigo_chamados').delete().eq('artigo_id', a.id).eq('chamado_id', chamado.id)
    if (error) return avisar(mensagemErro(error), 'erro')
    setVinculados((v) => v.filter((x) => x !== a.id))
  }
  function enviarAoSolicitante(a) {
    onInserir?.(`Segue o passo a passo: ${a.titulo}\n${window.location.origin}/base/${a.id}`)
    avisar('Link do artigo colocado na resposta')
  }

  const Item = ({ a, vinculado }) => (
    <li className="kb-mini">
      <Link to={'/base/' + a.id} target="_blank" title={TIPOS_ARTIGO[a.tipo]?.rotulo}>
        {a.visibilidade === 'publica' ? <Globe size={13} /> : <Lock size={13} />} {a.titulo}
        {a.status === 'rascunho' && <small> (rascunho)</small>}
      </Link>
      <span className="kb-mini-acoes">
        {vinculado && a.visibilidade === 'publica' && a.status === 'publicado' && onInserir && (
          <button className="btn-icone" onClick={() => enviarAoSolicitante(a)} title="Colocar o link na resposta ao solicitante" aria-label="Enviar ao solicitante"><CornerDownLeft size={14} /></button>
        )}
        {vinculado
          ? <button className="btn-icone" onClick={() => desvincular(a)} title="Desvincular" aria-label="Desvincular"><X size={14} /></button>
          : <button className="btn-link" onClick={() => vincular(a)}><Link2 size={13} /> Vincular</button>}
      </span>
    </li>
  )

  return (
    <div className="cartao painel-lateral kb-no-chamado">
      <h3 className="rotulo-linha"><BookOpen size={15} /> Base de conhecimento {meus.length > 0 && <small>{meus.length}</small>}</h3>
      {artigos === null ? <p className="texto-suave">Carregando…</p> : (
        <>
          {meus.length > 0 && <ul className="kb-minis">{meus.map((a) => <Item key={a.id} a={a} vinculado />)}</ul>}
          {sugestoes.length > 0 && (
            <>
              <p className="kb-sub">{meus.length ? 'Outros que podem ajudar' : 'Podem ajudar neste chamado'}</p>
              <ul className="kb-minis">{sugestoes.map((a) => <Item key={a.id} a={a} />)}</ul>
            </>
          )}
          {buscando ? (
            <div className="kb-busca-mini">
              <div className="kb-busca-campo">
                <Search size={14} />
                <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar artigo…" aria-label="Buscar artigo"
                  onKeyDown={(e) => { if (e.key === 'Escape') { setBuscando(false); setBusca('') } }} />
                <button className="btn-icone" onClick={() => { setBuscando(false); setBusca('') }} aria-label="Fechar busca"><X size={14} /></button>
              </div>
              {busca.trim().length >= 2 && (resultados.length
                ? <ul className="kb-minis">{resultados.map((a) => <Item key={a.id} a={a} />)}</ul>
                : <p className="texto-suave">Nada encontrado.</p>)}
            </div>
          ) : (
            <div className="kb-no-chamado-acoes">
              {lista.length > 0 && <button className="btn-link" onClick={() => setBuscando(true)}><Search size={13} /> Buscar e vincular</button>}
              <Link className="btn-link" to={`/base/novo?chamado=${chamado.id}`}><Plus size={13} /> Criar artigo deste chamado</Link>
            </div>
          )}
          {chamado.status === 'resolvido' && !meus.length && (
            <p className="dica">Resolveu algo que pode se repetir? Registre a solução para a próxima vez.</p>
          )}
        </>
      )}
    </div>
  )
}
