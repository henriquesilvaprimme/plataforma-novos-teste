import React, { useState, useEffect, useMemo } from 'react';
import Lead from './components/Lead';
import { RefreshCcw, Bell, Search, CheckCircle, DollarSign, Calendar } from 'lucide-react'; // Adicionado CheckCircle, DollarSign, Calendar
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

const Leads = ({
  usuarios,
  onUpdateStatus,
  transferirLead,
  usuarioLogado,
  scrollContainerRef,
  saveLocalChange,
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

  // NOVOS STATES: modal de fechamento
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingLead, setClosingLead] = useState(null);

  // campos do modal
  const [modalNome, setModalNome] = useState('');
  const [modalSeguradora, setModalSeguradora] = useState('');
  const [modalMeioPagamento, setModalMeioPagamento] = useState('');
  const [modalCartaoPortoNovo, setModalCartaoPortoNovo] = useState('Não'); // 'Sim' | 'Não'
  const [modalPremioLiquido, setModalPremioLiquido] = useState('');
  const [modalComissao, setModalComissao] = useState('');
  const [modalParcelamento, setModalParcelamento] = useState('1');
  const [modalVigenciaInicial, setModalVigenciaInicial] = useState('');
  const [modalVigenciaFinal, setModalVigenciaFinal] = useState('');
  const [isSubmittingClose, setIsSubmittingClose] = useState(false);

  // Normaliza um documento do Firestore para o formato esperado pelo React
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

    // Nome
    const nomeVal =
      safe(data.Nome) ||
      safe(data.nome) ||
      safe(data.Name) ||
      safe(data.name) ||
      safe(data['Nome Completo']) ||
      '';

    // Modelo do veículo - mapeia várias variações possíveis de campo do formulário
    const modeloVal =
      safe(data.Modelo) ||
      safe(data.modelo) ||
      safe(data['Modelo do Veículo']) ||
      safe(data['modelo do veículo']) ||
      safe(data.modeloVeiculo) ||
      safe(data.ModeloVeiculo) ||
      safe(data.vehicleModel) ||
      safe(data.vehicle_model) ||
      safe(data.model) ||
      '';

    // Ano / Modelo
    const anoModeloVal =
      safe(data.AnoModelo) ||
      safe(data.anoModelo) ||
      safe(data.Ano) ||
      safe(data.ano) ||
      safe(data.vehicleYearModel) ||
      safe(data.vehicle_year) ||
      '';

    // Cidade
    const cidadeVal =
      safe(data.Cidade) || safe(data.cidade) || safe(data.city) || '';

    // Telefone
    const telefoneVal =
      safe(data.Telefone) || safe(data.telefone) || safe(data.phone) || '';

    // Tipo Seguro
    const tipoSeguroVal =
      safe(data.TipoSeguro) ||
      safe(data.tipoSeguro) ||
      safe(data.insuranceType) ||
      safe(data.tipo_de_seguro) ||
      '';

    return {
      id: String(docId),
      ID: data.ID ?? data.id ?? docId,
      Nome: nomeVal,
      name: nomeVal,
      Name: nomeVal,
      // Mantemos ambos por compatibilidade, mas o campo principal para leadsFechados será "Modelo" (em pt)
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
      confirmado:
        data.confirmado === true || data.confirmado === 'true' ? true : false,
      insurer: data.insurer ?? data.Seguradora ?? '',
      insurerConfirmed:
        data.insurerConfirmed === true || data.insurerConfirmed === 'true'
          ? true
          : false,
      usuarioId:
        data.usuarioId !== undefined && data.usuarioId !== null
          ? Number(data.usuarioId)
          : data.usuarioId ?? null,
      premioLiquido: data.premioLiquido ?? data.PremioLiquido ?? '',
      comissao: data.comissao ?? data.Comissao ?? '',
      parcelamento: data.parcelamento ?? data.Parcelamento ?? '',
      VigenciaFinal: data.VigenciaFinal ?? data.vigenciaFinal ?? '',
      VigenciaInicial: data.VigenciaInicial ?? data.vigenciaInicial ?? '',
      createdAt: toISO(data.createdAt ?? data.data ?? data.Data ?? data.criadoEm), // Adicionado data.criadoEm
      responsavel: data.responsavel ?? data.Responsavel ?? '',
      editado: data.editado ?? '',
      observacao: data.observacao ?? data.Observacao ?? '',
      agendamento: data.agendamento ?? data.Agendamento ?? '',
      agendados: data.agendados ?? false,
      MeioPagamento: data.MeioPagamento ?? '',
      CartaoPortoNovo: data.CartaoPortoNovo ?? '',
      closedAt: data.closedAt ?? null, // Adicionado closedAt
      registeredAt: data.registeredAt ?? null, // Adicionado registeredAt
      // Mantém demais campos brutos se houver necessidade
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

  // NOVA FUNÇÃO: Formata um objeto Date para "DD/MM/AAAA"
  const formatDDMMYYYY = (date) => {
    if (!date) return '';
    const d = date instanceof Date ? date : date.toDate(); // Converte Timestamp para Date
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // NOVA FUNÇÃO: Formata um objeto Date para "DD/MM/AAAA HH:MM"
  const formatDDMMYYYYHHMM = (date) => {
    if (!date) return '';
    const d = date instanceof Date ? date : date.toDate(); // Converte Timestamp para Date
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  // Listener em tempo real para leads
  useEffect(() => {
    setIsLoading(true);
    try {
      const collRef = collection(db, 'leads');
      const unsub = onSnapshot(
        collRef,
        (snapshot) => {
          const lista = snapshot.docs.map((d) => normalizeLead(d.id, d.data()));

          // Ordena localmente por createdAt (se existir)
          lista.sort((a, b) => {
            const da = a.createdAt ? new Date(a.createdAt) : new Date(0);
            const dbb = b.createdAt ? new Date(b.createdAt) : new Date(0);
            return dbb - da;
          });

          setLeadsData(lista);

          // Atualiza observações e flags
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

      return () => {
        unsub();
      };
    } catch (err) {
      console.error('Erro ao iniciar listener de leads:', err);
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch manual (mantido para botão Refresh)
  const fetchLeadsFromFirebase = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'leads'));
      const lista = [];
      querySnapshot.forEach((docSnap) => {
        lista.push(normalizeLead(docSnap.id, docSnap.data()));
      });

      lista.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt) : new Date(0);
        const dbb = b.createdAt ? new Date(b.createdAt) : new Date(0);
        return dbb - da;
      });

      setLeadsData(lista);

      // Atualiza observações e flags com os dados do fetch manual também
      const initialObservacoes = {};
      const initialIsEditingObservacao = {};
      lista.forEach((lead) => {
        initialObservacoes[lead.id] = lead.observacao || '';
        initialIsEditingObservacao[lead.id] =
          !lead.observacao || lead.observacao.trim() === '';
      });
      setObservacoes(initialObservacoes);
      setIsEditingObservacao(initialIsEditingObservacao);
    } catch (error) {
      console.error('Erro ao buscar leads do Firebase:', error);
      alert('Erro ao buscar leads do Firebase. Veja o console para detalhes.');
    } finally {
      setIsLoading(false);
    }
  };

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

  const isStatusAgendado = (status) => {
    return typeof status === 'string' && status.startsWith('Agendado');
  };

  const extractStatusDate = (status) => {
    if (typeof status !== 'string') return null;
    const parts = status.split(' - ');
    return parts.length > 1 ? parts[1] : null;
  };

  // -------------------------
  // VISIBILITY: apenas admin vê todos; usuário vê apenas os leads atribuídos a ele
  // -------------------------
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

    // user id values could be in different keys
    const userId = String(user.id ?? user.ID ?? user.userId ?? '').trim();
    const userNome = String(user.nome ?? user.name ?? user.usuario ?? '').trim().toLowerCase();

    // lead.usuarioId can be number or string
    const leadUsuarioId = lead.usuarioId !== undefined && lead.usuarioId !== null ? String(lead.usuarioId).trim() : '';
    if (leadUsuarioId && userId && leadUsuarioId === userId) return true;

    // Compare responsavel / Responsavel names
    const leadResponsavel = String(lead.responsavel ?? lead.Responsavel ?? '').trim().toLowerCase();
    if (leadResponsavel && userNome && leadResponsavel === userNome) return true;

    // Fallback: raw.usuario/login match
    const leadUsuarioLogin = String(lead.usuario ?? lead.user ?? lead.raw?.usuario ?? lead.raw?.user ?? '').trim();
    const userLogin = String(user.usuario ?? '').trim();
    if (leadUsuarioLogin && userLogin && leadUsuarioLogin === userLogin) return true;

    return false;
  };
  // -------------------------

  const contagens = useMemo(() => {
    // Work off visible leads only
    const visibleLeads = leadsData.filter((l) => canViewLead(l));
    let emContatoCount = 0;
    let semContatoCount = 0;
    let agendadosCount = 0;
    let todosPendentesCount = 0;
    let fechadosCount = 0; // Novo contador para leads fechados
    const today = new Date().toLocaleDateString('pt-BR');

    visibleLeads.forEach((lead) => {
      const s = lead.status ?? '';

      if (s === 'Fechado') {
        fechadosCount++;
      } else if (s === 'Perdido') {
        // Não conta perdidos em nenhum filtro de "ativos"
      } else {
        todosPendentesCount++; // Conta todos que não são Fechado ou Perdido
        if (s === 'Em Contato') {
          emContatoCount++;
        } else if (s === 'Sem Contato') {
          semContatoCount++;
        } else if (isStatusAgendado(s)) {
          const statusDateStr = extractStatusDate(s);
          if (statusDateStr) {
            const [dia, mes, ano] = statusDateStr.split('/');
            const statusDateFormatted = new Date(`${ano}-${mes}-${dia}T00:00:00`).toLocaleDateString('pt-BR');
            if (statusDateFormatted === today) {
              agendadosCount++;
            }
          }
        }
      }
    });

    return {
      emContato: emContatoCount,
      semContato: semContatoCount,
      agendadosHoje: agendadosCount,
      todosPendentes: todosPendentesCount,
      fechados: fechadosCount, // Adiciona o contador de fechados
    };
  }, [leadsData, usuarioLogado]); // recalcula quando leadsData ou usuarioLogado mudar

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
    if (!filtroMesAno) return true; // Sem filtro de data
    if (!leadDateStr) return false; // Lead sem data de criação

    try {
      const leadDate = new Date(leadDateStr);
      const [filtroAno, filtroMes] = filtroMesAno.split('-').map(Number);

      return leadDate.getFullYear() === filtroAno && (leadDate.getMonth() + 1) === filtroMes;
    } catch (e) {
      console.error("Erro ao comparar datas:", e);
      return false;
    }
  };

  const nomeContemFiltro = (leadNome, filtroNome) => {
    if (!filtroNome) return true;
    if (!leadNome) return false;
    const nomeNormalizado = normalizarTexto(leadNome);
    const filtroNormalizado = normalizarTexto(filtroNome);
    return nomeNormalizado.includes(filtroNormalizado);
  };

  // Filtra por visibilidade primeiro (apenas leads atribuídos ao usuário, salvo Admin)
  const gerais = leadsData
    .filter((lead) => canViewLead(lead))
    .filter((lead) => {
      const s = lead.status ?? '';
      // Leads 'Perdido' não aparecem nesta lista
      if (s === 'Perdido') return false;

      // Se houver filtro de status, aplica
      if (filtroStatus) {
        if (filtroStatus === 'Agendado') {
          const today = new Date();
          const todayFormatted = today.toLocaleDateString('pt-BR');
          const statusDateStr = extractStatusDate(s);
          if (!statusDateStr) return false;
          const [dia, mes, ano] = statusDateStr.split('/');
          const statusDate = new Date(`${ano}-${mes}-${dia}T00:00:00`);
          const statusDateFormatted = statusDate.toLocaleDateString('pt-BR');
          return isStatusAgendado(lead.status) && statusDateFormatted === todayFormatted;
        }
        // Se o filtro for 'Fechado', mostra apenas leads fechados
        if (filtroStatus === 'Fechado') {
          return s === 'Fechado';
        }
        // Para outros status, mostra leads com o status correspondente
        return lead.status === filtroStatus;
      }

      // Se houver filtro de data, aplica
      if (filtroData) {
        return isSameMonthAndYear(lead.createdAt, filtroData);
      }

      // Se houver filtro de nome, aplica
      if (filtroNome) {
        return nomeContemFiltro(lead.Nome || lead.name || lead.nome, filtroNome);
      }

      // Por padrão, mostra todos os leads que não são 'Perdido'
      return true;
    });

  const totalPaginas = Math.max(1, Math.ceil(gerais.length / leadsPorPagina));
  const paginaCorrigida = Math.min(paginaAtual, totalPaginas);
  const usuariosAtivos = usuarios ? usuarios.filter((u) => u.status === 'Ativo') : [];

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

    setSelecionados((prev) => ({
      ...prev,
      [leadId]: '',
    }));
    transferirLead(leadId, null);

    try {
      const leadRef = doc(db, 'leads', leadId);
      await updateDoc(leadRef, { usuarioId: null, responsavel: null });
    } catch (error) {
      console.error('Erro ao alterar atribuição no Firebase:', error);
      alert('Erro ao alterar atribuição. Veja o console.');
    }
  };

  const inicio = (paginaCorrigida - 1) * leadsPorPagina;
  const fim = inicio + leadsPorPagina;
  const leadsPagina = gerais.slice(inicio, fim);

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
    // Se for Fechado -> abrir modal de fechamento
    if (novoStatus === 'Fechado') {
      const lead = leadsData.find((l) => String(l.id) === String(leadId));
      if (!lead) {
        alert('Lead não encontrada para fechamento.');
        return;
      }
      openClosingModal(lead);
      return;
    }

    // fluxo antigo para outros statuses
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
      // Não interrompe o fluxo, apenas loga o erro
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
      if (observacaoAtual && observacaoAtual.trim() !== '') {
        dataToUpdate.observacao = observacaoAtual;
      }

      if (agendamento) {
        dataToUpdate.agendamento = agendamento;
      } else {
        dataToUpdate.agendamento = null;
      }

      await updateDoc(leadRef, dataToUpdate);

      const currentLead = leadsData.find((l) => l.id === leadId);
      const hasNoObservacao =
        !currentLead || !currentLead.observacao || currentLead.observacao.trim() === '';

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

  // ---------------- Modal: funções auxiliares ----------------
  const toDateInputValue = (date = new Date()) => {
    const d = new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${yyyy}-${mm}-${dd}`; // formato para <input type="date">
  };

  const addOneYearToDate = (date) => {
    const d = new Date(date);
    d.setFullYear(d.getFullYear() + 1);
    return d;
  };

  // Formatação de moeda para input: aceita digitação de números e formatado como R$
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
    // permitimos que o usuário cole ou digite já formatado; extraímos dígitos e formatamos
    const digits = extractDigits(raw);
    const formatted = digits ? formatCurrencyFromDigits(digits) : '';
    setModalPremioLiquido(formatted);
  };

  // Comissão: mantemos número inteiro e adicionamos '%'
  const handleComissaoChange = (e) => {
    const raw = e.target.value;
    const digits = extractDigits(raw).slice(0, 3); // até 3 dígitos (ex: 100%)
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
    // CartaoPortoNovo deve ser 'Sim' ou 'Não'
    setModalCartaoPortoNovo(lead.CartaoPortoNovo ? String(lead.CartaoPortoNovo) : 'Não');
    setModalPremioLiquido(lead.PremioLiquido ? String(lead.PremioLiquido) : '');
    // se a comissao vier como '10%' mantém; se vier '10' converte
    const com = lead.Comissao ?? lead.comissao ?? '';
    setModalComissao(com ? (String(com).includes('%') ? String(com) : `${String(extractDigits(com) || com)}%`) : '');
    setModalParcelamento(lead.Parcelamento ? String(lead.Parcelamento) : '1');
    const hoje = new Date();
    setModalVigenciaInicial(toDateInputValue(hoje));
    setModalVigenciaFinal(toDateInputValue(addOneYearToDate(hoje))); // Ajustado aqui
    setIsClosingModalOpen(true);
  };

  const closeClosingModal = () => {
    setIsClosingModalOpen(false);
    setClosingLead(null);
    setIsSubmittingClose(false);
    // reset modal values (opcional)
    // setModalNome('');
    // ...
  };

  // Ao submeter o fechamento (Concluir Venda)
  const handleConcluirVenda = async () => {
    if (!closingLead) return;
    setIsSubmittingClose(true);

    try {
      const leadId = String(closingLead.id);
      // Converte datas do input para objetos Date
      const vigenciaInicialDate = modalVigenciaInicial ? new Date(`${modalVigenciaInicial}T00:00:00`) : null;
      const vigenciaFinalDate = modalVigenciaFinal ? new Date(`${modalVigenciaFinal}T00:00:00`) : null;

      // --- NOVO: grava também em 'renovacoes' (mesmo payload, mesmo doc id) ---
      try {
        const renovRef = doc(db, 'renovacoes', leadId);
        const now = new Date();
        const registeredAtOneYearLater = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

        const renovPayload = {
          ID: closingLead.ID ?? closingLead.id ?? leadId,
          id: leadId,
          Nome: modalNome,
          name: modalNome,
          Modelo: closingLead.Modelo ?? closingLead.vehicleModel ?? '',
          AnoModelo: closingLead.AnoModelo ?? closingLead.vehicleYearModel ?? '',
          Cidade: closingLead.Cidade ?? closingLead.city ?? '',
          Telefone: closingLead.Telefone ?? closingLead.phone ?? '',
          TipoSeguro: closingLead.TipoSeguro ?? closingLead.insuranceType ?? '',
          usuarioId: null, // Responsavel sem preenchimento
          Seguradora: modalSeguradora || '',
          MeioPagamento: modalMeioPagamento || '',
          CartaoPortoNovo: modalMeioPagamento === 'CP' ? (modalCartaoPortoNovo || 'Não') : '',
          PremioLiquido: modalPremioLiquido || '',
          Comissao: modalComissao || '',
          Parcelamento: modalParcelamento || '',
          VigenciaInicial: vigenciaInicialDate ? formatDDMMYYYY(vigenciaInicialDate) : '', // Formatado
          VigenciaFinal: vigenciaFinalDate ? formatDDMMYYYY(vigenciaFinalDate) : '',     // Formatado
          Status: '', // Status sem preenchimento
          Observacao: closingLead.observacao ?? closingLead.Observacao ?? '',
          Responsavel: '', // Responsavel sem preenchimento
          Data: closingLead.Data ?? formatDDMMYYYYFromISO(closingLead.createdAt) ?? '',
          createdAt: closingLead.createdAt ?? null,
          closedAt: formatDDMMYYYYHHMM(now), // Formatado
          registeredAt: formatDDMMYYYY(registeredAtOneYearLater), // Formatado para data atual + 1 ano
        };
        await setDoc(renovRef, renovPayload);
      } catch (errRenov) {
        console.error('Erro ao gravar em renovacoes:', errRenov);
        // não interrompe o fluxo principal; só registra o erro
      }
      // --- FIM gravação em renovacoes ---

      // Atualiza lead original: status, closedAt e campos de venda/nome
      const originalRef = doc(db, 'leads', leadId);
      const updatePayload = {
        status: 'Fechado',
        closedAt: serverTimestamp(), // Mantém serverTimestamp para o lead original no Firestore
        Seguradora: modalSeguradora || '',
        PremioLiquido: modalPremioLiquido || '',
        Comissao: modalComissao || '',
        Parcelamento: modalParcelamento || '',
        MeioPagamento: modalMeioPagamento || '',
        CartaoPortoNovo: modalMeioPagamento === 'CP' ? (modalCartaoPortoNovo || 'Não') : '',
        VigenciaInicial: vigenciaInicialDate ? formatDDMMYYYY(vigenciaInicialDate) : '', // Formatado
        VigenciaFinal: vigenciaFinalDate ? formatDDMMYYYY(vigenciaFinalDate) : '',     // Formatado
        Nome: modalNome,
        name: modalNome,
        insurerConfirmed: true, // Marca como confirmado para exibir o layout de fechado
      };

      // aplica também saveLocalChange para manter sincronização local se existir a função
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
            VigenciaInicial: vigenciaInicialDate ? formatDDMMYYYY(vigenciaInicialDate) : '', // Formatado
            VigenciaFinal: vigenciaFinalDate ? formatDDMMYYYY(vigenciaFinalDate) : '',     // Formatado
            Nome: modalNome,
            insurerConfirmed: true,
          },
        });
      }

      await updateDoc(originalRef, updatePayload);

      // sucesso: fecha modal e deixa o listener atualizar a lista automaticamente
      closeClosingModal();
      alert('Venda concluída e registrada com sucesso.');
    } catch (err) {
      console.error('Erro ao concluir venda:', err);
      alert('Erro ao concluir venda. Veja o console para detalhes.');
      setIsSubmittingClose(false);
    }
  };

  // Listas fixas
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
          onClick={() => aplicarFiltroStatus('Fechado')}
          className={`
            px-5 py-2 rounded-full font-bold transition duração-300 shadow-lg
            ${filtroStatus === 'Fechado' ? 'bg-green-700 text-white ring-2 ring-green-400' : 'bg-green-500 text-white hover:bg-green-600'}
          `}
        >
          Fechados <span className="text-sm font-extrabold ml-1">({contagens.fechados})</span>
        </button>

        <button
          onClick={() => aplicarFiltroStatus(null)}
          className={`
            px-5 py-2 rounded-full font-bold transition duração-300 shadow-lg
            ${filtroStatus === null ? 'bg-gray-800 text-white ring-2 ring-gray-500' : 'bg-gray-600 text-white hover:bg-gray-700'}
          `}
        >
          Todos <span className="text-sm font-extrabold ml-1">({contagens.todosPendentes + contagens.fechados})</span>
        </button>
      </div>

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
              const isSeguradoraPreenchida = !!lead.Seguradora && lead.insurerConfirmed; // Usar insurerConfirmed para o layout de fechado

              return (
                <div
                  key={lead.id}
                  className={`bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 p-6 relative border-t-4 ${isSeguradoraPreenchida ? 'border-green-600' : 'border-indigo-500'}`}
                >
                  {isSeguradoraPreenchida ? (
                    // LAYOUT DE LEAD FECHADO
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {/* COLUNA 1: Informações do Lead */}
                      <div className="col-span-1 border-b pb-4 lg:border-r lg:pb-0 lg:pr-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{lead.Nome || lead.name}</h3>
                        <div className="space-y-1 text-sm text-gray-700">
                          <p><strong>Modelo:</strong> {lead.Modelo || lead.vehicleModel}</p>
                          <p><strong>Ano/Modelo:</strong> {lead.AnoModelo || lead.vehicleYearModel}</p>
                          <p><strong>Cidade:</strong> {lead.Cidade || lead.city}</p>
                          <p><strong>Telefone:</strong> {lead.Telefone || lead.phone}</p>
                          <p><strong>Tipo de Seguro:</strong> {lead.TipoSeguro || lead.insuranceType}</p>
                        </div>
                        {responsavel && (
                          <p className="mt-4 text-sm font-semibold text-green-600 bg-green-50 p-2 rounded-lg">
                            Transferido para: <strong>{responsavel.nome}</strong>
                          </p>
                        )}
                      </div>

                      {/* COLUNA 2: Detalhes do Fechamento */}
                      <div className="col-span-1 border-b pb-4 lg:border-r lg:pb-0 lg:px-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                          <DollarSign size={18} className="mr-2 text-green-500" />
                          Detalhes do Fechamento
                        </h3>
                        <div className="space-y-2 text-sm text-gray-700">
                          <p><strong>Seguradora:</strong> {lead.Seguradora}</p>
                          <p><strong>Meio de Pagamento:</strong> {lead.MeioPagamento}</p>
                          {lead.MeioPagamento === 'CP' && <p><strong>Cartão Porto Novo:</strong> {lead.CartaoPortoNovo}</p>}
                          <p><strong>Prêmio Líquido:</strong> {lead.PremioLiquido}</p>
                          <p><strong>Comissão:</strong> {lead.Comissao}</p>
                          <p><strong>Parcelamento:</strong> {lead.Parcelamento}</p>
                        </div>
                      </div>

                      {/* COLUNA 3: Vigência e Botão de Concluído */}
                      <div className="col-span-1 lg:pl-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                          <Calendar size={18} className="mr-2 text-green-500" />
                          Vigência
                        </h3>
                        <div className="space-y-2 text-sm text-gray-700 mb-6">
                          <p><strong>Início:</strong> {lead.VigenciaInicial}</p> {/* Já formatado */}
                          <p><strong>Término:</strong> {lead.VigenciaFinal}</p> {/* Já formatado */}
                        </div>
                        <div className="w-full py-3 px-4 rounded-xl font-bold bg-green-100 text-green-700 flex items-center justify-center border border-green-300">
                          <CheckCircle size={20} className="mr-2" />
                          Fechado!
                        </div>
                      </div>
                    </div>
                  ) : (
                    // LAYOUT DE LEAD NORMAL
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
                                  Mudar Atribuição
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
                  )}

                  <div
                    className="absolute bottom-2 right-4 text-xs text-gray-400 italic"
                    title={`Criado em: ${formatDDMMYYYYFromISO(lead.createdAt)}`}
                  >
                    Criado em: {formatDDMMYYYYFromISO(lead.createdAt)}
                  </div>
                </div>
              );
            })}

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
                className={`px-4 py-2 rounded-lg border texto-sm font-medium transition duração-150 shadow-md ${
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

      {/* Modal de Concluir Venda */}
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
                <select
                  value={modalSeguradora}
                  onChange={(e) => {
                    setModalSeguradora(e.target.value);
                    // se mudar para CP inicia Cartao como 'Não' por padrão
                    if (e.target.value === 'CP' && (!modalCartaoPortoNovo || modalCartaoPortoNovo === '')) {
                      setModalCartaoPortoNovo('Não');
                    }
                    // se tirar CP, limpa CartaoPortoNovo
                    if (e.target.value !== 'CP') {
                      setModalCartaoPortoNovo('Não');
                    }
                  }}
                  className="mt-1 w-full p-2 border rounded text-sm"
                >
                  {seguradoraOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt === '' ? '— selecione —' : opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Meio de pagamento</label>
                <select
                  value={modalMeioPagamento}
                  onChange={(e) => {
                    setModalMeioPagamento(e.target.value);
                    // se mudar para CP inicia Cartao como 'Não' por padrão
                    if (e.target.value === 'CP' && (!modalCartaoPortoNovo || modalCartaoPortoNovo === '')) {
                      setModalCartaoPortoNovo('Não');
                    }
                    // se tirar CP, limpa CartaoPortoNovo
                    if (e.target.value !== 'CP') {
                      setModalCartaoPortoNovo('Não');
                    }
                  }}
                  className="mt-1 w-full p-2 border rounded text-sm"
                >
                  {meioPagamentoOptions.map((m) => (
                    <option key={m} value={m}>{m === '' ? '— selecione —' : m}</option>
                  ))}
                </select>
              </div>

              {/* Cartao Porto Seguro Novo: aparece somente se MeioPagamento === 'CP' */}
              {modalMeioPagamento === 'CP' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700">Cartão Porto Seguro Novo?</label>
                  <select
                    value={modalCartaoPortoNovo}
                    onChange={(e) => setModalCartaoPortoNovo(e.target.value)}
                    className="mt-1 w-full p-2 border rounded text-sm"
                  >
                    <option value="Sim">Sim</option>
                    <option value="Não">Não</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700">Prêmio Líquido</label>
                <input
                  value={modalPremioLiquido}
                  onChange={handlePremioChange}
                  placeholder="R$ 0,00"
                  className="mt-1 w-full p-2 border rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Comissão</label>
                <input
                  value={modalComissao}
                  onChange={handleComissaoChange}
                  placeholder="10%"
                  className="mt-1 w-full p-2 border rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Parcelamento</label>
                <select
                  value={modalParcelamento}
                  onChange={(e) => setModalParcelamento(e.target.value)}
                  className="mt-1 w-full p-2 border rounded text-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={String(n)}>{String(n)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700">Vigência Inicial</label>
                <input type="date" value={modalVigenciaInicial} onChange={(e) => {
                  setModalVigenciaInicial(e.target.value);
                  // atualiza final automaticamente para +1 ano quando inicial muda
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
              <button onClick={closeClosingModal} disabled={isSubmittingClose} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">
                Cancelar
              </button>
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
