import { useEffect, useState } from 'react'

const CHAVE = 'hd_tema'
function lerSalvo() { try { return localStorage.getItem(CHAVE) } catch { return null } }
function sistemaEscuro() { return window.matchMedia?.('(prefers-color-scheme: dark)').matches }

export function temaInicial() { return lerSalvo() || (sistemaEscuro() ? 'escuro' : 'claro') }

export function aplicarTema(t) {
  document.documentElement.dataset.tema = t
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'escuro' ? '#0f1320' : '#0f2c66')
}

export function useTema() {
  const [tema, setTema] = useState(temaInicial)
  useEffect(() => { aplicarTema(tema) }, [tema])
  useEffect(() => {
    // segue o sistema enquanto a pessoa não escolher
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const f = (e) => { if (!lerSalvo()) setTema(e.matches ? 'escuro' : 'claro') }
    mq?.addEventListener?.('change', f)
    return () => mq?.removeEventListener?.('change', f)
  }, [])
  const alternar = () => setTema((t) => {
    const novo = t === 'escuro' ? 'claro' : 'escuro'
    try { localStorage.setItem(CHAVE, novo) } catch { /* sem armazenamento */ }
    return novo
  })
  return [tema, alternar]
}
