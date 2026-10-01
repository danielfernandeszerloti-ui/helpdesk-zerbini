import { useEffect, useRef, useState } from 'react'

// Cores validadas (CVD/contraste) para as duas séries do dashboard
export const COR_ABERTOS = '#2f42c4'
export const COR_CONCLUIDOS = '#0e9a95'

function usarLargura() {
  const ref = useRef(null)
  const [largura, setLargura] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setLargura(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, largura]
}

function passoBonito(max, n = 4) {
  if (max <= 0) return 1
  const bruto = max / n
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const f = bruto / mag
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag
}

// Linhas no tempo com crosshair + tooltip. series: [{nome, cor, valores:[n]}], rotulos: [texto do eixo X]
export function LinhasTempo({ rotulos, series, altura = 240, titulos }) {
  const [ref, largura] = usarLargura()
  const [foco, setFoco] = useState(null)
  const m = { t: 16, r: 44, b: 28, l: 34 }
  const w = largura - m.l - m.r
  const h = altura - m.t - m.b
  const maxV = Math.max(1, ...series.flatMap((s) => s.valores))
  const passo = passoBonito(maxV)
  const topo = Math.ceil(maxV / passo) * passo
  const n = rotulos.length
  const x = (i) => m.l + (n <= 1 ? w / 2 : (i * w) / (n - 1))
  const y = (v) => m.t + h - (v / topo) * h
  const ticks = []
  for (let v = 0; v <= topo + 1e-9; v += passo) ticks.push(v)
  const cadaX = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 70))))

  function mover(e) {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    const i = n <= 1 ? 0 : Math.round(((px - m.l) / w) * (n - 1))
    setFoco(Math.min(n - 1, Math.max(0, i)))
  }

  return (
    <div className="grafico" ref={ref}>
      <div className="legenda">
        {series.map((s) => <span key={s.nome}><i className="chave-linha" style={{ background: s.cor }} />{s.nome}</span>)}
      </div>
      <div className="grafico-area" onPointerMove={mover} onPointerLeave={() => setFoco(null)}
        tabIndex={0} role="img" aria-label={`Gráfico: ${series.map((s) => s.nome).join(' e ')} por período`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setFoco((f) => Math.min(n - 1, (f ?? -1) + 1))
          if (e.key === 'ArrowLeft') setFoco((f) => Math.max(0, (f ?? n) - 1))
        }} onBlur={() => setFoco(null)}>
        <svg width={largura} height={altura}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={m.l + w} y1={y(v)} y2={y(v)} className="grade" />
              <text x={m.l - 8} y={y(v)} className="eixo" textAnchor="end" dominantBaseline="middle">{v.toLocaleString('pt-BR')}</text>
            </g>
          ))}
          {rotulos.map((r, i) => ((i % cadaX === 0 && n - 1 - i >= Math.ceil(cadaX / 2)) || i === n - 1) && (
            <text key={i} x={x(i)} y={altura - 8} className="eixo" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{r}</text>
          ))}
          {foco != null && <line x1={x(foco)} x2={x(foco)} y1={m.t} y2={m.t + h} className="crosshair" />}
          {series.map((s) => (
            <g key={s.nome}>
              <path d={`M${s.valores.map((v, i) => `${x(i)},${y(v)}`).join('L')}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={s.cor} opacity="0.08" />
              <polyline points={s.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(n - 1)} cy={y(s.valores[n - 1] || 0)} r="4" fill={s.cor} stroke="#fff" strokeWidth="2" />
              {foco != null && <circle cx={x(foco)} cy={y(s.valores[foco] || 0)} r="5" fill={s.cor} stroke="#fff" strokeWidth="2" />}
            </g>
          ))}
        </svg>
        {foco != null && (
          <div className="dica-grafico" style={{ left: Math.min(x(foco) + 12, largura - 170), top: 8 }}>
            <div className="dica-titulo">{(titulos || rotulos)[foco]}</div>
            {series.map((s) => (
              <div key={s.nome} className="dica-linha"><i className="chave-linha" style={{ background: s.cor }} /><b>{s.valores[foco]}</b><span>{s.nome}</span></div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Barras horizontais simples (uma série). itens: [{rotulo, valor, detalhe?}]
export function BarrasH({ itens, cor = COR_ABERTOS, vazio = 'Sem dados no período', formatar = (v) => v.toLocaleString('pt-BR') }) {
  if (!itens.length) return <p className="texto-suave vazio-grafico">{vazio}</p>
  const max = Math.max(1, ...itens.map((i) => i.valor))
  return (
    <ul className="barras-h">
      {itens.map((i) => (
        <li key={i.rotulo} tabIndex={0} title={`${i.rotulo}: ${formatar(i.valor)}${i.detalhe ? ' · ' + i.detalhe : ''}`}>
          <span className="bh-rotulo">{i.rotulo}</span>
          <span className="bh-trilho">{i.valor > 0 && <span style={{ width: `${(i.valor / max) * 100}%`, background: cor }} />}</span>
          <span className="bh-valor">{formatar(i.valor)}</span>
        </li>
      ))}
    </ul>
  )
}
