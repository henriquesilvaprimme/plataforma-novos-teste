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

const GOOGLE_APPS_SCRIPT_BASE_URL = 'https://script.google.com/macros/s/AKfycby8vujvd5ybEpkaZ0kwZecAWOdaL0XJR84oKJBAIR9dVYeTCv7iSdTdHQWBb7YCp349/exec';
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
  const localChangesRef = useRef({}); // formato: { [uuidOrId]: { id, type, data, timestamp } }

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
        localChangesRef.current = JSON.parse(raw);
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

  // Save a local change (used by child components, optimistic update already handled there)
  const saveLocalChange = (change) => {
    // change = { id: <idOuUuid>, type: 'status_update'|'assign_user'|'salvarObservacao'|..., data: {...} }
    const key = String(change.id ?? (change.data && change.data.id) ?? crypto.randomUUID());
    const timestamp = Date.now();
    localChangesRef.current[key] = { ...change, timestamp, id: key };
    persistLocalChangesToStorage();
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
    const merged = fetchedLeads.map(lead => {
      const key = Object.keys(localChangesRef.current).find(k => {
        const ch = localChangesRef.current[k];
        if (!ch) return false;
        if (String(ch.id) === String(lead.id) || (ch.data && String(ch.data.id) === String(lead.id))) return true;
        if (ch.data && ch.data.phone && String(ch.data.phone) === String(lead.phone)) return true;
        return false;
      });

      if (key) {
        const change = localChangesRef.current[key];
        if (now - change.timestamp < SYNC_DELAY_MS) {
          return { ...lead, ...change.data };
        }
      }
      return lead;
    });

    // Também adicionar leads que existem apenas nas localChanges (novo lead local)
    Object.keys(localChangesRef.current).forEach(k => {
      const change = localChangesRef.current[k];
      if (!change) return;
      if (Date.now() - change.timestamp < SYNC_DELAY_MS) {
        const exists = merged.some(l => String(l.id) === String(change.id) || (change.data && String(l.phone) === String(change.data.phone)));
        if (!exists) {
          merged.unshift({ id: change.id, ...change.data });
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
        const sortedData = data;

        const formattedLeads = sortedData.map((item, index) => ({
          id: item.id ? Number(item.id) : index + 1,
          name: item.name || item.Name || '',
          vehicleModel: item.vehiclemodel || item.vehicleModel || '',
          vehicleYearModel: item.vehicleyearmodel || item.vehicleYearModel || '',
          city: item.city || '',
          phone: item.phone || item.Telefone || '',
          insuranceType: item.insurancetype || item.insuranceType || '',
          status: item.status || 'Selecione o status',
          confirmado: item.confirmado === 'true' || item.confirmado === true,
          insurer: item.insurer || '',
          insurerConfirmed: item.insurerConfirmed === 'true' || item.insurerConfirmed === true,
          usuarioId: item.usuarioId ? Number(item.usuarioId) : null,
          premioLiquido: item.premioLiquido || '',
          comissao: item.comissao || '',
          parcelamento: item.parcelamento || '',
          VigenciaFinal: item.VigenciaFinal || '',
          VigenciaInicial: item.VigenciaInicial || '',
          createdAt: item.data || new Date().toISOString(),
          responsavel: item.responsavel || '',
          editado: item.editado || '',
          observacao: item.observacao || '',
          agendamento: item.agendamento || '',
          agendados: item.agendados || '',
          // NOVOS CAMPOS
          MeioPagamento: item.MeioPagamento || '',
          CartaoPortoNovo: item.CartaoPortoNovo || '',
        }));

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

      const formattedData = data.map(item => ({
        ...item,
        insuranceType: item.insuranceType || '',
        MeioPagamento: item.MeioPagamento || '',
        CartaoPortoNovo: item.CartaoPortoNovo || '',
      }));
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
        if (String(lead.ID) === String(leadId)) {
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
    setLeads((prevLeads) => {
      if (!prevLeads.some(lead => lead.ID === novoLead.ID)) {
        return [novoLead, ...prevLeads];
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
        lead.phone === phone ? { ...lead, status: novoStatus, confirmado: true } : lead
      )
    );

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
            const novoLeadFechado = {
              ID: leadParaAdicionar.id || crypto.randomUUID(),
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
              MeioPagamento: leadParaAdicionar.MeioPagamento || "",
              CartaoPortoNovo: leadParaAdicionar.CartaoPortoNovo || "",
              id: leadParaAdicionar.id || null,
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
      await fetch(SALVAR_AGENDAMENTO_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
          leadId: leadId,
          dataAgendada: dataAgendada,
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Recarrega os leads para que a nova data apareça
      await fetchLeadsFromSheet();
    } catch (error) {
      console.error('Erro ao confirmar agendamento:', error);
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

  // FUNÇÃO ATUALIZADA COM NOVOS PARÂMETROS
  const confirmarSeguradoraLead = (id, premio, seguradora, comissao, parcelamento, vigenciaFinal, vigenciaInicial, meioPagamento, cartaoPortoNovo) => {
    const lead = leadsFechados.find((lead) => lead.ID == id);

    if (!lead) {
      console.error(`Lead com ID ${id} não encontrado na lista de leads fechados.`);
      return;
    }

    lead.Seguradora = seguradora;
    lead.PremioLiquido = premio;
    lead.Comissao = comissao;
    lead.Parcelamento = parcelamento;
    lead.VigenciaFinal = vigenciaFinal || '';
    lead.VigenciaInicial = vigenciaInicial || '';
    lead.MeioPagamento = meioPagamento || '';
    lead.CartaoPortoNovo = cartaoPortoNovo || '';

    setLeadsFechados((prev) => {
      const atualizados = prev.map((l) =>
        l.ID === id ? {
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
        } : l
      );
      return atualizados;
    });

    try {
      fetch(GOOGLE_APPS_SCRIPT_BASE_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
          v: 'alterar_seguradora',
          lead: lead
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })
      .then(response => {
        console.log('Requisição de dados da seguradora enviada (com no-cors).');
        setTimeout(() => {
          fetchLeadsFechadosFromSheet();
        }, 1000);
      })
      .catch(error => {
        console.error('Erro ao enviar lead (rede ou CORS):', error);
      });
    } catch (error) {
      console.error('Erro no bloco try/catch de envio do lead:', error);
    }
  };

  const atualizarDetalhesLeadFechado = (id, campo, valor) => {
    setLeadsFechados((prev) =>
      prev.map((lead) =>
        lead.ID === id ? { ...lead, [campo]: valor } : lead
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
    if (lead.status === 'Fechado') path = '/leads-fechados';
    else if (lead.status === 'Perdido') path = '/leads-perdidos';

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

  // FUNÇÃO PARA SALVAR OBSERVAÇÃO (restaurada para enviar imediatamente, como antes)
  const salvarObservacao = async (leadId, observacao) => {
    try {
      const response = await fetch(SALVAR_OBSERVACAO_SCRIPT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'salvarObservacao',
          leadId: leadId,
          observacao: observacao,
        }),
      });

      if (response && response.ok) {
        console.log('Observação salva com sucesso!');
        // Recarrega os leads para que a nova observação apareça
        await fetchLeadsFromSheet();
      } else {
        // Se servidor não retornar ok (em modo no-cors pode ser indefinido), ainda chamamos fetch para tentar atualizar
        console.warn('Resposta não OK ao salvar observação (pode ser no-cors):', response);
        setTimeout(fetchLeadsFromSheet, 800);
      }
    } catch (error) {
      console.error('Erro de rede ao salvar observação:', error);
      // Tentar atualizar localmente mesmo em erro de rede
      setTimeout(fetchLeadsFromSheet, 1200);
    }
  };

  // ------------------ SYNC WORKER: envia alterações após expirarem ------------------
  useEffect(() => {
    // carrega alterações ao montar
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

      // Processa cada alteração vencida (envia POST genérico; você pode customizar por tipo)
      for (const key of dueKeys) {
        const change = localChangesRef.current[key];
        if (!change) continue;

        try {
          // Envio genérico: action=change.type, data=change.data
          await fetch(GOOGLE_APPS_SCRIPT_BASE_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: change.type,
              data: change.data,
            }),
          });

          // Após envio, removemos a alteração local
          delete localChangesRef.current[key];
          persistLocalChangesToStorage();

          // Forçar um fetch para garantir que o estado servidor seja refletido
          setTimeout(() => {
            fetchLeadsFromSheet();
            fetchLeadsFechadosFromSheet();
          }, 800);
        } catch (err) {
          console.error('Erro ao sincronizar alteração local:', err);
          // Em caso de erro, mantemos a alteração para tentar de novo posteriormente
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

  // ===================== NOVA FUNÇÃO: força sincronização imediata =====================
  const forceSyncWithSheets = async () => {
    // Objetivo: o botão REFRESH deve ser determinante — sobrescrever o estado local com o Sheets.
    try {
      // 1) Carrega alterações locais atuais
      loadLocalChangesFromStorage();

      // 2) Limpa explicitamente as alterações locais (descarta pendentes),
      // para garantir que o fetch venha "puro" do Sheets e não seja mesclado.
      const hadLocalChanges = Object.keys(localChangesRef.current).length > 0;
      if (hadLocalChanges) {
        console.log('forceSyncWithSheets: limpando alterações locais pendentes para forçar estado do Sheets.');
      }
      localChangesRef.current = {};
      persistLocalChangesToStorage();

      // 3) Solicitar ao Apps Script uma sincronização global (ex.: consolidar dados, puxar de outras abas)
      try {
        await fetch(`${GOOGLE_APPS_SCRIPT_BASE_URL}?action=syncAll`, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ forceSync: true }),
        });
      } catch (syncErr) {
        // no-cors pode gerar erro ao ler a resposta — isso é esperado em muitos cenários com Apps Script.
        console.warn('Sync request (no-cors) enviada; a resposta pode não ser acessível no cliente.', syncErr);
      }

      // 4) Pequena espera para o Apps Script processar (ajuste o tempo se necessário)
      await new Promise((res) => setTimeout(res, 900));

      // 5) Buscar os dados atualizados diretamente do Sheets (sem aplicar alterações locais)
      //    Para garantir que não ocorra merge, garantimos que localChangesRef está vazio antes do fetch.
      await fetchLeadsFromSheet();
      await fetchLeadsFechadosFromSheet();

      console.log('forceSyncWithSheets: dados atualizados a partir do Sheets e alterações locais removidas.');
    } catch (error) {
      console.error('Erro ao forçar sincronização com Sheets:', error);
      alert('Erro ao sincronizar com o Sheets. Verifique a conexão e tente novamente.');
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
                    : leadsFechados.filter((lead) => lead.Responsavel === usuarioLogado.nome)
                }
                leads={
                  isAdmin
                    ? leads
                    : leads.filter((lead) => lead.responsavel === usuarioLogado.nome)
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
                leads={isAdmin ? leads : leads.filter((lead) => lead.responsavel === usuarioLogado.nome)}
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
                // NOVO: função que salva alterações localmente para sincronizar depois
                saveLocalChange={saveLocalChange}
                // NOVO: função para forçar sincronização imediata com o Sheets
                forceSyncWithSheets={forceSyncWithSheets}
              />
            }
          />
          <Route
            path="/leads-fechados"
            element={
              <LeadsFechados
                leads={isAdmin ? leadsFechados : leadsFechados.filter((lead) => lead.Responsavel === usuarioLogado.nome)}
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
                leads={isAdmin ? leads.filter((lead) => lead.status === 'Perdido') : leads.filter((lead) => lead.responsavel === usuarioLogado.nome && lead.status === 'Perdido')}
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
