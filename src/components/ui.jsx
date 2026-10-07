import { useEffect, useRef, useState } from 'react'
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

  const adicionar = (lista) => adicionarArquivos(lista, setArquivos, onErro)

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
              <MiniaturaArquivo arquivo={f} />
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

// valida e junta arquivos à lista (máx. 10)
export function adicionarArquivos(lista, setArquivos, onErro) {
  const novos = []
  for (const f of lista) {
    if (f.size > LIMITE_ARQUIVO && !f.type.startsWith('image/')) { onErro?.(`"${f.name}" passa de 10 MB`); continue }
    novos.push(f)
  }
  if (novos.length) setArquivos((atuais) => [...atuais, ...novos].slice(0, 10))
  return novos.length
}

// Ctrl+V / arrastar no campo de texto: prints e arquivos viram anexo.
// Se a área de transferência também tiver texto (ex.: células do Excel), o texto tem prioridade.
export function arquivosDoEvento(e, tipo = 'colar') {
  const dt = tipo === 'colar' ? e.clipboardData : e.dataTransfer
  if (!dt) return []
  let arquivos = [...(dt.files || [])]
  if (!arquivos.length && dt.items) arquivos = [...dt.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean)
  if (!arquivos.length) return []
  if (tipo === 'colar' && (dt.getData('text/plain') || '').trim()) return []
  e.preventDefault()
  const agora = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const carimbo = `${agora.getFullYear()}${p(agora.getMonth() + 1)}${p(agora.getDate())}-${p(agora.getHours())}${p(agora.getMinutes())}${p(agora.getSeconds())}`
  return arquivos.map((f, i) => {
    if (f.type.startsWith('image/') && (!f.name || /^image\.(png|jpe?g|gif|bmp|webp)$/i.test(f.name))) {
      const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
      return new File([f], `print-${carimbo}${arquivos.length > 1 ? '-' + (i + 1) : ''}.${ext}`, { type: f.type })
    }
    return f
  })
}

// handlers prontos para um <textarea>
export function colarArquivos(setArquivos, onErro, onOk) {
  const tratar = (tipo) => (e) => {
    const fs = arquivosDoEvento(e, tipo)
    if (fs.length && adicionarArquivos(fs, setArquivos, onErro)) onOk?.(fs.length === 1 ? `"${fs[0].name}" anexado` : `${fs.length} arquivos anexados`)
  }
  return { onPaste: tratar('colar'), onDrop: tratar('soltar') }
}

function MiniaturaArquivo({ arquivo }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!arquivo.type?.startsWith('image/')) return
    const u = URL.createObjectURL(arquivo)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [arquivo])
  return url ? <img src={url} alt="" className="miniatura-arquivo" /> : <FileText size={15} />
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

// Texto do chamado/mensagem: trechos colados do Excel (colunas separadas por TAB) viram tabela
function separarBlocos(texto) {
  const linhas = String(texto || '').replace(/\r\n?/g, '\n').split('\n')
  const blocos = []
  let i = 0
  while (i < linhas.length) {
    if (linhas[i].includes('\t')) {
      const ini = i
      while (i < linhas.length && linhas[i].includes('\t')) i++
      const grupo = linhas.slice(ini, i)
      // 1 linha só vira tabela se tiver pelo menos 3 colunas
      if (grupo.length >= 2 || grupo[0].split('\t').length >= 3) { blocos.push({ tabela: grupo.map((l) => l.split('\t').map((c) => c.trim())) }); continue }
      blocos.push({ texto: grupo.join('\n') })
      continue
    }
    const ini = i
    while (i < linhas.length && !linhas[i].includes('\t')) i++
    blocos.push({ texto: linhas.slice(ini, i).join('\n') })
  }
  return blocos
}

export function TextoChamado({ texto, className = 'corpo' }) {
  const blocos = separarBlocos(texto)
  if (!blocos.some((b) => b.tabela)) return <div className={className}>{texto}</div>
  return (
    <div className={className}>
      {blocos.map((b, i) => b.tabela ? (
        <div key={i} className="tabela-colada">
          <table>
            <tbody>
              {b.tabela.map((linha, j) => {
                const cols = Math.max(...b.tabela.map((l) => l.length))
                return (
                  <tr key={j}>
                    {Array.from({ length: cols }, (_, k) => <td key={k}>{linha[k] ?? ''}</td>)}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        b.texto.replace(/^\n+|\n+$/g, '') && <div key={i} className="texto-bloco">{b.texto.replace(/^\n+|\n+$/g, '')}</div>
      ))}
    </div>
  )
}
