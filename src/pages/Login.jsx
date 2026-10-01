import { useState } from 'react'
import { Mail, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { mensagemErro } from '../lib/util'

export default function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem('hd_ultimo_email') || '')
  const [etapa, setEtapa] = useState('email')
  const [codigo, setCodigo] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  async function enviar(e) {
    e?.preventDefault()
    setErro('')
    const limpo = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpo)) { setErro('Digite um e-mail válido.'); return }
    setCarregando(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: limpo,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    })
    setCarregando(false)
    if (error) {
      if (/grupozerbini|Database error saving new user/i.test(error.message)) setErro('Use seu e-mail corporativo @grupozerbini.com.br.')
      else if (/rate limit|security purposes/i.test(error.message)) setErro('Muitas tentativas. Aguarde um minuto e tente de novo.')
      else setErro(mensagemErro(error))
      return
    }
    try { localStorage.setItem('hd_ultimo_email', limpo) } catch { /* ignora */ }
    setEmail(limpo)
    setEtapa('codigo')
  }

  async function verificar(e) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo.trim(), type: 'email' })
    setCarregando(false)
    if (error) setErro('Código inválido ou expirado.')
  }

  return (
    <div className="login">
      <div className="login-lado">
        <div className="login-marca">
          <span className="marca-icone grande" aria-hidden>
            <svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" /></svg>
          </span>
          <div>
            <h1>Zerbini Helpdesk</h1>
            <p>Chamados internos do Grupo Zerbini</p>
          </div>
        </div>
        <p className="login-frase">Abra um chamado para a TI em menos de um minuto e acompanhe cada resposta por aqui.</p>
      </div>

      <div className="login-form">
        {etapa === 'email' ? (
          <form onSubmit={enviar} className="cartao">
            <h2>Entrar</h2>
            <p className="texto-suave">Use seu e-mail corporativo. Enviaremos um link de acesso — sem senha.</p>
            <label className="campo">
              <span>E-mail</span>
              <input type="email" autoFocus autoComplete="email" placeholder="nome.sobrenome@grupozerbini.com.br"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {erro && <div className="alerta alerta-erro">{erro}</div>}
            <button className="btn btn-primario btn-bloco" disabled={carregando}>
              {carregando ? 'Enviando…' : 'Enviar link de acesso'}
            </button>
          </form>
        ) : (
          <form onSubmit={verificar} className="cartao">
            <div className="icone-circulo"><Mail size={22} /></div>
            <h2>Confira seu e-mail</h2>
            <p className="texto-suave">Enviamos um link de acesso para <b>{email}</b>. Abra o e-mail e clique no link — pode fechar esta aba.</p>
            <label className="campo">
              <span>Ou digite o código do e-mail</span>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="000000"
                value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} />
            </label>
            {erro && <div className="alerta alerta-erro">{erro}</div>}
            <button className="btn btn-primario btn-bloco" disabled={carregando || codigo.length < 6}>
              {carregando ? 'Verificando…' : 'Entrar com o código'}
            </button>
            <div className="linha-acoes">
              <button type="button" className="btn-link" onClick={() => { setEtapa('email'); setCodigo(''); setErro('') }}>
                <ArrowLeft size={15} /> Trocar e-mail
              </button>
              <button type="button" className="btn-link" onClick={enviar} disabled={carregando}>Reenviar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
