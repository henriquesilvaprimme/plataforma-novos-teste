import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { RefreshCcw, Users, DollarSign, PhoneCall, PhoneOff, Calendar, XCircle, TrendingUp, Repeat, PieChart } from 'lucide-react';

const Dashboard = ({ usuarioLogado }) => {
  const [leadsData, setLeadsData] = useState([]);
  const [renovacoesData, setRenovacoesData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Estilo para os contadores reduzidos e robustos
  const boxStyle = {
    padding: '8px 12px', // Reduzido
    borderRadius: '8px', // Mais arredondado
    flex: '1 1 auto', // Flexível para se ajustar
    color: '#fff',
    textAlign: 'center',
    minWidth: '120px', // Largura mínima para evitar quebra excessiva
    maxWidth: '180px', // Largura máxima para manter compacto
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)', // Sombra para robustez
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
    margin: '5px', // Espaçamento entre os boxes
  };

  const titleStyle = {
    fontSize: '14px', // Fonte menor para o título
    fontWeight: 'normal', // Peso normal
    marginBottom: '5px',
    opacity: '0.9',
  };

  const valueStyle = {
    fontSize: '20px', // Fonte menor para o valor
    fontWeight: 'bold',
  };

  const PieChartComponent = ({ percentage }) => {
    const radius = 30; // Raio menor
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <svg width="80" height="80" viewBox="0 0 80 80"> {/* Tamanho menor */}
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="transparent"
          stroke="#e0e0e0"
          strokeWidth="8" // Largura da borda
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="transparent"
          stroke="#4CAF50"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
        />
        <text x="40" y="45" textAnchor="middle" fontSize="16" fill="#333" fontWeight="bold"> {/* Fonte menor */}
          {percentage}%
        </text>
      </svg>
    );
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#333', marginBottom: '20px' }}>Dashboard</h1>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px', // Espaçamento ajustado
          marginBottom: '30px',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            cursor: 'pointer',
            fontSize: '14px',
          }}
          title="Data de Início"
        />
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            cursor: 'pointer',
            fontSize: '14px',
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
            padding: '8px 16px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          Filtrar
        </button>

        <button
          title='Atualizando dados...'
          disabled={isRefreshing || isLoading}
          style={{
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 12px',
            cursor: 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '40px',
            height: '40px',
          }}
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
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <p style={{ fontSize: '16px', color: '#555' }}>Carregando dados do dashboard...</p>
        </div>
      )}

      {!isLoading && (
        <>
          {/* Seção de Seguros Novos */}
          <h2 style={{ marginTop: '40px', marginBottom: '15px', fontSize: '24px', fontWeight: 'bold', color: '#333', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>Seguros Novos</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: '10px' }}>
            <div style={{ ...boxStyle, backgroundColor: '#424242' }}>
              <h3 style={titleStyle}>Total de Leads</h3>
              <p style={valueStyle}>{dashboardStats.totalLeads}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#9C27B0' }}>
              <h3 style={titleStyle}>Taxa de Conversão</h3>
              <p style={valueStyle}>{dashboardStats.taxaConversaoLeads}%</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#4CAF50' }}>
              <h3 style={titleStyle}>Vendas</h3>
              <p style={valueStyle}>{dashboardStats.vendas}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#F44336' }}>
              <h3 style={titleStyle}>Leads Perdidos</h3>
              <p style={valueStyle}>{dashboardStats.perdidos}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#FF9800' }}>
              <h3 style={titleStyle}>Em Contato</h3>
              <p style={valueStyle}>{dashboardStats.emContato}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#9E9E9E' }}>
              <h3 style={titleStyle}>Sem Contato</h3>
              <p style={valueStyle}>{dashboardStats.semContato}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: '10px', marginTop: '20px' }}>
            <div style={{ ...boxStyle, backgroundColor: '#003366' }}>
              <h3 style={titleStyle}>Porto Seguro</h3>
              <p style={valueStyle}>{dashboardStats.portoSeguroLeads}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#87CEFA' }}>
              <h3 style={titleStyle}>Azul Seguros</h3>
              <p style={valueStyle}>{dashboardStats.azulSegurosLeads}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#FF8C00' }}>
              <h3 style={titleStyle}>Itau Seguros</h3>
              <p style={valueStyle}>{dashboardStats.itauSegurosLeads}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#4CAF50' }}>
              <h3 style={titleStyle}>Demais Seguradoras</h3>
              <p style={valueStyle}>{dashboardStats.demaisSeguradorasLeads}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: '10px', marginTop: '20px', marginBottom: '40px' }}>
            <div style={{ ...boxStyle, backgroundColor: '#3f51b5' }}>
              <h3 style={titleStyle}>Total Prêmio Líquido</h3>
              <p style={valueStyle}>
                {dashboardStats.totalPremioLiquidoLeads.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </p>
            </div>
              
            <div style={{ ...boxStyle, backgroundColor: '#009688' }}>
              <h3 style={titleStyle}>Média Comissão</h3>
              <p style={valueStyle}>
                {dashboardStats.comissaoMediaGlobalLeads.replace('.', ',')}%
              </p>
            </div>
          </div>

          {/* Seção de Renovações */}
          <h2 style={{ marginTop: '40px', marginBottom: '15px', fontSize: '24px', fontWeight: 'bold', color: '#333', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>Renovações</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: '10px' }}>
            <div style={{ ...boxStyle, backgroundColor: '#673AB7' }}>
              <h3 style={titleStyle}>Total de Renovações</h3>
              <p style={valueStyle}>{dashboardStats.totalRenovacoes}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#2196F3' }}>
              <h3 style={titleStyle}>Renovados</h3>
              <p style={valueStyle}>{dashboardStats.renovados}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#FF5722' }}>
              <h3 style={titleStyle}>Renovações Perdidas</h3>
              <p style={valueStyle}>{dashboardStats.renovacoesPerdidas}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#FFC107', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
              <h3 style={titleStyle}>Taxa de Renovação</h3>
              <PieChartComponent percentage={parseFloat(dashboardStats.taxaRenovacao)} />
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: '10px', marginTop: '20px' }}>
            <div style={{ ...boxStyle, backgroundColor: '#003366' }}>
              <h3 style={titleStyle}>Porto Seguro Renov.</h3>
              <p style={valueStyle}>{dashboardStats.portoSeguroRenovacoes}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#87CEFA' }}>
              <h3 style={titleStyle}>Azul Seguros Renov.</h3>
              <p style={valueStyle}>{dashboardStats.azulSegurosRenovacoes}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#FF8C00' }}>
              <h3 style={titleStyle}>Itau Seguros Renov.</h3>
              <p style={valueStyle}>{dashboardStats.itauSegurosRenovacoes}</p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#4CAF50' }}>
              <h3 style={titleStyle}>Demais Seguradoras Renov.</h3>
              <p style={valueStyle}>{dashboardStats.demaisSeguradorasRenovacoes}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-start', gap: '10px', marginTop: '20px' }}>
            <div style={{ ...boxStyle, backgroundColor: '#00BCD4' }}>
              <h3 style={titleStyle}>Prêmio Líquido Renovados</h3>
              <p style={valueStyle}>
                {dashboardStats.premioLiquidoRenovados.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </p>
            </div>
            <div style={{ ...boxStyle, backgroundColor: '#8BC34A' }}>
              <h3 style={titleStyle}>Média Comissão Renovados</h3>
              <p style={valueStyle}>
                {dashboardStats.mediaComissaoRenovados.replace('.', ',')}%
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
