import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  onSnapshot,
  where,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Users,
  DollarSign,
  PhoneCall,
  PhoneOff,
  Calendar,
  XCircle,
  TrendingUp,
} from 'lucide-react';

const Dashboard = ({ usuarioLogado }) => {
  const [leadsData, setLeadsData] = useState([]);
  const [usuariosData, setUsuariosData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filtroMesAno, setFiltroMesAno] = useState('');

  // Função auxiliar para normalizar leads (copiada de Leads.jsx)
  const normalizeLead = (docId, data = {}) => {
    const safe = (v) => (v === undefined || v === null ? '' : v);

    const toISO = (v) => {
      if (!v && v !== 0) return '';
      if (typeof v === 'object' && typeof v.toDate === 'function') {
        return v.toDate().toISOString();
      }
      if (typeof v === 'string') return v;
      try {
        return new Date(v).toISOString();
      } catch {
        return '';
      }
    };

    return {
      id: String(docId),
      status: typeof data.status === 'string' ? data.status : data.Status ?? '',
      usuarioId:
        data.usuarioId !== undefined && data.usuarioId !== null
          ? Number(data.usuarioId)
          : data.usuarioId ?? null,
      responsavel: data.responsavel ?? data.Responsavel ?? '',
      createdAt: toISO(data.createdAt ?? data.data ?? data.Data ?? data.criadoEm),
      ...data,
    };
  };

  // Listener para leads
  useEffect(() => {
    setIsLoading(true);
    const leadsColRef = collection(db, 'leads');
    const unsubscribeLeads = onSnapshot(
      leadsColRef,
      (snapshot) => {
        const leadsList = snapshot.docs.map((doc) =>
          normalizeLead(doc.id, doc.data())
        );
        setLeadsData(leadsList);
        setIsLoading(false);
      },
      (error) => {
        console.error('Erro ao buscar leads:', error);
        setIsLoading(false);
      }
    );

    // Listener para usuários
    const usuariosColRef = collection(db, 'usuarios');
    const unsubscribeUsuarios = onSnapshot(
      usuariosColRef,
      (snapshot) => {
        const usuariosList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setUsuariosData(usuariosList);
      },
      (error) => {
        console.error('Erro ao buscar usuários:', error);
      }
    );

    return () => {
      unsubscribeLeads();
      unsubscribeUsuarios();
    };
  }, []);

  const isAdmin = usuarioLogado?.tipo === 'Admin';

  const getCurrentUserFromPropOrStorage = () => {
    if (usuarioLogado) return usuarioLogado;
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  const canViewLead = (lead) => {
    if (isAdmin) return true;
    const user = getCurrentUserFromPropOrStorage();
    if (!user) return false;

    const userId = String(user.id ?? user.ID ?? user.userId ?? '').trim();
    const userNome = String(user.nome ?? user.name ?? user.usuario ?? '')
      .trim()
      .toLowerCase();

    const leadUsuarioId =
      lead.usuarioId !== undefined && lead.usuarioId !== null
        ? String(lead.usuarioId).trim()
        : '';
    if (leadUsuarioId && userId && leadUsuarioId === userId) return true;

    const leadResponsavel = String(lead.responsavel ?? lead.Responsavel ?? '')
      .trim()
      .toLowerCase();
    if (leadResponsavel && userNome && leadResponsavel === userNome) return true;

    const leadUsuarioLogin = String(
      lead.usuario ?? lead.user ?? lead.raw?.usuario ?? lead.raw?.user ?? ''
    ).trim();
    const userLogin = String(user.usuario ?? '').trim();
    if (leadUsuarioLogin && userLogin && leadUsuarioLogin === userLogin) return true;

    return false;
  };

  const isStatusAgendado = (status) => {
    return typeof status === 'string' && status.startsWith('Agendado');
  };

  const extractStatusDate = (status) => {
    if (typeof status !== 'string') return null;
    const parts = status.split(' - ');
    return parts.length > 1 ? parts[1] : null;
  };

  const filteredLeads = useMemo(() => {
    let filtered = leadsData.filter((lead) => canViewLead(lead));

    if (filtroMesAno) {
      const [filtroAno, filtroMes] = filtroMesAno.split('-').map(Number);
      filtered = filtered.filter((lead) => {
        if (!lead.createdAt) return false;
        try {
          const leadDate = new Date(lead.createdAt);
          return (
            leadDate.getFullYear() === filtroAno &&
            leadDate.getMonth() + 1 === filtroMes
          );
        } catch (e) {
          console.error('Erro ao filtrar lead por data:', e);
          return false;
        }
      });
    }
    return filtered;
  }, [leadsData, usuarioLogado, filtroMesAno]);

  const dashboardStats = useMemo(() => {
    let totalLeads = 0;
    let vendas = 0;
    let emContato = 0;
    let semContato = 0;
    let agendadosHoje = 0;
    let perdidos = 0;
    const today = new Date().toLocaleDateString('pt-BR');

    filteredLeads.forEach((lead) => {
      totalLeads++; // Todos os leads visíveis e filtrados por data

      const s = lead.status ?? '';

      if (s === 'Fechado') {
        vendas++;
      } else if (s === 'Em Contato') {
        emContato++;
      } else if (s === 'Sem Contato') {
        semContato++;
      } else if (isStatusAgendado(s)) {
        const statusDateStr = extractStatusDate(s);
        if (statusDateStr) {
          const [dia, mes, ano] = statusDateStr.split('/');
          const statusDateFormatted = new Date(
            `${ano}-${mes}-${dia}T00:00:00`
          ).toLocaleDateString('pt-BR');
          if (statusDateFormatted === today) {
            agendadosHoje++;
          }
        }
      } else if (s === 'Perdido') {
        perdidos++;
      }
    });

    const taxaConversao = totalLeads > 0 ? (vendas / totalLeads) * 100 : 0;

    return {
      totalLeads,
      vendas,
      emContato,
      semContato,
      agendadosHoje,
      perdidos,
      taxaConversao: taxaConversao.toFixed(2),
    };
  }, [filteredLeads]);

  const handleMesAnoChange = (e) => {
    setFiltroMesAno(e.target.value);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 relative min-h-screen bg-gray-100 font-sans">
      {isLoading && (
        <div className="fixed inset-0 bg-white bg-opacity-80 flex justify-center items-center z-50">
          <div className="flex items-center">
            <svg
              className="animate-spin h-8 w-8 text-indigo-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <p className="ml-4 text-xl font-semibold text-gray-700">
              Carregando Dashboard...
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 mb-4">
          <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
            <TrendingUp size={32} className="text-indigo-500 mr-3" />
            Dashboard
          </h1>
          <div className="flex items-center gap-2">
            <label htmlFor="filtroMesAno" className="text-sm font-medium text-gray-700">
              Filtrar por Mês/Ano:
            </label>
            <input
              type="month"
              id="filtroMesAno"
              value={filtroMesAno}
              onChange={handleMesAnoChange}
              className="p-2 border border-gray-300 rounded-lg cursor-pointer text-sm"
              title="Filtrar dados por mês e ano de criação do lead"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {/* Card: Total de Leads */}
          <div className="bg-indigo-500 text-white rounded-lg p-5 shadow-md flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-80">Total de Leads</p>
              <p className="text-3xl font-bold">{dashboardStats.totalLeads}</p>
            </div>
            <Users size={36} />
          </div>

          {/* Card: Vendas */}
          <div className="bg-green-500 text-white rounded-lg p-5 shadow-md flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-80">Vendas</p>
              <p className="text-3xl font-bold">{dashboardStats.vendas}</p>
            </div>
            <DollarSign size={36} />
          </div>

          {/* Card: Taxa de Conversão */}
          <div className="bg-purple-500 text-white rounded-lg p-5 shadow-md flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-80">Taxa de Conversão</p>
              <p className="text-3xl font-bold">{dashboardStats.taxaConversao}%</p>
            </div>
            <TrendingUp size={36} />
          </div>

          {/* Card: Em Contato */}
          <div className="bg-orange-500 text-white rounded-lg p-5 shadow-md flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-80">Em Contato</p>
              <p className="text-3xl font-bold">{dashboardStats.emContato}</p>
            </div>
            <PhoneCall size={36} />
          </div>

          {/* Card: Sem Contato */}
          <div className="bg-gray-700 text-white rounded-lg p-5 shadow-md flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-80">Sem Contato</p>
              <p className="text-3xl font-bold">{dashboardStats.semContato}</p>
            </div>
            <PhoneOff size={36} />
          </div>

          {/* Card: Agendados Hoje */}
          <div className="bg-blue-500 text-white rounded-lg p-5 shadow-md flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-80">Agendados Hoje</p>
              <p className="text-3xl font-bold">{dashboardStats.agendadosHoje}</p>
            </div>
            <Calendar size={36} />
          </div>

          {/* Card: Perdidos */}
          <div className="bg-red-500 text-white rounded-lg p-5 shadow-md flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-80">Perdidos</p>
              <p className="text-3xl font-bold">{dashboardStats.perdidos}</p>
            </div>
            <XCircle size={36} />
          </div>
        </div>
      </div>

      {/* Aqui você pode adicionar mais seções do dashboard, como gráficos, tabelas, etc. */}
    </div>
  );
};

export default Dashboard;
