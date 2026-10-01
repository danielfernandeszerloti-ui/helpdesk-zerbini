import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Inbox, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { codigo, emAndamento, tempoRelativo, nomeDeEmail, previsaoColaborador } from '../lib/util'
import { StatusBadge, Vazio } from '../components/ui'

export default function MeusChamados() {
  const { perfil } = useSessao()
  const [lista, setLista] = useState(null)
  const [aba, setAba] = useState('andamento')

  useEffect(() => {
    let vivo = true
    const carregar = () => supabase.from('hd_chamados')
      .select('id,titulo,status,atualizado_em,criado_em,atribuido_email,lido_solicitante,prazo_sla,etapa_id,categoria:hd_categorias(nome)')
      .eq('solicitante_email', perfil.email).order('atualizado_em', { ascending: false }).limit(500)
      .then(({ data }) => vivo && setLista(data || []))
    carregar()
    const canal = supabase.channel('meus-chamados')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hd_chamados', filter: `solicitante_email=eq.${perfil.email}` }, carregar)
      .subscribe()
    return () => { vivo = false; supabase.removeChannel(canal) }
  }, [perfil.email])

  const andamento = (lista || []).filter(emAndamento)
  const finalizados = (lista || []).filter((c) => !emAndamento(c))
  const visiveis = aba === 'andamento' ? andamento : finalizados
  const primeiroNome = (perfil.nome || nomeDeEmail(perfil.email)).split(' ')[0]

  return (
    <div className="pagina pagina-estreita">
      <div className="cabecalho-pagina">
        <div>
          <h1>Olá, {primeiroNome}</h1>
          <p className="texto-suave">Acompanhe aqui os seus chamados com a TI. <a href="/passo-a-passo.pdf" target="_blank" rel="noopener">Ver o passo a passo</a></p>
        </div>
        <Link to="/novo" className="btn btn-primario"><Plus size={17} /> Novo chamado</Link>
      </div>

      <div className="segmentos" role="tablist">
        <button role="tab" aria-selected={aba === 'andamento'} className={aba === 'andamento' ? 'ativo' : ''} onClick={() => setAba('andamento')}>
          Em andamento <span className="contagem">{andamento.length}</span>
        </button>
        <button role="tab" aria-selected={aba === 'finalizados'} className={aba === 'finalizados' ? 'ativo' : ''} onClick={() => setAba('finalizados')}>
          Finalizados <span className="contagem">{finalizados.length}</span>
        </button>
      </div>

      {lista === null ? <div className="cartao carregando-bloco"><div className="spinner" /></div> : visiveis.length === 0 ? (
        <div className="cartao">
          <Vazio icone={Inbox} titulo={aba === 'andamento' ? 'Nenhum chamado em andamento' : 'Nenhum chamado finalizado'}>
            {aba === 'andamento' && <>Precisa de ajuda? <Link to="/novo">Abra um chamado</Link>.</>}
          </Vazio>
        </div>
      ) : (
        <ul className="lista-cartoes">
          {visiveis.map((c) => (
            <li key={c.id}>
              <Link to={`/chamado/${c.id}`} className={'item-chamado' + (!c.lido_solicitante ? ' nao-lido' : '')}>
                <div className="item-topo">
                  <span className="codigo">{codigo(c.id)}</span>
                  <StatusBadge status={c.status} />
                  {!c.lido_solicitante && <span className="pilula-nova">Nova atualização</span>}
                </div>
                <strong className="item-titulo">{c.titulo}</strong>
                <div className="item-meta">
                  <span>{c.categoria?.nome || 'Sem categoria'}</span>
                  <span>·</span>
                  <span>{c.atribuido_email ? `Com ${nomeDeEmail(c.atribuido_email)}` : 'Aguardando atendimento'}</span>
                  {previsaoColaborador(c) && <><span>·</span><span className={'previsao-col ' + previsaoColaborador(c).tipo}>{previsaoColaborador(c).texto}</span></>}
                  <span>·</span>
                  <span>Atualizado {tempoRelativo(c.atualizado_em)}</span>
                </div>
                <ChevronRight className="item-seta" size={18} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
