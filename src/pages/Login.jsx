import { useState } from 'react'
import { Mail, ArrowLeft, Moon, Sun, CircleHelp, KeyRound, Eye, EyeOff } from 'lucide-react'
import { useTema } from '../lib/tema'
import { supabase } from '../lib/supabase'
import { mensagemErro } from '../lib/util'

export default function Login() {
  const [tema, alternarTema] = useTema()
  const [email, setEmail] = useState(() => localStorage.getItem('hd_ultimo_email') || '')
  const [etapa, setEtapa] = useState('email')
  const [codigo, setCodigo] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [senha, setSenha] = useState('')
  const [verSenha, setVerSenha] = useState(false)

  // trava local após várias tentativas erradas (além do limite do servidor)
  const chaveTent = (em) => 'hd_tent_' + em
  function bloqueadoAte(em) {
    try { const t = JSON.parse(localStorage.getItem(chaveTent(em)) || '{}'); return t.ate && t.ate > Date.now() ? t.ate : 0 } catch { return 0 }
  }
  function registrarFalha(em) {
    try {
      const t = JSON.parse(localStorage.getItem(chaveTent(em)) || '{}')
      const recentes = (t.falhas || []).filter((x) => Date.now() - x < 15 * 60e3).concat(Date.now())
      localStorage.setItem(chaveTent(em), JSON.stringify({ falhas: recentes, ate: recentes.length >= 5 ? Date.now() + 5 * 60e3 : 0 }))
      return recentes.length
    } catch { return 0 }
  }

  async function entrarComSenha(e) {
    e.preventDefault()
    setErro('')
    const limpo = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(limpo)) { setErro('Digite um e-mail válido.'); return }
    if (!senha) { setErro('Digite sua senha.'); return }
    const ate = bloqueadoAte(limpo)
    if (ate) { setErro(`Muitas tentativas. Tente de novo em ${Math.ceil((ate - Date.now()) / 60000)} min ou entre com o código por e-mail.`); return }
    setCarregando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: limpo, password: senha })
    setCarregando(false)
    if (error) {
      const n = /rate limit|too many/i.test(error.message) ? 5 : registrarFalha(limpo)
      setSenha('')
      setErro(n >= 5 ? 'Muitas tentativas erradas. Aguarde 5 minutos ou entre com o código por e-mail.'
        : 'E-mail ou senha incorretos. Se você ainda não criou uma senha, entre com o código por e-mail.')
      return
    }
    try { localStorage.setItem('hd_ultimo_email', limpo); localStorage.removeItem(chaveTent(limpo)) } catch { /* ignora */ }
  }

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
        <img src="/parede-tech.svg" alt="" className="login-arte" />
        <div className="login-legenda">
          <span className="login-selo">TI · Grupo Zerbini</span>
          <p className="login-frase">Abra um chamado para a TI em menos de um minuto e acompanhe cada resposta por aqui.</p>
        </div>
      </div>

      <div className="login-form">
        <button className="btn-icone btn-tema login-tema" onClick={alternarTema} aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}
          title={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}>
          {tema === 'escuro' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className="login-marca">
          <img src="/logo-z-azul.png" alt="Grupo Zerbini" className="logo-claro" />
          <img src="/logo-z-branco.png" alt="Grupo Zerbini" className="logo-escuro" />
          <div>
            <h1>Zerbini Helpdesk</h1>
            <p>Chamados internos do Grupo Zerbini</p>
          </div>
        </div>
        {etapa === 'email' ? (
          <form onSubmit={enviar} className="cartao">
            <h2>Entrar</h2>
            <p className="texto-suave">Use seu e-mail corporativo. Enviaremos um código de acesso — sem precisar de senha.</p>
            <label className="campo">
              <span>E-mail</span>
              <input type="email" autoFocus autoComplete="email" placeholder="nome.sobrenome@grupozerbini.com.br"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {erro && <div className="alerta alerta-erro">{erro}</div>}
            <button className="btn btn-primario btn-bloco" disabled={carregando}>
              {carregando ? 'Enviando…' : 'Enviar código de acesso'}
            </button>
            <button type="button" className="btn-link login-alternar" onClick={() => { setEtapa('senha'); setErro('') }}>
              <KeyRound size={15} /> Prefiro entrar com senha
            </button>
          </form>
        ) : etapa === 'senha' ? (
          <form onSubmit={entrarComSenha} className="cartao">
            <h2>Entrar com senha</h2>
            <p className="texto-suave">Para quem já criou uma senha em <b>Minha conta</b>.</p>
            <label className="campo">
              <span>E-mail</span>
              <input type="email" autoComplete="username" placeholder="nome.sobrenome@grupozerbini.com.br"
                value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={!email} />
            </label>
            <label className="campo">
              <span>Senha</span>
              <div className="campo-senha">
                <input type={verSenha ? 'text' : 'password'} autoComplete="current-password" value={senha}
                  onChange={(e) => setSenha(e.target.value)} autoFocus={!!email} />
                <button type="button" className="btn-icone" onClick={() => setVerSenha(!verSenha)} aria-label={verSenha ? 'Esconder senha' : 'Mostrar senha'}>
                  {verSenha ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {erro && <div className="alerta alerta-erro">{erro}</div>}
            <button className="btn btn-primario btn-bloco" disabled={carregando}>{carregando ? 'Entrando…' : 'Entrar'}</button>
            <div className="linha-acoes">
              <button type="button" className="btn-link" onClick={() => { setEtapa('email'); setSenha(''); setErro('') }}>
                <Mail size={15} /> Entrar com código por e-mail
              </button>
            </div>
            <small className="dica">Esqueceu a senha? Entre com o código e crie outra em Minha conta.</small>
          </form>
        ) : (
          <form onSubmit={verificar} className="cartao">
            <div className="icone-circulo"><Mail size={22} /></div>
            <h2>Confira seu e-mail</h2>
            <p className="texto-suave">Enviamos um código de acesso para <b>{email}</b>. Digite abaixo ou clique no link do e-mail.</p>
            <label className="campo">
              <span>Código do e-mail</span>
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
        <a href="/passo-a-passo.pdf" target="_blank" rel="noopener" className="login-ajuda">
          <CircleHelp size={16} /> Primeira vez? Veja o passo a passo
        </a>
      </div>
    </div>
  )
}
