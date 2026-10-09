import { NavLink, Outlet } from 'react-router-dom'
import { Bell, BellOff, LayoutDashboard, Inbox, Plus, Settings, LogOut, KanbanSquare, BarChart3, ListTodo, Moon, Sun, CircleHelp } from 'lucide-react'
import { useState } from 'react'
import { useTema } from '../lib/tema'
import MinhaConta from './MinhaConta'
import { useAlertas } from '../lib/alertas'
import { useSessao } from '../lib/sessao'
import { nomeDeEmail } from '../lib/util'
import { Avatar } from './ui'

export default function Layout() {
  const { perfil, sair, avisar } = useSessao()
  const [tema, alternarTema] = useTema()
  const alertas = useAlertas(perfil)
  const [conta, setConta] = useState(false)
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
            {alertas.equipe && (
              <button className={'btn-icone btn-sino' + (alertas.ligado ? '' : ' desligado') + (alertas.ligado && alertas.semPermissao ? ' pendente' : '')}
                onClick={() => { const r = alertas.alternar(); avisar(r ? (alertas.semPermissao ? 'Som ligado. Permita as notificações do navegador para ver avisos com a aba em segundo plano.' : 'Som de novos chamados ligado') : 'Som de novos chamados desligado') }}
                title={alertas.ligado ? (alertas.semPermissao ? 'Som ligado — clique para permitir também as notificações do Windows' : 'Som de novos chamados ligado (clique para desligar)') : 'Som de novos chamados desligado (clique para ligar)'}
                aria-label={alertas.ligado ? 'Desligar som de novos chamados' : 'Ligar som de novos chamados'}>
                {alertas.ligado ? <Bell size={18} /> : <BellOff size={18} />}
              </button>
            )}
            <button className="btn-icone btn-tema" onClick={alternarTema}
              title={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'} aria-label={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}>
              {tema === 'escuro' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="btn-conta" onClick={() => setConta(true)} title="Minha conta (senha opcional)" aria-label="Minha conta">
              <Avatar nome={nome} email={perfil.email} />
              <span className="usuario-nome">{nome}</span>
            </button>
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
      {conta && <MinhaConta onFechar={() => setConta(false)} />}
      <footer className="rodape">© {new Date().getFullYear()} Grupo Zerbini · Helpdesk interno</footer>
    </div>
  )
}
