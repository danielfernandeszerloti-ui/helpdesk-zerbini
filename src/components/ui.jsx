import { useRef, useState } from 'react'
import { Paperclip, Upload, X, FileText } from 'lucide-react'
import { STATUS, PRIORIDADE, TIPOS, iniciais, tamanhoLegivel, LIMITE_ARQUIVO, situacaoSla, dataHora } from '../lib/util'

export function Avatar({ nome, pequeno }) {
  return <span className={'avatar' + (pequeno ? ' avatar-p' : '')} aria-hidden>{iniciais(nome)}</span>
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || { rotulo: status, cor: 'cinza' }
  return <span className={`badge badge-${s.cor}`}>{s.rotulo}</span>
}

export function PrioridadeBadge({ prioridade }) {
  const p = PRIORIDADE[prioridade] || { rotulo: prioridade, cor: 'cinza' }
  return <span className={`prio prio-${p.cor}`}><i />{p.rotulo}</span>
}

export function TipoBadge({ tipo }) {
  if (!TIPOS[tipo]) return null
  return <span className={`tipo tipo-${tipo}`} title={TIPOS[tipo].desc}>{TIPOS[tipo].rotulo}</span>
}

export function SlaTexto({ chamado }) {
  if (chamado.aprovacao === 'pendente' && !['resolvido', 'cancelado'].includes(chamado.status)) return <span className="sla sla-aprovacao">Aguardando aprovação</span>
  const s = situacaoSla(chamado)
  if (s === 'sem') return <span className="texto-suave">Sem SLA</span>
  if (s === 'pausado') return <span className="sla sla-pausado" title={`Prazo: ${dataHora(chamado.prazo_sla)}`}>Pausado<small className="sub">aguardando colaborador</small></span>
  if (s === 'atrasado') return <span className="sla sla-atrasado">Atrasado<small className="sub">{dataHora(chamado.prazo_sla)}</small></span>
  if (s === 'hoje') return <span className="sla sla-hoje">Hoje · {dataHora(chamado.prazo_sla).slice(11)}</span>
  return <span>{dataHora(chamado.prazo_sla)}</span>
}

// Área de anexos "clique ou arraste", como no Auvodesk
export function SeletorArquivos({ arquivos, setArquivos, compacto, onErro }) {
  const input = useRef(null)
  const [arrastando, setArrastando] = useState(false)

  const adicionar = (lista) => {
    const novos = []
    for (const f of lista) {
      if (f.size > LIMITE_ARQUIVO && !f.type.startsWith('image/')) { onErro?.(`"${f.name}" passa de 10 MB`); continue }
      novos.push(f)
    }
    setArquivos([...arquivos, ...novos].slice(0, 10))
  }

  return (
    <div className={compacto ? 'seletor-compacto' : undefined}>
      {compacto ? (
        <button type="button" className="btn btn-leve" onClick={() => input.current.click()}>
          <Paperclip size={16} /> Anexar
        </button>
      ) : (
        <div
          className={'dropzone' + (arrastando ? ' ativo' : '')}
          onClick={() => input.current.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); adicionar(e.dataTransfer.files) }}
          role="button" tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
        >
          <Upload size={26} />
          <span>Clique ou arraste arquivos</span>
          <small>Prints, fotos, PDFs · até 10 MB cada</small>
        </div>
      )}
      <input ref={input} type="file" multiple hidden onChange={(e) => { adicionar(e.target.files); e.target.value = '' }} />
      {arquivos.length > 0 && (
        <ul className="lista-arquivos">
          {arquivos.map((f, i) => (
            <li key={i}>
              <FileText size={15} />
              <span className="nome-arquivo">{f.name}</span>
              <small>{tamanhoLegivel(f.size)}</small>
              <button type="button" className="btn-icone" aria-label="Remover" onClick={() => setArquivos(arquivos.filter((_, j) => j !== i))}><X size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function Vazio({ icone: Icone, titulo, children }) {
  return (
    <div className="vazio">
      {Icone && <Icone size={34} strokeWidth={1.5} />}
      <strong>{titulo}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}
