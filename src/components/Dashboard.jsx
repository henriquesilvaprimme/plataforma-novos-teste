import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { RefreshCcw } from 'lucide-react'; // Importação do ícone de refresh

const Dashboard = ({ usuarioLogado }) => {
  const [leadsData, setLeadsData] = useState([]); // Agora armazena todos os leads do Firebase
  const [isLoading, setIsLoading] = useState(true); // Estado para o carregamento inicial do dashboard
  const [isRefreshing, setIsRefreshing] = useState(false); // Estado para o botão de refresh

  // Inicializar dataInicio e dataFim com valores padrão ao carregar o componente
  const getPrimeiroDiaMes = () => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  };

  const getDataHoje = () => {
    return new Date().toISOString().slice(0, 10);
  };

  const [dataInicio, setDataInicio] = useState(getPrimeiroDiaMes());
  const [dataFim, setDataFim] = useState(getDataHoje());
  const [filtroAplicado, setFiltroAplicado] = useState({ inicio: getPrimeiroDiaMes(), fim: getDataHoje() });

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
      Seguradora: data.Seguradora ?? '',
      PremioLiquido: data.PremioLiquido ?? '',
      Comissao: data.Comissao ?? '',
      ...data,
    };
  };

  // Listener para leads do Firebase
  useEffect(() => {
    const leadsColRef = collection(db, 'leads');
    const unsubscribeLeads = onSnapshot(
      leadsColRef,
      (snapshot) => {
        const leadsList = snapshot.docs.map((doc) =>
          normalizeLead(doc.id, doc.data())
        );
        setLeadsData(leadsList);
        setIsLoading(false); // Desativa o loading inicial após carregar os dados
        setIsRefreshing(false); // Desativa o refresh se estava ativo
      },
      (error) => {
        console.error('Erro ao buscar leads:', error);
        setIsLoading(false);
        setIsRefreshing(false);
      }
    );

    return () => {
      unsubscribeLeads();
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

  // Função auxiliar para validar e formatar a data (mantida da iteração anterior)
  const getValidDateStr = (dateValue) => {
    if (!dateValue) return null;
    try {
      const dateObj = new Date(dateValue);
      if (isNaN(dateObj.getTime())) {
        return null;
      }
      return dateObj.toISOString().slice(0, 10);
    } catch (e) {
      return null;
    }
  };

  const filteredLeads = useMemo(() => {
    let filtered = leadsData.filter((lead) => canViewLead(lead));

    // Aplica o filtro de data de criação
    filtered = filtered.filter((lead) => {
      const dataLeadStr = getValidDateStr(lead.createdAt);
      if (!dataLeadStr) return false;
      if (filtroAplicado.inicio && dataLeadStr < filtroAplicado.inicio) return false;
      if (filtroAplicado.fim && dataLeadStr > filtroAplicado.fim) return false;
      return true;
    });

    return filtered;
  }, [leadsData, usuarioLogado, filtroAplicado]);

  const dashboardStats = useMemo(() => {
    let totalLeads = 0;
    let vendas = 0;
    let emContato = 0;
    let semContato = 0;
    let agendadosHoje = 0;
    let perdidos = 0;
    const today = new Date().toLocaleDateString('pt-BR');

    // Contadores por seguradora para leads fechados
    let portoSeguro = 0;
    let azulSeguros = 0;
    let itauSeguros = 0;
    let demaisSeguradoras = 0;
    let totalPremioLiquido = 0;
    let somaTotalPercentualComissao = 0;
    let totalVendasParaMedia = 0;

    const demaisSeguradorasLista = [
      'tokio', 'yelum', 'suhai', 'allianz', 'bradesco', 'hdi', 'zurich', 'alfa', 'mitsui', 'mapfre', 'demais seguradoras'
    ];

    filteredLeads.forEach((lead) => {
      totalLeads++; // Todos os leads visíveis e filtrados por data

      const s = lead.status ?? '';

      if (s === 'Fechado') {
        vendas++;
        // Contagem por seguradora para leads fechados
        const segNormalized = (lead.Seguradora || '').toString().trim().toLowerCase();
        if (segNormalized === 'porto seguro') {
          portoSeguro++;
        } else if (segNormalized === 'azul seguros') {
          azulSeguros++;
        } else if (segNormalized === 'itau seguros') {
          itauSeguros++;
        } else if (demaisSeguradorasLista.includes(segNormalized)) {
          demaisSeguradoras++;
        }

        // Soma de prêmio líquido e comissão para leads fechados
        // Garante que PremioLiquido seja um número antes de somar
        const premio = parseFloat(String(lead.PremioLiquido).replace(/[R$,.]/g, '')) / 100 || 0;
        totalPremioLiquido += premio;

        // Garante que Comissão seja um número antes de somar
        const comissao = parseFloat(String(lead.Comissao).replace(/%/g, '')) || 0;
        somaTotalPercentualComissao += comissao;
        totalVendasParaMedia++;

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
    const comissaoMediaGlobal = totalVendasParaMedia > 0 ? somaTotalPercentualComissao / totalVendasParaMedia : 0;

    return {
      totalLeads,
      vendas,
      emContato,
      semContato,
      agendadosHoje,
      perdidos,
      taxaConversao: taxaConversao.toFixed(2),
      portoSeguro,
      azulSeguros,
      itauSeguros,
      demaisSeguradoras,
      totalPremioLiquido,
      comissaoMediaGlobal: comissaoMediaGlobal.toFixed(2),
    };
  }, [filteredLeads]);

  const handleAplicarFiltroData = () => {
    setIsRefreshing(true); // Ativa o loading do botão
    setFiltroAplicado({ inicio: dataInicio, fim: dataFim });
    // O useEffect do listener de leads já vai atualizar os dados,
    // então o isRefreshing será desativado quando os novos dados chegarem.
  };

  const boxStyle = {
    padding: '10px',
    borderRadius: '5px',
    flex: 1,
    color: '#fff',
    textAlign: 'center',
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Dashboard</h1>

      {/* Filtro de datas com botão e o NOVO Botão de Refresh */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            cursor: 'pointer',
          }}
          title="Data de Início"
        />
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            cursor: 'pointer',
          }}
          title="Data de Fim"
        />
        <button
          onClick={handleAplicarFiltroData}
          style={{
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 14px',
            cursor: 'pointer',
          }}
        >
          Filtrar
        </button>

        {/* Botão de Refresh - agora apenas um indicador visual de que os dados estão sendo atualizados */}
        <button
          title='Atualizando dados...'
          disabled={isRefreshing || isLoading} // Desabilita se estiver carregando ou atualizando
          style={{
            backgroundColor: '#6c757d', // Cor cinza para o botão de refresh
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 10px', // Um pouco menor para o ícone
            cursor: 'default', // Cursor padrão, pois está desabilitado
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '36px', // Tamanho mínimo para o ícone
            height: '36px',
          }}
        >
          {(isRefreshing || isLoading) ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <RefreshCcw size={20} /> // Ícone de refresh (não clicável, apenas visual)
          )}
        </button>
      </div>

      {/* Spinner de carregamento para o Dashboard geral */}
      {isLoading && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <p>Carregando dados do dashboard...</p>
          {/* Você pode adicionar um spinner aqui se quiser um indicador visual */}
        </div>
      )}

      {!isLoading && ( // Renderiza o conteúdo apenas quando não estiver carregando
        <>
          {/* Primeira linha de contadores */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
            <div style={{ ...boxStyle, backgroundColor: '#eee', color: '#333' }}>
              <h3>Total de Leads</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardStats.totalLeads}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#9C27B0' }}>
              <h3>Taxa de Conversão</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardStats.taxaConversao}%</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#4CAF50' }}>
              <h3>Vendas</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardStats.vendas}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#F44336' }}>
              <h3>Leads Perdidos</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardStats.perdidos}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#FF9800' }}>
              <h3>Em Contato</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardStats.emContato}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#9E9E9E' }}>
              <h3>Sem Contato</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardStats.semContato}</p>
            </div>
          </div>

          {/* Segunda linha de contadores */}
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
            <div style={{ ...boxStyle, backgroundColor: '#003366' }}>
              <h3>Porto Seguro</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardStats.portoSeguro}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#87CEFA' }}>
              <h3>Azul Seguros</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardStats.azulSeguros}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#FF8C00' }}>
              <h3>Itau Seguros</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardStats.itauSeguros}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#4CAF50' }}>
              <h3>Demais Seguradoras</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>{dashboardStats.demaisSeguradoras}</p>
            </div>
          </div>

          {/* Somente para Admin: linha de Prêmio Líquido e Comissão */}
          {isAdmin && (
            <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
              <div style={{ ...boxStyle, backgroundColor: '#3f51b5' }}>
                <h3>Total Prêmio Líquido</h3>
                <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {dashboardStats.totalPremioLiquido.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </p>
              </div>
                
              <div style={{ ...boxStyle, backgroundColor: '#009688' }}>
                <h3>Média Comissão</h3>
                <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {dashboardStats.comissaoMediaGlobal.replace('.', ',')}%
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;
