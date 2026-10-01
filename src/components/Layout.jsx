import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Inbox, Plus, Tags, LogOut } from 'lucide-react'
import { useSessao } from '../lib/sessao'
import { nomeDeEmail } from '../lib/util'
import { Avatar } from './ui'

export default function Layout() {
  const { perfil, sair } = useSessao()
  const nome = perfil.nome || nomeDeEmail(perfil.email)
  return (
    <div className="app">
      <header className="topo">
        <div className="topo-interno">
          <NavLink to="/" className="marca">
            <span className="marca-icone" aria-hidden>
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 7h14M5 12h14M5 17h9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none" /></svg>
            </span>
            <span>
              <strong>Zerbini Helpdesk</strong>
              <small>Grupo Zerbini</small>
            </span>
          </NavLink>
          <div className="usuario">
            <Avatar nome={nome} />
            <span className="usuario-nome">{nome}</span>
            <button className="btn-icone claro" onClick={sair} title="Sair" aria-label="Sair"><LogOut size={18} /></button>
          </div>
        </div>
      </header>
      <nav className="abas">
        <div className="abas-interno">
          {perfil.eh_agente && <NavLink to="/painel"><LayoutDashboard size={17} /> Painel</NavLink>}
          <NavLink to="/meus"><Inbox size={17} /> Meus chamados</NavLink>
          <NavLink to="/novo"><Plus size={17} /> Novo chamado</NavLink>
          {perfil.eh_agente && <NavLink to="/categorias"><Tags size={17} /> Categorias</NavLink>}
        </div>
      </nav>
      <main className="conteudo">
        <Outlet />
      </main>
      <footer className="rodape">© {new Date().getFullYear()} Grupo Zerbini · Helpdesk interno</footer>
    </div>
  )
}
