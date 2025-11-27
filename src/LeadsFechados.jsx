import React, { useState, useEffect, useRef } from 'react';
import { RefreshCcw, Search, CheckCircle, DollarSign, Calendar } from 'lucide-react';
import { collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from './firebase';

const LeadsFechados = ({ leads, usuarios, onUpdateInsurer, onConfirmInsurer, onUpdateDetalhes, fetchLeadsFechadosFromSheet, isAdmin, scrollContainerRef }) => {
    const [fechadosFiltradosInterno, setFechadosFiltradosInterno] = useState([]);
    const [paginaAtual, setPaginaAtual] = useState(1);
    const leadsPorPagina = 10;

    const [valores, setValores] = useState({});
    const [vigencia, setVigencia] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [nomeInput, setNomeInput] = useState('');
    const [nomeTemporario, setNomeTemporario] = useState({});
    const [leadsFromFirebase, setLeadsFromFirebase] = useState([]);

    const getMesAnoAtual = () => {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        return `${ano}-${mes}`;
    };
    const [dataInput, setDataInput] = useState(getMesAnoAtual());
    const [filtroNome, setFiltroNome] = useState('');
    const [filtroData, setFiltroData] = useState(getMesAnoAtual());
    const [premioLiquidoInputDisplay, setPremioLiquidoInputDisplay] = useState({});

    const getDataParaComparacao = (dataStr) => {
        if (!dataStr && dataStr !== 0) return '';
        if (typeof dataStr === 'object' && dataStr !== null && typeof dataStr.toDate === 'function') {
            const d = dataStr.toDate();
            if (!isNaN(d.getTime())) {
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
        }
        dataStr = String(dataStr).trim();
        const parts = dataStr.split('/');
        if (parts.length === 3) {
            const [dia, mes, ano] = parts;
            if (!isNaN(parseInt(dia)) && !isNaN(parseInt(mes)) && !isNaN(parseInt(ano))) {
                return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
            }
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) return dataStr;
        const maybeDate = new Date(dataStr);
        if (!isNaN(maybeDate.getTime())) {
            return `${maybeDate.getFullYear()}-${String(maybeDate.getMonth() + 1).padStart(2, '0')}-${String(maybeDate.getDate()).padStart(2, '0')}`;
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

    const scrollToTop = () => {
        if (scrollContainerRef && scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const aplicarFiltroNome = () => {
        const filtroLimpo = nomeInput.trim();
        setFiltroNome(filtroLimpo);
        setFiltroData('');
        setDataInput('');
        setPaginaAtual(1);
        scrollToTop();
    };

    const aplicarFiltroData = () => {
        setFiltroData(dataInput);
        setFiltroNome('');
        setNomeInput('');
        setPaginaAtual(1);
        scrollToTop();
    };

    const mesesPt = {
        janeiro: '01', fevereiro: '02', marco: '03', março: '03', abril: '04', maio: '05',
        junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10',
        novembro: '11', dezembro: '12'
    };

    const filtroDataToYYYYMM = (filtro) => {
        if (!filtro) return '';
        const s = String(filtro).trim();
        if (/^\d{4}-\d{2}$/.test(s)) return s;
        const m = s.match(/(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(de)?\s*(\d{4})/i);
        if (m) {
            const mesNome = m[1].toLowerCase();
            const ano = m[3];
            const mesNum = mesesPt[mesNome] || mesesPt[mesNome.replace('ç','c')] || '';
            if (mesNum) return `${ano}-${mesNum}`;
        }
        const m2 = s.match(/(\d{1,2})[\/\-](\d{4})/);
        if (m2) {
            const mes = String(m2[1]).padStart(2, '0');
            const ano = m2[2];
            if (parseInt(mes, 10) >= 1 && parseInt(mes, 10) <= 12) return `${ano}-${mes}`;
        }
        return '';
    };

    const getCurrentUserInfo = () => {
        try {
            const auth = getAuth();
            const user = auth && auth.currentUser;
            if (user) {
                return {
                    name: user.displayName ? String(user.displayName).trim() : '',
                    email: user.email ? String(user.email).trim() : '',
                    uid: user.uid ? String(user.uid) : ''
                };
            }
        } catch (e) {}
        if (Array.isArray(usuarios)) {
            const foundCurrent = usuarios.find(u => u.isCurrent || u.current || u.isMe || u.me || u.isLogged);
            if (foundCurrent) {
                return {
                    name: foundCurrent.nome || foundCurrent.name || '',
                    email: foundCurrent.email || foundCurrent.mail || '',
                    uid: foundCurrent.uid || foundCurrent.id || ''
                };
            }
        }
        return { name: '', email: '', uid: '' };
    };

    useEffect(() => {
        setIsLoading(true);
        try {
            const q = query(collection(db, 'leadsFechados'), orderBy('closedAt', 'desc'));
            const unsub = onSnapshot(q, (snapshot) => {
                const list = snapshot.docs.map(d => {
                    const data = d.data() || {};
                    return {
                        ID: d.id,
                        Responsavel: data.Responsavel ?? data.responsavel ?? data.ResponsavelName ?? '',
                        PremioLiquido: data.PremioLiquido ?? data.premioLiquido ?? data.Premio ?? '',
                        VigenciaInicial: data.VigenciaInicial ?? data.vigenciaInicial ?? data.VigenciaInicio ?? '',
                        VigenciaFinal: data.VigenciaFinal ?? data.vigenciaFinal ?? data.VigenciaFim ?? '',
                        ...data
                    };
                });
                setLeadsFromFirebase(list);
                setIsLoading(false);
            }, (err) => {
                console.error('Erro no listener leadsFechados:', err);
                setIsLoading(false);
            });

            return () => {
                try { unsub(); } catch (e) {}
            };
        } catch (err) {
            console.error('Erro iniciando listener leadsFechados:', err);
            setIsLoading(false);
        }
    }, []);

    const handleRefresh = async () => {
        setIsLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'leadsFechados'), orderBy('closedAt', 'desc')));
            const lista = snap.docs.map(d => {
                const data = d.data() || {};
                return {
                    ID: d.id,
                    Responsavel: data.Responsavel ?? data.responsavel ?? data.ResponsavelName ?? '',
                    PremioLiquido: data.PremioLiquido ?? data.premioLiquido ?? data.Premio ?? '',
                    VigenciaInicial: data.VigenciaInicial ?? data.vigenciaInicial ?? data.VigenciaInicio ?? '',
                    VigenciaFinal: data.VigenciaFinal ?? data.vigenciaFinal ?? data.VigenciaFim ?? '',
                    ...data
                };
            });
            setLeadsFromFirebase(lista);
        } catch (error) {
            console.error('Erro ao atualizar leads fechados (fetch):', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        handleRefresh();
    }, []);

    useEffect(() => {
        const sourceLeads = (Array.isArray(leadsFromFirebase) && leadsFromFirebase.length > 0) ? leadsFromFirebase : (Array.isArray(leads) ? leads : []);
        let fechadosAtuais = sourceLeads.filter(lead => {
            const status = String(lead.Status ?? lead.status ?? '').toLowerCase();
            if (status === 'fechado') return true;
            if (lead.closedAt) return true;
            if (lead.VigenciaInicial || lead.VigenciaFinal) return true;
            return false;
        });

        // -------------------------
        // VISIBILITY: apenas admin vê todos; usuário vê apenas os leads atribuídos a ele
        // -------------------------
        const canViewLead = (lead) => {
            if (isAdmin) return true;

            const user = getCurrentUserInfo();
            if (!user) return false;

            const userId = String(user.uid ?? user.id ?? user.ID ?? '').trim();
            const userNome = String(user.name ?? '').trim().toLowerCase();
            const userEmail = String(user.email ?? '').trim().toLowerCase();

            // lead.usuarioId can be number or string
            const leadUsuarioId = lead.usuarioId !== undefined && lead.usuarioId !== null ? String(lead.usuarioId).trim() : '';
            if (leadUsuarioId && userId && leadUsuarioId === userId) return true;

            // Compare responsavel / Responsavel names
            const leadResponsavel = String(lead.Responsavel ?? lead.responsavel ?? lead.ResponsavelName ?? lead.Responsible ?? lead.transferidoPara ?? lead.assignedTo ?? '').trim().toLowerCase();
            if (leadResponsavel && userNome && leadResponsavel === userNome) return true;

            // Compare responsavel UIDs (se existir)
            const leadResponsavelUid = String(lead.ResponsavelUid ?? lead.responsavelUid ?? lead.responsavelId ?? lead.ResponsavelId ?? lead.assignedUid ?? '').trim();
            if (leadResponsavelUid && userId && leadResponsavelUid === userId) return true;

            // Compare responsavel email (se existir)
            const leadResponsavelEmail = String(lead.ResponsavelEmail ?? lead.responsavelEmail ?? lead.emailResponsavel ?? lead.assignedEmail ?? lead.email ?? '').trim().toLowerCase();
            if (leadResponsavelEmail && userEmail && leadResponsavelEmail === userEmail) return true;

            return false;
        };

        // Aplica filtro de visibilidade
        fechadosAtuais = fechadosAtuais.filter((lead) => canViewLead(lead));

        // sync valores, nomeTemporario, premio display e vigencia (idêntico ao seu código anterior)
        setValores(prevValores => {
            const novosValores = { ...prevValores };
            fechadosAtuais.forEach(lead => {
                const key = String(lead.ID ?? lead.id ?? lead.documentId ?? lead.phone ?? '');
                const rawPremioFromApi = String(lead.PremioLiquido ?? lead.premioLiquido ?? lead.Premio ?? '');
                const premioFromApi = parseFloat(rawPremioFromApi.replace(/\./g, '').replace(',', '.'));
                const premioInCents = isNaN(premioFromApi) || rawPremioFromApi === '' ? null : Math.round(premioFromApi * 100);

                const apiComissao = lead.Comissao ?? lead.comissao ?? '';
                const apiParcelamento = lead.Parcelamento ?? lead.parcelamento ?? '';
                const apiInsurer = lead.Seguradora ?? lead.insurer ?? '';
                const apiMeioPagamento = lead.MeioPagamento ?? lead.meioPagamento ?? '';
                const apiCartaoPortoNovo = lead.CartaoPortoNovo ?? lead.cartaoPortoNovo ?? '';

                if (!novosValores[key]) novosValores[key] = {};

                if ((novosValores[key].PremioLiquido === undefined || novosValores[key].PremioLiquido === null) && premioInCents !== null) {
                    novosValores[key].PremioLiquido = premioInCents;
                } else if (novosValores[key].PremioLiquido === undefined) {
                    novosValores[key].PremioLiquido = null;
                }

                if ((novosValores[key].Comissao === undefined || novosValores[key].Comissao === '') && apiComissao !== '') {
                    novosValores[key].Comissao = typeof apiComissao === 'string' ? apiComissao : String(apiComissao);
                } else if (novosValores[key].Comissao === undefined) {
                    novosValores[key].Comissao = '';
                }

                if ((novosValores[key].Parcelamento === undefined || novosValores[key].Parcelamento === '') && apiParcelamento !== '') {
                    novosValores[key].Parcelamento = String(apiParcelamento);
                } else if (novosValores[key].Parcelamento === undefined) {
                    novosValores[key].Parcelamento = '';
                }

                if ((novosValores[key].insurer === undefined || novosValores[key].insurer === '') && apiInsurer !== '') {
                    novosValores[key].insurer = String(apiInsurer);
                } else if (novosValores[key].insurer === undefined) {
                    novosValores[key].insurer = '';
                }

                if ((novosValores[key].MeioPagamento === undefined || novosValores[key].MeioPagamento === '') && apiMeioPagamento !== '') {
                    novosValores[key].MeioPagamento = String(apiMeioPagamento);
                } else if (novosValores[key].MeioPagamento === undefined) {
                    novosValores[key].MeioPagamento = '';
                }

                if ((novosValores[key].CartaoPortoNovo === undefined || novosValores[key].CartaoPortoNovo === '') && apiCartaoPortoNovo !== '') {
                    novosValores[key].CartaoPortoNovo = String(apiCartaoPortoNovo);
                } else if (novosValores[key].CartaoPortoNovo === undefined) {
                    novosValores[key].CartaoPortoNovo = '';
                }
            });
            return novosValores;
        });

        setNomeTemporario(prevNomes => {
            const novosNomes = { ...prevNomes };
            fechadosAtuais.forEach(lead => {
                const key = String(lead.ID ?? lead.id ?? lead.documentId ?? lead.phone ?? '');
                if (novosNomes[key] === undefined) {
                    novosNomes[key] = lead.name || lead.Nome || lead.nome || '';
                }
            });
            return novosNomes;
        });

        setPremioLiquidoInputDisplay(prevDisplay => {
            const newDisplay = { ...prevDisplay };
            fechadosAtuais.forEach(lead => {
                const key = String(lead.ID ?? lead.id ?? lead.documentId ?? lead.phone ?? '');
                const currentPremio = String(lead.PremioLiquido ?? lead.premioLiquido ?? lead.Premio ?? '');
                if (currentPremio !== '') {
                    const premioFloat = parseFloat(currentPremio.toString().replace(',', '.').replace(/\s/g, '').replace(/\./g, ''));
                    newDisplay[key] = isNaN(premioFloat) ? '' : premioFloat.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } else if (prevDisplay[key] === undefined) {
                    newDisplay[key] = '';
                }
            });
            return newDisplay;
        });

        setVigencia(prevVigencia => {
            const novasVigencias = { ...prevVigencia };
            fechadosAtuais.forEach(lead => {
                const key = String(lead.ID ?? lead.id ?? lead.documentId ?? lead.phone ?? '');
                const vigenciaInicioStrApi = lead.VigenciaInicial ?? lead.vigenciaInicial ?? lead.VigenciaInicio ?? lead.vigenciaInicio ?? '';
                const vigenciaFinalStrApi = lead.VigenciaFinal ?? lead.vigenciaFinal ?? lead.VigenciaFim ?? lead.vigenciaFim ?? '';

                if (!novasVigencias[key]) novasVigencias[key] = { inicio: '', final: '' };

                if (vigenciaInicioStrApi && (!novasVigencias[key].inicio || novasVigencias[key].inicio === '')) {
                    const normalizedInicio = getDataParaComparacao(vigenciaInicioStrApi);
                    novasVigencias[key].inicio = normalizedInicio || String(vigenciaInicioStrApi);
                }

                if (vigenciaFinalStrApi && (!novasVigencias[key].final || novasVigencias[key].final === '')) {
                    const normalizedFinal = getDataParaComparacao(vigenciaFinalStrApi);
                    novasVigencias[key].final = normalizedFinal || String(vigenciaFinalStrApi);
                } else if (!novasVigencias[key].final && novasVigencias[key].inicio) {
                    try {
                        const d = new Date(novasVigencias[key].inicio + 'T00:00:00');
                        d.setFullYear(d.getFullYear() + 1);
                        const y = d.getFullYear();
                        const m = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        novasVigencias[key].final = `${y}-${m}-${day}`;
                    } catch (e) {}
                }
            });
            return novasVigencias;
        });

        const fechadosOrdenados = [...fechadosAtuais].sort((a, b) => {
            const timeFrom = (lead) => {
                const vi = getDataParaComparacao(lead.VigenciaInicial ?? lead.vigenciaInicial ?? lead.VigenciaInicio ?? '');
                if (vi) {
                    const d = new Date(vi + 'T00:00:00');
                    if (!isNaN(d.getTime())) return d.getTime();
                }
                if (lead.closedAt && typeof lead.closedAt.toDate === 'function') return -lead.closedAt.toDate().getTime();
                if (lead.closedAt) {
                    const d = new Date(lead.closedAt);
                    if (!isNaN(d.getTime())) return d.getTime();
                }
                const dataStr = lead.Data ?? lead.data ?? '';
                const iso = getDataParaComparacao(String(dataStr));
                if (iso) {
                    const d = new Date(iso + 'T00:00:00');
                    if (!isNaN(d.getTime())) return d.getTime();
                }
                return 0;
            };
            return timeFrom(b) - timeFrom(a);
        });

        let leadsFiltrados;
        if (filtroNome) {
            leadsFiltrados = fechadosOrdenados.filter(lead =>
                nomeContemFiltro(lead.name || lead.Nome || lead.nome || lead.Responsavel || '', filtroNome)
            );
        } else if (filtroData) {
            const targetYYYYMM = filtroDataToYYYYMM(filtroData);
            leadsFiltrados = fechadosOrdenados.filter(lead => {
                const vigenciaInicioRaw = lead.VigenciaInicial ?? lead.vigenciaInicial ?? lead.VigenciaInicio ?? lead.vigencia_inicio ?? lead.Vigencia ?? '';
                const dataLeadFormatada = getDataParaComparacao(vigenciaInicioRaw);
                const dataLeadMesAno = dataLeadFormatada ? dataLeadFormatada.substring(0, 7) : '';
                return dataLeadMesAno === targetYYYYMM;
            });
        } else {
            leadsFiltrados = fechadosOrdenados;
        }

        setFechadosFiltradosInterno(leadsFiltrados);
    }, [leadsFromFirebase, leads, filtroNome, filtroData, isAdmin, usuarios]);

    const formatarMoeda = (valorCentavos) => {
        if (valorCentavos === null || isNaN(valorCentavos)) return '';
        return (valorCentavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const handleNomeBlur = (id, novoNome) => {
        const nomeAtualizado = novoNome.trim();
        const origem = (leadsFromFirebase.length ? leadsFromFirebase : leads);
        const lead = origem.find(l => String(l.ID) === String(id) || String(l.id) === String(id));
        if (lead && (lead.name !== nomeAtualizado && lead.Nome !== nomeAtualizado && lead.nome !== nomeAtualizado)) {
            if (nomeAtualizado) {
                setNomeTemporario(prev => ({
                    ...prev,
                    [`${id}`]: nomeAtualizado,
                }));
                onUpdateDetalhes(id, 'name', nomeAtualizado);
            } else {
                setNomeTemporario(prev => ({
                    ...prev,
                    [`${id}`]: lead.name || lead.Nome || lead.nome || '',
                }));
            }
        }
    };

    const handlePremioLiquidoChange = (id, valor) => {
        let cleanedValue = valor.replace(/[^\d,\.]/g, '');
        const commaParts = cleanedValue.split(',');
        if (commaParts.length > 2) cleanedValue = commaParts[0] + ',' + commaParts.slice(1).join('');
        if (commaParts.length > 1 && commaParts[1].length > 2) cleanedValue = commaParts[0] + ',' + commaParts[1].slice(0, 2);

        setPremioLiquidoInputDisplay(prev => ({ ...prev, [`${id}`]: cleanedValue }));

        const valorParaParse = cleanedValue.replace(/\./g, '').replace(',', '.');
        const valorEmReais = parseFloat(valorParaParse);
        const valorParaEstado = isNaN(valorEmReais) || cleanedValue === '' ? null : Math.round(valorEmReais * 100);

        setValores(prev => ({ ...prev, [`${id}`]: { ...prev[`${id}`], PremioLiquido: valorParaEstado } }));
    };

    const handlePremioLiquidoBlur = (id) => {
        const valorCentavos = valores[`${id}`]?.PremioLiquido;
        let valorReais = null;
        if (valorCentavos !== null && !isNaN(valorCentavos)) valorReais = valorCentavos / 100;
        setPremioLiquidoInputDisplay(prev => ({ ...prev, [`${id}`]: valorCentavos !== null && !isNaN(valorCentavos) ? formatarMoeda(valorCentavos) : '' }));
        onUpdateDetalhes(id, 'PremioLiquido', valorReais);
    };

    const handleComissaoChange = (id, valor) => {
        let cleanedValue = valor.replace(/[^\d,]/g, '');
        const parts = cleanedValue.split(',');
        if (parts.length > 2) cleanedValue = parts[0] + ',' + parts.slice(1).join('');
        if (parts.length > 1 && parts[1].length > 2) cleanedValue = parts[0] + ',' + parts[1].slice(0, 2);

        setValores(prev => ({ ...prev, [`${id}`]: { ...prev[`${id}`], Comissao: cleanedValue } }));
    };

    const handleComissaoBlur = (id) => {
        const comissaoInput = valores[`${id}`]?.Comissao || '';
        const comissaoFloat = parseFloat(comissaoInput.replace(',', '.'));
        onUpdateDetalhes(id, 'Comissao', isNaN(comissaoFloat) ? '' : comissaoFloat);
    };

    const handleParcelamentoChange = (id, valor) => {
        setValores(prev => ({ ...prev, [`${id}`]: { ...prev[`${id}`], Parcelamento: valor } }));
        onUpdateDetalhes(id, 'Parcelamento', valor);
    };

    const handleMeioPagamentoChange = (id, valor) => {
        setValores(prev => {
            const newState = { ...prev, [`${id}`]: { ...prev[`${id}`], MeioPagamento: valor } };
            if (valor !== 'CP' && newState[`${id}`]?.CartaoPortoNovo) {
                newState[`${id}`].CartaoPortoNovo = '';
                onUpdateDetalhes(id, 'CartaoPortoNovo', '');
            }
            return newState;
        });
        onUpdateDetalhes(id, 'MeioPagamento', valor);
    };

    const handleCartaoPortoChange = (id, valor) => {
        setValores(prev => ({ ...prev, [`${id}`]: { ...prev[`${id}`], CartaoPortoNovo: valor } }));
        onUpdateDetalhes(id, 'CartaoPortoNovo', valor);
    };

    const handleInsurerChange = (id, valor) => {
        const portoSeguradoras = ['Porto Seguro', 'Azul Seguros', 'Itau Seguros'];
        setValores(prev => {
            const newState = { ...prev, [`${id}`]: { ...prev[`${id}`], insurer: valor } };
            if (!portoSeguradoras.includes(valor) && newState[`${id}`]?.CartaoPortoNovo) {
                newState[`${id}`].CartaoPortoNovo = '';
                onUpdateDetalhes(id, 'CartaoPortoNovo', '');
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
                dataFinal = `${anoFinal}-${mesInicio}-${diaInicio}`;
            }
        }
        setVigencia(prev => ({ ...prev, [`${id}`]: { ...prev[`${id}`], inicio: dataString, final: dataFinal } }));
        onUpdateDetalhes(id, 'VigenciaInicial', dataString);
        onUpdateDetalhes(id, 'VigenciaFinal', dataFinal);
    };

    const totalPaginas = Math.max(1, Math.ceil(fechadosFiltradosInterno.length / leadsPorPagina));
    const paginaCorrigida = Math.min(paginaAtual, totalPaginas);
    const inicio = (paginaCorrigida - 1) * leadsPorPagina;
    const fim = inicio + leadsPorPagina;
    const leadsPagina = fechadosFiltradosInterno.slice(inicio, fim);

    const handlePaginaAnterior = () => { setPaginaAtual(prev => Math.max(prev - 1, 1)); scrollToTop(); };
    const handlePaginaProxima = () => { setPaginaAtual(prev => Math.min(prev + 1, totalPaginas)); scrollToTop(); };

    // safeConfirm: envoltório com checagem de rede e try/catch para falhas de fetch
    const safeConfirm = async (...args) => {
        // args: (leadKey, premio, insurer, comissao, parcelamento, inicio, final, meioPagamento, cartaoPorto)
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            alert('Sem conexão de rede. Verifique sua internet e tente novamente.');
            return;
        }
        setIsLoading(true);
        try {
            if (typeof onConfirmInsurer !== 'function') {
                throw new Error('A função onConfirmInsurer não está definida.');
            }
            await onConfirmInsurer(...args);
            // opcional: mostrar confirmação amigável
            // alert('Lead enviado com sucesso.');
        } catch (err) {
            console.error('Erro ao enviar lead:', err);
            // Mensagem amigável
            const msg = err && err.message ? err.message : String(err);
            // Se for provável problema de CORS, sugerir verificação:
            let sugestao = '';
            if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('networkrequest failed')) {
                sugestao = '\nPossíveis causas: servidor inacessível, endpoint errado ou bloqueio por CORS.';
            }
            alert('Erro ao enviar lead: ' + msg + sugestao);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 relative min-h-screen bg-gray-100 font-sans">
            {isLoading && (
                <div className="absolute inset-0 bg-white bg-opacity-80 flex justify-center items-center z-50">
                    <div className="flex flex-col items-center">
                        <svg className="animate-spin h-10 w-10 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <p className="ml-4 text-xl font-semibold text-gray-700 mt-3">Carregando...</p>
                    </div>
                </div>
            )}

            {/* Cabeçalho e filtros (igual ao anterior) */}
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 mb-4">
                    <h1 className="text-4xl font-extrabold text-gray-900 flex items-center">
                        <CheckCircle size={32} className="text-green-500 mr-3" />
                        Leads Fechados
                    </h1>
                    <button title="Atualizar dados" onClick={handleRefresh} disabled={isLoading}
                        className={`p-3 rounded-full transition duration-300 ${isLoading ? 'text-gray-400 cursor-not-allowed' : 'text-green-600 hover:bg-green-100 shadow-sm'}`}>
                        <RefreshCcw size={24} className={isLoading ? '' : 'hover:rotate-180'} />
                    </button>
                </div>
                <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch">
                    <div className="flex itens-center gap-2 flex-1 min-w-[200px]">
                        <input type="text" placeholder="Buscar por nome..." value={nomeInput} onChange={(e) => setNomeInput(e.target.value)}
                            className="flex-grow p-3 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500 text-sm" />
                        <button onClick={aplicarFiltroNome} className="p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition duration-200 shadow-md">
                            <Search size={20} />
                        </button>
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-[200px] justify-end">
                        <input type="month" value={dataInput} onChange={(e) => setDataInput(e.target.value)}
                            className="p-3 border border-gray-300 rounded-lg cursor-pointer text-sm" title="Filtrar por Mês/Ano de Vigência Inicial" />
                        <button onClick={aplicarFiltroData} className="p-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition duration-200 shadow-md whitespace-nowrap">
                            Filtrar Data
                        </button>
                    </div>
                </div>
            </div>

            {/* Lista de cards (renderização igual ao seu código original) */}
            <div className="space-y-5">
                {fechadosFiltradosInterno.length === 0 && !isLoading ? (
                    <div className="text-center p-12 bg-white rounded-xl shadow-md text-gray-600 text-lg">
                        <p> Você ainda não tem nenhum fechamento, mas logo terá! 😉  </p>
                    </div>
                ) : (
                    leadsPagina.map((lead) => {
                        const responsavelName = lead.Responsavel ?? lead.responsavel ?? lead.ResponsavelName ?? '';
                        const responsavel = Array.isArray(usuarios) ? usuarios.find((u) => u.nome === responsavelName) : undefined;
                        const isSeguradoraPreenchida = !!(lead.Seguradora ?? lead.insurer ?? lead.raw?.Seguradora);
                        const leadKey = String(lead.ID ?? lead.id ?? lead.documentId ?? lead.phone ?? '');
                        const currentInsurer = valores[`${leadKey}`]?.insurer || (lead.Seguradora ?? lead.insurer ?? '');
                        const currentMeioPagamento = valores[`${leadKey}`]?.MeioPagamento || (lead.MeioPagamento ?? lead.meioPagamento ?? '');
                        const isPortoInsurer = ['Porto Seguro', 'Azul Seguros', 'Itau Seguros'].includes(currentInsurer);
                        const isCPPayment = currentMeioPagamento === 'CP';
                        const showCartaoPortoNovo = isPortoInsurer && isCPPayment;
                        const isButtonDisabled =
                            ! (valores[`${leadKey}`]?.insurer || (lead.Seguradora ?? lead.insurer ?? '')) ||
                            valores[`${leadKey}`]?.PremioLiquido === null ||
                            valores[`${leadKey}`]?.PremioLiquido === undefined ||
                            !valores[`${leadKey}`]?.Comissao ||
                            parseFloat(String(valores[`${leadKey}`]?.Comissao || '0').replace(',', '.')) === 0 ||
                            !valores[`${leadKey}`]?.Parcelamento ||
                            valores[`${leadKey}`]?.Parcelamento === '' ||
                            !vigencia[`${leadKey}`]?.inicio ||
                            !vigencia[`${leadKey}`]?.final;

                        return (
                            <div key={leadKey} className={`bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative border-t-4 ${isSeguradoraPreenchida ? 'border-green-600' : 'border-amber-500'}`}>
                                <div className="col-span-1 border-b pb-4 lg:border-r lg:pb-0 lg:pr-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        {isSeguradoraPreenchida ? (
                                            <h3 className="text-xl font-bold text-gray-900">{nomeTemporario[leadKey] || lead.name || lead.Nome || lead.nome}</h3>
                                        ) : (
                                            <div className="flex flex-col w-full">
                                                <input type="text" value={nomeTemporario[leadKey] ?? (lead.name || lead.Nome || lead.nome || '')}
                                                    onChange={(e) => setNomeTemporario(prev => ({ ...prev, [leadKey]: e.target.value }))}
                                                    onBlur={(e) => handleNomeBlur(leadKey, e.target.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                                    className="text-xl font-bold text-gray-900 border border-indigo-300 rounded-lg p-1 focus:ring-indigo-500 focus:border-indigo-500" />
                                                <span className='text-xs text-gray-500 mt-1'>Atualize o nome com o mesmo da proposta.</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-1 text-sm text-gray-700">
                                        <p><strong>Responsável:</strong> {responsavelName}</p>
                                        <p><strong>Modelo:</strong> {lead.vehicleModel ?? lead.Modelo}</p>
                                        <p><strong>Ano/Modelo:</strong> {lead.vehicleYearModel ?? lead.AnoModelo ?? lead.anoModelo}</p>
                                        <p><strong>Cidade:</strong> {lead.city ?? lead.Cidade}</p>
                                        <p><strong>Telefone:</strong> {lead.phone ?? lead.Telefone}</p>
                                        <p><strong>Tipo de Seguro:</strong> {lead.insuranceType ?? lead.TipoSeguro}</p>
                                    </div>

                                    {responsavelName && (
                                        <p className="mt-4 text-sm font-semibold text-green-600 bg-green-50 p-2 rounded-lg">
                                            Transferido para: <strong>{responsavelName}</strong>
                                        </p>
                                    )}
                                </div>

                                <div className="col-span-1 border-b pb-4 lg:border-r lg:pb-0 lg:px-6">
                                    <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                                        <DollarSign size={18} className="mr-2 text-green-500" />
                                        Detalhes do Fechamento
                                    </h3>
                                    <div className="mb-4">
                                        <label className="text-xs font-semibold text-gray-600 block mb-1">Seguradora</label>
                                        <select value={valores[`${leadKey}`]?.insurer || (lead.Seguradora ?? lead.insurer ?? '')}
                                            onChange={(e) => handleInsurerChange(leadKey, e.target.value)} disabled={isSeguradoraPreenchida}
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500">
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

                                    <div className="mb-4">
                                        <label className="text-xs font-semibold text-gray-600 block mb-1">Meio de Pagamento</label>
                                        <select value={valores[`${leadKey}`]?.MeioPagamento || (lead.MeioPagamento ?? lead.meioPagamento ?? '')}
                                            onChange={(e) => handleMeioPagamentoChange(leadKey, e.target.value)} disabled={isSeguradoraPreenchida}
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500">
                                            <option value=""> </option>
                                            <option value="CP">CP</option>
                                            <option value="CC">CC</option>
                                            <option value="Debito">Debito</option>
                                            <option value="Boleto">Boleto</option>
                                        </select>
                                    </div>

                                    {showCartaoPortoNovo && (
                                        <div className="mb-4">
                                            <label className="text-xs font-semibold text-gray-600 block mb-1">Cartão Porto Seguro Novo?</label>
                                            <select value={valores[`${leadKey}`]?.CartaoPortoNovo || (lead.CartaoPortoNovo ?? lead.cartaoPortoNovo ?? '')}
                                                onChange={(e) => handleCartaoPortoChange(leadKey, e.target.value)} disabled={isSeguradoraPreenchida}
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500">
                                                <option value=""> </option>
                                                <option value="Sim">Sim</option>
                                                <option value="Não">Não</option>
                                            </select>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-3 mt-4">
                                        <div>
                                            <label className="text-xs font-semibold text-gray-600 block mb-1">Prêmio Líquido</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold text-sm">R$</span>
                                                <input type="text" placeholder="0,00"
                                                    value={premioLiquidoInputDisplay[`${leadKey}`] || (valores[`${leadKey}`]?.PremioLiquido !== undefined && valores[`${leadKey}`]?.PremioLiquido !== null ? formatarMoeda(valores[`${leadKey}`].PremioLiquido) : (lead.PremioLiquido ?? lead.premioLiquido ?? ''))}
                                                    onChange={(e) => handlePremioLiquidoChange(leadKey, e.target.value)}
                                                    onBlur={() => handlePremioLiquidoBlur(leadKey)}
                                                    disabled={isSeguradoraPreenchida}
                                                    className="w-full p-2 pl-8 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500 text-right" />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="text-xs font-semibold text-gray-600 block mb-1">Comissão (%)</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold text-sm">%</span>
                                                <input type="text" placeholder="0,00" value={valores[`${leadKey}`]?.Comissao || ''}
                                                    onChange={(e) => handleComissaoChange(leadKey, e.target.value)} onBlur={() => handleComissaoBlur(leadKey)}
                                                    disabled={isSeguradoraPreenchida}
                                                    className="w-full p-2 pl-8 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500 text-right" />
                                            </div>
                                        </div>

                                        <div className="col-span-2">
                                            <label className="text-xs font-semibold text-gray-600 block mb-1">Parcelamento</label>
                                            <select value={valores[`${leadKey}`]?.Parcelamento || ''} onChange={(e) => handleParcelamentoChange(leadKey, e.target.value)} disabled={isSeguradoraPreenchida}
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500">
                                                <option value="">Selecione o Parcelamento</option>
                                                {[...Array(12)].map((_, i) => (<option key={i + 1} value={`${i + 1}`}>{i + 1}</option>))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="col-span-1 lg:pl-6">
                                    <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                                        <Calendar size={18} className="mr-2 text-green-500" />
                                        Vigência
                                    </h3>

                                    <div className="mb-4">
                                        <label htmlFor={`vigencia-inicio-${leadKey}`} className="text-xs font-semibold text-gray-600 block mb-1">Início</label>
                                        <input id={`vigencia-inicio-${leadKey}`} type="date"
                                            value={vigencia[`${leadKey}`]?.inicio || getDataParaComparacao(lead.VigenciaInicial ?? lead.vigenciaInicial ?? '') || ''}
                                            onChange={(e) => handleVigenciaInicioChange(leadKey, e.target.value)} disabled={isSeguradoraPreenchida}
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500" />
                                    </div>

                                    <div className="mb-6">
                                        <label htmlFor={`vigencia-final-${leadKey}`} className="text-xs font-semibold text-gray-600 block mb-1">Término (Automático)</label>
                                        <input id={`vigencia-final-${leadKey}`} type="date" value={vigencia[`${leadKey}`]?.final || getDataParaComparacao(lead.VigenciaFinal ?? lead.vigenciaFinal ?? '') || ''}
                                            readOnly disabled className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-100 cursor-not-allowed" />
                                    </div>

                                    {!isSeguradoraPreenchida ? (
                                        <button onClick={async () => {
                                            await safeConfirm(
                                                leadKey,
                                                valores[`${leadKey}`]?.PremioLiquido === null ? null : valores[`${leadKey}`]?.PremioLiquido / 100,
                                                valores[`${leadKey}`]?.insurer || (lead.Seguradora ?? lead.insurer ?? ''),
                                                parseFloat(String(valores[`${leadKey}`]?.Comissao || '0').replace(',', '.')),
                                                valores[`${leadKey}`]?.Parcelamento,
                                                vigencia[`${leadKey}`]?.inicio,
                                                vigencia[`${leadKey}`]?.final,
                                                valores[`${leadKey}`]?.MeioPagamento || '',
                                                valores[`${leadKey}`]?.CartaoPortoNovo || ''
                                            );
                                        }} disabled={isButtonDisabled || isLoading}
                                            title={isButtonDisabled ? 'Preencha todos os campos para confirmar.' : 'Confirmar e finalizar renovação.'}
                                            className={`w-full py-3 rounded-xl font-bold transition duration-300 shadow-lg flex items-center justify-center ${isButtonDisabled ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>
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

            {fechadosFiltradosInterno.length > 0 && (
                <div className="mt-8 flex justify-center bg-white p-4 rounded-xl shadow-lg">
                    <div className="flex justify-center items-center gap-4 mt-8 pb-8">
                        <button onClick={handlePaginaAnterior} disabled={paginaCorrigida <= 1 || isLoading}
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition duration-150 shadow-md ${(paginaCorrigida <= 1 || isLoading) ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white border-indigo-500 text-indigo-600 hover:bg-indigo-50'}`}>
                            Anterior
                        </button>

                        <span className="text-gray-700 font-semibold">Página {paginaCorrigida} de {totalPaginas}</span>

                        <button onClick={handlePaginaProxima} disabled={paginaCorrigida >= totalPaginas || isLoading}
                            className={`px-4 py-2 rounded-lg border texto-sm font-medium transition duration-150 shadow-md ${(paginaCorrigida >= totalPaginas || isLoading) ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-white border-indigo-500 text-indigo-600 hover:bg-indigo-50'}`}>
                            Próxima
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeadsFechados;
