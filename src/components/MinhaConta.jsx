import { useEffect, useRef, useState } from 'react'
import { X, Eye, EyeOff, Check, KeyRound, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/sessao'
import { avaliarSenha, NIVEIS } from '../lib/senha'
import { nomeDeEmail } from '../lib/util'
import { Avatar } from './ui'

export default function MinhaConta({ onFechar }) {
  const { perfil, avisar } = useSessao()
  const nome = perfil.nome || nomeDeEmail(perfil.email)
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [ver, setVer] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [pedirCodigo, setPedirCodigo] = useState(false)
  const [codigo, setCodigo] = useState('')
  const caixa = useRef(null)

  const av = avaliarSenha(senha, { email: perfil.email, nome })
  const confere = senha && senha === confirma

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onFechar()
    document.addEventListener('keydown', esc)
    caixa.current?.querySelector('input')?.focus()
    return () => document.removeEventListener('keydown', esc)
  }, [onFechar])

  async function salvar(e) {
    e.preventDefault()
    setErro('')
    if (!av.ok) return setErro('A senha ainda não atende a todos os requisitos.')
    if (!confere) return setErro('A confirmação não confere com a senha.')
    setEnviando(true)
    const { error } = await supabase.auth.updateUser(pedirCodigo ? { password: senha, nonce: codigo.trim() } : { password: senha })
    setEnviando(false)
    if (error) {
      // projeto configurado para pedir confirmação ao trocar a senha
      if (/reauthentication|nonce/i.test(error.code || error.message) && !pedirCodigo) {
        const r = await supabase.auth.reauthenticate()
        if (r.error) return setErro('Não foi possível enviar o código de confirmação. Tente de novo.')
        setPedirCodigo(true)
        return setErro('')
      }
      if (/same_password|different from the old/i.test(error.code || error.message)) return setErro('A nova senha precisa ser diferente da atual.')
      if (/weak_password|password should/i.test(error.code || error.message)) return setErro('O servidor considerou a senha fraca. Use uma senha mais longa e variada.')
      if (/nonce|otp|token/i.test(error.message)) return setErro('Código de confirmação inválido ou expirado.')
      return setErro(error.message)
    }
    avisar('Senha salva. Você pode entrar com ela ou continuar usando o código por e-mail.')
    onFechar()
  }

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal cartao" role="dialog" aria-modal="true" aria-labelledby="mc-titulo" ref={caixa}>
        <header className="modal-topo">
          <h2 id="mc-titulo">Minha conta</h2>
          <button className="btn-icone" onClick={onFechar} aria-label="Fechar"><X size={18} /></button>
        </header>
        <div className="mc-pessoa">
          <Avatar nome={nome} email={perfil.email} />
          <div><strong>{nome}</strong><small>{perfil.email}</small></div>
        </div>

        <form onSubmit={salvar} className="mc-senha">
          <h3><KeyRound size={16} /> Senha <span className="texto-suave">(opcional)</span></h3>
          <p className="texto-suave">Você pode continuar entrando só com o código por e-mail. Se preferir, crie uma senha forte para entrar mais rápido.</p>
          <label className="campo">
            <span>Nova senha</span>
            <div className="campo-senha">
              <input type={ver ? 'text' : 'password'} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} maxLength={72} />
              <button type="button" className="btn-icone" onClick={() => setVer(!ver)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}>{ver ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
          </label>
          <div className={'medidor nivel-' + av.nivel} aria-live="polite">
            <div><span /><span /><span /><span /></div>
            <small>{senha ? NIVEIS[av.nivel] : 'Força da senha'}</small>
          </div>
          <ul className="regras-senha">
            {av.regras.map((r) => (
              <li key={r.texto} className={senha ? (r.ok ? 'ok' : 'falta') : ''}>
                {senha && r.ok ? <Check size={13} strokeWidth={3} /> : <i />} {r.texto}
              </li>
            ))}
          </ul>
          <label className="campo">
            <span>Confirmar senha</span>
            <input type={ver ? 'text' : 'password'} autoComplete="new-password" value={confirma} onChange={(e) => setConfirma(e.target.value)} maxLength={72} />
            {confirma && !confere && <small className="dica erro-texto">As senhas não conferem.</small>}
          </label>
          {pedirCodigo && (
            <label className="campo">
              <span>Código enviado para o seu e-mail</span>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} />
              <small className="dica">Por segurança, confirme com o código que acabamos de enviar.</small>
            </label>
          )}
          {erro && <div className="alerta alerta-erro">{erro}</div>}
          <div className="modal-botoes">
            <button type="button" className="btn btn-leve" onClick={onFechar}>Cancelar</button>
            <button className="btn btn-primario" disabled={enviando || !av.ok || !confere || (pedirCodigo && codigo.length < 6)}>
              <ShieldCheck size={16} /> {enviando ? 'Salvando…' : 'Salvar senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
