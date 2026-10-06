import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Inbox, Plus, Settings, LogOut, KanbanSquare, BarChart3, ListTodo, Moon, Sun, CircleHelp } from 'lucide-react'
import { useTema } from '../lib/tema'
import { useSessao } from '../lib/sessao'
import { nomeDeEmail } from '../lib/util'
import { Avatar } from './ui'

export default function Layout() {
  const { perfil, sair } = useSessao()
  const [tema, alternarTema] = useTema()
  const nome = perfil.nome || nomeDeEmail(perfil.email)
  return (
    <div className="app">
      <header className="topo">
        <div className="topo-interno">
          <NavLink to="/" className="marca">
            <img src="/logo-z-azul.png" alt="" className="marca-logo logo-claro" />
            <img src="/logo-z-branco.png" alt="" className="marca-logo logo-escuro" />
            <span>
              <strong>Zerbini Helpdesk</strong>
              <small>Grupo Zerbini</small>
            </span>
          </NavLink>
          <div className="usuario">
            <a href="/passo-a-passo.pdf" target="_blank" rel="noopener" className="btn-ajuda" title="Passo a passo: como abrir e acompanhar chamados">
              <CircleHelp size={18} /> <span>Como usar</span>
            </a>
            <button className="btn-icone btn-tema" onClick={alternarTema}
              title={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'} aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}>
              {tema === 'escuro' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Avatar nome={nome} />
            <span className="usuario-nome">{nome}</span>
            <button className="btn-icone" onClick={sair} title="Sair" aria-label="Sair"><LogOut size={18} /></button>
          </div>
        </div>
      </header>
      <nav className="abas">
        <div className="abas-interno">
          {(perfil.eh_agente || perfil.eh_dev) && <NavLink to="/hoje"><ListTodo size={17} /> Hoje</NavLink>}
          {perfil.eh_agente && <NavLink to="/painel"><LayoutDashboard size={17} /> Painel</NavLink>}
          {perfil.eh_agente && <NavLink to="/indicadores"><BarChart3 size={17} /> Indicadores</NavLink>}
          {(perfil.eh_agente || perfil.eh_dev) && <NavLink to="/kanban"><KanbanSquare size={17} /> Desenvolvimento</NavLink>}
          <NavLink to="/meus"><Inbox size={17} /> Meus chamados</NavLink>
          <NavLink to="/novo"><Plus size={17} /> Novo chamado</NavLink>
          {perfil.eh_agente && <NavLink to="/configuracoes"><Settings size={17} /> Configurações</NavLink>}
        </div>
      </nav>
      <main className="conteudo">
        <Outlet />
      </main>
      <footer className="rodape">© {new Date().getFullYear()} Grupo Zerbini · Helpdesk interno</footer>
    </div>
  )
}
