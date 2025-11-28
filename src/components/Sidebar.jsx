import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, Search, Trophy, UserPlus, UserCircle, FilePlus, Repeat, Shield } from 'lucide-react'; // Importando FilePlus para Criar Lead, Repeat para Renovações, Shield para Segurados

const Sidebar = ({ nomeUsuario }) => {

  const isAdmin = nomeUsuario.tipo === 'Admin';

  return (
    <div className="w-64 bg-white shadow-xl border-r border-gray-200 h-full p-6">
      <h2 className="text-xl font-semibold mb-8">
        Olá, {nomeUsuario.nome.charAt(0).toUpperCase() + nomeUsuario.nome.slice(1)}
      </h2>

      <nav className="flex flex-col gap-4">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-100 transition ${
              isActive ? 'border-l-4 border-blue-500 bg-blue-50' : ''
            }`
          }
        >
          <Home size={20} />
          Dashboard
        </NavLink>

        <NavLink
          to="/leads"
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-100 transition ${
              isActive ? 'border-l-4 border-blue-500 bg-blue-50' : ''
            }`
          }
        >
          <Users size={20} />
          Leads
        </NavLink>

        {/* NOVO: Link para Renovações */}
        <NavLink
          to="/renovacoes"
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-100 transition ${
              isActive ? 'border-l-4 border-blue-500 bg-blue-50' : ''
            }`
          }
        >
          <Repeat size={20} />
          Renovações
        </NavLink>

        {/* NOVO: Link para Renovados */}
        <NavLink
          to="/renovados"
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-100 transition ${
              isActive ? 'border-l-4 border-blue-500 bg-blue-50' : ''
            }`
          }
        >
          <Repeat size={20} /> {/* Você pode querer um ícone diferente aqui */}
          Renovados
        </NavLink>

        {/* NOVO: Link para Segurados */}
        <NavLink
          to="/segurados"
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-100 transition ${
              isActive ? 'border-l-4 border-blue-500 bg-blue-50' : ''
            }`
          }
        >
          <Shield size={20} />
          Segurados
        </NavLink>

        <NavLink
          to="/leads-perdidos"
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-100 transition ${
              isActive ? 'border-l-4 border-blue-500 bg-blue-50' : ''
            }`
          }
        >
          <Users size={20} /> {/* Você pode querer um ícone diferente aqui, como XCircle */}
          Leads Perdidos
        </NavLink>

        {isAdmin && (
          <>
            {/* NOVO: Link para Ranking visível SÓ para Admin */}
            <NavLink
              to="/ranking"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-100 transition ${
                  isActive ? 'border-l-4 border-blue-500 bg-blue-50' : ''
                }`
              }
            >
              <Trophy size={20} />
              Ranking
            </NavLink>
            
            {/* Link para Criar Lead */}
            <NavLink
              to="/criar-lead"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-100 transition ${
                  isActive ? 'border-l-4 border-blue-500 bg-blue-50' : ''
                }`
              }
            >
              <FilePlus size={20} /> {/* Ícone para "Criar Lead" */}
              Criar Lead
            </NavLink>

            <NavLink
              to="/criar-usuario"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-100 transition ${
                  isActive ? 'border-l-4 border-blue-500 bg-blue-50' : ''
                }`
              }
            >
              <UserPlus size={20} />
              Criar Usuário
            </NavLink>

            <NavLink
              to="/usuarios"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-blue-100 transition ${
                  isActive ? 'border-l-4 border-blue-500 bg-blue-50' : ''
                }`
              }
            >
              <UserCircle size={20} />
              Usuários
            </NavLink>
          </>
        )}
      </nav>
    </div>
  );
};

export default Sidebar;
