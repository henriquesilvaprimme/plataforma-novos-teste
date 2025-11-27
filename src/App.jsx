import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Leads from './Leads';
import LeadsFechados from './LeadsFechados';
import LeadsPerdidos from './LeadsPerdidos';
import BuscarLead from './BuscarLead';
import CriarUsuario from './pages/CriarUsuario';
import GerenciarUsuarios from './pages/GerenciarUsuarios';
import Ranking from './pages/Ranking';
import CriarLead from './pages/CriarLead';

// Este componente agora vai rolar o elemento com a ref para o topo
function ScrollToTop({ scrollContainerRef }) {
  const { pathname } = useLocation();

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, [pathname, scrollContainerRef]);

  return null;
}

const GOOGLE_APPS_SCRIPT_BASE_URL = '/api/gas';
const GOOGLE_SHEETS_SCRIPT_URL = `${GOOGLE_APPS_SCRIPT_BASE_URL}?v=getLeads`;
const GOOGLE_SHEETS_LEADS_FECHADOS = `${GOOGLE_APPS_SCRIPT_BASE_URL}?v=pegar_clientes_fechados`;
const GOOGLE_SHEETS_USERS_AUTH_URL = `${GOOGLE_APPS_SCRIPT_BASE_URL}?v=pegar_usuario`;
const SALVAR_AGENDAMENTO_SCRIPT_URL = `${GOOGLE_APPS_SCRIPT_BASE_URL}?action=salvarAgendamento`;
const SALVAR_OBSERVACAO_SCRIPT_URL = `${GOOGLE_APPS_SCRIPT_BASE_URL}`;

// ======= CONFIGURAÇÃO DE SINCRONIZAÇÃO LOCAL =======
const LOCAL_CHANGES_KEY = 'leads_local_changes_v1';
const SYNC_DELAY_MS = 5 * 60 * 1000; // 5 minutos
const SYNC_CHECK_INTERVAL_MS = 1000; // checa a cada 1s
// =====================================================

function App() {
  const navigate = useNavigate();
  const mainContentRef = useRef(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  const [senhaInput, setSenhaInput] = useState('');
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [backgroundLoaded, setBackgroundLoaded] = useState(false);

  const [leads, setLeads] = useState([]);
  const [leadsFechados, setLeadsFechados] = useState([]);
  const [leadSelecionado, setLeadSelecionado] = useState(null);

  const [usuarios, setUsuarios] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [leadsCount, setLeadsCount] = useState(0);
  const [ultimoFechadoId, setUltimoFechadoId] = useState(null);

  // Referência em memória das alterações locais (evita leituras/desescritas excessivas)
  const localChangesRef = useRef({}); // formato: { [key]: { id, leadId, type, data, timestamp, ... } }

  // Carrega background
  useEffect(() => {
    const img = new Image();
    img.src = '/background.png';
    img.onload = () => setBackgroundLoaded(true);
  }, []);

  // ------------------ Helpers de localChanges ------------------
  const loadLocalChangesFromStorage = () => {
    try {
      const raw = localStorage.getItem(LOCAL_CHANGES_KEY);
      if (raw) {
        localChangesRef.current = JSON.parse(raw) || {};
      } else {
        localChangesRef.current = {};
      }
    } catch (err) {
      console.error('Erro ao carregar localChanges:', err);
      localChangesRef.current = {};
    }
  };

  const persistLocalChangesToStorage = () => {
    try {
      localStorage.setItem(LOCAL_CHANGES_KEY, JSON.stringify(localChangesRef.current));
    } catch (err) {
      console.error('Erro ao salvar localChanges:', err);
    }
  };

  // Merge seguro: não sobrescreve campos quando o valor do change é undefined
  const mergeWithDefined = (base, changeData = {}) => {
    const result = { ...base };
    Object.keys(changeData).forEach((k) => {
      const v = changeData[k];
      if (v !== undefined) result[k] = v;
    });
    return result;
  };

  // Normaliza um objeto de lead vindo do sheet/local para garantir campos básicos,
  // e extrai possíveis variações de Document ID (ex.: 'Document ID', 'documentId', 'docId', 'DocumentID', etc.)
  const normalizeLead = (item = {}) => {
    // tenta extrair id seguro
    const rawId = item.id ?? item.ID ?? item.Id ?? item.IdLead ?? null;
    const derivedId = rawId !== null && rawId !== undefined && rawId !== ''
      ? String(rawId)
      : (item.phone ? String(item.phone) : (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)));

    // document id possible keys
    const rawDocumentId = item.documentId ?? item.docId ?? item.DocumentId ?? item.DocumentID ?? item['Document ID'] ?? item['DocumentId'] ?? item.documentID ?? null;
    const documentId = rawDocumentId !== null && rawDocumentId !== undefined && rawDocumentId !== '' ? String(rawDocumentId) : null;

    const statusRaw = item.status ?? item.Status ?? item.stato ?? '';
    const status = (typeof statusRaw === 'string' && statusRaw.trim() !== '') ? statusRaw : (item.confirmado ? 'Em Contato' : 'Selecione o status');

    // garante que tanto id quanto ID existam e sejam strings (consistência)
    return {
      id: String(item.id ?? item.ID ?? derivedId),
      ID: String(item.ID ?? item.id ?? derivedId),
      documentId: documentId, // novo campo consistente para Document ID
      // também mantém a chave original caso exista (muitos objetos podem ter "Document ID" literais)
      'Document ID': item['Document ID'] ?? rawDocumentId ?? undefined,
      name: item.name ?? item.Name ?? item.nome ?? '',
      nome: item.nome ?? item.name ?? item.Name ?? '',
      vehicleModel: item.vehicleModel ?? item.vehiclemodel ?? item.vehicle_model ?? item.Modelo ?? item.modelo ?? '',
      vehicleYearModel: item.vehicleYearModel ?? item.vehicleyearmodel ?? item.vehicle_year_model ?? item.AnoModelo ?? item.anoModelo ?? '',
      city: item.city ?? item.Cidade ?? item.cityName ?? '',
      phone: item.phone ?? item.Telefone ?? item.Phone ?? '',
      insuranceType: item.insuranceType ?? item.insurancetype ?? item.insurer ?? item.TipoSeguro ?? '',
      status: status,
      confirmado: item.confirmado === 'true' || item.confirmado === true || false,
      insurer: item.insurer ?? item.Insurer ?? '',
      insurerConfirmed: item.insurerConfirmed === 'true' || item.insurerConfirmed === true || false,
      usuarioId: item.usuarioId ? Number(item.usuarioId) : (item.usuarioId ?? null),
      premioLiquido: item.premioLiquido ?? item.PremioLiquido ?? '',
      comissao: item.comissao ?? item.Comissao ?? '',
      parcelamento: item.parcelamento ?? item.Parcelamento ?? '',
      VigenciaFinal: item.VigenciaFinal ?? item.vigenciaFinal ?? '',
      VigenciaInicial: item.VigenciaInicial ?? item.vigenciaFinal ?? '',
      createdAt: item.createdAt ?? item.data ?? item.Data ?? new Date().toISOString(),
      responsavel: item.responsavel ?? item.Responsavel ?? '',
      editado: item.editado ?? '',
      observacao: item.observacao ?? item.Observacao ?? '',
      agendamento: item.agendamento ?? item.Agendamento ?? '',
      agendados: item.agendados ?? false,
      MeioPagamento: item.MeioPagamento ?? '',
      CartaoPortoNovo: item.CartaoPortoNovo ?? '',
      // preserva quaisquer outros campos
      ...item,
    };
  };

  // util: compara um lead com um identificador (aceita id, ID, phone ou documentId)
  const leadMatchesIdent = (lead, ident) => {
    if (!ident || !lead) return false;
    const s = String(ident);
    return (
      String(lead.id) === s ||
      String(lead.ID) === s ||
      String(lead.phone ?? '') === s ||
      String(lead.documentId ?? '') === s ||
      String(lead['Document ID'] ?? '') === s
    );
  };

  // Aplica uma alteração no estado local imediatamente (optimistic)
  const applyChangeToLocalState = (change) => {
    try {
      const leadId = change.leadId || change.data?.leadId || change.data?.id || change.data?.ID || change.id;
      const type = change.type;
      const data = change.data || {};

      if (!leadId && type !== 'criarLead') return;

      // Atualiza leads (se aplicável)
      setLeads(prev => {
        if (!prev || prev.length === 0) return prev;
        const updated = prev.map(l => {
          // tentar casar por id numérico ou string ou phone ou documentId
          if (String(l.id) === String(leadId) || String(l.ID) === String(leadId) || String(data.phone || '') === String(l.phone || '') || String(l.documentId ?? '') === String(leadId)) {
            let copy = { ...l };
            if (type === 'alterarAtribuido') {
              if (data.usuarioId !== undefined) {
                copy.usuarioId = data.usuarioId;
                const u = usuarios.find(u => String(u.id) === String(data.usuarioId));
                if (u) copy.responsavel = u.nome;
              } else if (data.responsavel !== undefined) {
                copy.responsavel = data.responsavel;
              }
            } else if (type === 'salvarObservacao') {
              copy.observacao = data.observacao ?? copy.observacao;
            } else if (type === 'atualizarStatus') {
              copy.status = data.status ?? copy.status;
              if (data.phone) copy.phone = data.phone;
              copy.confirmado = true;
            } else if (type === 'salvarAgendamento') {
              copy.agendamento = data.dataAgendada ?? copy.agendamento;
            } else if (type === 'alterar_seguradora') {
              // manter consistência dos campos
              copy = { ...copy, ...data };
            }
            return copy;
          }
          return l;
        });
        return updated;
      });

      // Atualiza leadsFechados (se for alteração de seguradora)
      if (type === 'alterar_seguradora') {
        setLeadsFechados(prev => {
          if (!prev || prev.length === 0) return prev;
          const updated = prev.map(lf => {
            if (
              String(lf.ID) === String(leadId) ||
              String(lf.id) === String(leadId) ||
              String(lf.phone ?? '') === String(leadId) ||
              String(lf.documentId ?? '') === String(leadId) ||
              String(lf['Document ID'] ?? '') === String(leadId)
            ) {
              return { ...lf, ...data };
            }
            return lf;
          });
          return updated;
        });
      }
    } catch (err) {
      console.error('Erro ao aplicar alteração local ao estado:', err);
    }
  };

  // Save a local change (used by child components, optimistic update already handled there)
  const saveLocalChange = (change) => {
    try {
      const derivedLeadId = change.id ?? change.data?.id ?? change.data?.ID ?? change.data?.leadId ?? change.data?.phone ?? change.data?.documentId ?? null;
      const keyBase = derivedLeadId ? String(derivedLeadId) : (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
      const key = keyBase;
      const timestamp = Date.now();

      const stored = {
        ...change,
        id: key,
        leadId: derivedLeadId ?? null,
        timestamp,
      };

      localChangesRef.current[key] = stored;
      persistLocalChangesToStorage();

      // Aplicar imediatamente no estado local para segurar alterações (optimistic)
      applyChangeToLocalState(stored);
    } catch (err) {
      console.error('Erro em saveLocalChange:', err);
    }
  };

  // ------------------ FETCH USUÁRIOS ------------------
  const fetchUsuariosForLogin = async () => {
    try {
      const response = await fetch(GOOGLE_SHEETS_USERS_AUTH_URL);
      const data = await response.json();

      if (Array.isArray(data)) {
        setUsuarios(data.map(item => ({
          id: item.id || '',
          usuario: item.usuario || '',
          nome: item.nome || '',
          email: item.email || '',
          senha: item.senha || '',
          status: item.status || 'Ativo',
          tipo: item.tipo || 'Usuario',
        })));
      } else {
        setUsuarios([]);
        console.warn('Resposta inesperada ao buscar usuários para login:', data);
      }
    } catch (error) {
      console.error('Erro ao buscar usuários para login:', error);
      setUsuarios([]);
    }
  };

  useEffect(() => {
    if (!isEditing) {
      fetchUsuariosForLogin();
      const interval = setInterval(fetchUsuariosForLogin, 300000);
      return () => clearInterval(interval);
    }
  }, [isEditing]);

  const formatarDataParaExibicao = (dataString) => {
    if (!dataString) return '';
    try {
      let dateObj;
      const partesHifen = dataString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const partesBarra = dataString.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

      if (partesHifen) {
        dateObj = new Date(dataString + 'T00:00:00');
      } else if (partesBarra) {
        dateObj = new Date(`${partesBarra[3]}-${partesBarra[2]}-${partesBarra[1]}T00:00:00`);
      } else {
        dateObj = new Date(dataString);
      }

      if (isNaN(dateObj.getTime())) {
        console.warn('Data inválida para exibição:', dataString);
        return dataString;
      }

      const dia = String(dateObj.getDate()).padStart(2, '0');
      const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
      const ano = dateObj.getFullYear();
      const nomeMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                         "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const mesExtenso = nomeMeses[dateObj.getMonth()];
      const anoCurto = String(ano).substring(2);

      return `${dia}/${mesExtenso}/${anoCurto}`;
    } catch (error) {
      console.error('Erro ao formatar data para exibição:', error);
      return dataString;
    }
  };

  // ------------------ FETCH LEADS (com merge de localChanges) ------------------
  const applyLocalChangesToFetched = (fetchedLeads) => {
    const now = Date.now();
    loadLocalChangesFromStorage();

    // primeiro mapeia fetched para objeto normalizado (garante status sempre string)
    const normalizedFetched = fetchedLeads.map((f) => normalizeLead(f));

    const merged = normalizedFetched.map(lead => {
      const matchedChangeKey = Object.keys(localChangesRef.current).find(k => {
        const ch = localChangesRef.current[k];
        if (!ch) return false;

        // considerar documentId nas comparações
        const leadIdMatches = (
          (ch.leadId && String(ch.leadId) === String(lead.id)) ||
          (ch.leadId && String(ch.leadId) === String(lead.ID)) ||
          (ch.leadId && String(ch.leadId) === String(lead.documentId)) ||
          (ch.id && String(ch.id) === String(lead.id)) ||
          (ch.id && String(ch.id) === String(lead.ID)) ||
          (ch.id && String(ch.id) === String(lead.documentId)) ||
          (ch.data && (
            String(ch.data.id) === String(lead.id) ||
            String(ch.data.ID) === String(lead.id) ||
            String(ch.data.leadId) === String(lead.id) ||
            String(ch.data.id) === String(lead.documentId) ||
            String(ch.data.ID) === String(lead.documentId) ||
            String(ch.data.leadId) === String(lead.documentId)
          ))
        );

        const phoneMatches = ch.data && ch.data.phone && String(ch.data.phone) === String(lead.phone);

        return (leadIdMatches || phoneMatches);
      });

      if (matchedChangeKey) {
        const change = localChangesRef.current[matchedChangeKey];
        if (!change) return lead;
        if (now - change.timestamp < SYNC_DELAY_MS) {
          // Fazer merge seguro: não sobrescrever com undefined
          const mergedLead = mergeWithDefined(lead, change.data || {});
          // garantir normalização após merge
          return normalizeLead(mergedLead);
        }
      }

      return lead;
    });

    // Adiciona leads que existem apenas nas localChanges (novos locais) se ainda estiverem no período de hold
    Object.keys(localChangesRef.current).forEach(k => {
      const change = localChangesRef.current[k];
      if (!change) return;
      if (Date.now() - change.timestamp < SYNC_DELAY_MS) {
        const exists = merged.some(l =>
          String(l.id) === String(change.leadId) ||
          (change.data && String(l.phone) === String(change.data.phone)) ||
          String(l.documentId ?? '') === String(change.leadId ?? change.data?.documentId ?? '')
        );
        if (!exists) {
          const newLead = normalizeLead({ id: change.leadId || change.id, documentId: change.data?.documentId ?? change.leadId, ...(change.data || {}) });
          merged.unshift(newLead);
        }
      }
    });

    return merged;
  };

  const fetchLeadsFromSheet = async () => {
    try {
      const response = await fetch(GOOGLE_SHEETS_SCRIPT_URL);
      const data = await response.json();

      if (Array.isArray(data)) {
        const formattedLeads = data.map(item => normalizeLead(item));

        // Aplicar merge com alterações locais (se existirem)
        loadLocalChangesFromStorage();
        const merged = applyLocalChangesToFetched(formattedLeads);

        if (!leadSelecionado) {
          setLeads(merged);
        }
      } else {
        if (!leadSelecionado) {
          setLeads([]);
        }
      }
    } catch (error) {
      console.error('Erro ao buscar leads da planilha:', error);
      if (!leadSelecionado) {
        setLeads([]);
      }
    }
  };
  // ------------------------------------------------------------------------------

  useEffect(() => {
    if (!isEditing) {
      fetchLeadsFromSheet();
      const interval = setInterval(() => {
        fetchLeadsFromSheet();
      }, 300000);
      return () => clearInterval(interval);
    }
  }, [leadSelecionado, isEditing]);

  // ------------------ LEADS FECHADOS (mesma lógica, sem merge por enquanto) -------------
  const fetchLeadsFechadosFromSheet = async () => {
    try {
      const response = await fetch(GOOGLE_SHEETS_LEADS_FECHADOS)
      const data = await response.json();

      if (!Array.isArray(data)) {
        setLeadsFechados([]);
        return;
      }

      // normaliza e garante id/ID/documentId como strings
      const formattedData = data.map(item => normalizeLead(item));
      setLeadsFechados(formattedData);

    } catch (error) {
      console.error('Erro ao buscar leads fechados:', error);
      setLeadsFechados([]);
    }
  };

  useEffect(() => {
    if (!isEditing) {
      fetchLeadsFechadosFromSheet();
      const interval = setInterval(() => {
        fetchLeadsFechadosFromSheet();
      }, 300000);
      return () => clearInterval(interval);
    }
  }, [isEditing]);
  // ------------------------------------------------------------------------------

  // =========================================================================
  // === LÓGICA ADICIONADA: Função para atualizar o nome em Leads Fechados ===
  // =========================================================================
  const handleLeadFechadoNameUpdate = (leadId, novoNome) => {
    setLeadsFechados(prevLeads => {
      const updatedLeads = prevLeads.map(lead => {
        if (leadMatchesIdent(lead, leadId)) {
          return {
            ...lead,
            name: novoNome,
          };
        }
        return lead;
      });
      return updatedLeads;
    });
  };
  // =========================================================================

  // ------------------ Funções de adicionar/atualizar estado local --------------
  const adicionarUsuario = (usuario) => {
    setUsuarios((prev) => [...prev, { ...usuario, id: prev.length + 1 }]);
  };

  const adicionarNovoLead = (novoLead) => {
    const normalized = normalizeLead(novoLead);
    setLeads((prevLeads) => {
      if (!prevLeads.some(lead => String(lead.ID) === String(normalized.ID) || String(lead.id) === String(normalized.id) || String(lead.documentId ?? '') === String(normalized.documentId ?? ''))) {
        return [normalized, ...prevLeads];
      }
      return prevLeads;
    });
  };

  const atualizarStatusLeadAntigo = (id, novoStatus, phone) => {
    if (novoStatus === 'Fechado') {
      setLeadsFechados((prev) => {
        const atualizados = prev.map((leadsFechados) =>
          leadsFechados.phone === phone ? { ...leadsFechados, Status: novoStatus, confirmado: true } : leadsFechados
        );
        return atualizados;
      });
    }

    setLeads((prev) =>
      prev.map((lead) =>
        lead.phone === phone ? { ...lead, status: novoStatus, confirmado: true } : lead
      )
    );
  };

  const atualizarStatusLead = (id, novoStatus, phone) => {
    // Atualiza UI local imediatamente (optimistic)
    setLeads((prev) =>
      prev.map((lead) =>
        lead.phone === phone ? { ...lead, status: novoStatus ?? lead.status, confirmado: true } : lead
      )
    );

    // Salva localmente para sincronizar depois (mantenha o estado local)
    saveLocalChange({
      id: id,
      type: 'atualizarStatus',
      data: { leadId: id, status: novoStatus, phone: phone || null }
    });

    if (novoStatus === 'Fechado') {
      setLeadsFechados((prev) => {
        const jaExiste = prev.some((lead) => lead.phone === phone);

        if (jaExiste) {
          const atualizados = prev.map((lead) =>
            lead.phone === phone ? { ...lead, Status: novoStatus, confirmado: true } : lead
          );
          return atualizados;
        } else {
          const leadParaAdicionar = leads.find((lead) => lead.phone === phone);

          if (leadParaAdicionar) {
            const newId = String(leadParaAdicionar.id ?? leadParaAdicionar.ID ?? leadParaAdicionar.documentId ?? (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)));

            const novoLeadFechado = {
              ID: newId,
              id: newId,
              documentId: leadParaAdicionar.documentId ?? null,
              name: leadParaAdicionar.name,
              vehicleModel: leadParaAdicionar.vehicleModel,
              vehicleYearModel: leadParaAdicionar.vehicleYearModel,
              city: leadParaAdicionar.city,
              phone: leadParaAdicionar.phone,
              insuranceType: leadParaAdicionar.insuranceType || leadParaAdicionar.insuranceType || "",
              Data: leadParaAdicionar.createdAt || new Date().toISOString(),
              Responsavel: leadParaAdicionar.responsavel || "",
              Status: "Fechado",
              Seguradora: leadParaAdicionar.Seguradora || "",
              PremioLiquido: leadParaAdicionar.premioLiquido || "",
              Comissao: leadParaAdicionar.Comissao || "",
              Parcelamento: leadParaAdicionar.Parcelamento || "",
              VigenciaInicial: leadParaAdicionar.VigenciaInicial || "",
              VigenciaFinal: leadParaAdicionar.VigenciaFinal || "",
              MeioPagamento: leadParaAdicionar.MeioPagamento || '',
              CartaoPortoNovo: leadParaAdicionar.CartaoPortoNovo || '',
              usuario: leadParaAdicionar.usuario || "",
              nome: leadParaAdicionar.nome || "",
              email: leadParaAdicionar.email || "",
              senha: leadParaAdicionar.senha || "",
              status: leadParaAdicionar.status || "Ativo",
              tipo: leadParaAdicionar.tipo || "Usuario",
              "Ativo/Inativo": leadParaAdicionar["Ativo/Inativo"] || "Ativo",
              confirmado: true,
              observacao: leadParaAdicionar.observacao || ''
            };
            return [...prev, novoLeadFechado];
          }
          console.warn("Lead não encontrado na lista principal para adicionar aos fechados.");
          return prev;
        }
      });
    }
  };

  const handleConfirmAgendamento = async (leadId, dataAgendada) => {
    try {
      if (typeof saveLocalChange === 'function') {
        saveLocalChange({
          id: leadId,
          type: 'salvarAgendamento',
          data: { leadId: leadId, dataAgendada: dataAgendada }
        });
      }
    } catch (error) {
      console.error('Erro ao agendar (salvando localmente):', error);
    }
  };

  const atualizarSeguradoraLead = (id, seguradora) => {
    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === id
          ? limparCamposLead({ ...lead, insurer: seguradora })
          : lead
      )
    );
  };

  const limparCamposLead = (lead) => ({
    ...lead,
    premioLiquido: "",
    comissao: "",
    VigenciaFinal: "",
    VigenciaInicial: "",
  })

  // FUNÇÃO ATUALIZADA COM SUPORTE A Document ID (doc.id do Firestore)
  const confirmarSeguradoraLead = (id, premio, seguradora, comissao, parcelamento, vigenciaFinal, vigenciaInicial, meioPagamento, cartaoPortoNovo) => {
    const ident = String(id);

    // Procura pelo lead usando ID, id, phone ou documentId (tolerante)
    const found = leadsFechados.find(l => leadMatchesIdent(l, ident));

    if (!found) {
      console.warn(`Aviso: Lead com identificador ${ident} não encontrado por ID/id/phone/documentId. Irei criar um placeholder em leadsFechados.`);
    }

    // Atualiza estado localmente sempre que possível (mapeia por várias chaves)
    setLeadsFechados((prev) => {
      // Se já existe, atualiza
      let updated = prev.map((l) => {
        if (leadMatchesIdent(l, ident)) {
          return {
            ...l,
            insurerConfirmed: true,
            Seguradora: seguradora,
            PremioLiquido: premio,
            Comissao: comissao,
            Parcelamento: parcelamento,
            VigenciaFinal: vigenciaFinal || '',
            VigenciaInicial: vigenciaInicial || '',
            MeioPagamento: meioPagamento || '',
            CartaoPortoNovo: cartaoPortoNovo || ''
          };
        }
        return l;
      });

      // Se não encontrou, adiciona um placeholder (upsert) para compatibilidade com doc.id do Firestore
      const existsNow = updated.some(l => leadMatchesIdent(l, ident));
      if (!existsNow) {
        const placeholder = normalizeLead({
          ID: ident,
          id: ident,
          documentId: ident,
          'Document ID': ident,
          name: '',
          phone: '',
          Data: new Date().toISOString(),
          Responsavel: usuarioLogado?.nome ?? '',
          Status: 'Fechado',
          Seguradora: seguradora || '',
          PremioLiquido: premio || '',
          Comissao: comissao || '',
          Parcelamento: parcelamento || '',
          VigenciaInicial: vigenciaInicial || '',
          VigenciaFinal: vigenciaFinal || '',
          MeioPagamento: meioPagamento || '',
          CartaoPortoNovo: cartaoPortoNovo || '',
          confirmed: true,
          insurerConfirmed: true
        });
        updated = [...updated, placeholder];
      }

      return updated;
    });

    // Enfileira alteração localmente (mesmo que o lead não tenha sido localizado, para sincronizar posteriormente)
    try {
      const changeId = ident ?? (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
      const dataToSave = {
        id: changeId,
        ID: changeId,
        documentId: changeId,
        Seguradora: seguradora,
        PremioLiquido: premio,
        Comissao: comissao,
        Parcelamento: parcelamento,
        VigenciaFinal: vigenciaFinal || '',
        VigenciaInicial: vigenciaInicial || '',
        MeioPagamento: meioPagamento || '',
        CartaoPortoNovo: cartaoPortoNovo || ''
      };
      saveLocalChange({
        id: changeId,
        type: 'alterar_seguradora',
        data: dataToSave
      });
    } catch (error) {
      console.error('Erro ao enfileirar alteração de seguradora localmente:', error);
    }
  };

  const atualizarDetalhesLeadFechado = (id, campo, valor) => {
    setLeadsFechados((prev) =>
      prev.map((lead) =>
        leadMatchesIdent(lead, id) ? { ...lead, [campo]: valor } : lead
      )
    );
  };

  const transferirLead = (leadId, responsavelId) => {
    if (responsavelId === null) {
      setLeads((prev) =>
        prev.map((lead) =>
          lead.id === leadId ? { ...lead, responsavel: null } : lead
        )
      );
      return;
    }

    let usuario = usuarios.find((u) => u.id == responsavelId);

    if (!usuario) {
      return;
    }

    setLeads((prev) =>
      prev.map((lead) =>
        lead.id === leadId ? { ...lead, responsavel: usuario.nome } : lead
      )
    );
  };

  const onAbrirLead = (lead) => {
    setLeadSelecionado(lead);

    let path = '/leads';
    if ((lead?.status ?? '') === 'Fechado') path = '/leads-fechados';
    else if ((lead?.status ?? '') === 'Perdido') path = '/leads-perdidos';

    navigate(path);
  };

  const handleLogin = () => {
    const usuarioEncontrado = usuarios.find(
      (u) => u.usuario === loginInput && u.senha === senhaInput && u.status === 'Ativo'
    );

    if (usuarioEncontrado) {
      setIsAuthenticated(true);
      setUsuarioLogado(usuarioEncontrado);
    } else {
      alert('Login ou senha inválidos ou usuário inativo.');
    }
  };

  // FUNÇÃO PARA SALVAR OBSERVAÇÃO (agora salva localmente e só sincroniza após 5 minutos)
  const salvarObservacao = async (leadId, observacao) => {
    try {
      if (typeof saveLocalChange === 'function') {
        saveLocalChange({
          id: leadId,
          type: 'salvarObservacao',
          data: { leadId, observacao: observacao }
        });
      }

      console.log('Observação salva localmente. Será sincronizada após 5 minutos.');
    } catch (error) {
      console.error('Erro ao salvar observação localmente:', error);
    }
  };

  // ------------------ SYNC WORKER: envia alterações após expirarem ------------------
  useEffect(() => {
    loadLocalChangesFromStorage();

    const interval = setInterval(async () => {
      const now = Date.now();
      const dueKeys = [];
      const keys = Object.keys(localChangesRef.current);

      for (const k of keys) {
        const change = localChangesRef.current[k];
        if (!change) continue;
        if (now - change.timestamp >= SYNC_DELAY_MS) {
          dueKeys.push(k);
        }
      }

      if (dueKeys.length === 0) return;

      for (const key of dueKeys) {
        const change = localChangesRef.current[key];
        if (!change) continue;

        try {
          await fetch(GOOGLE_APPS_SCRIPT_BASE_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: change.type,
              data: change.data,
            }),
          });

          delete localChangesRef.current[key];
          persistLocalChangesToStorage();

        } catch (err) {
          console.error('Erro ao sincronizar alteração local:', err);
          // mantém para nova tentativa
        }
      }
    }, SYNC_CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const formatarDataParaDDMMYYYY = (dataString) => {
    if (!dataString) return '';

    try {
      let dateObj;
      const partesHifen = dataString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (partesHifen) {
        dateObj = new Date(`${partesHifen[1]}-${partesHifen[2]}-${partesHifen[3]}T00:00:00`);
      } else {
        const partesBarra = dataString.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (partesBarra) {
          dateObj = new Date(`${partesBarra[3]}-${partesBarra[2]}-${partesBarra[1]}T00:00:00`);
        } else {
          dateObj = new Date(dataString);
        }
      }

      if (isNaN(dateObj.getTime())) {
        console.warn('formatarDataParaDDMMYYYY: Data inválida detectada:', dataString);
        return dataString;
      }

      const dia = String(dateObj.getDate()).padStart(2, '0');
      const mesIndex = dateObj.getMonth();
      const ano = dateObj.getFullYear();
      const nomeMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                         "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      const mesExtenso = nomeMeses[mesIndex];
      const anoCurto = String(ano).substring(2);

      return `${dia}/${mesExtenso}/${anoCurto}`;
    } catch (e) {
      console.error("Erro na função formatarDataParaDDMMYYYY:", e);
      return dataString;
    }
  };

  // ===================== FUNÇÃO: não força sincronização imediata =====================
  const forceSyncWithSheets = async () => {
    try {
      loadLocalChangesFromStorage();
      console.log('forceSyncWithSheets: sincronização imediata desativada. Alterações serão enviadas após 5 minutos.');
    } catch (error) {
      console.error('Erro em forceSyncWithSheets (agora sem forçar):', error);
    }
  };
  // =============================================================================

  if (!isAuthenticated) {
    return (
      <div
        className={`flex items-center justify-center min-h-screen bg-cover bg-center transition-opacity duration-1000 ${
          backgroundLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          backgroundImage: `url('/background.png')`,
        }}
      >
        <div className="bg-blue-900 bg-opacity-60 text-white p-10 rounded-2xl shadow-2xl w-full max-w-sm">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 mb-2 flex items-center justify-center text-4xl text-yellow-400">
              👑
            </div>
            <h1 className="text-xl font-semibold">GRUPO</h1>
            <h2 className="text-2xl font-bold text-white">PRIMME SEGUROS</h2>
            <p className="text-sm text-white">CORRETORA DE SEGUROS</p>
          </div>

          <input
            type="text"
            placeholder="Usuário"
            value={loginInput}
            onChange={(e) => setLoginInput(e.target.value)}
            className="w-full mb-4 px-4 py-2 rounded text-black"
          />
          <input
            type="password"
            placeholder="Senha"
            value={senhaInput}
            onChange={(e) => setSenhaInput(e.target.value)}
            className="w-full mb-2 px-4 py-2 rounded text-black"
          />
          <div className="text-right text-sm mb-4">
            <a href="#" className="text-white underline">
            </a>
          </div>
          <button
            onClick={handleLogin}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            ENTRAR
          </button>
        </div>
      </div>
    );
  }

  const isAdmin = usuarioLogado?.tipo === 'Admin';

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <Sidebar isAdmin={isAdmin} nomeUsuario={usuarioLogado} />

      <main ref={mainContentRef} style={{ flex: 1, overflow: 'auto' }}>
        <ScrollToTop scrollContainerRef={mainContentRef} />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <Dashboard
                leadsClosed={
                  isAdmin
                    ? leadsFechados
                    : leadsFechados.filter((lead) => String(lead.Responsavel) === String(usuarioLogado.nome))
                }
                leads={
                  isAdmin
                    ? leads
                    : leads.filter((lead) => String(lead.responsavel) === String(usuarioLogado.nome))
                }
                usuarioLogado={usuarioLogado}
                setIsEditing={setIsEditing}
              />
            }
          />
          <Route
            path="/leads"
            element={
              <Leads
                leads={isAdmin ? leads : leads.filter((lead) => String(lead.responsavel) === String(usuarioLogado.nome))}
                usuarios={usuarios}
                onUpdateStatus={atualizarStatusLead}
                fetchLeadsFromSheet={fetchLeadsFromSheet}
                transferirLead={transferirLead}
                usuarioLogado={usuarioLogado}
                leadSelecionado={leadSelecionado}
                setIsEditing={setIsEditing}
                scrollContainerRef={mainContentRef}
                onConfirmAgendamento={handleConfirmAgendamento}
                salvarObservacao={salvarObservacao}
                saveLocalChange={saveLocalChange}
                forceSyncWithSheets={forceSyncWithSheets}
              />
            }
          />
          <Route
            path="/leads-fechados"
            element={
              <LeadsFechados
                leads={isAdmin ? leadsFechados : leadsFechados.filter((lead) => String(lead.Responsavel) === String(usuarioLogado.nome))}
                usuarios={usuarios}
                onUpdateInsurer={atualizarSeguradoraLead}
                onConfirmInsurer={confirmarSeguradoraLead}
                onUpdateDetalhes={atualizarDetalhesLeadFechado}
                fetchLeadsFechadosFromSheet={fetchLeadsFechadosFromSheet}
                isAdmin={isAdmin}
                ultimoFechadoId={ultimoFechadoId}
                onAbrirLead={onAbrirLead}
                leadSelecionado={leadSelecionado}
                formatarDataParaExibicao={formatarDataParaExibicao}
                setIsEditing={setIsEditing}
                scrollContainerRef={mainContentRef}
                onLeadNameUpdate={handleLeadFechadoNameUpdate}
              />
            }
          />
          <Route
            path="/leads-perdidos"
            element={
              <LeadsPerdidos
                leads={isAdmin ? leads.filter((lead) => String(lead.status) === 'Perdido') : leads.filter((lead) => String(lead.responsavel) === String(usuarioLogado.nome) && String(lead.status) === 'Perdido')}
                usuarios={usuarios}
                fetchLeadsFromSheet={fetchLeadsFromSheet}
                onAbrirLead={onAbrirLead}
                isAdmin={isAdmin}
                leadSelecionado={leadSelecionado}
                setIsEditing={setIsEditing}
              />
            }
          />
          <Route path="/buscar-lead" element={<BuscarLead
            leads={leads}
            fetchLeadsFromSheet={fetchLeadsFromSheet}
            fetchLeadsFechadosFromSheet={fetchLeadsFechadosFromSheet}
            setIsEditing={setIsEditing}
          />} />
          <Route
            path="/criar-lead"
            element={<CriarLead adicionarLead={adicionarNovoLead} />}
          />
          {isAdmin && (
            <>
              <Route path="/criar-usuario" element={<CriarUsuario adicionarUsuario={adicionarUsuario} />} />
              <Route
                path="/usuarios"
                element={<GerenciarUsuarios />}
              />
            </>
          )}
          <Route path="/ranking" element={<Ranking
            usuarios={usuarios}
            fetchLeadsFromSheet={fetchLeadsFromSheet}
            fetchLeadsFechadosFromSheet={fetchLeadsFechadosFromSheet}
            leads={leads} />} />
          <Route path="*" element={<h1 style={{ padding: 20 }}>Página não encontrada</h1>} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
