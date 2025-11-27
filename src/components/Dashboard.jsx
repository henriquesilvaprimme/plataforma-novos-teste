import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { RefreshCcw, ArrowRightCircle, ArrowLeftCircle, Users, DollarSign, PhoneCall, PhoneOff, Calendar, XCircle, TrendingUp, Repeat } from 'lucide-react';

const Dashboard = ({ usuarioLogado }) => {
  const [leadsData, setLeadsData] = useState([]);
  const [renovacoesData, setRenovacoesData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentSection, setCurrentSection] = useState('segurosNovos'); // 'segurosNovos' ou 'renovacoes'

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

  useEffect(() => {
    const leadsColRef = collection(db, 'leads');
    const unsubscribeLeads = onSnapshot(
      leadsColRef,
      (snapshot) => {
        const leadsList = snapshot.docs.map((doc) =>
          normalizeLead(doc.id, doc.data())
        );
        setLeadsData(leadsList);
        setIsLoading(false);
        setIsRefreshing(false);
      },
      (error) => {
        console.error('Erro ao buscar leads:', error);
        setIsLoading(false);
        setIsRefreshing(false);
      }
    );

    const renovacoesColRef = collection(db, 'renovacoes');
    const unsubscribeRenovacoes = onSnapshot(
      renovacoesColRef,
      (snapshot) => {
        const renovacoesList = snapshot.docs.map((doc) =>
          normalizeLead(doc.id, doc.data())
        );
        setRenovacoesData(renovacoesList);
      },
      (error) => {
        console.error('Erro ao buscar renovações:', error);
      }
    );

    return () => {
      unsubscribeLeads();
      unsubscribeRenovacoes();
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

    filtered = filtered.filter((lead) => {
      const dataLeadStr = getValidDateStr(lead.createdAt);
      if (!dataLeadStr) return false;
      if (filtroAplicado.inicio && dataLeadStr < filtroAplicado.inicio) return false;
      if (filtroAplicado.fim && dataLeadStr > filtroAplicado.fim) return false;
      return true;
    });

    return filtered;
  }, [leadsData, usuarioLogado, filtroAplicado]);

  const filteredRenovacoes = useMemo(() => {
    let filtered = renovacoesData.filter((renovacao) => canViewLead(renovacao));

    filtered = filtered.filter((renovacao) => {
      const dataRenovacaoStr = getValidDateStr(renovacao.createdAt);
      if (!dataRenovacaoStr) return false;
      if (filtroAplicado.inicio && dataRenovacaoStr < filtroAplicado.inicio) return false;
      if (filtroAplicado.fim && dataRenovacaoStr > filtroAplicado.fim) return false;
      return true;
    });

    return filtered;
  }, [renovacoesData, usuarioLogado, filtroAplicado]);

  const dashboardStats = useMemo(() => {
    let totalLeads = 0;
    let vendas = 0;
    let emContato = 0;
    let semContato = 0;
    let agendadosHoje = 0;
    let perdidos = 0;

    let portoSeguroLeads = 0;
    let azulSegurosLeads = 0;
    let itauSegurosLeads = 0;
    let demaisSeguradorasLeads = 0;
    let totalPremioLiquidoLeads = 0;
    let somaTotalPercentualComissaoLeads = 0;
    let totalVendasParaMediaLeads = 0;

    let totalRenovacoes = 0;
    let renovados = 0;
    let renovacoesPerdidas = 0;
    let portoSeguroRenovacoes = 0;
    let azulSegurosRenovacoes = 0;
    let itauSegurosRenovacoes = 0;
    let demaisSeguradorasRenovacoes = 0;
    let premioLiquidoRenovados = 0;
    let somaComissaoRenovados = 0;
    let totalRenovadosParaMedia = 0;

    const today = new Date().toLocaleDateString('pt-BR');
    const demaisSeguradorasLista = [
      'tokio', 'yelum', 'suhai', 'allianz', 'bradesco', 'hdi', 'zurich', 'alfa', 'mitsui', 'mapfre', 'demais seguradoras'
    ];

    filteredLeads.forEach((lead) => {
      totalLeads++;

      const s = lead.status ?? '';

      if (s === 'Fechado') {
        vendas++;
        const segNormalized = (lead.Seguradora || '').toString().trim().toLowerCase();
        if (segNormalized === 'porto seguro') {
          portoSeguroLeads++;
        } else if (segNormalized === 'azul seguros') {
          azulSegurosLeads++;
        } else if (segNormalized === 'itau seguros') {
          itauSegurosLeads++;
        } else if (demaisSeguradorasLista.includes(segNormalized)) {
          demaisSeguradorasLeads++;
        }

        const premio = parseFloat(String(lead.PremioLiquido).replace(/[R$,.]/g, '')) / 100 || 0;
        totalPremioLiquidoLeads += premio;

        const comissao = parseFloat(String(lead.Comissao).replace(/%/g, '')) || 0;
        somaTotalPercentualComissaoLeads += comissao;
        totalVendasParaMediaLeads++;

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

    filteredRenovacoes.forEach((renovacao) => {
      totalRenovacoes++;
      const s = renovacao.status ?? '';

      if (s === 'Renovado') {
        renovados++;
        const segNormalized = (renovacao.Seguradora || '').toString().trim().toLowerCase();
        if (segNormalized === 'porto seguro') {
          portoSeguroRenovacoes++;
        } else if (segNormalized === 'azul seguros') {
          azulSegurosRenovacoes++;
        } else if (segNormalized === 'itau seguros') {
          itauSegurosRenovacoes++;
        } else if (demaisSeguradorasLista.includes(segNormalized)) {
          demaisSeguradorasRenovacoes++;
        }

        const premio = parseFloat(String(renovacao.PremioLiquido).replace(/[R$,.]/g, '')) / 100 || 0;
        premioLiquidoRenovados += premio;
        const comissao = parseFloat(String(renovacao.Comissao).replace(/%/g, '')) || 0;
        somaComissaoRenovados += comissao;
        totalRenovadosParaMedia++;
      } else if (s === 'Perdido') {
        renovacoesPerdidas++;
      }
    });

    const taxaConversaoLeads = totalLeads > 0 ? (vendas / totalLeads) * 100 : 0;
    const comissaoMediaGlobalLeads = totalVendasParaMediaLeads > 0 ? somaTotalPercentualComissaoLeads / totalVendasParaMediaLeads : 0;
    const mediaComissaoRenovados = totalRenovadosParaMedia > 0 ? somaComissaoRenovados / totalRenovadosParaMedia : 0;
    const taxaRenovacao = totalRenovacoes > 0 ? (renovados / totalRenovacoes) * 100 : 0;

    return {
      totalLeads,
      vendas,
      emContato,
      semContato,
      agendadosHoje,
      perdidos,
      taxaConversaoLeads: taxaConversaoLeads.toFixed(2),
      portoSeguroLeads,
      azulSegurosLeads,
      itauSegurosLeads,
      demaisSeguradorasLeads,
      totalPremioLiquidoLeads,
      comissaoMediaGlobalLeads: comissaoMediaGlobalLeads.toFixed(2),
      totalRenovacoes,
      renovados,
      renovacoesPerdidas,
      portoSeguroRenovacoes,
      azulSegurosRenovacoes,
      itauSegurosRenovacoes,
      demaisSeguradorasRenovacoes,
      premioLiquidoRenovados,
      mediaComissaoRenovados: mediaComissaoRenovados.toFixed(2),
      taxaRenovacao: taxaRenovacao.toFixed(2),
    };
  }, [filteredLeads, filteredRenovacoes]);

  const handleAplicarFiltroData = () => {
    setIsRefreshing(true);
    setFiltroAplicado({ inicio: dataInicio, fim: dataFim });
  };

  const navigateSections = (direction) => {
    if (direction === 'next') {
      setCurrentSection('renovacoes');
    } else {
      setCurrentSection('segurosNovos');
    }
  };

  // Estilos para o novo design
  const containerStyle = {
    padding: '20px',
    fontFamily: 'Roboto, sans-serif',
    backgroundColor: '#f4f6f9',
    minHeight: '100vh',
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '30px',
    borderBottom: '1px solid #e0e0e0',
    paddingBottom: '15px',
  };

  const titleStyle = {
    fontSize: '32px',
    fontWeight: '700',
    color: '#333',
    margin: '0',
  };

  const filterContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '30px',
    flexWrap: 'wrap',
    backgroundColor: '#fff',
    padding: '15px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
  };

  const inputStyle = {
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid #dcdcdc',
    fontSize: '14px',
    color: '#555',
  };

  const buttonStyle = {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 18px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    transition: 'background-color 0.3s ease',
  };

  const refreshButtonStyle = {
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '40px',
    height: '40px',
    transition: 'background-color 0.3s ease',
  };

  const sectionTitleStyle = {
    fontSize: '26px',
    fontWeight: '600',
    color: '#444',
    marginBottom: '20px',
    borderBottom: '1px solid #e0e0e0',
    paddingBottom: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const cardGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', // Ajustado para 160px
    gap: '15px',
    marginBottom: '40px',
  };

  const cardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    padding: '15px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    minHeight: '100px', // Altura mínima para consistência
    transition: 'transform 0.2s ease-in-out',
  };

  const cardTitleStyle = {
    fontSize: '13px', // Reduzido
    fontWeight: '500',
    color: '#666',
    marginBottom: '8px',
  };

  const cardValueStyle = {
    fontSize: '22px', // Reduzido
    fontWeight: '700',
    color: '#333',
  };

  const PieChartComponent = ({ percentage, color = '#4CAF50' }) => {
    const radius = 30;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <svg width="80" height="80" viewBox="0 0 80 80" style={{ marginTop: '10px' }}>
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="transparent"
          stroke="#e0e0e0"
          strokeWidth="8"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="transparent"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
        />
        <text x="40" y="45" textAnchor="middle" fontSize="16" fill="#333" fontWeight="bold">
          {percentage}%
        </text>
      </svg>
    );
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Dashboard</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {currentSection === 'renovacoes' && (
            <button
              onClick={() => navigateSections('prev')}
              style={{ ...refreshButtonStyle, backgroundColor: '#007bff' }}
              title="Seção Anterior"
            >
              <ArrowLeftCircle size={24} />
            </button>
          )}
          {currentSection === 'segurosNovos' && (
            <button
              onClick={() => navigateSections('next')}
              style={{ ...refreshButtonStyle, backgroundColor: '#007bff' }}
              title="Próxima Seção"
            >
              <ArrowRightCircle size={24} />
            </button>
          )}
        </div>
      </div>

      <div style={filterContainerStyle}>
        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          style={inputStyle}
          title="Data de Início"
        />
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          style={inputStyle}
          title="Data de Fim"
        />
        <button
          onClick={handleAplicarFiltroData}
          style={buttonStyle}
        >
          Filtrar
        </button>

        <button
          title='Atualizando dados...'
          disabled={isRefreshing || isLoading}
          style={refreshButtonStyle}
        >
          {(isRefreshing || isLoading) ? (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <RefreshCcw size={20} />
          )}
        </button>
      </div>

      {isLoading && (
        <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
          <p style={{ fontSize: '18px', color: '#555' }}>Carregando dados do dashboard...</p>
        </div>
      )}

      {!isLoading && currentSection === 'segurosNovos' && (
        <>
          <h2 style={sectionTitleStyle}>Seguros Novos</h2>
          <div style={cardGridStyle}>
            <div style={{ ...cardStyle, backgroundColor: '#e0f2f7' }}>
              <h3 style={cardTitleStyle}>Total de Leads</h3>
              <p style={cardValueStyle}>{dashboardStats.totalLeads}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#e8f5e9' }}>
              <h3 style={cardTitleStyle}>Vendas</h3>
              <p style={cardValueStyle}>{dashboardStats.vendas}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#ffe0b2' }}>
              <h3 style={cardTitleStyle}>Em Contato</h3>
              <p style={cardValueStyle}>{dashboardStats.emContato}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#ffcdd2' }}>
              <h3 style={cardTitleStyle}>Sem Contato</h3>
              <p style={cardValueStyle}>{dashboardStats.semContato}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#f3e5f5' }}>
              <h3 style={cardTitleStyle}>Leads Perdidos</h3>
              <p style={cardValueStyle}>{dashboardStats.perdidos}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#e1f5fe' }}>
              <h3 style={cardTitleStyle}>Taxa de Conversão</h3>
              <p style={cardValueStyle}>{dashboardStats.taxaConversaoLeads}%</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#e0f7fa' }}>
              <h3 style={cardTitleStyle}>Total Prêmio Líquido</h3>
              <p style={cardValueStyle}>
                {dashboardStats.totalPremioLiquidoLeads.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#e8f5e9' }}>
              <h3 style={cardTitleStyle}>Média Comissão</h3>
              <p style={cardValueStyle}>
                {dashboardStats.comissaoMediaGlobalLeads.replace('.', ',')}%
              </p>
            </div>
          </div>

          <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#555', marginBottom: '15px', borderBottom: '1px dashed #e0e0e0', paddingBottom: '8px' }}>Seguradoras (Novos)</h3>
          <div style={cardGridStyle}>
            <div style={{ ...cardStyle, backgroundColor: '#bbdefb' }}>
              <h3 style={cardTitleStyle}>Porto Seguro</h3>
              <p style={cardValueStyle}>{dashboardStats.portoSeguroLeads}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#c8e6c9' }}>
              <h3 style={cardTitleStyle}>Azul Seguros</h3>
              <p style={cardValueStyle}>{dashboardStats.azulSegurosLeads}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#ffecb3' }}>
              <h3 style={cardTitleStyle}>Itau Seguros</h3>
              <p style={cardValueStyle}>{dashboardStats.itauSegurosLeads}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#f8bbd0' }}>
              <h3 style={cardTitleStyle}>Demais Seguradoras</h3>
              <p style={cardValueStyle}>{dashboardStats.demaisSeguradorasLeads}</p>
            </div>
          </div>
        </>
      )}

      {!isLoading && currentSection === 'renovacoes' && (
        <>
          <h2 style={sectionTitleStyle}>Renovações</h2>
          <div style={cardGridStyle}>
            <div style={{ ...cardStyle, backgroundColor: '#e3f2fd' }}>
              <h3 style={cardTitleStyle}>Total de Renovações</h3>
              <p style={cardValueStyle}>{dashboardStats.totalRenovacoes}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#e8f5e9' }}>
              <h3 style={cardTitleStyle}>Renovados</h3>
              <p style={cardValueStyle}>{dashboardStats.renovados}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#ffe0b2' }}>
              <h3 style={cardTitleStyle}>Renovações Perdidas</h3>
              <p style={cardValueStyle}>{dashboardStats.renovacoesPerdidas}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#fce4ec', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <h3 style={cardTitleStyle}>Taxa de Renovação</h3>
              <PieChartComponent percentage={parseFloat(dashboardStats.taxaRenovacao)} color="#673AB7" />
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#e0f7fa' }}>
              <h3 style={cardTitleStyle}>Prêmio Líquido Renovados</h3>
              <p style={cardValueStyle}>
                {dashboardStats.premioLiquidoRenovados.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#e8f5e9' }}>
              <h3 style={cardTitleStyle}>Média Comissão Renovados</h3>
              <p style={cardValueStyle}>
                {dashboardStats.mediaComissaoRenovados.replace('.', ',')}%
              </p>
            </div>
          </div>

          <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#555', marginBottom: '15px', borderBottom: '1px dashed #e0e0e0', paddingBottom: '8px' }}>Seguradoras (Renovações)</h3>
          <div style={cardGridStyle}>
            <div style={{ ...cardStyle, backgroundColor: '#bbdefb' }}>
              <h3 style={cardTitleStyle}>Porto Seguro</h3>
              <p style={cardValueStyle}>{dashboardStats.portoSeguroRenovacoes}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#c8e6c9' }}>
              <h3 style={cardTitleStyle}>Azul Seguros</h3>
              <p style={cardValueStyle}>{dashboardStats.azulSegurosRenovacoes}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#ffecb3' }}>
              <h3 style={cardTitleStyle}>Itau Seguros</h3>
              <p style={cardValueStyle}>{dashboardStats.itauSegurosRenovacoes}</p>
            </div>
            <div style={{ ...cardStyle, backgroundColor: '#f8bbd0' }}>
              <h3 style={cardTitleStyle}>Demais Seguradoras</h3>
              <p style={cardValueStyle}>{dashboardStats.demaisSeguradorasRenovacoes}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
