import React, { useState, useEffect, useRef } from 'react';
import { RefreshCcw, Search, CheckCircle, DollarSign, Calendar } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from './firebase';

// ===============================================
// 1. COMPONENTE PRINCIPAL: LeadsFechados
// ===============================================

const LeadsFechados = ({ leads: _leads_unused, usuarios, onUpdateInsurer, onConfirmInsurer, onUpdateDetalhes, fetchLeadsFechadosFromSheet: _fetch_unused, isAdmin, scrollContainerRef }) => {
    // --- ESTADOS ---
    const [fechadosFiltradosInterno, setFechadosFiltradosInterno] = useState([]);
    const [paginaAtual, setPaginaAtual] = useState(1);
    const leadsPorPagina = 10;

    const [valores, setValores] = useState({});
    const [vigencia, setVigencia] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [nomeInput, setNomeInput] = useState('');

    // Novo estado: leads vindos do Firestore (normalizados)
    const [leadsFromFirebase, setLeadsFromFirebase] = useState([]);

    // >>> NOVO ESTADO: Controle de edição de nome <<<
    const [nomeTemporario, setNomeTemporario] = useState({}); // Mapeia ID para o texto temporário no input

    const getMesAnoAtual = () => {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        return `${ano}-${mes}`; // Formato: AAAA-MM
    };
    const [dataInput, setDataInput] = useState(getMesAnoAtual());
    const [filtroNome, setFiltroNome] = useState('');
    const [filtroData, setFiltroData] = useState(getMesAnoAtual());
    const [premioLiquidoInputDisplay, setPremioLiquidoInputDisplay] = useState({});

    // --- HELPERS / NORMALIZAÇÃO ---

    // Converte DD/MM/AAAA -> AAAA-MM-DD (string) e valida
    const getDataParaComparacao = (dataStr) => {
        if (!dataStr) return '';
        dataStr = String(dataStr).trim();

        const parts = dataStr.split('/');

        // Trata o formato DD/MM/AAAA
        if (parts.length === 3) {
            const [dia, mes, ano] = parts;
            if (!isNaN(parseInt(dia)) && !isNaN(parseInt(mes)) && !isNaN(parseInt(ano))) {
                return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
            }
        }

        // Se já estiver em AAAA-MM-DD, retorna como está
        if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
            return dataStr;
        }

        return ''; // Retorna vazio se não conseguir formatar
    };

    const getMonthYearFromDateInput = (dateLike) => {
        // Recebe Date, string ISO, string AAAA-MM-DD, Firestore Timestamp-like (com toDate)
        if (!dateLike) return '';
        try {
            // Firestore Timestamp-like
            if (typeof dateLike === 'object' && typeof dateLike.toDate === 'function') {
                const d = dateLike.toDate();
                const ano = d.getFullYear();
                const mes = String(d.getMonth() + 1).padStart(2, '0');
                return `${ano}-${mes}`;
            }
            // ISO string ou Date
            const d = new Date(dateLike);
            if (!isNaN(d.getTime())) {
                const ano = d.getFullYear();
                const mes = String(d.getMonth() + 1).padStart(2, '0');
                return `${ano}-${mes}`;
            }
            // AAAA-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateLike))) {
                return String(dateLike).substring(0, 7);
            }
            // DD/MM/YYYY fallback
            const iso = getDataParaComparacao(String(dateLike));
            if (iso) return iso.substring(0, 7);
        } catch (e) {
            // swallow
        }
        return '';
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

    const nomeContemFiltro = (leadNome, filtroNome) => {
        if (!filtroNome) return true;
        if (!leadNome) return false;

        const nomeNormalizado = normalizarTexto(leadNome);
        const filtroNormalizado = normalizarTexto(filtroNome);

        return nomeNormalizado.includes(filtroNormalizado);
    };

    // Util: converte vários formatos de moeda para float (ex.: "R$ 1.234,56" -> 1234.56)
    const parseCurrencyToFloat = (raw) => {
        if (raw === undefined || raw === null) return NaN;
        let s = String(raw).trim();
        if (s === '') return NaN;

        // Remove "R$", espaços e outros caracteres alfabéticos
        s = s.replace(/R\$\s*/i, '');
        // Remove any non-digit, non-dot, non-comma, non-minus
        s = s.replace(/[^\d\.,-]/g, '');

        // If contains both '.' and ',' assume '.' are thousands and ',' decimal (BRL)
        if (s.indexOf('.') !== -1 && s.indexOf(',') !== -1) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            // If only contains ',' treat as decimal separator
            if (s.indexOf(',') !== -1 && s.indexOf('.') === -1) {
                s = s.replace(',', '.');
            }
            // If only contains '.' could be decimal or already float; keep as is
        }

        const n = parseFloat(s);
        return isNaN(n) ? NaN : n;
    };

    // Util: converte várias representações de data para YYYY-MM-DD (input date value)
    const parseDateToInputValue = (raw) => {
        if (!raw && raw !== 0) return '';
        try {
            // Firestore Timestamp-like
            if (typeof raw === 'object' && typeof raw.toDate === 'function') {
                const d = raw.toDate();
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            }

            // If it's a Date object
            if (raw instanceof Date) {
                const y = raw.getFullYear();
                const m = String(raw.getMonth() + 1).padStart(2, '0');
                const day = String(raw.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            }

            // String cases:
            const s = String(raw).trim();

            // If ISO or includes 'T' (e.g., 2024-11-27T10:00:00Z)
            if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /^\d{4}-\d{2}-\d{2}$/.test(s)) {
                const d = new Date(s);
                if (!isNaN(d.getTime())) {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${day}`;
                }
            }

            // If DD/MM/YYYY
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
                const [dd, mm, yyyy] = s.split('/');
                return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
            }

            // If already in YYYY-MM-DD but maybe with time zone
            const mIso = s.match(/^(\d{4}-\d{2}-\d{2})/);
            if (mIso) return mIso[1];

            return '';
        } catch (e) {
            return '';
        }
    };

    // Normaliza um documento de leadsFechados similar ao Leads.jsx
    const normalizeClosedLead = (docId, data = {}) => {
        const safe = (v) => (v === undefined || v === null ? '' : v);

        // Nome
        const nomeVal =
            safe(data.Nome) ||
            safe(data.nome) ||
            safe(data.Name) ||
            safe(data.name) ||
            '';

        // Modelo do veículo - várias variações
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
            '';

        // closedAt -> assegura que carregamos objeto Timestamp ou Date / ISO
        let closedAtRaw = data.closedAt ?? data.ClosedAt ?? data.Closedate ?? null;
        // createdAt fallback
        let createdAtRaw = data.createdAt ?? data.created ?? data.Data ?? null;

        // Campos financeiros e vigências (preservamos nas raw e tentamos normalizar)
        const rawPremio = data.PremioLiquido ?? data.premioLiquido ?? data.Premio ?? '';
        const rawVigI = data.VigenciaInicial ?? data.vigenciaInicial ?? data.VigenciaInicio ?? '';
        const rawVigF = data.VigenciaFinal ?? data.vigenciaFinal ?? data.VigenciaFim ?? '';
        const rawComissao = data.Comissao ?? data.comissao ?? data.comission ?? '';
        const rawParcelamento = data.Parcelamento ?? data.parcelamento ?? data.Parcelas ?? '';
        const rawMeioPagamento = data.MeioPagamento ?? data.meioPagamento ?? data.Meiopagamento ?? '';
        const rawCartaoPortoNovo = data.CartaoPortoNovo ?? data.cartaoPortoNovo ?? data.Cartao ?? '';
        const rawSeguradora = data.Seguradora ?? data.insurer ?? data.seguradora ?? '';

        return {
            id: String(docId),
            ID: data.ID ?? data.id ?? docId,
            Nome: nomeVal,
            name: nomeVal,
            Name: nomeVal,
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
            Status: typeof data.Status === 'string' ? data.Status : (typeof data.status === 'string' ? data.status : ''),
            Observacao: data.Observacao ?? data.observacao ?? '',
            Responsavel: data.Responsavel ?? data.responsavel ?? '',
            usuarioId: data.usuarioId ?? data.userId ?? null,
            // Campos financeiros e vigência brutos
            raw: {
                ...data,
                PremioLiquido: rawPremio,
                VigenciaInicial: rawVigI,
                VigenciaFinal: rawVigF,
                Comissao: rawComissao,
                Parcelamento: rawParcelamento,
                MeioPagamento: rawMeioPagamento,
                CartaoPortoNovo: rawCartaoPortoNovo,
                Seguradora: rawSeguradora,
            },
            // preserve timestamps/raw
            closedAt: closedAtRaw,
            createdAt: createdAtRaw,
        };
    };

    // --- UTIL: SCROLL TO TOP ---
    const scrollToTop = () => {
        if (scrollContainerRef && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const aplicarFiltroNome = () => {
        const filtroLimpo = nomeInput.trim();
        setFiltroNome(filtroLimpo);
        setFiltroData('');
        setNomeInput('');
        setPaginaAtual(1);
        scrollToTop();
    };

    const aplicarFiltroData = () => {
        setFiltroData(dataInput); // dataInput está no formato AAAA-MM
        setFiltroNome('');
        setNomeInput('');
        setPaginaAtual(1);
        scrollToTop();
    };

    // --- Novo: Listener em tempo real para leadsFechados no Firestore ---
    useEffect(() => {
        setIsLoading(true);
        try {
            const q = query(collection(db, 'leadsFechados'), orderBy('closedAt', 'desc'));
            const unsub = onSnapshot(q, (snapshot) => {
                const lista = snapshot.docs.map(d => normalizeClosedLead(d.id, d.data()));
                setLeadsFromFirebase(lista);
                setIsLoading(false);
            }, (err) => {
                console.error('Erro no listener leadsFechados:', err);
                setIsLoading(false);
            });

            return () => unsub();
        } catch (err) {
            console.error('Erro ao iniciar listener leadsFechados:', err);
            setIsLoading(false);
        }
    }, []);

    // Handler de refresh manual (busca via getDocs)
    const handleRefresh = async () => {
        setIsLoading(true);
        try {
            const snapshot = await getDocs(query(collection(db, 'leadsFechados'), orderBy('closedAt', 'desc')));
            const lista = snapshot.docs.map(d => normalizeClosedLead(d.id, d.data()));
            setLeadsFromFirebase(lista);
        } catch (error) {
            console.error('Erro ao atualizar leads fechados:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // --- EFEITO DE FILTRAGEM E SINCRONIZAÇÃO DE ESTADOS ---
    useEffect(() => {
        // Uses leadsFromFirebase (normalized)
        const fechadosAtuais = (leadsFromFirebase || []).filter(lead => {
            // If Status is defined, require 'Fechado' (string match)
            if (lead.Status) return String(lead.Status).toLowerCase() === 'fechado';
            // If there's closedAt, assume closed
            if (lead.closedAt) return true;
            // fallback: include if Data or createdAt exists
            if (lead.raw?.Data || lead.createdAt) return true;
            return false;
        });

        // Sync valores (PremioLiquido in cents, Comissao string/number, Parcelamento, insurer, MeioPagamento, CartaoPortoNovo)
        setValores(prevValores => {
            const novosValores = { ...prevValores };

            fechadosAtuais.forEach(lead => {
                const raw = lead.raw || {};
                const leadKey = String(lead.ID ?? lead.id ?? '');

                // parse premio
                const rawPremio = raw.PremioLiquido ?? raw.premioLiquido ?? raw.Premio ?? '';
                const parsedPremioFloat = parseCurrencyToFloat(rawPremio); // e.g. 1234.56
                const premioInCents = isNaN(parsedPremioFloat) ? null : Math.round(parsedPremioFloat * 100);

                // parse comissao raw - aceita "10%", "10,5", "10"
                let apiComissao = raw.Comissao ?? raw.comissao ?? '';
                if (apiComissao !== '' && typeof apiComissao !== 'string') {
                    apiComissao = String(apiComissao);
                }

                // parse parcelamento
                const apiParcelamento = raw.Parcelamento ?? raw.parcelamento ?? raw.Parcelas ?? '';

                const apiInsurer = raw.Seguradora ?? raw.insurer ?? raw.seguradora ?? '';
                const apiMeioPagamento = raw.MeioPagamento ?? raw.meioPagamento ?? raw.Meiopagamento ?? '';
                const apiCartaoPortoNovo = raw.CartaoPortoNovo ?? raw.cartaoPortoNovo ?? raw.Cartao ?? '';

                // If there is no entry or fields are undefined, set them
                if (!novosValores[leadKey]) novosValores[leadKey] = {};

                // Only set if value is meaningful or not yet present (to avoid overwriting edited local values)
                if ((novosValores[leadKey].PremioLiquido === undefined || novosValores[leadKey].PremioLiquido === null) && premioInCents !== null) {
                    novosValores[leadKey].PremioLiquido = premioInCents;
                } else if (novosValores[leadKey].PremioLiquido === undefined) {
                    novosValores[leadKey].PremioLiquido = null;
                }

                if ((novosValores[leadKey].Comissao === undefined || novosValores[leadKey].Comissao === '') && apiComissao !== '') {
                    // normalize "10%" => "10%" or "10,5" => "10,5"
                    novosValores[leadKey].Comissao = typeof apiComissao === 'string' ? apiComissao : String(apiComissao);
                } else if (novosValores[leadKey].Comissao === undefined) {
                    novosValores[leadKey].Comissao = '';
                }

                if ((novosValores[leadKey].Parcelamento === undefined || novosValores[leadKey].Parcelamento === '') && apiParcelamento !== '') {
                    novosValores[leadKey].Parcelamento = String(apiParcelamento);
                } else if (novosValores[leadKey].Parcelamento === undefined) {
                    novosValores[leadKey].Parcelamento = '';
                }

                if ((novosValores[leadKey].insurer === undefined || novosValores[leadKey].insurer === '') && apiInsurer !== '') {
                    novosValores[leadKey].insurer = String(apiInsurer);
                } else if (novosValores[leadKey].insurer === undefined) {
                    novosValores[leadKey].insurer = '';
                }

                if ((novosValores[leadKey].MeioPagamento === undefined || novosValores[leadKey].MeioPagamento === '') && apiMeioPagamento !== '') {
                    novosValores[leadKey].MeioPagamento = String(apiMeioPagamento);
                } else if (novosValores[leadKey].MeioPagamento === undefined) {
                    novosValores[leadKey].MeioPagamento = '';
                }

                if ((novosValores[leadKey].CartaoPortoNovo === undefined || novosValores[leadKey].CartaoPortoNovo === '') && apiCartaoPortoNovo !== '') {
                    novosValores[leadKey].CartaoPortoNovo = String(apiCartaoPortoNovo);
                } else if (novosValores[leadKey].CartaoPortoNovo === undefined) {
                    novosValores[leadKey].CartaoPortoNovo = '';
                }
            });

            return novosValores;
        });

        // Sync Nome temporario
        setNomeTemporario(prevNomes => {
            const novosNomes = { ...prevNomes };
            fechadosAtuais.forEach(lead => {
                const leadKey = String(lead.ID ?? lead.id ?? '');
                if (novosNomes[leadKey] === undefined || novosNomes[leadKey] === '') {
                    novosNomes[leadKey] = lead.name || lead.Name || lead.Nome || '';
                }
            });
            return novosNomes;
        });

        // Sync display for premioLiquido
        setPremioLiquidoInputDisplay(prevDisplay => {
            const newDisplay = { ...prevDisplay };
            fechadosAtuais.forEach(lead => {
                const leadKey = String(lead.ID ?? lead.id ?? '');
                const rawPremio = lead.raw?.PremioLiquido ?? lead.raw?.premioLiquido ?? lead.raw?.Premio ?? '';
                const parsed = parseCurrencyToFloat(rawPremio);
                if (!isNaN(parsed)) {
                    // formatted like "1.234,56"
                    newDisplay[leadKey] = parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } else {
                    // If we already had a display value (local), keep it; otherwise empty
                    if (prevDisplay[leadKey] === undefined) newDisplay[leadKey] = '';
                }
            });
            return newDisplay;
        });

        // Sync vigencia (inicio/final) using parseDateToInputValue
        setVigencia(prevVigencia => {
            const novasVigencias = { ...prevVigencia };
            fechadosAtuais.forEach(lead => {
                const leadKey = String(lead.ID ?? lead.id ?? '');

                const vigenciaInicioRaw = lead.raw?.VigenciaInicial ?? lead.raw?.vigenciaInicial ?? lead.raw?.VigenciaInicio ?? '';
                const vigenciaFinalRaw = lead.raw?.VigenciaFinal ?? lead.raw?.vigenciaFinal ?? lead.raw?.VigenciaFim ?? '';

                const parsedInicio = parseDateToInputValue(vigenciaInicioRaw);
                const parsedFinal = parseDateToInputValue(vigenciaFinalRaw);

                if (!novasVigencias[leadKey]) novasVigencias[leadKey] = { inicio: '', final: '' };

                // If parsed value exists and not already set locally (or empty), set it
                if (parsedInicio && (!novasVigencias[leadKey].inicio || novasVigencias[leadKey].inicio === '')) {
                    novasVigencias[leadKey].inicio = parsedInicio;
                } else if (!novasVigencias[leadKey].inicio && parsedInicio === '') {
                    // fallback: try to infer from Data or closedAt
                    if (!novasVigencias[leadKey].inicio) {
                        // do nothing
                    }
                }

                if (parsedFinal && (!novasVigencias[leadKey].final || novasVigencias[leadKey].final === '')) {
                    novasVigencias[leadKey].final = parsedFinal;
                } else if (!novasVigencias[leadKey].final && parsedFinal === '') {
                    // if only inicio exists, compute final = +1 year
                    if (novasVigencias[leadKey].inicio && !novasVigencias[leadKey].final) {
                        try {
                            const d = new Date(novasVigencias[leadKey].inicio + 'T00:00:00');
                            d.setFullYear(d.getFullYear() + 1);
                            const y = d.getFullYear();
                            const m = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            novasVigencias[leadKey].final = `${y}-${m}-${day}`;
                        } catch (e) {
                            // ignore
                        }
                    }
                }
            });
            return novasVigencias;
        });

        // ORDENAÇÃO: usa closedAt quando disponível, senão Data/createdAt
        const fechadosOrdenados = [...fechadosAtuais].sort((a, b) => {
            // obter timestamp para comparação
            const toTime = (lead) => {
                // closedAt Firestore Timestamp-like
                if (lead.closedAt && typeof lead.closedAt.toDate === 'function') {
                    return lead.closedAt.toDate().getTime();
                }
                // closedAt como ISO / date string
                if (lead.closedAt) {
                    const d = new Date(lead.closedAt);
                    if (!isNaN(d.getTime())) return d.getTime();
                }
                // fallback Data (DD/MM/YYYY)
                if (lead.raw?.Data) {
                    const iso = getDataParaComparacao(lead.raw?.Data);
                    if (iso) {
                        const d = new Date(iso + 'T00:00:00');
                        if (!isNaN(d.getTime())) return d.getTime();
                    }
                }
                // fallback createdAt
                if (lead.createdAt && typeof lead.createdAt.toDate === 'function') {
                    return lead.createdAt.toDate().getTime();
                }
                if (lead.createdAt) {
                    const d = new Date(lead.createdAt);
                    if (!isNaN(d.getTime())) return d.getTime();
                }
                return 0;
            };

            return toTime(b) - toTime(a);
        });

        // Aplicação da lógica de filtragem
        let leadsFiltrados;
        if (filtroNome) {
            leadsFiltrados = fechadosOrdenados.filter(lead =>
                nomeContemFiltro(lead.name || lead.Name || lead.Nome, filtroNome)
            );
        } else if (filtroData) {
            // filtroData no formato AAAA-MM
            leadsFiltrados = fechadosOrdenados.filter(lead => {
                // Prioriza closedAt
                const monthYearFromClosedAt = getMonthYearFromDateInput(lead.closedAt);
                if (monthYearFromClosedAt) {
                    return monthYearFromClosedAt === filtroData;
                }
                // fallback para Data (DD/MM/YYYY ou AAAA-MM-DD)
                const dataLeadRaw = lead.raw?.Data ?? lead.raw?.data ?? lead.createdAt ?? '';
                const dataLeadFormatada = dataLeadRaw ? (getMonthYearFromDateInput(dataLeadRaw) || (getDataParaComparacao(String(dataLeadRaw)) || '').substring(0, 7)) : '';
                if (dataLeadFormatada) return dataLeadFormatada === filtroData;

                // fallback try vigencia final/inicio
                const vigIni = vigencia[lead.ID]?.inicio || '';
                if (vigIni && vigIni.substring(0, 7) === filtroData) return true;
                const vigFim = vigencia[lead.ID]?.final || '';
                if (vigFim && vigFim.substring(0, 7) === filtroData) return true;

                return false;
            });
        } else {
            leadsFiltrados = fechadosOrdenados;
        }

        setFechadosFiltradosInterno(leadsFiltrados);
    }, [leadsFromFirebase, filtroNome, filtroData]);

    // --- FUNÇÕES DE HANDLER (NOVAS E EXISTENTES) ---

    const formatarMoeda = (valorCentavos) => {
        if (valorCentavos === null || isNaN(valorCentavos)) return '';
        return (valorCentavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // >>> NOVO HANDLER: Lógica para editar o nome do lead <<<
    const handleNomeBlur = (id, novoNome) => {
        const nomeAtualizado = novoNome.trim();
        const lead = (leadsFromFirebase || []).find(l => String(l.ID) === String(id) || String(l.id) === String(id));
        if (lead && (lead.name || lead.Name || lead.Nome) !== nomeAtualizado) {
            if (nomeAtualizado) {
                setNomeTemporario(prev => ({
                    ...prev,
                    [`${id}`]: nomeAtualizado,
                }));
                onUpdateDetalhes(id, 'name', nomeAtualizado);
            } else {
                setNomeTemporario(prev => ({
                    ...prev,
                    [`${id}`]: lead.name || '',
                }));
            }
        }
    };
    // <<< FIM NOVO HANDLER >>>

    const handlePremioLiquidoChange = (id, valor) => {
        let cleanedValue = valor.replace(/[^\d,\.]/g, '');
        const commaParts = cleanedValue.split(',');

        if (commaParts.length > 2) {
            cleanedValue = commaParts[0] + ',' + commaParts.slice(1).join('');
        }
        if (commaParts.length > 1 && commaParts[1].length > 2) {
            cleanedValue = commaParts[0] + ',' + commaParts[1].slice(0, 2);
        }

        setPremioLiquidoInputDisplay(prev => ({
            ...prev,
            [`${id}`]: cleanedValue,
        }));

        // Parsing to cents: remove dots, replace comma with dot, parse float
        const valorParaParse = cleanedValue.replace(/\./g, '').replace(',', '.');
        const valorEmReais = parseFloat(valorParaParse);
        const valorParaEstado = isNaN(valorEmReais) || cleanedValue === '' ? null : Math.round(valorEmReais * 100);

        setValores(prev => ({
            ...prev,
            [`${id}`]: {
                ...prev[`${id}`],
                PremioLiquido: valorParaEstado,
            },
        }));
    };

    const handlePremioLiquidoBlur = (id) => {
        const valorCentavos = valores[`${id}`]?.PremioLiquido;
        let valorReais = null;

        if (valorCentavos !== null && !isNaN(valorCentavos)) {
            valorReais = valorCentavos / 100;
        }

        setPremioLiquidoInputDisplay(prev => ({
            ...prev,
            [`${id}`]: valorCentavos !== null && !isNaN(valorCentavos) ? formatarMoeda(valorCentavos) : '',
        }));

        onUpdateDetalhes(id, 'PremioLiquido', valorReais);
    };

    const handleComissaoChange = (id, valor) => {
        let cleanedValue = valor.replace(/[^\d,]/g, '');
        const parts = cleanedValue.split(',');
        if (parts.length > 2) {
            cleanedValue = parts[0] + ',' + parts.slice(1).join('');
        }
        if (parts.length > 1 && parts[1].length > 2) {
            cleanedValue = parts[0] + ',' + parts[1].slice(0, 2);
        }

        setValores(prev => ({
            ...prev,
            [`${id}`]: {
                ...prev[`${id}`],
                Comissao: cleanedValue,
            },
        }));
    };

    const handleComissaoBlur = (id) => {
        const comissaoInput = valores[`${id}`]?.Comissao || '';
        const comissaoFloat = parseFloat(comissaoInput.replace(',', '.'));
        onUpdateDetalhes(id, 'Comissao', isNaN(comissaoFloat) ? '' : comissaoFloat);
    };


    const handleParcelamentoChange = (id, valor) => {
        setValores(prev => ({
            ...prev,
            [`${id}`]: {
                ...prev[`${id}`],
                Parcelamento: valor,
            },
        }));
        onUpdateDetalhes(id, 'Parcelamento', valor);
    };
    
    // ************************************************************
    // NOVO HANDLER: Meio de Pagamento
    // ************************************************************
    const handleMeioPagamentoChange = (id, valor) => {
        setValores(prev => {
            const newState = {
                ...prev,
                [`${id}`]: {
                    ...prev[`${id}`],
                    MeioPagamento: valor,
                },
            };
            
            if (valor !== 'CP' && newState[`${id}`]?.CartaoPortoNovo) {
                newState[`${id}`].CartaoPortoNovo = '';
                onUpdateDetalhes(id, 'CartaoPortoNovo', '');
            }
            
            return newState;
        });

        onUpdateDetalhes(id, 'MeioPagamento', valor);
    };

    const handleCartaoPortoChange = (id, valor) => {
        setValores(prev => ({
            ...prev,
            [`${id}`]: {
                ...prev[`${id}`],
                CartaoPortoNovo: valor,
            },
        }));
        onUpdateDetalhes(id, 'CartaoPortoNovo', valor);
    };

    const handleInsurerChange = (id, valor) => {
        const portoSeguradoras = ['Porto Seguro', 'Azul Seguros', 'Itau Seguros'];
        
        setValores(prev => {
            const newState = {
                ...prev,
                [`${id}`]: {
                    ...prev[`${id}`],
                    insurer: valor,
                },
            };
            
            if (!portoSeguradoras.includes(valor) && newState[`${id}`]?.CartaoPortoNovo) {
                newState[`${id}`].CartaoPortoNovo = '';
                onUpdateDetalhes(id, 'CartaoPortoNovo', ''); // Limpa na API também
            }

            return newState;
        });
    };

    const handleVigenciaInicioChange = (id, dataString) => {
        let dataFinal = '';
        if (dataString) {
            const dataInicioObj = new Date(dataString + 'T00:00:00');
            if (!isNaN(dataInicioObj.getTime())) {
                const anoInicio = dataInicioObj.getFullYear();
                const mesInicio = String(dataInicioObj.getMonth() + 1).padStart(2, '0');
                const diaInicio = String(dataInicioObj.getDate()).padStart(2, '0');

                const anoFinal = anoInicio + 1;
                dataFinal = `${anoFinal}-${mesInicio}-${diaInicio}`; // AAAA-MM-DD
            }
        }

        setVigencia(prev => ({
            ...prev,
            [`${id}`]: {
                ...prev[`${id}`],
                inicio: dataString,
                final: dataFinal,
            },
        }));

        onUpdateDetalhes(id, 'VigenciaInicial', dataString);
        onUpdateDetalhes(id, 'VigenciaFinal', dataFinal);
    };


    // --- LÓGICA DE PAGINAÇÃO ---
    const totalPaginas = Math.max(1, Math.ceil(fechadosFiltradosInterno.length / leadsPorPagina));
    const paginaCorrigida = Math.min(paginaAtual, totalPaginas);
    const inicio = (paginaCorrigida - 1) * leadsPorPagina;
    const fim = inicio + leadsPorPagina;
    const leadsPagina = fechadosFiltradosInterno.slice(inicio, fim);

    const handlePaginaAnterior = () => {
        setPaginaAtual(prev => Math.max(prev - 1, 1));
        scrollToTop();
    };

    const handlePaginaProxima = () => {
        setPaginaAtual(prev => Math.min(prev + 1, totalPaginas));
        scrollToTop();
    };

    // --- RENDERIZAÇÃO ---
    return (
        <div className="p-4 md:p-6 lg:p-8 relative min-h-screen bg-gray-100 font-sans">

            {/* Overlay de Loading */}
            {isLoading && (
                <div className="absolute inset-0 bg-white bg-opacity-80 flex justify-center items-center z-50">
                    <div className="flex flex-col items-center">
                        <svg className="animate-spin h-10 w-10 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="ml-4 text-xl font-semibold text-gray-700 mt-3">Carregando Leads Concluídos...</p>
                    </div>
                </div>
            )}

            {/* Cabeçalho Principal (Moderno) */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 mb-4">
                    <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
                        <CheckCircle size={32} className="text-green-500 mr-3" />
                        Leads Fechados
                    </h1>

                    <button
                        title="Atualizar dados"
                        onClick={handleRefresh}
                        disabled={isLoading}
                        className={`p-3 rounded-full transition duration-300 ${isLoading ? 'text-gray-400 cursor-not-allowed' : 'text-green-600 hover:bg-green-100 shadow-sm'}`}
                    >
                        <RefreshCcw size={24} className={isLoading ? '' : 'hover:rotate-180'} />
                    </button>
                </div>

                {/* Controles de Filtro (Inline) */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch">
                    {/* Filtro de Nome */}
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <input
                            type="text"
                            placeholder="Buscar por nome..."
                            value={nomeInput}
                            onChange={(e) => setNomeInput(e.target.value)}
                            className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 text-sm"
                        />
                        <button
                            onClick={aplicarFiltroNome}
                            className="p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition duration-200 shadow-md"
                        >
                            <Search size={20} />
                        </button>
                    </div>

                    {/* Filtro de Data */}
                    <div className="flex items-center gap-2 flex-1 min-w-[200px] justify-end">
                        <input
                            type="month"
                            value={dataInput}
                            onChange={(e) => setDataInput(e.target.value)}
                            className="p-3 border border-gray-300 rounded-lg cursor-pointer text-sm"
                            title="Filtrar por Mês/Ano de Criação"
                        />
                        <button
                            onClick={aplicarFiltroData}
                            className="p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition duration-200 shadow-md whitespace-nowrap"
                        >
                            Filtrar Data
                        </button>
                    </div>
                </div>
            </div>

            {/* Lista de Cards de Leads */}
            <div className="space-y-5">
                {fechadosFiltradosInterno.length === 0 && !isLoading ? (
                    <div className="text-center p-12 bg-white rounded-xl shadow-md text-gray-600 text-lg">
                        <p> Você ainda não tem nenhum fechamento, mas logo terá! 😉  </p>
                    </div>
                ) : (
                    leadsPagina.map((lead) => {
                        // leadKey: identificador para usar nos estados locais (valores/vigencia/nomeTemporario)
                        const leadKey = String(lead.ID ?? lead.id ?? '');
                        // docId: id do documento Firestore (usado para chamadas ao backend/parent)
                        const docId = lead.id ?? (lead.ID ? String(lead.ID) : '');

                        const responsavel = usuarios.find((u) => u.nome === lead.Responsavel || u.nome === lead.Responsavel);
                        const isSeguradoraPreenchida = !!(lead.raw?.Seguradora || lead.raw?.insurer || lead.raw?.Seguradora);

                        // Variáveis de estado para a lógica condicional
                        const currentInsurer = valores[`${leadKey}`]?.insurer || (lead.raw?.Seguradora ?? lead.raw?.insurer ?? '');
                        const currentMeioPagamento = valores[`${leadKey}`]?.MeioPagamento || (lead.raw?.MeioPagamento ?? lead.raw?.meioPagamento ?? '');
                        const isPortoInsurer = ['Porto Seguro', 'Azul Seguros', 'Itau Seguros'].includes(currentInsurer);
                        const isCPPayment = currentMeioPagamento === 'CP';

                        const showCartaoPortoNovo = isPortoInsurer && isCPPayment;

                        const isButtonDisabled =
                            (
                                !(valores[`${leadKey}`]?.insurer || (lead.raw?.Seguradora ?? lead.raw?.insurer)) ||
                                (valores[`${leadKey}`]?.PremioLiquido === null || valores[`${leadKey}`]?.PremioLiquido === undefined) ||
                                !valores[`${leadKey}`]?.Comissao ||
                                parseFloat(String(valores[`${leadKey}`]?.Comissao || '0').replace(',', '.')) === 0 ||
                                !valores[`${leadKey}`]?.Parcelamento ||
                                valores[`${leadKey}`]?.Parcelamento === '' ||
                                !vigencia[`${leadKey}`]?.inicio ||
                                !vigencia[`${leadKey}`]?.final
                            );

                        // Show formatted values (fall back to local state or raw)
                        const displayPremio = premioLiquidoInputDisplay[`${leadKey}`] ?? (
                            (valores[`${leadKey}`]?.PremioLiquido !== undefined && valores[`${leadKey}`]?.PremioLiquido !== null)
                                ? formatarMoeda(valores[`${leadKey}`].PremioLiquido)
                                : (parseCurrencyToFloat(lead.raw?.PremioLiquido ?? lead.raw?.premioLiquido ?? '') ? (parseCurrencyToFloat(lead.raw?.PremioLiquido ?? lead.raw?.premioLiquido ?? '')).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')
                        );

                        return (
                            <div
                                key={leadKey || docId}
                                className={`bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative border-t-4 ${isSeguradoraPreenchida ? 'border-green-600' : 'border-amber-500'}`}
                            >
                                {/* COLUNA 1: Informações do Lead */}
                                <div className="col-span-1 border-b pb-4 lg:border-r lg:pb-0 lg:pr-6">
                                    
                                    <div className="flex items-center gap-2 mb-2">
                                        {isSeguradoraPreenchida ? (
                                            <h3 className="text-xl font-bold text-gray-900">{nomeTemporario[leadKey] || lead.name || lead.Name || lead.Nome}</h3>
                                        ) : (
                                            <div className="flex flex-col w-full">
                                                <input
                                                    type="text"
                                                    value={nomeTemporario[leadKey] || lead.name || lead.Name || lead.Nome || ''}
                                                    onChange={(e) => setNomeTemporario(prev => ({ ...prev, [leadKey]: e.target.value }))}
                                                    onBlur={(e) => handleNomeBlur(leadKey, e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.currentTarget.blur();
                                                        }
                                                    }}
                                                    className="text-xl font-bold text-gray-900 border border-indigo-300 rounded-lg p-1 focus:ring-indigo-500 focus:border-indigo-500"
                                                />
                                                <span className='text-xs text-gray-500 mt-1'>Atualize o nome com o mesmo da proposta.</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-1 text-sm text-gray-700">
                                        <p><strong>Modelo:</strong> {lead.vehicleModel || lead.Modelo || ''}</p>
                                        <p><strong>Ano/Modelo:</strong> {lead.vehicleYearModel || lead.AnoModelo || lead.anoModelo || ''}</p>
                                        <p><strong>Cidade:</strong> {lead.city || lead.Cidade || ''}</p>
                                        <p><strong>Telefone:</strong> {lead.phone || lead.Telefone || ''}</p>
                                        <p><strong>Tipo de Seguro:</strong> {lead.insuranceType || lead.TipoSeguro || ''}</p>
                                    </div>

                                    {responsavel && isAdmin && (
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

                                    {/* 1. Seguradora (Select) */}
                                    <div className="mb-4">
                                        <label className="text-xs font-semibold text-gray-600 block mb-1">Seguradora</label>
                                        <select
                                            value={valores[`${leadKey}`]?.insurer || lead.raw?.Seguradora || lead.raw?.insurer || ''}
                                            onChange={(e) => handleInsurerChange(leadKey, e.target.value)}
                                            disabled={!!(lead.raw?.Seguradora || lead.raw?.insurer)}
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500"
                                        >
                                            <option value="">Selecione a seguradora</option>
                                            <option value="Porto Seguro">Porto Seguro</option>
                                            <option value="Azul Seguros">Azul Seguros</option>
                                            <option value="Itau Seguros">Itau Seguros</option>
                                            <option value="Tokio">Tokio</option>
                                            <option value="Yelum">Yelum</option>
                                            <option value="Bradesco">Bradesco</option>
                                            <option value="Allianz">Allianz</option>
                                            <option value="Suhai">Suhai</option>
                                            <option value="Hdi">Hdi</option>
                                            <option value="Zurich">Zurich</option>
                                            <option value="Mitsui">Mitsui</option>
                                            <option value="Mapfre">Mapfre</option>
                                            <option value="Alfa">Alfa</option>
                                            <option value="Demais Seguradoras">Demais Seguradoras</option>
                                        </select>
                                    </div>

                                    {/* 2. Meio de Pagamento (Select) - RELOCADO */}
                                    <div className="mb-4">
                                        <label className="text-xs font-semibold text-gray-600 block mb-1">Meio de Pagamento</label>
                                        <select
                                            value={valores[`${leadKey}`]?.MeioPagamento || lead.raw?.MeioPagamento || ''}
                                            onChange={(e) => handleMeioPagamentoChange(leadKey, e.target.value)}
                                            disabled={!!(lead.raw?.Seguradora || lead.raw?.insurer)}
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500"
                                        >
                                            <option value=""> </option>
                                            <option value="CP">CP</option>
                                            <option value="CC">CC</option>
                                            <option value="Debito">Debito</option>
                                            <option value="Boleto">Boleto</option>
                                        </select>
                                    </div>
                                    
                                    {/* 3. Cartão Porto Seguro Novo? (Select) - CONDICIONAL E RELOCADO */}
                                    {showCartaoPortoNovo && (
                                        <div className="mb-4">
                                            <label className="text-xs font-semibold text-gray-600 block mb-1">Cartão Porto Seguro Novo?</label>
                                            <select
                                                value={valores[`${leadKey}`]?.CartaoPortoNovo || lead.raw?.CartaoPortoNovo || ''}
                                                onChange={(e) => handleCartaoPortoChange(leadKey, e.target.value)}
                                                disabled={!!(lead.raw?.Seguradora || lead.raw?.insurer)}
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500"
                                            >
                                                <option value=""> </option>
                                                <option value="Sim">Sim</option>
                                                <option value="Não">Não</option>
                                            </select>
                                        </div>
                                    )}
                                    
                                    {/* 4., 5., 6. Demais campos (Prêmio, Comissão, Parcelamento) */}
                                    <div className="grid grid-cols-2 gap-3 mt-4">
                                        <div>
                                            <label className="text-xs font-semibold text-gray-600 block mb-1">Prêmio Líquido</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold text-sm">R$</span>
                                                <input
                                                    type="text"
                                                    placeholder="0,00"
                                                    value={displayPremio || ''}
                                                    onChange={(e) => handlePremioLiquidoChange(leadKey, e.target.value)}
                                                    onBlur={() => handlePremioLiquidoBlur(leadKey)}
                                                    disabled={!!(lead.raw?.Seguradora || lead.raw?.insurer)}
                                                    className="w-full p-2 pl-8 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500 text-right"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs font-semibold text-gray-600 block mb-1">Comissão (%)</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold text-sm">%</span>
                                                <input
                                                    type="text"
                                                    placeholder="0,00"
                                                    value={valores[`${leadKey}`]?.Comissao || (lead.raw?.Comissao ?? '')}
                                                    onChange={(e) => handleComissaoChange(leadKey, e.target.value)}
                                                    onBlur={() => handleComissaoBlur(leadKey)}
                                                    disabled={!!(lead.raw?.Seguradora || lead.raw?.insurer)}
                                                    className="w-full p-2 pl-8 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500 text-right"
                                                />
                                            </div>
                                        </div>

                                        <div className="col-span-2">
                                            <label className="text-xs font-semibold text-gray-600 block mb-1">Parcelamento</label>
                                            <select
                                                value={valores[`${leadKey}`]?.Parcelamento || (lead.raw?.Parcelamento ?? '')}
                                                onChange={(e) => handleParcelamentoChange(leadKey, e.target.value)}
                                                disabled={!!(lead.raw?.Seguradora || lead.raw?.insurer)}
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500"
                                            >
                                                <option value="">Selecione o Parcelamento</option>
                                                {[...Array(12)].map((_, i) => (
                                                    <option key={i + 1} value={`${i + 1}`}>{i + 1}</option>
                                                ))}
                                            </select>
                                        </div>
                                        
                                    </div>
                                </div>

                                {/* COLUNA 3: Vigência e Ação de Confirmação */}
                                <div className="col-span-1 lg:pl-6">
                                    <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                                        <Calendar size={18} className="mr-2 text-green-500" />
                                        Vigência
                                    </h3>

                                    {/* Vigência Início */}
                                    <div className="mb-4">
                                        <label htmlFor={`vigencia-inicio-${leadKey}`} className="text-xs font-semibold text-gray-600 block mb-1">Início</label>
                                        <input
                                            id={`vigencia-inicio-${leadKey}`}
                                            type="date"
                                            value={vigencia[`${leadKey}`]?.inicio || parseDateToInputValue(lead.raw?.VigenciaInicial ?? lead.raw?.vigenciaInicial ?? '') || ''}
                                            onChange={(e) => handleVigenciaInicioChange(leadKey, e.target.value)}
                                            disabled={!!(lead.raw?.Seguradora || lead.raw?.insurer)}
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500"
                                        />
                                    </div>

                                    {/* Vigência Final (Readonly) */}
                                    <div className="mb-6">
                                        <label htmlFor={`vigencia-final-${leadKey}`} className="text-xs font-semibold text-gray-600 block mb-1">Término (Automático)</label>
                                        <input
                                            id={`vigencia-final-${leadKey}`}
                                            type="date"
                                            value={vigencia[`${leadKey}`]?.final || parseDateToInputValue(lead.raw?.VigenciaFinal ?? lead.raw?.vigenciaFinal ?? '') || ''}
                                            readOnly
                                            disabled={true}
                                            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-100 cursor-not-allowed"
                                        />
                                    </div>

                                    {/* Botão de Ação */}
                                    {!isSeguradoraPreenchida ? (
                                        <button
                                            onClick={async () => {
                                                // Use docId for parent handlers
                                                await onConfirmInsurer(
                                                    docId ?? leadKey,
                                                    valores[`${leadKey}`]?.PremioLiquido === null ? null : valores[`${leadKey}`]?.PremioLiquido / 100,
                                                    valores[`${leadKey}`]?.insurer || lead.raw?.Seguradora || lead.raw?.insurer || '',
                                                    parseFloat(String(valores[`${leadKey}`]?.Comissao || (lead.raw?.Comissao ?? '0')).replace(',', '.')),
                                                    valores[`${leadKey}`]?.Parcelamento || lead.raw?.Parcelamento || lead.raw?.parcelamento || '',
                                                    vigencia[`${leadKey}`]?.inicio || parseDateToInputValue(lead.raw?.VigenciaInicial ?? lead.raw?.vigenciaInicial ?? ''),
                                                    vigencia[`${leadKey}`]?.final || parseDateToInputValue(lead.raw?.VigenciaFinal ?? lead.raw?.vigenciaFinal ?? ''),
                                                    valores[`${leadKey}`]?.MeioPagamento || lead.raw?.MeioPagamento || '',
                                                    valores[`${leadKey}`]?.CartaoPortoNovo || lead.raw?.CartaoPortoNovo || ''
                                                );
                                            }}
                                            disabled={isButtonDisabled}
                                            title={isButtonDisabled ? 'Preencha todos os campos para confirmar.' : 'Confirmar e finalizar renovação.'}
                                            className={`w-full py-3 rounded-xl font-bold transition duration-300 shadow-lg flex items-center justify-center ${
                                                isButtonDisabled
                                                    ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                                    : 'bg-green-600 text-white hover:bg-green-700'
                                            }`}
                                        >
                                            <CheckCircle size={20} className="mr-2" />
                                            Concluir Venda!
                                        </button>
                                    ) : (
                                        <div className="w-full py-3 px-4 rounded-xl font-bold bg-green-100 text-green-700 flex items-center justify-center border border-green-300">
                                            <CheckCircle size={20} className="mr-2" />
                                            Fechado!
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Rodapé e Paginação */}
            {fechadosFiltradosInterno.length > 0 && (
                <div className="mt-8 flex justify-center bg-white p-4 rounded-xl shadow-lg">
                    <div className="flex justify-center items-center gap-4 mt-8 pb-8">
                        <button
                            onClick={handlePaginaAnterior}
                            disabled={paginaCorrigida <= 1 || isLoading}
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition duration-150 shadow-md ${
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
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition duration-150 shadow-md ${
                                (paginaCorrigida >= totalPaginas || isLoading)
                                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                    : 'bg-white border-indigo-500 text-indigo-600 hover:bg-indigo-50'
                            }`}
                        >
                            Próxima
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeadsFechados;
