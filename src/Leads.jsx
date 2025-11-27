import React, { useState, useEffect, useMemo } from 'react';
import Lead from './components/Lead';
import { RefreshCcw, Bell, Search } from 'lucide-react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase'; // ajuste o caminho se necessário

const Leads = ({
  usuarios,
  onUpdateStatus,
  transferirLead,
  usuarioLogado,
  scrollContainerRef,
  saveLocalChange,
}) => {
  // Estado principal dos leads vindo do Firestore
  const [leadsData, setLeadsData] = useState([]);
  const [selecionados, setSelecionados] = useState({});
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [observacoes, setObservacoes] = useState({});
  const [isEditingObservacao, setIsEditingObservacao] = useState({});
  const [dataInput, setDataInput] = useState('');
  const [filtroData, setFiltroData] = useState('');
  const [nomeInput, setNomeInput] = useState('');
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroStatus, setFiltroStatus] = useState(null);
  const [showNotification, setShowNotification] = useState(false);
  const [hasScheduledToday, setHasScheduledToday] = useState(false);

  // Fetch inicial e função reutilizável para buscar leads do Firestore
  const fetchLeadsFromFirebase = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'leads'));
      const lista = [];
      querySnapshot.forEach((docSnap) => {
        lista.push({
          id: docSnap.id,
          ...docSnap.data(),
        });
      });

      // Opcional: ordenar por createdAt (se existir)
      lista.sort((a, b) => {
        const toDate = (v) => {
          if (!v) return new Date(0);
          // Firestore Timestamp tem toDate()
          if (typeof v === 'object' && typeof v.toDate === 'function') {
            return v.toDate();
          }
          return new Date(v);
        };
        const da = toDate(a.createdAt);
        const dbb = toDate(b.createdAt);
        return dbb - da;
      });

      setLeadsData(lista);
    } catch (error) {
      console.error('Erro ao buscar leads do Firebase:', error);
      alert('Erro ao buscar leads do Firebase. Veja o console para detalhes.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLeadsFromFirebase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atualiza observações e flags de edição quando leads chegam
  useEffect(() => {
    const initialObservacoes = {};
    const initialIsEditingObservacao = {};
    leadsData.forEach((lead) => {
      initialObservacoes[lead.id] = lead.observacao || '';
      initialIsEditingObservacao[lead.id] = !lead.observacao || lead.observacao.trim() === '';
    });
    setObservacoes(initialObservacoes);
    setIsEditingObservacao(initialIsEditingObservacao);
  }, [leadsData]);

  const normalizarTexto = (texto = '') => {
    return texto
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()@\+\?><\[\]\+]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // helper: checa se status é string e começa com 'Agendado'
  const isStatusAgendado = (status) => {
    return typeof status === 'string' && status.startsWith('Agendado');
  };

  // helper: extrai data dd/mm/yyyy do campo status (ex: "Agendado - 25/12/2025")
  const extractStatusDate = (status) => {
    if (typeof status !== 'string') return null;
    const parts = status.split(' - ');
    return parts.length > 1 ? parts[1] : null;
  };

  // --- LÓGICA DE CONTAGEM ---
  const contagens = useMemo(() => {
    let emContatoCount = 0;
    let semContatoCount = 0;
    let agendadosCount = 0;
    let todosCount = 0;
    const today = new Date().toLocaleDateString('pt-BR');

    leadsData.forEach((lead) => {
      // Ignorar Fechado e Perdido do total Geral (pendentes)
      if (lead.status !== 'Fechado' && lead.status !== 'Perdido') {
        todosCount++;
      }

      if (lead.status === 'Em Contato') {
        emContatoCount++;
      } else if (lead.status === 'Sem Contato') {
        semContatoCount++;
      } else if (isStatusAgendado(lead.status)) {
        const statusDateStr = extractStatusDate(lead.status);
        if (statusDateStr) {
          const [dia, mes, ano] = statusDateStr.split('/');
          const statusDateFormatted = new Date(`${ano}-${mes}-${dia}T00:00:00`).toLocaleDateString('pt-BR');
          if (statusDateFormatted === today) {
            agendadosCount++;
          }
        }
      }
    });

    return {
      emContato: emContatoCount,
      semContato: semContatoCount,
      agendadosHoje: agendadosCount,
      todosPendentes: todosCount,
    };
  }, [leadsData]);
  // --- FIM DA LÓGICA DE CONTAGEM ---

  useEffect(() => {
    setHasScheduledToday(contagens.agendadosHoje > 0);
  }, [contagens]);

  // Refresh agora recarrega do Firebase
  const handleRefreshLeads = async () => {
    await fetchLeadsFromFirebase();
    // atualizar flags de edição para os leads recém-buscados
    const refreshedIsEditingObservacao = {};
    leadsData.forEach((lead) => {
      refreshedIsEditingObservacao[lead.id] = !lead.observacao || lead.observacao.trim() === '';
    });
    setIsEditingObservacao(refreshedIsEditingObservacao);
  };

  const leadsPorPagina = 10;

  const aplicarFiltroData = () => {
    setFiltroData(dataInput);
    setFiltroNome('');
    setNomeInput('');
    setFiltroStatus(null);
    setPaginaAtual(1);
  };

  const aplicarFiltroNome = () => {
    const filtroLimpo = nomeInput.trim();
    setFiltroNome(filtroLimpo);
    setFiltroData('');
    setDataInput('');
    setFiltroStatus(null);
    setPaginaAtual(1);
  };

  const aplicarFiltroStatus = (status) => {
    setFiltroStatus(status);
    setFiltroNome('');
    setNomeInput('');
    setFiltroData('');
    setDataInput('');
    setPaginaAtual(1);
  };

  const isSameMonthAndYear = (leadDateStr, filtroMesAno) => {
    if (!filtroMesAno) return true;
    if (!leadDateStr) return false;
    const leadData = new Date(leadDateStr);
    const leadAno = leadData.getFullYear();
    const leadMes = String(leadData.getMonth() + 1).padStart(2, '0');
    return filtroMesAno === `${leadAno}-${leadMes}`;
  };

  const nomeContemFiltro = (leadNome, filtroNome) => {
    if (!filtroNome) return true;
    if (!leadNome) return false;
    const nomeNormalizado = normalizarTexto(leadNome);
    const filtroNormalizado = normalizarTexto(filtroNome);
    return nomeNormalizado.includes(filtroNormalizado);
  };

  const gerais = leadsData.filter((lead) => {
    if (lead.status === 'Fechado' || lead.status === 'Perdido') return false;

    if (filtroStatus) {
      if (filtroStatus === 'Agendado') {
        const today = new Date();
        const todayFormatted = today.toLocaleDateString('pt-BR');
        const statusDateStr = extractStatusDate(lead.status);
        if (!statusDateStr) return false;
        const [dia, mes, ano] = statusDateStr.split('/');
        const statusDate = new Date(`${ano}-${mes}-${dia}T00:00:00`);
        const statusDateFormatted = statusDate.toLocaleDateString('pt-BR');
        return isStatusAgendado(lead.status) && statusDateFormatted === todayFormatted;
      }
      return lead.status === filtroStatus;
    }

    if (filtroData) {
      const leadMesAno = lead.createdAt ? (typeof lead.createdAt === 'object' && typeof lead.createdAt.toDate === 'function' ? lead.createdAt.toDate().toISOString().substring(0,7) : (String(lead.createdAt).substring(0,7))) : '';
      return leadMesAno === filtroData;
    }

    if (filtroNome) {
      return nomeContemFiltro(lead.name || lead.nome, filtroNome);
    }

    return true;
  });

  const totalPaginas = Math.max(1, Math.ceil(gerais.length / leadsPorPagina));
  const paginaCorrigida = Math.min(paginaAtual, totalPaginas);
  const usuariosAtivos = usuarios ? usuarios.filter((u) => u.status === 'Ativo') : [];
  const isAdmin = usuarioLogado?.tipo === 'Admin';

  const handleSelect = (leadId, userId) => {
    setSelecionados((prev) => ({
      ...prev,
      [leadId]: Number(userId),
    }));
  };

  const enviarLeadAtualizado = async (lead) => {
    if (!lead || !lead.id) return;
    try {
      const leadRef = doc(db, 'leads', lead.id);
      // Atualiza apenas campos relevantes: usuarioId e responsavel (se existirem)
      const dataToUpdate = {};
      if ('usuarioId' in lead) dataToUpdate.usuarioId = lead.usuarioId ?? null;
      if ('responsavel' in lead) dataToUpdate.responsavel = lead.responsavel ?? null;
      if (Object.keys(dataToUpdate).length > 0) {
        await updateDoc(leadRef, dataToUpdate);
      }
      await fetchLeadsFromFirebase();
    } catch (error) {
      console.error('Erro ao enviar lead atualizado para Firebase:', error);
    }
  };

  const handleEnviar = (leadId) => {
    const finalUserId = selecionados[leadId];

    if (!finalUserId) {
      alert('Selecione um usuário antes de enviar.');
      return;
    }

    // Salva localmente a atribuição para retry/sync futuro (TTL gerenciado pelo App)
    if (typeof saveLocalChange === 'function') {
      saveLocalChange({
        id: leadId,
        type: 'alterarAtribuido',
        data: { leadId, usuarioId: finalUserId },
      });
    }

    // Atualiza local + submete para parent
    transferirLead(leadId, finalUserId);

    // Envia atualização para Firebase: set usuarioId e responsavel (nome)
    const usuario = usuariosAtivos.find((u) => String(u.id) === String(finalUserId));
    const responsavelNome = usuario ? usuario.nome : null;

    const lead = leadsData.find((l) => l.id === leadId);
    const leadAtualizado = { ...lead, usuarioId: finalUserId, responsavel: responsavelNome };

    enviarLeadAtualizado(leadAtualizado);
  };

  const handleAlterar = async (leadId) => {
    // Salva localmente a remoção/alteração de atribuição (usuario null) para retry/sync futuro
    if (typeof saveLocalChange === 'function') {
      saveLocalChange({
        id: leadId,
        type: 'alterarAtribuido',
        data: { leadId, usuarioId: null },
      });
    }

    setSelecionados((prev) => ({
      ...prev,
      [leadId]: '',
    }));
    transferirLead(leadId, null);

    // Atualiza no Firestore: remove usuarioId e responsavel
    try {
      const leadRef = doc(db, 'leads', leadId);
      await updateDoc(leadRef, { usuarioId: null, responsavel: null });
      await fetchLeadsFromFirebase();
    } catch (error) {
      console.error('Erro ao alterar atribuição no Firebase:', error);
      alert('Erro ao alterar atribuição. Veja o console.');
    }
  };

  const inicio = (paginaCorrigida - 1) * leadsPorPagina;
  const fim = inicio + leadsPorPagina;
  const leadsPagina = gerais.slice(inicio, fim);

  // Função para rolar o contêiner principal para o topo
  const scrollToTop = () => {
    if (scrollContainerRef && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  const handlePaginaAnterior = () => {
    setPaginaAtual((prev) => Math.max(prev - 1, 1));
    scrollToTop();
  };

  const handlePaginaProxima = () => {
    setPaginaAtual((prev) => Math.min(prev + 1, totalPaginas));
    scrollToTop();
  };

  const formatarData = (dataStr) => {
    if (!dataStr) return '';
    // Trata Timestamp do Firestore
    if (typeof dataStr === 'object' && typeof dataStr.toDate === 'function') {
      return dataStr.toDate().toLocaleDateString('pt-BR');
    }
    let data;
    if (typeof dataStr === 'string' && dataStr.includes('/')) {
      const partes = dataStr.split('/');
      data = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
    } else if (typeof dataStr === 'string' && dataStr.includes('-') && dataStr.length === 10) {
      const partes = dataStr.split('-');
      data = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
    } else {
      data = new Date(dataStr);
    }

    if (isNaN(data.getTime())) {
      return '';
    }
    return data.toLocaleDateString('pt-BR');
  };

  const handleObservacaoChange = (leadId, text) => {
    setObservacoes((prev) => ({
      ...prev,
      [leadId]: text,
    }));
  };

  const handleSalvarObservacao = async (leadId) => {
    const observacaoTexto = observacoes[leadId] || '';
    if (!observacaoTexto.trim()) {
      alert('Por favor, digite uma observação antes de salvar.');
      return;
    }

    setIsLoading(true);
    try {
      if (typeof saveLocalChange === 'function') {
        saveLocalChange({
          id: leadId,
          type: 'salvarObservacao',
          data: { leadId, observacao: observacaoTexto },
        });
      }

      const leadRef = doc(db, 'leads', leadId);
      await updateDoc(leadRef, { observacao: observacaoTexto });
      setIsEditingObservacao((prev) => ({ ...prev, [leadId]: false }));
      await fetchLeadsFromFirebase();
    } catch (error) {
      console.error('Erro ao salvar observação no Firebase:', error);
      alert('Erro ao salvar observação. Por favor, tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAlterarObservacao = (leadId) => {
    setIsEditingObservacao((prev) => ({ ...prev, [leadId]: true }));
  };

  // Função utilitária para validar dd/mm/yyyy
  const isValidDDMMYYYY = (str) => {
    if (!str || typeof str !== 'string') return false;
    const parts = str.split('/');
    if (parts.length !== 3) return false;
    const [d, m, y] = parts.map((p) => parseInt(p, 10));
    if (!d || !m || !y) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  };

  // Atualiza status no Firebase e também salva observação/agendamento se necessário
  const handleConfirmStatus = async (leadId, novoStatus, phoneOrDate) => {
    // Salva localmente a alteração de status para retry/sync futuro (TTL gerenciado pelo App)
    if (typeof saveLocalChange === 'function') {
      saveLocalChange({
        id: leadId,
        type: 'atualizarStatus',
        data: { leadId, status: novoStatus, phone: phoneOrDate || null },
      });
    }

    // Primeiro notifica o parent para lógica de UI/estado global (se existir)
    try {
      onUpdateStatus && onUpdateStatus(leadId, novoStatus, phoneOrDate);
    } catch (err) {
      // não falhar se parent não estiver presente
      console.warn('onUpdateStatus disparado, mas houve erro/ausência:', err);
    }

    setIsLoading(true);
    try {
      const leadRef = doc(db, 'leads', leadId);

      // Determinar status final e data de agendamento (dd/mm/yyyy) se aplicável
      let finalStatus = novoStatus;
      let agendamento = null;

      // Caso o componente envie 'Agendar' com uma data no terceiro argumento (phoneOrDate),
      // ou envie 'Agendado - dd/mm/yyyy' como novoStatus, tratamos ambos.
      if (novoStatus === 'Agendar') {
        // Se o terceiro argumento contém a data no formato dd/mm/yyyy, usa-a
        if (isValidDDMMYYYY(phoneOrDate)) {
          agendamento = phoneOrDate;
          finalStatus = `Agendado - ${agendamento}`;
        } else {
          // Se não vier data, marcamos apenas como 'Agendado'
          finalStatus = 'Agendado';
          agendamento = null;
        }
      } else if (typeof novoStatus === 'string' && novoStatus.startsWith('Agendado')) {
        const possibleDate = extractStatusDate(novoStatus);
        if (isValidDDMMYYYY(possibleDate)) {
          agendamento = possibleDate;
          finalStatus = novoStatus;
        } else {
          finalStatus = novoStatus;
          agendamento = null;
        }
      } else {
        // Outros status: Fechado, Perdido, Em Contato, Sem Contato, etc.
        finalStatus = novoStatus;
        agendamento = null;
      }

      // Prepara objeto de atualização
      const dataToUpdate = { status: finalStatus };

      // Se tiver phone (número) passado e quiser salvar como 'phone' ou 'telefone'
      if (phoneOrDate && typeof phoneOrDate === 'string' && !isValidDDMMYYYY(phoneOrDate)) {
        // assumimos que é telefone
        dataToUpdate.phone = phoneOrDate;
      }

      // Se houver observação atual no state, atualizamos também
      const observacaoAtual = observacoes[leadId];
      if (observacaoAtual && observacaoAtual.trim() !== '') {
        dataToUpdate.observacao = observacaoAtual;
      }

      // Atualiza campo de agendamento (salva dd/mm/yyyy) ou remove se for null
      if (agendamento) {
        dataToUpdate.agendamento = agendamento;
      } else {
        // se quiser limpar o campo quando não há agendamento, define null
        dataToUpdate.agendamento = null;
      }

      await updateDoc(leadRef, dataToUpdate);

      const currentLead = leadsData.find((l) => l.id === leadId);
      const hasNoObservacao = !currentLead || !currentLead.observacao || currentLead.observacao.trim() === '';

      if ((finalStatus === 'Em Contato' || finalStatus === 'Sem Contato' || (typeof finalStatus === 'string' && finalStatus.startsWith('Agendado'))) && hasNoObservacao) {
        setIsEditingObservacao((prev) => ({ ...prev, [leadId]: true }));
      } else {
        setIsEditingObservacao((prev) => ({ ...prev, [leadId]: false }));
      }

      await fetchLeadsFromFirebase();
    } catch (error) {
      console.error('Erro ao atualizar status no Firebase:', error);
      alert('Erro ao atualizar status. Veja o console.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 relative min-h-screen bg-gray-100 font-sans">
      {/* 1. Overlay de Loading */}
      {isLoading && (
        <div className="fixed inset-0 bg-white bg-opacity-80 flex justify-center items-center z-50">
          <div className="flex items-center">
            <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="ml-4 text-xl font-semibold text-gray-700">Carregando LEADS...</p>
          </div>
        </div>
      )}

      {/* 2. Cabeçalho Principal e Área de Controles */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex flex-wrap itens-center justify-between gap-4 border-b pb-4 mb-4">
          <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
            <Bell size={32} className="text-indigo-500 mr-3" />
            Leads
          </h1>

          <div className="flex items-center gap-4">
            <button
              title="Atualizar dados"
              onClick={handleRefreshLeads}
              disabled={isLoading}
              className={`p-3 rounded-full transition duration-300 ${isLoading ? 'text-gray-400 cursor-not-allowed' : 'text-indigo-600 hover:bg-indigo-100 shadow-sm'}`}
            >
              <RefreshCcw size={24} className={isLoading ? '' : 'hover:rotate-180'} />
            </button>

            {hasScheduledToday && (
              <div
                className="relative cursor-pointer"
                onClick={() => setShowNotification(!showNotification)}
                title="Agendamentos para Hoje"
              >
                <Bell size={32} className="text-red-500" />
                <div className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold ring-2 ring-white">
                  1
                </div>
                {showNotification && (
                  <div className="absolute top-10 right-0 w-64 bg-white border border-gray-200 rounded-lg p-3 shadow-xl z-10">
                    <p className="text-sm font-semibold text-gray-800">Você tem agendamentos hoje!</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Controles de Filtro */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Buscar por nome..."
              value={nomeInput}
              onChange={(e) => setNomeInput(e.target.value)}
              className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              title="Filtrar leads pelo nome (contém)"
            />
            <button
              onClick={aplicarFiltroNome}
              className="p-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition duration-200 shadow-md"
            >
              <Search size={20} />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[200px] justify-end">
            <input
              type="month"
              value={dataInput}
              onChange={(e) => setDataInput(e.target.value)}
              className="p-3 border border-gray-300 rounded-lg cursor-pointer text-sm"
              title="Filtrar leads pelo mês e ano de criação"
            />
            <button
              onClick={aplicarFiltroData}
              className="p-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition duration-200 shadow-md whitespace-nowrap"
            >
              Filtrar Data
            </button>
          </div>
        </div>
      </div>

      {/* 3. Barra de Status/Filtros Rápidos COM CONTAGEM */}
      <div className="flex flex-wrap gap-3 justify-center mb-8">
        <button
          onClick={() => aplicarFiltroStatus('Em Contato')}
          className={`
            px-5 py-2 rounded-full font-bold transition duração-300 shadow-lg
            ${filtroStatus === 'Em Contato' ? 'bg-orange-600 text-white ring-2 ring-orange-400' : 'bg-orange-500 text-white hover:bg-orange-600'}
          `}
        >
          Em Contato <span className="text-sm font-extrabold ml-1">({contagens.emContato})</span>
        </button>

        <button
          onClick={() => aplicarFiltroStatus('Sem Contato')}
          className={`
            px-5 py-2 rounded-full font-bold transition duração-300 shadow-lg
            ${filtroStatus === 'Sem Contato' ? 'bg-gray-700 text-white ring-2 ring-gray-400' : 'bg-gray-500 text-white hover:bg-gray-600'}
          `}
        >
          Sem Contato <span className="text-sm font-extrabold ml-1">({contagens.semContato})</span>
        </button>

        {contagens.agendadosHoje > 0 && (
          <button
            onClick={() => aplicarFiltroStatus('Agendado')}
            className={`
              px-5 py-2 rounded-full font-bold transition duração-300 shadow-lg
              ${filtroStatus === 'Agendado' ? 'bg-blue-700 text-white ring-2 ring-blue-400' : 'bg-blue-500 text-white hover:bg-blue-600'}
            `}
          >
            Agendados <span className="text-sm font-extrabold ml-1">({contagens.agendadosHoje})</span>
          </button>
        )}

        <button
          onClick={() => aplicarFiltroStatus(null)}
          className={`
            px-5 py-2 rounded-full font-bold transition duração-300 shadow-lg
            ${filtroStatus === null ? 'bg-gray-800 text-white ring-2 ring-gray-500' : 'bg-gray-600 text-white hover:bg-gray-700'}
          `}
        >
          Todos <span className="text-sm font-extrabold ml-1">({contagens.todosPendentes})</span>
        </button>
      </div>

      {/* 4. Corpo Principal - Lista de Leads */}
      <div className="space-y-5">
        {isLoading ? null : gerais.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <p className="text-xl font-medium text-gray-600">Você não tem nenhum lead, aguarde. 🧐</p>
          </div>
        ) : (
          <>
            {leadsPagina.map((lead) => {
              const responsavel = usuarios ? usuarios.find((u) => u.nome === lead.responsavel) : null;
              const hasObservacaoSection = (lead.status === 'Em Contato' || lead.status === 'Sem Contato' || isStatusAgendado(lead.status));

              return (
                <div
                  key={lead.id}
                  className="bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 p-6 relative border-t-4 border-indigo-500"
                >
                  <div className={`grid ${hasObservacaoSection ? 'lg:grid-cols-2' : 'lg:grid-cols-1'} gap-6`}>
                    <div className="space-y-4">
                      <Lead
                        lead={lead}
                        onUpdateStatus={handleConfirmStatus}
                        disabledConfirm={!lead.responsavel}
                      />

                      <div className="pt-4 border-t border-gray-100 mt-4">
                        {lead.responsavel && responsavel ? (
                          <div className="flex items-center gap-3">
                            <p className="text-base text-green-600 font-semibold">
                              Transferido para <strong className="font-extrabold">{responsavel.nome}</strong>
                            </p>
                            {isAdmin && (
                              <button
                                onClick={() => handleAlterar(lead.id)}
                                className="px-3 py-1 bg-yellow-400 text-gray-900 text-sm rounded-md hover:bg-yellow-500 transition duration-150 shadow-sm"
                              >
                                Alterar
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <select
                              value={selecionados[lead.id] || ''}
                              onChange={(e) => handleSelect(lead.id, e.target.value)}
                              className="p-2 border border-gray-300 rounded-md text-sm shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            >
                              <option value="">Selecione usuário ativo</option>
                              {usuariosAtivos.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.nome}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleEnviar(lead.id)}
                              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition duration-150 shadow-md whitespace-nowrap"
                            >
                              Enviar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {hasObservacaoSection && (
                      <div className="lg:border-l lg:border-gray-200 lg:pl-6 space-y-3">
                        <label htmlFor={`observacao-${lead.id}`} className="block text-sm font-semibold text-gray-700">
                          Observações:
                        </label>
                        <textarea
                          id={`observacao-${lead.id}`}
                          value={observacoes[lead.id] || ''}
                          onChange={(e) => handleObservacaoChange(lead.id, e.target.value)}
                          placeholder="Adicione suas observações aqui..."
                          rows="3"
                          disabled={!isEditingObservacao[lead.id]}
                          className={`
                            w-full p-3 rounded-lg border text-sm resize-y shadow-sm
                            ${isEditingObservacao[lead.id] ? 'bg-white border-indigo-500 focus:ring-indigo-500' : 'bg-gray-50 border-gray-200 cursor-not-allowed'}
                          `}
                        ></textarea>

                        {isEditingObservacao[lead.id] ? (
                          <button
                            onClick={() => handleSalvarObservacao(lead.id)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition duration-150 font-bold shadow-md"
                          >
                            Salvar Observação
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAlterarObservacao(lead.id)}
                            className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-md hover:bg-yellow-500 transition duration-150 font-bold shadow-md"
                          >
                            Alterar Observação
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div
                    className="absolute bottom-2 right-4 text-xs text-gray-400 italic"
                    title={`Criado em: ${formatarData(lead.createdAt)}`}
                  >
                    Criado em: {formatarData(lead.createdAt)}
                  </div>
                </div>
              );
            })}

            {/* Paginação */}
            <div className="flex justify-center items-center gap-4 mt-8 pb-8">
              <button
                onClick={handlePaginaAnterior}
                disabled={paginaCorrigida <= 1 || isLoading}
                className={`px-4 py-2 rounded-lg border texto-sm font-medium transition duration-150 shadow-md ${
                  (paginaCorrigida <= 1 || isLoading)
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-white border-indigo-500 text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                Anterior
              </button>

              <span className="text-gray-700 font-semibold">
                Página {paginaCorrigida} de {totalPaginas}
              </span>

              <button
                onClick={handlePaginaProxima}
                disabled={paginaCorrigida >= totalPaginas || isLoading}
                className={`px-4 py-2 rounded-lg border texto-sm font-medium transition duration-150 shadow-md ${
                  (paginaCorrigida >= totalPaginas || isLoading)
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-white border-indigo-500 text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                Próxima
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Leads;
