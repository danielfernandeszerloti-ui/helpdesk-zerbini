import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)
export const useSessao = () => useContext(Ctx)

export function SessaoProvider({ children }) {
  const [sessao, setSessao] = useState(undefined) // undefined = carregando
  const [perfil, setPerfil] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [etapas, setEtapas] = useState([])
  const [equipe, setEquipe] = useState([]) // [{email, papel, nome, ativo}]
  const [toast, setToast] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const carregarCategorias = useCallback(async () => {
    const { data } = await supabase.from('hd_categorias').select('*').order('ordem').order('nome')
    setCategorias(data || [])
  }, [])

  const carregarEtapas = useCallback(async () => {
    const { data } = await supabase.from('hd_etapas').select('*').order('ordem').order('id')
    setEtapas(data || [])
  }, [])

  const carregarEquipe = useCallback(async () => {
    const { data } = await supabase.rpc('hd_equipe_detalhe')
    setEquipe(data || [])
  }, [])

  const email = sessao?.user?.email
  useEffect(() => {
    if (!email) { setPerfil(null); return }
    let ativo = true
    ;(async () => {
      const { data, error } = await supabase.rpc('hd_meu_perfil')
      if (!ativo) return
      if (error) { setPerfil({ erro: error.message }); return }
      setPerfil(data)
      carregarCategorias()
      carregarEtapas()
      if (data.eh_agente || data.eh_dev) carregarEquipe()
    })()
    return () => { ativo = false }
  }, [email, carregarCategorias, carregarEtapas, carregarEquipe])

  const avisar = useCallback((texto, tipo = 'ok') => {
    setToast({ texto, tipo, id: Date.now() })
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 3800 ? null : t)), 4000)
  }, [])

  const sair = () => supabase.auth.signOut()

  // e-mails de quem pode ser responsável: TI para qualquer chamado; dev só nos de Kanban
  const responsaveis = (kanban) => equipe.filter((m) => m.ativo && m.atende && (m.papel !== 'dev' || kanban)).map((m) => m.email)
  const agentes = equipe.filter((m) => m.ativo).map((m) => m.email)

  return (
    <Ctx.Provider value={{
      sessao, perfil, categorias, carregarCategorias, etapas, carregarEtapas,
      equipe, carregarEquipe, agentes, responsaveis, avisar, sair,
    }}>
      {children}
      {toast && <div className={`toast toast-${toast.tipo}`} role="status">{toast.texto}</div>}
    </Ctx.Provider>
  )
}
