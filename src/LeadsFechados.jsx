// src/Leads.jsx
import React, { useState, useEffect, useMemo } from 'react';
import Lead from './components/Lead';
import { RefreshCcw, Bell, Search } from 'lucide-react';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase'; // ajuste o caminho se necessário

// Pequeno utilitário para classes condicinais (evita template literals longos)
const classNames = (...args) => args.filter(Boolean).join(' ');

/**
 * Componente Leads:
 * - Lê collection 'leads' (listener em tempo real)
 * - showFechados=true -> exibe apenas leads com insurerConfirmed === true
 * - Respeita visibilidade: Admin vê todos; Usuario vê apenas seus leads
 */
const Leads = ({
  usuarios,
  onUpdateStatus,
  transferirLead,
  usuarioLogado,
  scrollContainerRef,
  saveLocalChange,
  showFechados = false, // se true exibe apenas insurerConfirmed === true
}) => {
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

  // modal de fechamento
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingLead, setClosingLead] = useState(null);
  const [modalNome, setModalNome] = useState('');
  const [modalSeguradora, setModalSeguradora] = useState('');
  const [modalMeioPagamento, setModalMeioPagamento] = useState('');
  const [modalCartaoPortoNovo, setModalCartaoPortoNovo] = useState('Não');
  const [modalPremioLiquido, setModalPremioLiquido] = useState('');
  const [modalComissao, setModalComissao] = useState('');
  const [modalParcelamento, setModalParcelamento] = useState('1');
  const [modalVigenciaInicial, setModalVigenciaInicial] = useState('');
  const [modalVigenciaFinal, setModalVigenciaFinal] = useState('');
  const [isSubmittingClose, setIsSubmittingClose] = useState(false);

  // Normalização de documento Firestore -> objeto consumível
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

    const nomeVal =
      safe(data.Nome) ||
      safe(data.nome) ||
      safe(data.Name) ||
      safe(data.name) ||
      safe(data['Nome Completo']) ||
      '';

    const modeloVal =
      safe(data.Modelo) ||
      safe(data.modelo) ||
      safe(data['Modelo do Veículo']) ||
      safe(data.modeloVeiculo) ||
      safe(data.vehicleModel) ||
      safe(data.model) ||
      '';

    const anoModeloVal =
      safe(data.AnoModelo) ||
      safe(data.anoModelo) ||
      safe(data.Ano) ||
      safe(data.ano) ||
      safe(data.vehicleYearModel) ||
      '';

    const cidadeVal = safe(data.Cidade) || safe(data.cidade) || safe(data.city) || '';
    const telefoneVal = safe(data.Telefone) || safe(data.telefone) || safe(data.phone) || '';
    const tipoSeguroVal =
      safe(data.TipoSeguro) || safe(data.tipoSeguro) || safe(data.insuranceType) || '';

    return {
      id: String(docId),
      ID: data.ID ?? data.id ?? docId,
      Nome: nomeVal,
      name: nomeVal,
      Modelo: modeloVal,
      vehicleModel: modeloVal,
      AnoModelo: anoModeloVal,
      vehicleYearModel: anoModeloVal,
      Cidade: cidadeVal,
      city: cidadeVal,
      Telefone: telefoneVal,
      phone: telefoneVal,
      TipoSeguro: tipoSeguroVal,
      insuranceType: tipoSeguroVal,
      status: typeof data.status === 'string' ? data.status : data.Status ?? '',
      confirmado: data.confirmado === true || data.confirmado === 'true',
      insurer: data.insurer ?? data.Seguradora ?? '',
      insurerConfirmed: data.insurerConfirmed === true || data.insurerConfirmed === 'true',
      usuarioId:
        data.usuarioId !== undefined && data.usuarioId !== null
          ? Number(data.usuarioId)
          : data.usuarioId ?? null,
      premioLiquido: data.premioLiquido ?? data.PremioLiquido ?? '',
      comissao: data.comissao ?? data.Comissao ?? '',
      parcelamento: data.parcelamento ?? data.Parcelamento ?? '',
      VigenciaFinal: data.VigenciaFinal ?? data.vigenciaFinal ?? '',
      VigenciaInicial: data.VigenciaInicial ?? data.vigenciaInicial ?? '',
      createdAt: toISO(data.createdAt ?? data.data ?? data.Data),
      responsavel: data.responsavel ?? data.Responsavel ?? '',
      observacao: data.observacao ?? data.Observacao ?? '',
      agendamento: data.agendamento ?? data.Agendamento ?? '',
      agendados: data.agendados ?? false,
      MeioPagamento: data.MeioPagamento ?? '',
      CartaoPortoNovo: data.CartaoPortoNovo ?? '',
      ...data,
    };
  };

  // Formata ISO -> DD/MM/YYYY
  const formatDDMMYYYYFromISO = (isoOrString) => {
    if (!isoOrString) return '';
    try {
      if (typeof isoOrString === 'object' && typeof isoOrString.toDate === 'function') {
        const d = isoOrString.toDate();
        return d.toLocaleDateString('pt-BR');
      }
      const d = new Date(isoOrString);
      if (isNaN(d.getTime())) return '';
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = String(d.getMonth() + 1).padStart(2, '0');
      const ano = d.getFullYear();
      return `${dia}/${mes}/${ano}`;
    } catch {
      return '';
    }
  };

  // Move lead manualmente para leadsFechados (mantive função existente)
  const moveLeadToClosed = async (leadId, leadData = {}) => {
    try {
      const payload = {
        ID: leadData.ID ?? leadData.id ?? String(leadId),
        id: String(leadId),
        Nome: leadData.Nome ?? leadData.name ?? '',
        Modelo: leadData.Modelo ?? leadData.vehicleModel ?? '',
        AnoModelo: leadData.AnoModelo ?? leadData.vehicleYearModel ?? '',
        Cidade: leadData.Cidade ?? leadData.city ?? '',
        Telefone: leadData.Telefone ?? leadData.phone ?? '',
        TipoSeguro: leadData.TipoSeguro ?? leadData.insuranceType ?? '',
        usuarioId: leadData.usuarioId ?? null,
        Seguradora: '',
        MeioPagamento: '',
        CartaoPortoNovo: '',
        PremioLiquido: '',
        Comissao: '',
        Parcelamento: '',
        VigenciaInicial: '',
        VigenciaFinal: '',
        Status: leadData.status ?? leadData.Status ?? 'Fechado',
        Observacao: leadData.observacao ?? leadData.Observacao ?? '',
        Responsavel: leadData.responsavel ?? leadData.Responsavel ?? '',
        Data: leadData.Data ?? formatDDMMYYYYFromISO(leadData.createdAt) ?? '',
        createdAt: leadData.createdAt ?? null,
        closedAt: serverTimestamp(),
      };

      const closedRef = doc(db, 'leadsFechados', String(leadId));
      await setDoc(closedRef, payload);

      const originalRef = doc(db, 'leads', String(leadId));
      const updatePayload = {
        closed: true,
        closedAt: serverTimestamp(),
        status: payload.Status ?? 'Fechado',
      };
      await updateDoc(originalRef, updatePayload);

      console.log(`Lead ${leadId} movida para leadsFechados.`);
    } catch (err) {
      console.error('Erro ao mover lead para fechado:', err);
    }
  };

  // Listener em tempo real da coleção 'leads'
  useEffect(() => {
    setIsLoading(true);
    const collRef = collection(db, 'leads');
    const unsub = onSnapshot(
      collRef,
      (snapshot) => {
        const lista = snapshot.docs.map((d) => normalizeLead(d.id, d.data()));

        // Ordena por createdAt desc (quando disponível)
        lista.sort((a, b) => {
          const da = a.createdAt ? new Date(a.createdAt) : new Date(0);
          const dbb = b.createdAt ? new Date(b.createdAt) : new Date(0);
          return dbb - da;
        });

        setLeadsData(lista);

        // init observacoes
        const initialObservacoes = {};
        const initialIsEditingObservacao = {};
        lista.forEach((lead) => {
          initialObservacoes[lead.id] = lead.observacao || '';
          initialIsEditingObservacao[lead.id] =
            !lead.observacao || lead.observacao.trim() === '';
        });
        setObservacoes(initialObservacoes);
        setIsEditingObservacao(initialIsEditingObservacao);

        setIsLoading(false);
      },
      (err) => {
        console.error('Erro no listener de leads:', err);
        setIsLoading(false);
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch manual (botão refresh)
  const fetchLeadsFromFirebase = async () => {
    setIsLoading(true);
    try {
      const qSnap = await getDocs(collection(db, 'leads'));
      const lista = [];
      qSnap.forEach((s) => lista.push(normalizeLead(s.id, s.data())));

      lista.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dbb = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dbb - da;
      });

      setLeadsData(lista);

      const initialObservacoes = {};
      const initialIsEditingObservacao = {};
      lista.forEach((lead) => {
        initialObservacoes[lead.id] = lead.observacao || '';
        initialIsEditingObservacao[lead.id] =
          !lead.observacao || lead.observacao.trim() === '';
      });
      setObservacoes(initialObservacoes);
      setIsEditingObservacao(initialIsEditingObservacao);
    } catch (err) {
      console.error('Erro ao buscar leads manualmente:', err);
      alert('Erro ao buscar leads do Firebase. Veja o console.');
    } finally {
      setIsLoading(false);
    }
  };

  const normalizarTexto = (texto = '') =>
    texto
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()@\+\?><\[\]\+]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const isStatusAgendado = (status) => typeof status === 'string' && status.startsWith('Agendado');
  const extractStatusDate = (status) => {
    if (typeof status !== 'string') return null;
    const parts = status.split(' - ');
    return parts.length > 1 ? parts[1] : null;
  };

  // VISIBILITY: Admin vs Usuario
  const isAdmin = usuarioLogado?.tipo === 'Admin' || usuarioLogado?.role === 'Admin';

  const getCurrentUserFromPropOrStorage = () => {
    if (usuarioLogado) return usuarioLogado;
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  const canViewLead = (lead) => {
    if (isAdmin) return true;
    const user = getCurrentUserFromPropOrStorage();
    if (!user) return false;

    const userId = String(user.id ?? user.ID ?? user.userId ?? '').trim();
    const userNome = String(user.nome ?? user.name ?? user.usuario ?? '').trim().toLowerCase();

    const leadUsuarioId = lead.usuarioId !== undefined && lead.usuarioId !== null ? String(lead.usuarioId).trim() : '';
    if (leadUsuarioId && userId && leadUsuarioId === userId) return true;

    const leadResponsavel = String(lead.responsavel ?? lead.Responsavel ?? '').trim().toLowerCase();
    if (leadResponsavel && userNome && leadResponsavel === userNome) return true;

    const leadUsuarioLogin = String(lead.usuario ?? lead.user ?? lead.raw?.usuario ?? lead.raw?.user ?? '').trim();
    const userLogin = String(user.usuario ?? '').trim();
    if (leadUsuarioLogin && userLogin && leadUsuarioLogin === userLogin) return true;

    return false;
  };

  // Contagens (somente leads visíveis)
  const contagens = useMemo(() => {
    const visibleLeads = leadsData.filter((l) => canViewLead(l));
    let emContatoCount = 0;
    let semContatoCount = 0;
    let agendadosCount = 0;
    let todosCount = 0;
    const today = new Date().toLocaleDateString('pt-BR');

    visibleLeads.forEach((lead) => {
      const s = lead.status ?? '';
      if (s !== 'Fechado' && s !== 'Perdido') {
        todosCount++;
      }

      if (s === 'Em Contato') emContatoCount++;
      else if (s === 'Sem Contato') semContatoCount++;
      else if (isStatusAgendado(s)) {
        const statusDateStr = extractStatusDate(s);
        if (statusDateStr) {
          const [dia, mes, ano] = statusDateStr.split('/');
          const statusDateFormatted = new Date(`${ano}-${mes}-${dia}T00:00:00`).toLocaleDateString('pt-BR');
          if (statusDateFormatted === today) agendadosCount++;
        }
      }
    });

    return {
      emContato: emContatoCount,
      semContato: semContatoCount,
      agendadosHoje: agendadosCount,
      todosPendentes: todosCount,
    };
  }, [leadsData, usuarioLogado]);

  useEffect(() => {
    setHasScheduledToday(contagens.agendadosHoje > 0);
  }, [contagens]);

  const handleRefreshLeads = async () => {
    await fetchLeadsFromFirebase();
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

  const nomeContemFiltro = (leadNome, filtroNomeArg) => {
    if (!filtroNomeArg) return true;
    if (!leadNome) return false;
    const nomeNormalizado = normalizarTexto(leadNome);
    const filtroNormalizado = normalizarTexto(filtroNomeArg);
    return nomeNormalizado.includes(filtroNormalizado);
  };

  // Leads visíveis (filtragem por visibilidade)
  const visibleLeadsAll = leadsData.filter((lead) => canViewLead(lead));

  // Leads fechados: insurerConfirmed === true
  const fechadosFiltered = visibleLeadsAll
    .filter((lead) => lead.insurerConfirmed === true)
    .filter((lead) => {
      if (filtroData) {
        const leadMesAno = lead.createdAt ? String(lead.createdAt).substring(0, 7) : '';
        if (leadMesAno !== filtroData) return false;
      }
      if (filtroNome) {
        if (!nomeContemFiltro(lead.Nome || lead.name || lead.nome, filtroNome)) return false;
      }
      return true;
    });

  // Leads gerais (exclui Fechado e Perdido)
  const gerais = visibleLeadsAll.filter((lead) => {
    const s = lead.status ?? '';
    if (s === 'Fechado' || s === 'Perdido') return false;

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
      const leadMesAno = lead.createdAt ? String(lead.createdAt).substring(0, 7) : '';
      if (leadMesAno !== filtroData) return false;
    }

    if (filtroNome) {
      if (!nomeContemFiltro(lead.Nome || lead.name || lead.nome, filtroNome)) return false;
    }

    return true;
  });

  const leadsForDisplay = showFechados ? fechadosFiltered : gerais;
  const totalPaginas = Math.max(1, Math.ceil(leadsForDisplay.length / leadsPorPagina));
  const paginaCorrigida = Math.min(paginaAtual, totalPaginas);
  const inicio = (paginaCorrigida - 1) * leadsPorPagina;
  const fim = inicio + leadsPorPagina;
  const leadsPagina = leadsForDisplay.slice(inicio, fim);

  const usuariosAtivos = usuarios ? usuarios.filter((u) => u.status === 'Ativo') : [];

  const handleSelect = (leadId, userId) => {
    setSelecionados((prev) => ({ ...prev, [leadId]: Number(userId) }));
  };

  const enviarLeadAtualizado = async (lead) => {
    if (!lead || !lead.id) return;
    try {
      const leadRef = doc(db, 'leads', lead.id);
      const dataToUpdate = {};
      if ('usuarioId' in lead) dataToUpdate.usuarioId = lead.usuarioId ?? null;
      if ('responsavel' in lead) dataToUpdate.responsavel = lead.responsavel ?? null;
      if (Object.keys(dataToUpdate).length > 0) {
        await updateDoc(leadRef, dataToUpdate);
      }
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
    if (typeof saveLocalChange === 'function') {
      saveLocalChange({
        id: leadId,
        type: 'alterarAtribuido',
        data: { leadId, usuarioId: finalUserId },
      });
    }
    transferirLead(leadId, finalUserId);

    const usuario = usuariosAtivos.find((u) => String(u.id) === String(finalUserId));
    const responsavelNome = usuario ? usuario.nome : null;
    const lead = leadsData.find((l) => l.id === leadId);
    const leadAtualizado = { ...lead, usuarioId: finalUserId, responsavel: responsavelNome };
    enviarLeadAtualizado(leadAtualizado);
  };

  const handleAlterar = async (leadId) => {
    if (typeof saveLocalChange === 'function') {
      saveLocalChange({
        id: leadId,
        type: 'alterarAtribuido',
        data: { leadId, usuarioId: null },
      });
    }
    setSelecionados((prev) => ({ ...prev, [leadId]: '' }));
    transferirLead(leadId, null);
    try {
      const leadRef = doc(db, 'leads', leadId);
      await updateDoc(leadRef, { usuarioId: null, responsavel: null });
    } catch (error) {
      console.error('Erro ao alterar atribuição no Firebase:', error);
      alert('Erro ao alterar atribuição. Veja o console.');
    }
  };

  const scrollToTop = () => {
    if (scrollContainerRef && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
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
    try {
      const d = new Date(dataStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('pt-BR');
    } catch {
      return '';
    }
  };

  const handleObservacaoChange = (leadId, text) => {
    setObservacoes((prev) => ({ ...prev, [leadId]: text }));
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

  const isValidDDMMYYYY = (str) => {
    if (!str || typeof str !== 'string') return false;
    const parts = str.split('/');
    if (parts.length !== 3) return false;
    const [d, m, y] = parts.map((p) => parseInt(p, 10));
    if (!d || !m || !y) return false;
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  };

  const handleConfirmStatus = async (leadId, novoStatus, phoneOrDate) => {
    if (novoStatus === 'Fechado') {
      const lead = leadsData.find((l) => String(l.id) === String(leadId));
      if (!lead) {
        alert('Lead não encontrada para fechamento.');
        return;
      }
      openClosingModal(lead);
      return;
    }

    if (typeof saveLocalChange === 'function') {
      saveLocalChange({
        id: leadId,
        type: 'atualizarStatus',
        data: { leadId, status: novoStatus, phone: phoneOrDate || null },
      });
    }

    try {
      onUpdateStatus && onUpdateStatus(leadId, novoStatus, phoneOrDate);
    } catch (err) {
      console.warn('onUpdateStatus disparado, mas houve erro/ausência:', err);
    }

    setIsLoading(true);
    try {
      const leadRef = doc(db, 'leads', leadId);

      let finalStatus = novoStatus;
      let agendamento = null;

      if (novoStatus === 'Agendar') {
        if (isValidDDMMYYYY(phoneOrDate)) {
          agendamento = phoneOrDate;
          finalStatus = `Agendado - ${agendamento}`;
        } else {
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
        finalStatus = novoStatus;
        agendamento = null;
      }

      const dataToUpdate = { status: finalStatus };

      if (phoneOrDate && typeof phoneOrDate === 'string' && !isValidDDMMYYYY(phoneOrDate)) {
        dataToUpdate.phone = phoneOrDate;
      }

      const observacaoAtual = observacoes[leadId];
      if (observacaoAtual && observacaoAtual.trim() !== '') dataToUpdate.observacao = observacaoAtual;
      if (agendamento) dataToUpdate.agendamento = agendamento;
      else dataToUpdate.agendamento = null;

      await updateDoc(leadRef, dataToUpdate);

      const currentLead = leadsData.find((l) => l.id === leadId);
      const hasNoObservacao = !currentLead || !currentLead.observacao || currentLead.observacao.trim() === '';

      if (
        (finalStatus === 'Em Contato' ||
          finalStatus === 'Sem Contato' ||
          (typeof finalStatus === 'string' && finalStatus.startsWith('Agendado'))) &&
        hasNoObservacao
      ) {
        setIsEditingObservacao((prev) => ({ ...prev, [leadId]: true }));
      } else {
        setIsEditingObservacao((prev) => ({ ...prev, [leadId]: false }));
      }
    } catch (error) {
      console.error('Erro ao atualizar status no Firebase:', error);
      alert('Erro ao atualizar status. Veja o console.');
    } finally {
      setIsLoading(false);
    }
  };

  // Modal helpers
  const toDateInputValue = (date = new Date()) => {
    const d = new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${yyyy}-${mm}-${dd}`;
  };

  const addOneYearDateInputValue = (date = new Date()) => {
    const d = new Date(date);
    d.setFullYear(d.getFullYear() + 1);
    return toDateInputValue(d);
  };

  const formatCurrencyFromDigits = (digits) => {
    if (!digits) return '';
    const int = parseInt(digits, 10);
    if (isNaN(int)) return '';
    const value = int / 100;
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const extractDigits = (str = '') => (str ? String(str).replace(/\D/g, '') : '');

  const handlePremioChange = (e) => {
    const raw = e.target.value;
    const digits = extractDigits(raw);
    const formatted = digits ? formatCurrencyFromDigits(digits) : '';
    setModalPremioLiquido(formatted);
  };

  const handleComissaoChange = (e) => {
    const raw = e.target.value;
    const digits = extractDigits(raw).slice(0, 3);
    if (!digits) {
      setModalComissao('');
      return;
    }
    setModalComissao(`${parseInt(digits, 10)}%`);
  };

  const openClosingModal = (lead) => {
    setClosingLead(lead);
    setModalNome(lead.Nome || lead.name || lead.nome || '');
    setModalSeguradora(lead.Seguradora || lead.insurer || '');
    setModalMeioPagamento(lead.MeioPagamento || '');
    setModalCartaoPortoNovo(lead.CartaoPortoNovo ? String(lead.CartaoPortoNovo) : 'Não');
    setModalPremioLiquido(lead.PremioLiquido ? String(lead.PremioLiquido) : '');
    const com = lead.Comissao ?? lead.comissao ?? '';
    setModalComissao(com ? (String(com).includes('%') ? String(com) : `${String(extractDigits(com) || com)}%`) : '');
    setModalParcelamento(lead.Parcelamento ? String(lead.Parcelamento) : '1');
    const hoje = new Date();
    setModalVigenciaInicial(toDateInputValue(hoje));
    setModalVigenciaFinal(addOneYearDateInputValue(hoje));
    setIsClosingModalOpen(true);
  };

  const closeClosingModal = () => {
    setIsClosingModalOpen(false);
    setClosingLead(null);
    setIsSubmittingClose(false);
  };

  // Concluir venda: grava em leadsFechados e atualiza lead original com insurerConfirmed true
  const handleConcluirVenda = async () => {
    if (!closingLead) return;
    setIsSubmittingClose(true);
    try {
      const leadId = String(closingLead.id);
      const vigIniISO = modalVigenciaInicial ? new Date(`${modalVigenciaInicial}T00:00:00`).toISOString() : '';
      const vigFinISO = modalVigenciaFinal ? new Date(`${modalVigenciaFinal}T00:00:00`).toISOString() : '';

      const payload = {
        ID: closingLead.ID ?? closingLead.id ?? leadId,
        id: leadId,
        Nome: modalNome,
        name: modalNome,
        Modelo: closingLead.Modelo ?? closingLead.vehicleModel ?? '',
        AnoModelo: closingLead.AnoModelo ?? closingLead.vehicleYearModel ?? '',
        Cidade: closingLead.Cidade ?? closingLead.city ?? '',
        Telefone: closingLead.Telefone ?? closingLead.phone ?? '',
        TipoSeguro: closingLead.TipoSeguro ?? closingLead.insuranceType ?? '',
        usuarioId: closingLead.usuarioId ?? null,
        Seguradora: modalSeguradora || '',
        MeioPagamento: modalMeioPagamento || '',
        CartaoPortoNovo: modalMeioPagamento === 'CP' ? (modalCartaoPortoNovo || 'Não') : '',
        PremioLiquido: modalPremioLiquido || '',
        Comissao: modalComissao || '',
        Parcelamento: modalParcelamento || '',
        VigenciaInicial: vigIniISO || '',
        VigenciaFinal: vigFinISO || '',
        Status: 'Fechado',
        Observacao: closingLead.observacao ?? closingLead.Observacao ?? '',
        Responsavel: closingLead.responsavel ?? closingLead.Responsavel ?? usuarioLogado?.nome ?? '',
        Data: closingLead.Data ?? formatDDMMYYYYFromISO(closingLead.createdAt) ?? '',
        createdAt: closingLead.createdAt ?? null,
        closedAt: serverTimestamp(),
      };

      const closedRef = doc(db, 'leadsFechados', leadId);
      await setDoc(closedRef, payload);

      // grava também em 'renovacoes' (opcional)
      try {
        const renovRef = doc(db, 'renovacoes', leadId);
        await setDoc(renovRef, { ...payload, registeredAt: serverTimestamp() });
      } catch (errRenov) {
        console.error('Erro ao gravar em renovacoes:', errRenov);
      }

      const originalRef = doc(db, 'leads', leadId);
      const updatePayload = {
        status: 'Fechado',
        closedAt: serverTimestamp(),
        Seguradora: modalSeguradora || '',
        PremioLiquido: modalPremioLiquido || '',
        Comissao: modalComissao || '',
        Parcelamento: modalParcelamento || '',
        MeioPagamento: modalMeioPagamento || '',
        CartaoPortoNovo: modalMeioPagamento === 'CP' ? (modalCartaoPortoNovo || 'Não') : '',
        VigenciaInicial: vigIniISO || '',
        VigenciaFinal: vigFinISO || '',
        Nome: modalNome,
        name: modalNome,
        insurerConfirmed: true,
      };

      if (typeof saveLocalChange === 'function') {
        saveLocalChange({
          id: leadId,
          type: 'alterar_seguradora',
          data: {
            leadId,
            Seguradora: modalSeguradora || '',
            PremioLiquido: modalPremioLiquido || '',
            Comissao: modalComissao || '',
            Parcelamento: modalParcelamento || '',
            MeioPagamento: modalMeioPagamento || '',
            CartaoPortoNovo: modalMeioPagamento === 'CP' ? (modalCartaoPortoNovo || 'Não') : '',
            VigenciaInicial: vigIniISO || '',
            VigenciaFinal: vigFinISO || '',
            Nome: modalNome,
          },
        });
      }

      await updateDoc(originalRef, updatePayload);

      closeClosingModal();
      alert('Venda concluída e registrada em leadsFechados com sucesso.');
    } catch (err) {
      console.error('Erro ao concluir venda:', err);
      alert('Erro ao concluir venda. Veja o console para detalhes.');
      setIsSubmittingClose(false);
    }
  };

  // Opções estáticas
  const seguradoraOptions = [
    '',
    'Porto Seguro',
    'Azul Seguros',
    'Itau Seguros',
    'Tokio Marine',
    'Yelum Seguros',
    'Suhai Seguros',
    'Allianz Seguros',
    'Bradesco Seguros',
    'Mitsui Seguros',
    'Hdi Seguros',
    'Aliro Seguros',
    'Zurich Seguros',
    'Alfa Seguros',
    'Demais Seguradoras',
  ];
  const meioPagamentoOptions = ['', 'CP', 'CC', 'Debito', 'Boleto'];

  return (
    <div className="p-4 md:p-6 lg:p-8 relative min-h-screen bg-gray-100 font-sans">
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

      <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 mb-4">
          <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
            <Bell size={32} className="text-indigo-500 mr-3" />
            {showFechados ? 'Leads Fechados' : 'Leads'}
          </h1>

          <div className="flex items-center gap-4">
            <button
              title="Atualizar dados"
              onClick={handleRefreshLeads}
              disabled={isLoading}
              className={classNames(
                'p-3 rounded-full transition duration-300',
                isLoading ? 'text-gray-400 cursor-not-allowed' : 'text-indigo-600 hover:bg-indigo-100 shadow-sm'
              )}
            >
              <RefreshCcw size={24} />
            </button>

            {hasScheduledToday && !showFechados && (
              <div
                className="relative cursor-pointer"
                onClick={() => setShowNotification(!showNotification)}
                title="Agendamentos para Hoje"
              >
                <Bell size={32} className="text-red-500" />
                <div className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold ring-2 ring-white">
                  {contagens.agendadosHoje}
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

      <div className="flex flex-wrap gap-3 justify-center mb-8">
        <button
          onClick={() => aplicarFiltroStatus('Em Contato')}
          className={classNames(
            'px-5 py-2 rounded-full font-bold transition duration-300 shadow-lg',
            filtroStatus === 'Em Contato' ? 'bg-orange-600 text-white ring-2 ring-orange-400' : 'bg-orange-500 text-white hover:bg-orange-600'
          )}
        >
          Em Contato <span className="text-sm font-extrabold ml-1">({contagens.emContato})</span>
        </button>

        <button
          onClick={() => aplicarFiltroStatus('Sem Contato')}
          className={classNames(
            'px-5 py-2 rounded-full font-bold transition duration-300 shadow-lg',
            filtroStatus === 'Sem Contato' ? 'bg-gray-700 text-white ring-2 ring-gray-400' : 'bg-gray-500 text-white hover:bg-gray-600'
          )}
        >
          Sem Contato <span className="text-sm font-extrabold ml-1">({contagens.semContato})</span>
        </button>

        {contagens.agendadosHoje > 0 && !showFechados && (
          <button
            onClick={() => aplicarFiltroStatus('Agendado')}
            className={classNames(
              'px-5 py-2 rounded-full font-bold transition duration-300 shadow-lg',
              filtroStatus === 'Agendado' ? 'bg-blue-700 text-white ring-2 ring-blue-400' : 'bg-blue-500 text-white hover:bg-blue-600'
            )}
          >
            Agendados <span className="text-sm font-extrabold ml-1">({contagens.agendadosHoje})</span>
          </button>
        )}

        <button
          onClick={() => aplicarFiltroStatus(null)}
          className={classNames(
            'px-5 py-2 rounded-full font-bold transition duration-300 shadow-lg',
            filtroStatus === null ? 'bg-gray-800 text-white ring-2 ring-gray-500' : 'bg-gray-600 text-white hover:bg-gray-700'
          )}
        >
          Todos <span className="text-sm font-extrabold ml-1">{!showFechados ? `(${contagens.todosPendentes})` : `(${fechadosFiltered.length})`}</span>
        </button>
      </div>

      <div className="space-y-5">
        {isLoading ? null : leadsForDisplay.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <p className="text-xl font-medium text-gray-600">
              {showFechados ? 'Nenhum lead fechado (insurerConfirmed) encontrado.' : 'Você não tem nenhum lead, aguarde. 🧐'}
            </p>
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
                  <div className={classNames('grid', hasObservacaoSection ? 'lg:grid-cols-2' : 'lg:grid-cols-1', 'gap-6')}>
                    <div className="space-y-4">
                      <Lead lead={lead} onUpdateStatus={handleConfirmStatus} disabledConfirm={!lead.responsavel} />

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
                              {usuariosAtivos.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
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
                        <label htmlFor={`observacao-${lead.id}`} className="block text-sm font-semibold text-gray-700">Observações:</label>
                        <textarea
                          id={`observacao-${lead.id}`}
                          value={observacoes[lead.id] || ''}
                          onChange={(e) => handleObservacaoChange(lead.id, e.target.value)}
                          placeholder="Adicione suas observações aqui..."
                          rows="3"
                          disabled={!isEditingObservacao[lead.id]}
                          className={classNames(
                            'w-full p-3 rounded-lg border text-sm resize-y shadow-sm',
                            isEditingObservacao[lead.id] ? 'bg-white border-indigo-500 focus:ring-indigo-500' : 'bg-gray-50 border-gray-200 cursor-not-allowed'
                          )}
                        />
                        {isEditingObservacao[lead.id] ? (
                          <button onClick={() => handleSalvarObservacao(lead.id)} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition duration-150 font-bold shadow-md">
                            Salvar Observação
                          </button>
                        ) : (
                          <button onClick={() => handleAlterarObservacao(lead.id)} className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-md hover:bg-yellow-500 transition duration-150 font-bold shadow-md">
                            Alterar Observação
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="absolute bottom-2 right-4 text-xs text-gray-400 italic" title={`Criado em: ${formatarData(lead.createdAt)}`}>
                    Criado em: {formatarData(lead.createdAt)}
                  </div>
                </div>
              );
            })}

            <div className="flex justify-center items-center gap-4 mt-8 pb-8">
              <button
                onClick={handlePaginaAnterior}
                disabled={paginaCorrigida <= 1 || isLoading}
                className={classNames(
                  'px-4 py-2 rounded-lg border text-sm font-medium transition duration-150 shadow-md',
                  (paginaCorrigida <= 1 || isLoading) ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white border-indigo-500 text-indigo-600 hover:bg-indigo-50'
                )}
              >
                Anterior
              </button>

              <span className="text-gray-700 font-semibold">Página {paginaCorrigida} de {totalPaginas}</span>

              <button
                onClick={handlePaginaProxima}
                disabled={paginaCorrigida >= totalPaginas || isLoading}
                className={classNames(
                  'px-4 py-2 rounded-lg border text-sm font-medium transition duration-150 shadow-md',
                  (paginaCorrigida >= totalPaginas || isLoading) ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white border-indigo-500 text-indigo-600 hover:bg-indigo-50'
                )}
              >
                Próxima
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal de Concluir Venda (simplificado) */}
      {isClosingModalOpen && closingLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 relative">
            <h2 className="text-xl font-bold mb-4">Concluir Venda</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700">ID (fixo)</label>
                <input readOnly value={String(closingLead.id)} className="mt-1 w-full p-2 border rounded bg-gray-100 text-sm" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Nome</label>
                <input value={modalNome} onChange={(e) => setModalNome(e.target.value)} className="mt-1 w-full p-2 border rounded text-sm" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Seguradora</label>
                <select value={modalSeguradora} onChange={(e) => setModalSeguradora(e.target.value)} className="mt-1 w-full p-2 border rounded text-sm">
                  {seguradoraOptions.map((opt) => <option key={opt} value={opt}>{opt === '' ? '— selecione —' : opt}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Meio de pagamento</label>
                <select value={modalMeioPagamento} onChange={(e) => {
                  setModalMeioPagamento(e.target.value);
                  if (e.target.value === 'CP' && (!modalCartaoPortoNovo || modalCartaoPortoNovo === '')) setModalCartaoPortoNovo('Não');
                  if (e.target.value !== 'CP') setModalCartaoPortoNovo('Não');
                }} className="mt-1 w-full p-2 border rounded text-sm">
                  {meioPagamentoOptions.map((m) => <option key={m} value={m}>{m === '' ? '— selecione —' : m}</option>)}
                </select>
              </div>

              {modalMeioPagamento === 'CP' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Cartão Porto Seguro Novo?</label>
                  <select value={modalCartaoPortoNovo} onChange={(e) => setModalCartaoPortoNovo(e.target.value)} className="mt-1 w-full p-2 border rounded text-sm">
                    <option value="Sim">Sim</option>
                    <option value="Não">Não</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700">Prêmio Líquido</label>
                <input value={modalPremioLiquido} onChange={handlePremioChange} placeholder="R$ 0,00" className="mt-1 w-full p-2 border rounded text-sm" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Comissão</label>
                <input value={modalComissao} onChange={handleComissaoChange} placeholder="10%" className="mt-1 w-full p-2 border rounded text-sm" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Parcelamento</label>
                <select value={modalParcelamento} onChange={(e) => setModalParcelamento(e.target.value)} className="mt-1 w-full p-2 border rounded text-sm">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={String(n)}>{String(n)}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Vigência Inicial</label>
                <input type="date" value={modalVigenciaInicial} onChange={(e) => {
                  setModalVigenciaInicial(e.target.value);
                  try {
                    const d = new Date(`${e.target.value}T00:00:00`);
                    d.setFullYear(d.getFullYear() + 1);
                    setModalVigenciaFinal(toDateInputValue(d));
                  } catch { }
                }} className="mt-1 w-full p-2 border rounded text-sm" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Vigência Final</label>
                <input type="date" value={modalVigenciaFinal} onChange={(e) => setModalVigenciaFinal(e.target.value)} className="mt-1 w-full p-2 border rounded text-sm" />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={closeClosingModal} disabled={isSubmittingClose} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">Cancelar</button>
              <button onClick={handleConcluirVenda} disabled={isSubmittingClose} className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700">
                {isSubmittingClose ? 'Processando...' : 'Concluir Venda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Leads;
