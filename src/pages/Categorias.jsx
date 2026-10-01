import { useState } from 'react'
import { Plus, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { mensagemErro } from '../lib/util'

function Linha({ cat, onSalvo }) {
  const { avisar } = useSessao()
  const [f, setF] = useState({ nome: cat.nome, sla_horas: cat.sla_horas ?? '', ordem: cat.ordem, ativa: cat.ativa })
  const mudou = f.nome !== cat.nome || String(f.sla_horas) !== String(cat.sla_horas ?? '') || Number(f.ordem) !== cat.ordem || f.ativa !== cat.ativa

  async function salvar(campos = f) {
    const { error } = await supabase.from('hd_categorias').update({
      nome: campos.nome.trim(), sla_horas: campos.sla_horas === '' ? null : Number(campos.sla_horas),
      ordem: Number(campos.ordem) || 0, ativa: campos.ativa,
    }).eq('id', cat.id)
    if (error) return avisar(mensagemErro(error), 'erro')
    avisar('Categoria salva')
    onSalvo()
  }

  return (
    <tr className={f.ativa ? '' : 'inativa'}>
      <td><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} maxLength={80} aria-label="Nome" /></td>
      <td><input type="number" min="1" placeholder="Sem SLA" value={f.sla_horas} onChange={(e) => setF({ ...f, sla_horas: e.target.value })} aria-label="SLA em horas" /></td>
      <td><input type="number" value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} aria-label="Ordem" className="curto" /></td>
      <td>
        <label className="interruptor">
          <input type="checkbox" checked={f.ativa} onChange={(e) => { const n = { ...f, ativa: e.target.checked }; setF(n); salvar(n) }} />
          <span>{f.ativa ? 'Ativa' : 'Inativa'}</span>
        </label>
      </td>
      <td>{mudou && <button className="btn btn-primario btn-p" onClick={() => salvar()}><Save size={14} /> Salvar</button>}</td>
    </tr>
  )
}

export default function Categorias() {
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
    <div className="pagina pagina-estreita">
      <div className="cabecalho-pagina">
        <div>
          <h1>Categorias</h1>
          <p className="texto-suave">O SLA (em horas) define o prazo automático dos novos chamados. Categorias inativas somem do formulário.</p>
        </div>
      </div>

      <form className="cartao nova-categoria" onSubmit={criar}>
        <input placeholder="Nova categoria" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} maxLength={80} />
        <input type="number" min="1" placeholder="SLA (horas)" value={nova.sla_horas} onChange={(e) => setNova({ ...nova, sla_horas: e.target.value })} />
        <button className="btn btn-primario" disabled={nova.nome.trim().length < 2}><Plus size={16} /> Adicionar</button>
      </form>

      <div className="cartao tabela-cartao">
        <div className="tabela-rolagem">
          <table className="tabela tabela-edicao">
            <thead><tr><th>Nome</th><th>SLA (horas)</th><th>Ordem</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {categorias.map((c) => <Linha key={c.id + ':' + c.nome + ':' + c.sla_horas + ':' + c.ordem + ':' + c.ativa} cat={c} onSalvo={carregarCategorias} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
