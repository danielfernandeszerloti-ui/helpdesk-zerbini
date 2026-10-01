import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)
export const useSessao = () => useContext(Ctx)

export function SessaoProvider({ children }) {
  const [sessao, setSessao] = useState(undefined) // undefined = carregando
  const [perfil, setPerfil] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [agentes, setAgentes] = useState([])
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
      if (data.eh_agente) {
        const m = await supabase.from('membros').select('email,papel').in('papel', ['admin', 'editor']).order('email')
        if (ativo) setAgentes((m.data || []).map((x) => x.email.toLowerCase()))
      }
    })()
    return () => { ativo = false }
  }, [email, carregarCategorias])

  const avisar = useCallback((texto, tipo = 'ok') => {
    setToast({ texto, tipo, id: Date.now() })
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 3800 ? null : t)), 4000)
  }, [])

  const sair = () => supabase.auth.signOut()

  return (
    <Ctx.Provider value={{ sessao, perfil, categorias, carregarCategorias, agentes, avisar, sair }}>
      {children}
      {toast && <div className={`toast toast-${toast.tipo}`} role="status">{toast.texto}</div>}
    </Ctx.Provider>
  )
}
