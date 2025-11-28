import React, { useState, useEffect, useMemo } from 'react';
import LeadRenovacoes from './components/LeadRenovacoes';
import { RefreshCcw, Bell, Search, Send, Edit, Save, User, ChevronLeft, ChevronRight, CheckCircle, DollarSign, Calendar } from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, query, orderBy, serverTimestamp, setDoc, addDoc } from 'firebase/firestore';
import { db } from './firebase'; // ajuste o caminho se necessário

// ===============================================
// FUNÇÃO AUXILIAR PARA O FILTRO DE DATA
// ===============================================
const getYearMonthFromDate = (dateValue) => {
    if (!dateValue) return '';

    let date;

    if (typeof dateValue === 'string' && dateValue.includes('/')) {
        const parts = dateValue.split('/');
        date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    else if (typeof dateValue === 'string' && dateValue.includes('-') && dateValue.length >= 7) {
        const parts = dateValue.split('-');
        date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
    }
    else {
        date = new Date(dateValue);
    }

    if (isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
};

// ===============================================
// FUNÇÃO AUXILIAR: Formata ISO -> DD/MM/YYYY
// ===============================================
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
    let d = date;
    if (typeof date.toDate === 'function') { // Se for um Timestamp do Firebase
        d = date.toDate();
    } else if (!(date instanceof Date)) { // Se não for Date nem Timestamp, tenta converter
        d = new Date(date);
    }
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

// NOVA FUNÇÃO: Formata um objeto Date para "DD/MM/AAAA HH:MM"
const formatDDMMYYYYHHMM = (date) => {
    if (!date) return '';
    let d = date;
    if (typeof date.toDate === 'function') { // Se for um Timestamp do Firebase
        d = date.toDate();
    } else if (!(date instanceof Date)) { // Se não for Date nem Timestamp, tenta converter
        d = new Date(date);
    }
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
};


// ===============================================
// COMPONENTE AUXILIAR: StatusButton com Contagem
// ===============================================
const StatusFilterButton = ({ status, count, currentFilter, onClick, isScheduledToday }) => {
    const isSelected = currentFilter === status;
    let baseClasses = `px-5 py-2 text-sm font-semibold rounded-full shadow-md transition duration-300 flex items-center justify-center whitespace-nowrap`;
    let activeClasses = `ring-2 ring-offset-2`;
    let nonActiveClasses = `hover:opacity-80`;

    let statusColors = '';
    if (status === 'Todos') {
        statusColors = isSelected ? 'bg-indigo-700 text-white ring-indigo-300' : 'bg-indigo-500 text-white hover:bg-indigo-600';
    } else if (status === 'Em Contato') {
        statusColors = isSelected ? 'bg-yellow-600 text-white ring-yellow-300' : 'bg-yellow-500 text-white hover:bg-yellow-600';
    } else if (status === 'Sem Contato') {
        statusColors = isSelected ? 'bg-red-600 text-white ring-red-300' : 'bg-red-500 text-white hover:bg-red-600';
    } else if (status === 'Agendado' && isScheduledToday) {
        statusColors = isSelected ? 'bg-cyan-600 text-white ring-cyan-300' : 'bg-cyan-500 text-white hover:bg-cyan-600';
    } else {
        statusColors = 'bg-gray-200 text-gray-700 hover:bg-gray-300';
    }

    const label = isScheduledToday ? `Agendados` : status;

    return (
        <button
            onClick={() => onClick(status)}
            className={`${baseClasses} ${statusColors} ${isSelected ? activeClasses : nonActiveClasses}`}
            disabled={status !== 'Todos' && status !== 'Agendado' && count === 0}
        >
            {label}
            {status !== 'Todos' && (
                <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-white bg-opacity-30 rounded-full">{count}</span>
            )}
        </button>
    );
};


// ===============================================
// 2. COMPONENTE PRINCIPAL: Renovacoes
// ===============================================
const Renovacoes = ({ usuarios, onUpdateStatus, transferirLead, usuarioLogado, scrollContainerRef }) => {
    const [leadsData, setLeadsData] = useState([]); // Alterado de 'leads' para 'leadsData'
    const [selecionados, setSelecionados] = useState({});
    const [paginaAtual, setPaginaAtual] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [observacoes, setObservacoes] = useState({});
    const [isEditingObservacao, setIsEditingObservacao] = useState({});

    // --- MODIFICAÇÃO AQUI: Inicializa dataInput e filtroData com o mês e ano atuais ---
    const today = new Date();
    const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const [dataInput, setDataInput] = useState(currentYearMonth);
    const [filtroData, setFiltroData] = useState(currentYearMonth);
    // --- FIM DA MODIFICAÇÃO ---

    const [nomeInput, setNomeInput] = useState('');
    const [filtroNome, setFiltroNome] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('Todos');
    const [hasScheduledToday, setHasScheduledToday] = useState(false);
    const [showNotification, setShowNotification] = useState(false);

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

    // NOVO ESTADO: Armazena o responsável recém-atribuído localmente (Lógica Otimista)
    const [responsavelLocal, setResponsavelLocal] = useState({});

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

        return {
            id: String(docId),
            ID: data.ID ?? data.id ?? docId,
            Nome: safe(data.Nome) || '',
            Modelo: safe(data.Modelo) || '',
            AnoModelo: safe(data.AnoModelo) || '',
            Cidade: safe(data.Cidade) || '',
            Telefone: safe(data.Telefone) || '',
            TipoSeguro: safe(data.TipoSeguro) || '',
            status: typeof data.Status === 'string' ? data.Status : data.status ?? '',
            Seguradora: safe(data.Seguradora) || '',
            MeioPagamento: safe(data.MeioPagamento) || '',
            CartaoPortoNovo: safe(data.CartaoPortoNovo) || '',
            PremioLiquido: safe(data.PremioLiquido) || '',
            Comissao: safe(data.Comissao) || '',
            Parcelamento: safe(data.Parcelamento) || '',
            VigenciaInicial: data.VigenciaInicial, // Mantém como está para ser formatado na exibição
            VigenciaFinal: data.VigenciaFinal,     // Mantém como está para ser formatado na exibição
            createdAt: data.createdAt,
            registeredAt: data.registeredAt, // Mantém como está para ser formatado na exibição
            responsavel: safe(data.Responsavel) || safe(data.responsavel) || '',
            observacao: safe(data.Observacao) || safe(data.observacao) || '',
            usuarioId: data.usuarioId !== undefined && data.usuarioId !== null ? Number(data.usuarioId) : data.usuarioId ?? null,
            closedAt: data.closedAt, // Mantém como está para ser formatado na exibição
            // Campos de fechamento
            Seguradora: safe(data.Seguradora) || '',
            MeioPagamento: safe(data.MeioPagamento) || '',
            CartaoPortoNovo: safe(data.CartaoPortoNovo) || '',
            PremioLiquido: safe(data.PremioLiquido) || '',
            Comissao: safe(data.Comissao) || '',
            Parcelamento: safe(data.Parcelamento) || '',
            ...data, // Mantém demais campos brutos se houver necessidade
        };
    };

    // --- LÓGICAS INICIAIS ---
    useEffect(() => {
        setIsLoading(true);
        try {
            const renovacoesRef = collection(db, 'renovacoes');
            const q = query(renovacoesRef, orderBy('registeredAt', 'asc')); // Ordena por registeredAt

            const unsub = onSnapshot(q, (snapshot) => {
                const lista = snapshot.docs.map((d) => normalizeLead(d.id, d.data()));
                setLeadsData(lista);

                const initialObservacoes = {};
                const initialIsEditingObservacao = {};
                const initialResponsavelLocal = {};

                lista.forEach(lead => {
                    initialObservacoes[lead.id] = lead.observacao || '';
                    initialIsEditingObservacao[lead.id] = !lead.observacao || lead.observacao.trim() === '';
                    if (lead.responsavel && lead.responsavel !== 'null') {
                         initialResponsavelLocal[lead.id] = lead.responsavel;
                    }
                });
                setObservacoes(initialObservacoes);
                setIsEditingObservacao(initialIsEditingObservacao);
                setResponsavelLocal(initialResponsavelLocal);

                setIsLoading(false);
            }, (error) => {
                console.error("Erro ao buscar renovações:", error);
                setIsLoading(false);
            });

            return () => unsub();
        } catch (error) {
            console.error("Erro ao configurar listener de renovações:", error);
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const today = new Date();
        const todayFormatted = today.toLocaleDateString('pt-BR');
        const todayAppointments = leadsData.filter(lead => { // Alterado para leadsData
            if (!lead.status.startsWith('Agendado')) return false;
            const statusDateStr = lead.status.split(' - ')[1];
            if (!statusDateStr) return false;
            const [dia, mes, ano] = statusDateStr.split('/');
            const statusDate = new Date(`${ano}-${mes}-${dia}T00:00:00`);
            const statusDateFormatted = statusDate.toLocaleDateString('pt-BR');
            return lead.status.startsWith('Agendado') && statusDateFormatted === todayFormatted;
        });
        setHasScheduledToday(todayAppointments.length > 0);
    }, [leadsData]); // Alterado para leadsData

    const handleRefreshLeads = async () => {
        setIsLoading(true);
        // O listener onSnapshot já cuida da atualização em tempo real,
        // então um "refresh" manual aqui apenas re-inicializa os estados locais
        // com base nos dados mais recentes do leadsData (que já foi atualizado pelo listener).
        const refreshedObservacoes = {};
        const refreshedIsEditingObservacao = {};
        const refreshedResponsavelLocal = {};

        leadsData.forEach(lead => { // Alterado para leadsData
            refreshedObservacoes[lead.id] = lead.observacao || '';
            refreshedIsEditingObservacao[lead.id] = !lead.observacao || lead.observacao.trim() === '';
            if (lead.responsavel && lead.responsavel !== 'null') {
                refreshedResponsavelLocal[lead.id] = lead.responsavel;
           }
        });
        setObservacoes(refreshedObservacoes);
        setIsEditingObservacao(refreshedIsEditingObservacao);
        setResponsavelLocal(refreshedResponsavelLocal);
        setSelecionados({}); // Limpa qualquer seleção pendente
        setIsLoading(false);
    };

    const leadsPorPagina = 10;
    const normalizarTexto = (texto = '') => {
        return texto.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.,\/#!$%^&*;:{}=\-_`~()@+\?><\[\]+]/g, '', '').replace(/\s+/g, ' ').trim();
    };

    const aplicarFiltroData = () => {
        setFiltroData(dataInput);
        setFiltroNome(''); setNomeInput(''); setFiltroStatus('Todos'); setPaginaAtual(1);
    };

    const aplicarFiltroNome = () => {
        const filtroLimpo = nomeInput.trim();
        setFiltroNome(filtroLimpo);
        setFiltroData(''); setDataInput(''); setFiltroStatus('Todos'); setPaginaAtual(1);
    };

    const aplicarFiltroStatus = (status) => {
        setFiltroStatus(status);
        setPaginaAtual(1);
    };

    const nomeContemFiltro = (leadNome, filtroNome) => {
        if (!filtroNome) return true;
        if (!leadNome) return false;
        const nomeNormalizado = normalizarTexto(leadNome);
        const filtroNormalizado = normalizarTexto(filtroNome);
        return nomeNormalizado.includes(filtroNormalizado);
    };

    /**
     * Função auxiliar para converter a data do formato dd/mm/aaaa ou aaaa-mm-dd em um objeto Date.
     * Retorna um objeto Date válido ou null se for inválido.
     */
    const parseDateToDateObject = (dateStr) => {
        if (!dateStr) return null;
        let date;
        if (dateStr.includes('/')) {
            // Formato dd/mm/aaaa
            const partes = dateStr.split('/');
            // Atenção: O construtor Date em JS usa MÊS de 0 a 11.
            date = new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
        } else if (dateStr.includes('-') && dateStr.length === 10) {
            // Formato aaaa-mm-dd
            const partes = dateStr.split('-');
            date = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
        } else {
            date = new Date(dateStr);
        }

        return isNaN(date.getTime()) ? null : date;
    };


    // --- Lógica de Filtro e ORDENAÇÃO (useMemo) ---
    const gerais = useMemo(() => {
        const isAdmin = usuarioLogado?.tipo === 'Admin';
        let filteredLeads = leadsData.filter((lead) => { // Alterado para leadsData
            // Adicionado "Cancelado" aqui para sumir da lista
            if (lead.status === 'Fechado' || lead.status === 'Perdido' || lead.status === 'Cancelado') return false;

            // Somente Admin pode ver todos os leads
            if (!isAdmin && lead.responsavel !== usuarioLogado?.nome) {
                return false;
            }

            // 1. FILTRO DE NOME
            if (filtroNome && !nomeContemFiltro(lead.Nome, filtroNome)) {
                return false;
            }

            // 2. FILTRO DE DATA (registeredAt)
            if (filtroData) {
                const leadRegisteredMesAno = getYearMonthFromDate(lead.registeredAt);
                if (leadRegisteredMesAno !== filtroData) {
                    return false;
                }
            }

            // 3. FILTRO DE STATUS
            if (filtroStatus && filtroStatus !== 'Todos') {
                if (filtroStatus === 'Agendado') {
                    const today = new Date();
                    const todayFormatted = today.toLocaleDateString('pt-BR');
                    const statusDateStr = lead.status.split(' - ')[1];
                    if (!statusDateStr) return false;
                    const [dia, mes, ano] = statusDateStr.split('/');
                    const statusDate = new Date(`${ano}-${mes}-${dia}T00:00:00`);
                    const statusDateFormatted = statusDate.toLocaleDateString('pt-BR');
                    return lead.status.startsWith('Agendado') && statusDateFormatted === todayFormatted;
                }
                return lead.status === filtroStatus;
            }


            return true;
        });

        // LÓGICA DE ORDENAÇÃO POR registeredAt (Crescente)
        filteredLeads.sort((a, b) => {
            const dateA = parseDateToDateObject(a.registeredAt);
            const dateB = parseDateToDateObject(b.registeredAt);

            // Se ambas as datas forem inválidas ou nulas, mantém a ordem original (0)
            if (!dateA && !dateB) return 0;
            // Datas inválidas ou nulas vão para o final
            if (!dateA) return 1;
            if (!dateB) return -1;

            // Ordem Crescente: a - b (datas mais antigas primeiro)
            return dateA.getTime() - dateB.getTime();
        });

        return filteredLeads;
    }, [leadsData, filtroStatus, filtroData, filtroNome]); // Alterado para leadsData

    // --- Contadores de Status ---
    const statusCounts = useMemo(() => {
        const counts = { 'Em Contato': 0, 'Sem Contato': 0, 'Agendado': 0 };
        const today = new Date();
        const todayFormatted = today.toLocaleDateString('pt-BR');

        leadsData.forEach(lead => { // Alterado para leadsData
            // Adicionado "Cancelado" aqui
            if (lead.status === 'Fechado' || lead.status === 'Perdido' || lead.status === 'Cancelado') return;

            if (lead.status === 'Em Contato') {
                counts['Em Contato']++;
            } else if (lead.status.startsWith('Agendado')) {
                       const statusDateStr = lead.status.split(' - ')[1];
                       if (!statusDateStr) return;
                       const [dia, mes, ano] = statusDateStr.split('/');
                       const statusDate = new Date(`${ano}-${mes}-${dia}T00:00:00`);
                       const statusDateFormatted = statusDate.toLocaleDateString('pt-BR');

                       if (statusDateFormatted === todayFormatted) {
                            counts['Agendado']++;
                       }
            }
        });
        return counts;
    }, [leadsData]); // Alterado para leadsData

    // --- Lógica de Paginação ---
    const totalPaginas = Math.max(1, Math.ceil(gerais.length / leadsPorPagina));
    const paginaCorrigida = Math.min(paginaAtual, totalPaginas);
    const usuariosAtivos = usuarios.filter((u) => u.status === 'Ativo');
    // Variável isAdmin calculada corretamente
    const isAdmin = usuarioLogado?.tipo === 'Admin';

    const inicio = (paginaCorrigida - 1) * leadsPorPagina;
    const fim = inicio + leadsPorPagina;
    const leadsPagina = gerais.slice(inicio, fim);

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

    // Salva o ID como STRING
    const handleSelect = (leadId, userId) => {
        setSelecionados((prev) => ({ ...prev, [leadId]: String(userId) }));
    };

    // Funções de Envio Assíncrono
    const enviarLeadAtualizado = async (leadId, usuarioId, responsavelNome) => {
        try {
            const leadRef = doc(db, 'renovacoes', leadId);
            await updateDoc(leadRef, {
                usuarioId: usuarioId,
                responsavel: responsavelNome
            });
        } catch (error) {
            console.error('Erro ao enviar lead atualizado para Firebase:', error);
        }
    };

    // FUNÇÃO PRINCIPAL CORRIGIDA PARA LÓGICA OTIMISTA
    const handleEnviar = (leadId) => {
        const userId = selecionados[leadId];
        if (!userId) {
            alert('Selecione um usuário antes de enviar.');
            return;
        }

        const lead = leadsData.find((l) => l.id === leadId); // Alterado para leadsData
        if (!lead) return;

        const usuarioSelecionado = usuarios.find(u => String(u.id) === String(userId));
        if (!usuarioSelecionado) {
            alert('Erro: Usuário selecionado não encontrado.');
            return;
        }

        const novoResponsavelNome = usuarioSelecionado.nome;

        // 1. ATUALIZAÇÃO VISUAL NO ESTADO PAI (IMEDIATA)
        // Isso força o componente pai a atualizar o array 'leads', alterando o campo 'responsavel'
        transferirLead(leadId, novoResponsavelNome);

        // 2. ATUALIZAÇÃO VISUAL NO ESTADO LOCAL (Backup e imediatez)
        // Garante que o nome correto será exibido logo de cara
        setResponsavelLocal(prev => ({ ...prev, [leadId]: novoResponsavelNome }));

        // 3. Limpa o select
        // Isso faz com que a condição de renderização abaixo mude para o bloco "Atribuído a: Nome"
        setSelecionados(prev => {
            const newSelection = { ...prev };
            delete newSelection[leadId];
            return newSelection;
        });

        // 4. ENVIO ASSÍNCRONO PARA O SERVIDOR
        enviarLeadAtualizado(leadId, String(userId), novoResponsavelNome);
    };

    const handleAlterar = (leadId) => {
        // Coloca o lead no modo de seleção (exibe o select)
        setSelecionados((prev) => ({ ...prev, [leadId]: '' }));
    };

    // Função para obter o nome do responsável (Prioriza o estado local otimista)
    const getResponsavelDisplay = (lead) => {
        // 1. Prioriza o nome no estado local (para a mudança otimista)
        if (responsavelLocal[lead.id]) {
            return responsavelLocal[lead.id];
        }
        // 2. Volta para o nome vindo do estado global (props)
        return lead.responsavel;
    };

    // --- Outras Funções (Mantidas) ---

    const formatarData = (data) => {
        return formatDDMMYYYY(data);
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
            const leadRef = doc(db, 'renovacoes', leadId);
            await updateDoc(leadRef, { observacao: observacaoTexto });
            setIsEditingObservacao(prev => ({ ...prev, [leadId]: false }));
            // Não precisa de fetchLeadsFromSheet, o listener já atualiza leadsData
        } catch (error) {
            console.error('Erro ao salvar observação:', error);
            alert('Erro ao salvar observação. Por favor, tente novamente.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAlterarObservacao = (leadId) => {
        setIsEditingObservacao(prev => ({ ...prev, [leadId]: true }));
    };

    const handleConfirmStatus = async (leadId, novoStatus, phone) => {
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

        // onUpdateStatus é uma prop, se ela existir, a lógica de atualização de status
        // no componente pai (Leads.jsx) será chamada.
        // Para renovações, a atualização de status pode ser diferente ou não existir.
        // Por enquanto, vamos apenas atualizar o status no Firebase diretamente para 'renovacoes'.
        setIsLoading(true);
        try {
            const leadRef = doc(db, 'renovacoes', leadId);
            await updateDoc(leadRef, { status: novoStatus });
            // O listener onSnapshot vai atualizar o estado leadsData
        } catch (error) {
            console.error('Erro ao atualizar status da renovação no Firebase:', error);
            alert('Erro ao atualizar status da renovação. Por favor, tente novamente.');
        } finally {
            setIsLoading(false);
        }

        const currentLead = leadsData.find(l => l.id === leadId); // Alterado para leadsData
        const hasNoObservacao = !currentLead?.observacao || currentLead.observacao.trim() === '';

        if ((novoStatus === 'Em Contato' || novoStatus === 'Sem Contato' || novoStatus.startsWith('Agendado')) && hasNoObservacao) {
            setIsEditingObservacao(prev => ({ ...prev, [leadId]: true }));
        } else if (novoStatus === 'Em Contato' || novoStatus === 'Sem Contato' || novoStatus.startsWith('Agendado')) {
            setIsEditingObservacao(prev => ({ ...prev, [leadId]: false }));
        } else {
            setIsEditingObservacao(prev => ({ ...prev, [leadId]: false }));
        }
    };

    const getFullStatus = (status) => {
        return status || 'Novo';
    }

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
        setModalSeguradora('');
        setModalMeioPagamento('');
        setModalCartaoPortoNovo('Não');
        setModalPremioLiquido('');
        setModalComissao('');
        setModalParcelamento('1');
        const hoje = new Date();
        setModalVigenciaInicial(toDateInputValue(hoje));
        setModalVigenciaFinal(toDateInputValue(addOneYearToDate(hoje)));
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
            // Converte datas do input para objetos Date para formatação
            const vigenciaInicialDate = modalVigenciaInicial ? new Date(`${modalVigenciaInicial}T00:00:00`) : null;
            const vigenciaFinalDate = modalVigenciaFinal ? new Date(`${modalVigenciaFinal}T00:00:00`) : null;
            const closedAtDate = new Date(); // Data e hora atuais para closedAt
            const registeredAtDate = new Date(); // Data e hora atuais para registeredAt

            // --- NOVO: grava também em 'renovados' (mesmo payload, mas com novo ID) ---
            try {
                const renovadosCollectionRef = collection(db, 'renovados');
                const newRenovDocRef = doc(renovadosCollectionRef); // Gera um novo ID para o documento
                const newLeadId = newRenovDocRef.id;

                const renovPayload = {
                    ID: newLeadId,
                    id: newLeadId,
                    Nome: modalNome,
                    name: modalNome,
                    Modelo: closingLead.Modelo ?? closingLead.vehicleModel ?? '',
                    AnoModelo: closingLead.AnoModelo ?? closingLead.vehicleYearModel ?? '',
                    Cidade: closingLead.Cidade ?? closingLead.city ?? '',
                    Telefone: closingLead.Telefone ?? closingLead.phone ?? '',
                    TipoSeguro: closingLead.TipoSeguro ?? closingLead.insuranceType ?? '',
                    usuarioId: closingLead.usuarioId ?? null, // Mantém o usuarioId do lead original
                    Seguradora: modalSeguradora || '',
                    MeioPagamento: modalMeioPagamento || '',
                    CartaoPortoNovo: modalMeioPagamento === 'CP' ? (modalCartaoPortoNovo || 'Não') : '',
                    PremioLiquido: modalPremioLiquido || '',
                    Comissao: modalComissao || '',
                    Parcelamento: modalParcelamento || '',
                    VigenciaInicial: formatDDMMYYYY(vigenciaInicialDate),
                    VigenciaFinal: formatDDMMYYYY(vigenciaFinalDate),
                    Status: 'Fechado', // Status preenchido como Fechado
                    Observacao: closingLead.observacao ?? closingLead.Observacao ?? '',
                    Responsavel: closingLead.responsavel ?? closingLead.Responsavel ?? '', // Responsavel preenchido
                    Data: closingLead.Data ?? formatDDMMYYYY(closingLead.createdAt) ?? '',
                    createdAt: closingLead.createdAt ?? null, // Mantém o original ou null
                    closedAt: formatDDMMYYYYHHMM(closedAtDate),
                    registeredAt: formatDDMMYYYY(registeredAtDate), // Data atual formatada
                };
                await setDoc(newRenovDocRef, renovPayload);
            } catch (errRenov) {
                console.error('Erro ao gravar em renovados:', errRenov);
                // não interrompe o fluxo principal; só registra o erro
            }
            // --- FIM gravação em renovados ---

            // Atualiza lead original: status, closedAt e campos de venda/nome
            const originalRef = doc(db, 'renovacoes', leadId);
            const updatePayload = {
                status: 'Fechado',
                closedAt: formatDDMMYYYYHHMM(closedAtDate),
                Seguradora: modalSeguradora || '',
                PremioLiquido: modalPremioLiquido || '',
                Comissao: modalComissao || '',
                Parcelamento: modalParcelamento || '',
                MeioPagamento: modalMeioPagamento || '',
                CartaoPortoNovo: modalMeioPagamento === 'CP' ? (modalCartaoPortoNovo || 'Não') : '',
                VigenciaInicial: formatDDMMYYYY(vigenciaInicialDate),
                VigenciaFinal: formatDDMMYYYY(vigenciaFinalDate),
                Nome: modalNome,
                name: modalNome,
                insurerConfirmed: true, // Marca como confirmado para exibir o layout de fechado
            };

            // aplica também saveLocalChange para manter sincronização local se existir a função
            // if (typeof saveLocalChange === 'function') {
            //     saveLocalChange({
            //         id: leadId,
            //         type: 'alterar_seguradora',
            //         data: {
            //             leadId,
            //             Seguradora: modalSeguradora || '',
            //             PremioLiquido: modalPremioLiquido || '',
            //             Comissao: modalComissao || '',
            //             Parcelamento: modalParcelamento || '',
            //             MeioPagamento: modalMeioPagamento || '',
            //             CartaoPortoNovo: modalMeioPagamento === 'CP' ? (modalCartaoPortoNovo || 'Não') : '',
            //             VigenciaInicial: formatDDMMYYYY(vigenciaInicialDate),
            //             VigenciaFinal: formatDDMMYYYY(vigenciaFinalDate),
            //             Nome: modalNome,
            //             insurerConfirmed: true,
            //         },
            //     });
            // }

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


    // --- Renderização do Layout ---
    return (
        <div className="p-4 md:p-6 lg:p-8 relative min-h-screen bg-gray-100 font-sans">

            {/* Overlay de Loading */}
            {isLoading && (
                <div className="fixed inset-0 bg-white bg-opacity-80 flex justify-center items-center z-50">
                    <div className="flex items-center">
                        <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="ml-4 text-xl font-semibold text-gray-700">Carregando Renovações...</p>
                    </div>
                </div>
            )}

            {/* Cabeçalho Principal */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 mb-4">
                    <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
                        <Bell size={32} className="text-indigo-500 mr-3" />
                        Renovações
                    </h1>

                    {/* Sino de Notificação */}
                    {hasScheduledToday && (
                        <div
                            className="relative cursor-pointer"
                            onClick={() => setShowNotification(!showNotification)}
                            title="Você tem agendamentos hoje!"
                        >
                            <Bell size={32} className="text-red-500 animate-pulse" />
                            <div className="absolute top-0 right-0 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold ring-2 ring-white">
                                1
                            </div>
                            {showNotification && (
                                <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl p-3 z-10 text-sm">
                                    Você tem agendamentos marcados para hoje!
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        title="Atualizar dados"
                        onClick={handleRefreshLeads}
                        disabled={isLoading}
                        className={`p-3 rounded-full transition duration-300 ${isLoading ? 'text-gray-400 cursor-not-allowed' : 'text-indigo-600 hover:bg-indigo-100 shadow-sm'}`}
                    >
                        <RefreshCcw size={24} className={isLoading ? '' : 'hover:rotate-180'} />
                    </button>
                </div>

                {/* Controles de Filtro */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch">
                    {/* Filtro de Nome */}
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <input
                            type="text"
                            placeholder="Buscar por nome..."
                            value={nomeInput}
                            onChange={(e) => setNomeInput(e.target.value)}
                            className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        />
                        <button
                            onClick={aplicarFiltroNome}
                            className="p-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition duration-200 shadow-md"
                        >
                            <Search size={20} />
                        </button>
                    </div>

                    {/* Filtro de Data (registeredAt) */}
                    <div className="flex items-center gap-2 flex-1 min-w-[200px] justify-end">
                        <input
                            type="month"
                            value={dataInput}
                            onChange={(e) => setDataInput(e.target.value)}
                            className="p-3 border border-gray-300 rounded-lg cursor-pointer text-sm"
                            title="Filtrar por Mês/Ano da Data de Registro"
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

            {/* Barra de Filtro de Status */}
            <div className="flex flex-wrap gap-3 justify-center mb-8">
                <StatusFilterButton
                    status="Todos"
                    count={gerais.length}
                    currentFilter={filtroStatus}
                    onClick={aplicarFiltroStatus}
                />
                <StatusFilterButton
                    status="Em Contato"
                    count={statusCounts['Em Contato']}
                    currentFilter={filtroStatus}
                    onClick={aplicarFiltroStatus}
                />
                <StatusFilterButton
                    status="Sem Contato"
                    count={statusCounts['Sem Contato']}
                    currentFilter={filtroStatus}
                    onClick={aplicarFiltroStatus}
                />
                {statusCounts['Agendado'] > 0 &&
                    <StatusFilterButton
                        status="Agendado"
                        count={statusCounts['Agendado']}
                        currentFilter={filtroStatus}
                        onClick={aplicarFiltroStatus}
                        isScheduledToday={true}
                    />
                }
            </div>

            {/* Lista de Cards de Leads */}
            <div className="space-y-5">
                {gerais.length === 0 && !isLoading ? (
                    <div className="text-center p-12 bg-white rounded-xl shadow-md text-gray-600 text-lg">
                        <p> Você não tem nenhuma renovação para o filtro selecionado no momento. </p>
                    </div>
                ) : (
                    leadsPagina.map((lead) => {
                        const shouldShowObs = lead.status === 'Em Contato' || lead.status === 'Sem Contato' || lead.status.startsWith('Agendado');

                        // Obtém o nome do responsável (priorizando a mudança otimista)
                        const responsavelNome = getResponsavelDisplay(lead);
                        const isAtribuido = responsavelNome && responsavelNome !== 'null';

                        return (
                            <div
                                key={lead.id}
                                className="bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 p-5 grid grid-cols-1 lg:grid-cols-3 gap-6 relative border-t-4 border-indigo-500"
                            >
                                {/* COLUNA 1: Informações do Lead */}
                                <div className="col-span-1 border-r lg:pr-6">
                                    <div className="mb-3">
                                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${lead.status.startsWith('Agendado') ? 'bg-cyan-100 text-cyan-800' : lead.status === 'Em Contato' ? 'bg-yellow-100 text-yellow-800' : lead.status === 'Sem Contato' ? 'bg-red-100 text-red-800' : lead.status === 'Fechado' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                            {getFullStatus(lead.status)}
                                        </span>
                                    </div>
                                    <LeadRenovacoes
                                        lead={lead}
                                        onUpdateStatus={handleConfirmStatus}
                                        disabledConfirm={!isAtribuido}
                                        // AQUI ESTÁ A CORREÇÃO: Passando a prop isAdmin
                                        isAdmin={isAdmin}
                                        compact={false}
                                    />
                                    {/* Linha de Vigência Final */}
                                    <div className="mt-3 flex items-center justify-start">
                                        <p className="text-sm font-semibold text-gray-700">
                                            Vigência Final: <strong className="text-indigo-600">{formatarData(lead.VigenciaFinal)}</strong>
                                        </p>

                                    </div>
                                    <p className="mt-1 text-xs text-gray-400">
                                        Registrado em: {formatarData(lead.registeredAt)}
                                    </p>
                                </div>

                                {/* COLUNA 2: Observações */}
                                <div className="col-span-1 border-r lg:px-6">
                                    {shouldShowObs && (
                                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
                                            <textarea
                                                value={observacoes[lead.id] || ''}
                                                onChange={(e) => handleObservacaoChange(lead.id, e.target.value)}
                                                rows="4"
                                                placeholder="Adicione suas observações aqui..."
                                                disabled={!isEditingObservacao[lead.id]}
                                                className={`w-full p-2 text-sm rounded-lg border resize-none transition duration-150 ${isEditingObservacao[lead.id] ? 'border-indigo-300 bg-white focus:ring-indigo-500 focus:border-indigo-500' : 'border-gray-200 bg-gray-100 cursor-text'}`}
                                            />
                                            <div className="flex justify-end gap-2 mt-2">
                                                {isEditingObservacao[lead.id] ? (
                                                    <button
                                                        onClick={() => handleSalvarObservacao(lead.id)}
                                                        className="flex items-center px-3 py-1 bg-green-500 text-white text-sm rounded-full hover:bg-green-600 disabled:opacity-50 transition duration-150"
                                                        disabled={isLoading}
                                                    >
                                                        <Save size={14} className="mr-1" /> Salvar
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => handleAlterarObservacao(lead.id)}
                                                        className="flex items-center px-3 py-1 bg-gray-400 text-white text-sm rounded-full hover:bg-gray-500 transition duration-150"
                                                    >
                                                        <Edit size={14} className="mr-1" /> Editar
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* COLUNA 3: Atribuição - LÓGICA DE EXIBIÇÃO */}
                                <div className="col-span-1 lg:pl-6">
                                    <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                                        <User size={18} className="mr-2 text-indigo-500" />
                                        Atribuição
                                    </h3>

                                    {/* Condição: Se está atribuído E NÃO está no modo de seleção */}
                                    {isAtribuido && !selecionados[lead.id] ? (
                                        <div className="p-3 bg-green-50 border border-green-200 rounded-lg shadow-sm">
                                            <p className="text-sm font-medium text-green-700">
                                                Atribuído a: <strong>{responsavelNome}</strong>
                                            </p>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => handleAlterar(lead.id)}
                                                    className="mt-2 px-3 py-1 bg-amber-500 text-white text-xs rounded-full hover:bg-amber-600 transition duration-150 shadow-sm"
                                                >
                                                    Mudar Atribuição
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        // Exibe o select e o botão Enviar (Se não está atribuído OU se está no modo de alteração)
                                        <div className="flex flex-col gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg shadow-sm">
                                            <select
                                                value={selecionados[lead.id] || ''}
                                                onChange={(e) => handleSelect(lead.id, e.target.value)}
                                                className="p-2 text-sm rounded-lg border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500"
                                            >
                                                <option value="">Transferir para...</option>
                                                {usuariosAtivos.map((u) => (
                                                    <option key={u.id} value={String(u.id)}> {u.nome} </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => handleEnviar(lead.id)}
                                                disabled={!selecionados[lead.id]}
                                                className="flex items-center justify-center p-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 disabled:bg-gray-400 transition duration-150"
                                            >
                                                <Send size={16} className="mr-1" /> Enviar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Paginação */}
            <div className="flex justify-center items-center gap-6 mt-8 p-4 bg-white rounded-xl shadow-md">
                <button
                    onClick={handlePaginaAnterior}
                    disabled={paginaCorrigida === 1}
                    className="w-10 h-10 flex items-center justify-center bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition duration-150 shadow-md"
                >
                    <ChevronLeft size={20} />
                </button>
                <span className="text-sm font-semibold text-gray-700">
                    Página {paginaCorrigida} de {totalPaginas}
                </span>
                <button
                    onClick={handlePaginaProxima}
                    disabled={paginaCorrigida === totalPaginas}
                    className="w-10 h-10 flex items-center justify-center bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition duration-150 shadow-md"
                >
                    <ChevronRight size={20} />
                </button>
            </div>

            {/* Modal de Fechamento de Venda */}
            {isClosingModalOpen && closingLead && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl">
                        <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">Concluir Venda: {closingLead.Nome}</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Nome do Cliente</label>
                                <input type="text" value={modalNome} onChange={(e) => setModalNome(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Seguradora</label>
                                <select value={modalSeguradora} onChange={(e) => setModalSeguradora(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                                    <option value="">Selecione</option>
                                    <option value="Porto Seguro">Porto Seguro</option>
                                    <option value="Azul Seguros">Azul Seguros</option>
                                    <option value="Itau Seguros">Itau Seguros</option>
                                    <option value="Tokio Marine">Tokio Marine</option>
                                    <option value="Yelum Seguros">Yelum Seguros</option>
                                    <option value="Suhai Seguros">Suhai Seguros</option>
                                    <option value="Allianz Seguros">Allianz Seguros</option>
                                    <option value="Bradesco Seguros">Bradesco Seguros</option>
                                    <option value="Mitsui Seguros">Mitsui Seguros</option>
                                    <option value="Hdi Seguros">Hdi Seguros</option>
                                    <option value="Aliro Seguros">Aliro Seguros</option>
                                    <option value="Zurich Seguros">Zurich Seguros</option>
                                    <option value="Alfa Seguros">Alfa Seguros</option>
                                    <option value="Demais Seguradoras">Demais Seguradoras</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Meio de Pagamento</label>
                                <select value={modalMeioPagamento} onChange={(e) => setModalMeioPagamento(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                                    <option value="">Selecione</option>
                                    <option value="CP">Cartão de Crédito Porto</option>
                                    <option value="CC">Cartão de Crédito</option>
                                    <option value="Debito">Débito</option>
                                    <option value="Boleto">Boleto</option>
                                </select>
                            </div>
                            {modalMeioPagamento === 'CP' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Cartão Porto Novo?</label>
                                    <select value={modalCartaoPortoNovo} onChange={(e) => setModalCartaoPortoNovo(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                                        <option value="Não">Não</option>
                                        <option value="Sim">Sim</option>
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Prêmio Líquido</label>
                                <input type="text" value={modalPremioLiquido} onChange={handlePremioChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" placeholder="R$ 0,00" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Comissão (%)</label>
                                <input type="text" value={modalComissao} onChange={handleComissaoChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" placeholder="Ex: 10%" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Parcelamento</label>
                                <select value={modalParcelamento} onChange={(e) => setModalParcelamento(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm">
                                    {[...Array(12)].map((_, i) => (
                                        <option key={i + 1} value={String(i + 1)}>{i + 1}x</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Vigência Inicial</label>
                                <input type="date" value={modalVigenciaInicial} onChange={(e) => {
                                    setModalVigenciaInicial(e.target.value);
                                    const newVigenciaInicial = new Date(`${e.target.value}T00:00:00`);
                                    setModalVigenciaFinal(toDateInputValue(addOneYearToDate(newVigenciaInicial)));
                                }} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Vigência Final</label>
                                <input type="date" value={modalVigenciaFinal} readOnly className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 cursor-not-allowed" />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={closeClosingModal} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400 transition duration-150">
                                Cancelar
                            </button>
                            <button onClick={handleConcluirVenda} disabled={isSubmittingClose} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition duration-150 disabled:opacity-50">
                                {isSubmittingClose ? 'Concluindo...' : 'Concluir Venda'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Renovacoes;
