// Alertas da equipe: som + notificação do sistema + contador no título da aba
// quando chega chamado novo ou o solicitante responde.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { codigo } from './util'

const CHAVE = 'hd_alertas'
const TITULO = 'Zerbini Helpdesk'

function lerPref() {
  try { return localStorage.getItem(CHAVE) !== 'off' } catch { return true }
}

let ctx
function tocar(tipo) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    // chamado novo: três notas subindo; resposta: duas notas curtas
    const notas = tipo === 'novo' ? [[659, 0], [880, 0.13], [1175, 0.26]] : [[784, 0], [988, 0.11]]
    const t0 = ctx.currentTime + 0.02
    for (const [freq, atraso] of notas) {
      const osc = ctx.createOscillator()
      const ganho = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      ganho.gain.setValueAtTime(0.0001, t0 + atraso)
      ganho.gain.exponentialRampToValueAtTime(0.22, t0 + atraso + 0.015)
      ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + atraso + (tipo === 'novo' ? 0.42 : 0.3))
      osc.connect(ganho).connect(ctx.destination)
      osc.start(t0 + atraso)
      osc.stop(t0 + atraso + 0.5)
    }
  } catch { /* navegador sem áudio */ }
}

// várias abas abertas: só uma toca/notifica
function primeiraAba(chave) {
  try {
    const k = 'hd_alerta:' + chave
    if (localStorage.getItem(k)) return false
    localStorage.setItem(k, String(Date.now()))
    // limpeza das marcas antigas
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const kk = localStorage.key(i)
      if (kk?.startsWith('hd_alerta:') && Date.now() - Number(localStorage.getItem(kk)) > 6e5) localStorage.removeItem(kk)
    }
    return true
  } catch { return true }
}

export function useAlertas(perfil) {
  const [ligado, setLigado] = useState(lerPref)
  const [pendentes, setPendentes] = useState(0)
  const navegar = useNavigate()
  const ligadoRef = useRef(ligado)
  ligadoRef.current = ligado
  const equipe = perfil.eh_agente || perfil.eh_dev

  const alertar = useCallback((tipo, chamado, texto) => {
    if (!ligadoRef.current) return
    if (document.hidden) setPendentes((n) => n + 1)
    if (!primeiraAba(tipo + ':' + chamado.id + ':' + (texto || ''))) return
    tocar(tipo)
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      const n = new Notification(tipo === 'novo' ? `Novo chamado ${codigo(chamado.id)}` : `Resposta no chamado ${codigo(chamado.id)}`, {
        body: `${chamado.solicitante_nome || chamado.solicitante_email || ''}: ${chamado.titulo}`,
        icon: '/favicon-32.png', tag: tipo + chamado.id,
      })
      n.onclick = () => { window.focus(); navegar(`/chamado/${chamado.id}`); n.close() }
    }
  }, [navegar])

  useEffect(() => {
    if (!equipe) return
    const canal = supabase.channel('alertas-' + perfil.email)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hd_chamados' }, ({ new: c }) => {
        if (!c || c.solicitante_email === perfil.email || c.registrado_por === perfil.email) return
        alertar('novo', c)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hd_mensagens' }, async ({ new: m }) => {
        if (!m || m.tipo !== 'mensagem' || m.interna || m.registrado_por || m.autor_email === perfil.email) return
        const { data: c } = await supabase.from('hd_chamados').select('id,titulo,solicitante_email,solicitante_nome,atribuido_email').eq('id', m.chamado_id).maybeSingle()
        if (!c || m.autor_email !== c.solicitante_email) return
        if (c.atribuido_email && c.atribuido_email !== perfil.email) return
        alertar('resposta', c, String(m.id))
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [equipe, perfil.email, alertar])

  // contador no título enquanto a aba está em segundo plano
  useEffect(() => {
    document.title = pendentes ? `(${pendentes}) ${TITULO}` : TITULO
  }, [pendentes])
  useEffect(() => {
    const ver = () => { if (!document.hidden) setPendentes(0) }
    document.addEventListener('visibilitychange', ver)
    return () => document.removeEventListener('visibilitychange', ver)
  }, [])

  const alternar = useCallback(() => {
    // ligado mas sem permissão de notificação do Windows: o 1º clique só pede a permissão
    if (ligadoRef.current && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
      tocar('novo')
      return true
    }
    const novo = !ligadoRef.current
    setLigado(novo)
    try { localStorage.setItem(CHAVE, novo ? 'on' : 'off') } catch { /* ignora */ }
    if (novo) {
      tocar('novo') // o clique libera o áudio no navegador e serve de amostra
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
    }
    return novo
  }, [])

  // o navegador só libera áudio depois de um clique na página
  useEffect(() => {
    const destravar = () => { try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); ctx.resume() } catch { /* */ } }
    window.addEventListener('pointerdown', destravar, { once: true })
    window.addEventListener('keydown', destravar, { once: true })
    return () => { window.removeEventListener('pointerdown', destravar); window.removeEventListener('keydown', destravar) }
  }, [])

  const semPermissao = 'Notification' in window && Notification.permission === 'default'
  return { equipe, ligado, alternar, semPermissao }
}
