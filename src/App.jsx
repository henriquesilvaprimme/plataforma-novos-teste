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

import { db } from './firebase';
import { collection, getDocs, onSnapshot, query, orderBy } from 'firebase/firestore';

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

// ======= CONFIGURAÇÃO DE SINCRONIZAÇÃO LOCAL (apenas armazenamento local; sem Sheets) =======
const LOCAL_CHANGES_KEY = 'leads_local_changes_v1';
// ==========================================================================================

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
  // detectando automaticamente variações do campo Document ID (ignora maiúsc/minúsc e espaços)
  const normalizeLead = (item = {}) => {
    // tenta extrair id seguro
    const rawId = item.id ?? item.ID ?? item.Id ?? item.IdLead ?? null;
    const derivedId = rawId !== null && rawId !== undefined && rawId !== ''
      ? String(rawId)
      : (item.phone ? String(item.phone) : (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)));

    // Detectar qualquer chave que contenha 'document' e 'id' (ex.: 'Document ID', 'documentId', 'DocumentID', etc.)
    let rawDocumentId = null;
    Object.keys(item || {}).forEach((k) => {
      const cleaned = String(k).toLowerCase().replace(/\s+/g, '');
      if (cleaned.includes('document') && cleaned.includes('id')) {
        const v = item[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          rawDocumentId = String(v);
        }
      }
      // detecta chaves curtas como 'docid' ou 'docId'
      if (!rawDocumentId) {
        const ck = String(k).toLowerCase();
        if (ck === 'docid' || ck === 'docid' || ck === 'doc_id' || ck === 'documentid') {
          const v = item[k];
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            rawDocumentId = String(v);
          }
        }
      }
    });

    // fallback para propriedades específicas
    if (!rawDocumentId) {
      rawDocumentId = item.documentId ?? item.docId ?? item.DocumentId ?? item.DocumentID ?? item['Document ID'] ?? null;
    }

    const documentId = rawDocumentId !== null && rawDocumentId !== undefined && String(rawDocumentId).trim() !== '' ? String(rawDocumentId).trim() : null;

    const statusRaw = item.status ?? item.Status ?? item.stato ?? '';
    const status = (typeof statusRaw === 'string' && statusRaw.trim() !== '') ? statusRaw : (item.confirmado ? 'Em Contato' : 'Selecione o status');

    // garante que tanto id quanto ID existam e sejam strings (consistência)
    return {
      id: String(item.id ?? item.ID ?? derivedId),
      ID: String(item.ID ?? item.id ?? derivedId),
      documentId: documentId, // novo campo consistente para Document ID
      // mantém 'Document ID' bruto se existir (algumas planilhas têm a coluna literal)
      'Document ID': item['Document ID'] ?? (documentId ? documentId : undefined),
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

  // util: normalize string for comparisons
  const norm = (v) => (v === undefined || v === null) ? '' : String(v).trim();

  // util: compara um lead com um identificador (aceita id, ID, phone ou documentId), com trim
  const leadMatchesIdent = (lead, ident) => {
    if (!ident || !lead) return false;
    const s = norm(ident);
    return (
      norm(lead.id) === s ||
      norm(lead.ID) === s ||
      norm(lead.phone) === s ||
      norm(lead.documentId) === s ||
      norm(lead['Document ID']) === s
    );
  };

  // Aplica uma alteração no estado local imediatamente (optimistic)
  const applyChangeToLocalState = (change) => {
    try {
      const leadId = change.leadId || change.data?.leadId || change.data?.id || change.data?.ID || change.data?.documentId || change.id;
      const type = change.type;
      const data = change.data || {};

      if (!leadId && type !== 'criarLead') return;

      // Atualiza leads (se aplicável)
      setLeads(prev => {
        if (!prev || prev.length === 0) return prev;
        const updated = prev.map(l => {
          // tentar casar por id numérico ou string ou phone ou documentId
          if (leadMatchesIdent(l, leadId) || (data.phone && norm(data.phone) === norm(l.phone))) {
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
            if (leadMatchesIdent(lf, leadId) || (data.phone && norm(data.phone) === norm(lf.phone))) {
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
      const snapshot = await getDocs(collection(db, 'usuarios'));
      const users = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() || {};
        users.push({
          id: docSnap.id,
          usuario: data.usuario ?? '',
          nome: data.nome ?? '',
          email: data.email ?? '',
          senha: data.senha ?? '',
          status: data.status ?? 'Ativo',
          tipo: data.tipo ?? 'Usuario',
        });
      });
      setUsuarios(users);
    } catch (error) {
      console.error('Erro ao buscar usuários do Firebase:', error);
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

  // ------------------ FIRESTORE: listeners para leads e leadsFechados ------------------
  useEffect(() => {
    // Listener para 'leads' (abertos)
    try {
      const qLeads = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
      const unsubLeads = onSnapshot(qLeads, (snapshot) => {
        const arr = snapshot.docs.map(d => normalizeLead({ id: d.id, ...(d.data() || {}) }));
        setLeads(arr);
      }, (err) => {
        console.error('Erro no listener leads:', err);
      });

      return () => {
        try { unsubLeads(); } catch (e) { /* ignore */ }
      };
    } catch (e) {
      console.error('Erro iniciando listener leads:', e);
    }
  }, []);

  useEffect(() => {
    // Listener para 'leadsFechados'
    try {
      const qFechados = query(collection(db, 'leadsFechados'), orderBy('closedAt', 'desc'));
      const unsubFechados = onSnapshot(qFechados, (snapshot) => {
        const arr = snapshot.docs.map(d => normalizeLead({ id: d.id, ...(d.data() || {}) }));
        setLeadsFechados(arr);
      }, (err) => {
        console.error('Erro no listener leadsFechados:', err);
      });

      return () => {
        try { unsubFechados(); } catch (e) { /* ignore */ }
      };
    } catch (e) {
      console.error('Erro iniciando listener leadsFechados:', e);
    }
  }, []);

  // Também expomos fetchers pontuais (getDocs) caso algum componente queira forçar refresh manual
  const fetchLeadsFromFirebase = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'leads'), orderBy('createdAt', 'desc')));
      const arr = snap.docs.map(d => normalizeLead({ id: d.id, ...(d.data() || {}) }));
      setLeads(arr);
    } catch (err) {
      console.error('Erro ao buscar leads do Firebase:', err);
      setLeads([]);
    }
  };

  const fetchLeadsFechadosFromFirebase = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'leadsFechados'), orderBy('closedAt', 'desc')));
      const arr = snap.docs.map(d => normalizeLead({ id: d.id, ...(d.data() || {}) }));
      setLeadsFechados(arr);
    } catch (err) {
      console.error('Erro ao buscar leadsFechados do Firebase:', err);
      setLeadsFechados([]);
    }
  };
  // -------------------------------------------------------------------------------------

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
      if (!prevLeads.some(lead => norm(lead.ID) === norm(normalized.ID) || norm(lead.id) === norm(normalized.id) || norm(lead.documentId ?? '') === norm(normalized.documentId ?? ''))) {
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

    // Salva localmente para sincronizar depois (agora apenas localChanges persistidos, sem Sheets)
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

  // FUNÇÃO ATUALIZADA COM SUPORTE A Document ID (doc.id do Firestore) E LOGS PARA DEBUG
  const confirmarSeguradoraLead = (id, premio, seguradora, comissao, parcelamento, vigenciaFinal, vigenciaInicial, meioPagamento, cartaoPortoNovo) => {
    const ident = String(id);

    // LOG TEMPORÁRIO: para debug (mostra ident recebido e lista reduzida de ids em leadsFechados)
    try {
      console.debug('[confirmarSeguradoraLead] ident recebido:', ident);
      console.debug('[confirmarSeguradoraLead] leadsFechados snapshot (ID,id,documentId):', leadsFechados.map(l => ({
        ID: norm(l.ID),
        id: norm(l.id),
        documentId: norm(l.documentId),
        'Document ID': norm(l['Document ID'])
      })));
    } catch (e) {
      // ignore
    }

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
        console.debug('[confirmarSeguradoraLead] placeholder criado para ident:', ident);
      }

      return updated;
    });

    // Enfileira alteração localmente (mesmo que o lead não tenha sido localizado, para persistência local)
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

  // FUNÇÃO PARA SALVAR OBSERVAÇÃO (apenas local)
  const salvarObservacao = async (leadId, observacao) => {
    try {
      if (typeof saveLocalChange === 'function') {
        saveLocalChange({
          id: leadId,
          type: 'salvarObservacao',
          data: { leadId, observacao: observacao }
        });
      }

      console.log('Observação salva localmente.');
    } catch (error) {
      console.error('Erro ao salvar observação localmente:', error);
    }
  };

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

  // ===================== FUNÇÃO: não força sincronização com Sheets (removido) =====================
  const forceSyncWithSheets = async () => {
    // removido: sincronização com Google Sheets
    console.log('Sincronização com Google Sheets removida. As alterações são persistidas localmente apenas.');
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
                fetchLeadsFromSheet={fetchLeadsFromFirebase} // renamed but usable by children
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
                leads={
                  isAdmin
                    ? leadsFechados
                    : leadsFechados.filter((lead) =>
                        String(lead.responsavel) === String(usuarioLogado.nome) ||
                        String(lead.Responsavel) === String(usuarioLogado.nome) ||
                        String(lead.usuarioId) === String(usuarioLogado.id) ||
                        String(lead.usuario) === String(usuarioLogado.usuario)
                      )
                }
                usuarios={usuarios}
                onUpdateInsurer={atualizarSeguradoraLead}
                onConfirmInsurer={confirmarSeguradoraLead}
                onUpdateDetalhes={atualizarDetalhesLeadFechado}
                fetchLeadsFechadosFromSheet={fetchLeadsFechadosFromFirebase} // renamed but usable
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
                fetchLeadsFromSheet={fetchLeadsFromFirebase}
                onAbrirLead={onAbrirLead}
                isAdmin={isAdmin}
                leadSelecionado={leadSelecionado}
                setIsEditing={setIsEditing}
              />
            }
          />
          <Route path="/buscar-lead" element={<BuscarLead
            leads={leads}
            fetchLeadsFromSheet={fetchLeadsFromFirebase}
            fetchLeadsFechadosFromSheet={fetchLeadsFechadosFromFirebase}
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
            fetchLeadsFromSheet={fetchLeadsFromFirebase}
            fetchLeadsFechadosFromSheet={fetchLeadsFechadosFromFirebase}
            leads={leads} />} />
          <Route path="*" element={<h1 style={{ padding: 20 }}>Página não encontrada</h1>} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
