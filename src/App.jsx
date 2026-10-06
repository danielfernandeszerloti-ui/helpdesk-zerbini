import { Navigate, Route, Routes } from 'react-router-dom'
import { useSessao } from './lib/sessao'
import Layout from './components/Layout'
import Login from './pages/Login'
import Painel from './pages/Painel'
import MeusChamados from './pages/MeusChamados'
import NovoChamado from './pages/NovoChamado'
import Chamado from './pages/Chamado'
import Configuracoes from './pages/Configuracoes'
import Kanban from './pages/Kanban'
import Indicadores from './pages/Indicadores'
import Hoje from './pages/Hoje'

function Carregando() {
  return <div className="tela-cheia"><div className="spinner" aria-label="Carregando" /></div>
}

export default function App() {
  const { sessao, perfil, sair } = useSessao()

  if (sessao === undefined) return <Carregando />
  if (!sessao) return <Login />
  if (!perfil) return <Carregando />

  if (perfil.erro || !perfil.pode_abrir) {
    return (
      <div className="tela-cheia">
        <div className="cartao cartao-aviso">
          <h2>Acesso restrito</h2>
          <p>O Zerbini Helpdesk é exclusivo para e-mails <b>@grupozerbini.com.br</b>.</p>
          <p className="texto-suave">Você entrou como {sessao.user.email}.</p>
          <button className="btn btn-primario" onClick={sair}>Entrar com outro e-mail</button>
        </div>
      </div>
    )
  }

  const agente = perfil.eh_agente
  const dev = perfil.eh_dev
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={agente ? <Navigate to="/hoje" replace /> : dev ? <Navigate to="/kanban" replace /> : <MeusChamados />} />
        <Route path="/meus" element={<MeusChamados />} />
        <Route path="/novo" element={<NovoChamado />} />
        <Route path="/chamado/:id" element={<Chamado />} />
        {(agente || dev) && <Route path="/hoje" element={<Hoje />} />}
        {agente && <Route path="/painel" element={<Painel />} />}
        {agente && <Route path="/indicadores" element={<Indicadores />} />}
        {(agente || dev) && <Route path="/kanban" element={<Kanban />} />}
        {agente && <Route path="/configuracoes" element={<Configuracoes />} />}
        {agente && <Route path="/categorias" element={<Navigate to="/configuracoes" replace />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
