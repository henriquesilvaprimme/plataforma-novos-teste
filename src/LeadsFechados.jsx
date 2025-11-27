import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

import { CheckCircle, RefreshCcw, Search, DollarSign, Calendar } from 'lucide-react';
// ===============================================
// 1. COMPONENTE PRINCIPAL: LeadsFechados
// ===============================================

const LeadsFechados = ({ usuarios, onUpdateInsurer, onConfirmInsurer, onUpdateDetalhes, isAdmin, scrollContainerRef }) => {
    // --- ESTADOS ---
    const [leadsFirebase, setLeadsFirebase] = useState([]);
    const [fechadosFiltradosInterno, setFechadosFiltradosInterno] = useState([]);
    const [paginaAtual, setPaginaAtual] = useState(1);
    const leadsPorPagina = 10;

    const [valores, setValores] = useState({});
    const [vigencia, setVigencia] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [nomeInput, setNomeInput] = useState('');

    // >>> NOVO ESTADO: Controle de edição de nome <<<
    // O estado nomeEditando foi removido para que a edição fique sempre aberta.
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

    // --- FUNÇÕES DE LÓGICA ---

    /**
     * GARANTIA DE FORMATO: Converte DD/MM/AAAA para AAAA-MM-DD sem depender de new Date().
     */
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
        setFiltroData(dataInput); // dataInput está no formato AAAA-MM
        setFiltroNome('');
        setNomeInput('');
        setPaginaAtual(1);
        scrollToTop();
    };

    const fetchLeadsFechadosFromFirebase = async () => {
        setIsLoading(true);
        try {
            const q = query(collection(db, "leadsFechados"), where("Status", "==", "Fechado"));
            const querySnapshot = await getDocs(q);
            const fetchedLeads = querySnapshot.docs.map(doc => ({
                ID: doc.id,
                name: doc.data().Nome,
                vehicleModel: doc.data().Modelo,
                vehicleYearModel: doc.data().AnoModelo,
                city: doc.data().Cidade,
                phone: doc.data().Telefone,
                insuranceType: doc.data().TipoSeguro,
                Responsavel: doc.data().Responsavel,
                Seguradora: doc.data().Seguradora,
                MeioPagamento: doc.data().MeioPagamento,
                CartaoPortoNovo: doc.data().CartaoPortoNovo,
                PremioLiquido: doc.data().PremioLiquido ? parseFloat(doc.data().PremioLiquido.replace('R$', '').replace('.', '').replace(',', '.')) : null,
                Comissao: doc.data().Comissao,
                Parcelamento: doc.data().Parcelamento,
                VigenciaInicial: doc.data().VigenciaInicial ? doc.data().VigenciaInicial.split('T')[0] : '',
                VigenciaFinal: doc.data().VigenciaFinal ? doc.data().VigenciaFinal.split('T')[0] : '',
            }));
            setLeadsFirebase(fetchedLeads);
        } catch (error) {
            console.error("Erro ao buscar leads fechados do Firebase:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // --- EFEITO DE CARREGAMENTO INICIAL ---
    useEffect(() => {
        fetchLeadsFechadosFromFirebase();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- EFEITO DE FILTRAGEM E SINCRONIZAÇÃO DE ESTADOS ---
    useEffect(() => {
        const fechadosAtuais = leadsFirebase;

        // Sincronização de estados
        setValores(prevValores => {
            const novosValores = { ...prevValores };
            fechadosAtuais.forEach(lead => {
                const rawPremioFromApi = String(lead.PremioLiquido || '');
                const premioFromApi = parseFloat(rawPremioFromApi.replace('.', '').replace(',', '.'));
                const premioInCents = isNaN(premioFromApi) || rawPremioFromApi === '' ? null : Math.round(premioFromApi * 100);

                const apiComissao = lead.Comissao ? String(lead.Comissao).replace('.', ',') : '';
                const apiParcelamento = lead.Parcelamento || '';
                const apiInsurer = lead.Seguradora || '';
                // >>> NOVO: Meio de Pagamento <<<
                const apiMeioPagamento = lead.MeioPagamento || '';
                // >>> NOVO: Cartao Porto Seguro Novo? <<<
                const apiCartaoPortoNovo = lead.CartaoPortoNovo || '';

                if (!novosValores[lead.ID] ||
                    (novosValores[lead.ID].PremioLiquido === undefined && premioInCents !== null) ||
                    (novosValores[lead.ID].Comissao === undefined && apiComissao !== '') ||
                    (novosValores[lead.ID].Parcelamento === undefined && apiParcelamento !== '') ||
                    (novosValores[lead.ID].insurer === undefined && apiInsurer !== '') ||
                    // >>> NOVO: Inicialização para Meio de Pagamento e Cartão Porto Novo <<<
                    (novosValores[lead.ID].MeioPagamento === undefined && apiMeioPagamento !== '') ||
                    (novosValores[lead.ID].CartaoPortoNovo === undefined && apiCartaoPortoNovo !== '')
                ) {
                    novosValores[lead.ID] = {
                        ...novosValores[lead.ID],
                        PremioLiquido: premioInCents,
                        Comissao: apiComissao,
                        Parcelamento: apiParcelamento,
                        insurer: apiInsurer,
                        // >>> NOVO: Meio de Pagamento e Cartão Porto Novo no estado <<<
                        MeioPagamento: apiMeioPagamento,
                        CartaoPortoNovo: apiCartaoPortoNovo,
                    };
                }
            });
            return novosValores;
        });

        // >>> NOVO: Sincronização do estado de Nome Temporário <<<
        setNomeTemporario(prevNomes => {
            const novosNomes = { ...prevNomes };
            fechadosAtuais.forEach(lead => {
                if (novosNomes[lead.ID] === undefined) {
                    novosNomes[lead.ID] = lead.name || '';
                }
            });
            return novosNomes;
        });
        // <<< FIM NOVO ESTADO NOME TEMPORÁRIO >>>


        setPremioLiquidoInputDisplay(prevDisplay => {
            const newDisplay = { ...prevDisplay };
            fechadosAtuais.forEach(lead => {
                const currentPremio = String(lead.PremioLiquido || '');
                if (currentPremio !== '') {
                    const premioFloat = parseFloat(currentPremio.replace(',', '.'));
                    newDisplay[lead.ID] = isNaN(premioFloat) ? '' : premioFloat.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } else if (prevDisplay[lead.ID] === undefined) {
                    newDisplay[lead.ID] = '';
                }
            });
            return newDisplay;
        });

        setVigencia(prevVigencia => {
            const novasVigencias = { ...prevVigencia };
            fechadosAtuais.forEach(lead => {
                const vigenciaInicioStrApi = String(lead.VigenciaInicial || '');
                const vigenciaFinalStrApi = String(lead.VigenciaFinal || '');

                if (!novasVigencias[lead.ID] || (novasVigencias[lead.ID].inicio === undefined && vigenciaInicioStrApi !== '')) {
                    novasVigencias[lead.ID] = { ...novasVigencias[lead.ID], inicio: vigenciaInicioStrApi };
                }
                if (!novasVigencias[lead.ID] || (novasVigencias[lead.ID].final === undefined && vigenciaFinalStrApi !== '')) {
                    novasVigencias[lead.ID] = { ...novasVigencias[lead.ID], final: vigenciaFinalStrApi };
                }
            });
            return novasVigencias;
        });

        // ORDENAÇÃO
        const fechadosOrdenados = [...fechadosAtuais].sort((a, b) => {
            const dataA = new Date(getDataParaComparacao(a.Data) + 'T00:00:00');
            const dataB = new Date(new Date(getDataParaComparacao(b.Data) + 'T00:00:00'));
            return dataB.getTime() - dataA.getTime();
        });

        // Aplicação da lógica de filtragem
        let leadsFiltrados;
        if (filtroNome) {
            leadsFiltrados = fechadosOrdenados.filter(lead =>
                nomeContemFiltro(lead.name, filtroNome)
            );
        } else if (filtroData) {
            leadsFiltrados = fechadosOrdenados.filter(lead => {
                const dataLeadFormatada = getDataParaComparacao(lead.Data);
                const dataLeadMesAno = dataLeadFormatada ? dataLeadFormatada.substring(0, 7) : '';
                return dataLeadMesAno === filtroData;
            });
        } else {
            leadsFiltrados = fechadosOrdenados;
        }

        setFechadosFiltradosInterno(leadsFiltrados);
    }, [leadsFirebase, filtroNome, filtroData]);


    // --- FUNÇÕES DE HANDLER (NOVAS E EXISTENTES) ---

    const formatarMoeda = (valorCentavos) => {
        if (valorCentavos === null || isNaN(valorCentavos)) return '';
        return (valorCentavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // >>> NOVO HANDLER: Lógica para editar o nome do lead <<<
    const handleNomeBlur = (id, novoNome) => {
        const nomeAtualizado = novoNome.trim();
        // setNomeEditando(null); // REMOVIDO: O campo não precisa sair do modo de edição

        // Verifica se o nome realmente mudou para evitar chamadas desnecessárias à API
        const lead = leadsFirebase.find(l => l.ID === id);
        if (lead && lead.name !== nomeAtualizado) {
            if (nomeAtualizado) {
                // 1. Atualiza o estado local temporário (que é exibido no card)
                setNomeTemporario(prev => ({
                    ...prev,
                    [`${id}`]: nomeAtualizado,
                }));
                // 2. Chama a função de atualização da prop, enviando 'name' para o Sheets
                onUpdateDetalhes(id, 'name', nomeAtualizado);
            } else {
                // Se o campo ficou vazio, reverte para o nome original (ou deixa a lógica de validação na API)
                setNomeTemporario(prev => ({
                    ...prev,
                    [`${id}`]: lead.name,
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

    // Converte para float (com ponto decimal) antes de enviar a atualização
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

            // Lógica de limpeza: Se o novo Meio de Pagamento não for 'CP',
            // limpe o campo 'CartaoPortoNovo' se ele estiver preenchido.
            if (valor !== 'CP' && newState[`${id}`]?.CartaoPortoNovo) {
                newState[`${id}`].CartaoPortoNovo = '';
                onUpdateDetalhes(id, 'CartaoPortoNovo', ''); // Limpa na API também
            }

            return newState;
        });

        onUpdateDetalhes(id, 'MeioPagamento', valor);
    };

    // ************************************************************
    // NOVO HANDLER: Cartão Porto Seguro Novo?
    // ************************************************************
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

    // ************************************************************
    // Handler para Seguradora (Atualizado para se integrar aos novos campos)
    // ************************************************************
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

            // Lógica de limpeza: Se a nova seguradora não for Porto/Azul/Itaú,
            // limpe o campo 'CartaoPortoNovo' se ele estiver preenchido.
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

        // Atualiza a planilha/API com as datas (estas podem ser atualizadas imediatamente, se desejar)
        onUpdateDetalhes(id, 'VigenciaInicial', dataString);
        onUpdateDetalhes(id, 'VigenciaFinal', dataFinal);
    };

    const handleRefresh = () => {
        fetchLeadsFechadosFromFirebase();
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
                        const responsavel = usuarios.find((u) => u.nome === lead.Responsavel);
                        const isSeguradoraPreenchida = !!lead.Seguradora;

                        // Variáveis de estado para a lógica condicional
                        const currentInsurer = valores[`${lead.ID}`]?.insurer || '';
                        const currentMeioPagamento = valores[`${lead.ID}`]?.MeioPagamento || '';
                        const isPortoInsurer = ['Porto Seguro', 'Azul Seguros', 'Itau Seguros'].includes(currentInsurer);
                        const isCPPayment = currentMeioPagamento === 'CP';

                        // Lógica de exibição do Cartão Porto Novo:
                        // Somente se a seguradora for Porto/Azul/Itaú E o meio de pagamento for CP.
                        const showCartaoPortoNovo = isPortoInsurer && isCPPayment;

                        // Lógica de desativação do botão de confirmação
                        const isButtonDisabled =
                            !valores[`${lead.ID}`]?.insurer ||
                            valores[`${lead.ID}`]?.PremioLiquido === null ||
                            valores[`${lead.ID}`]?.PremioLiquido === undefined ||
                            !valores[`${lead.ID}`]?.Comissao ||
                            parseFloat(String(valores[`${lead.ID}`]?.Comissao || '0').replace(',', '.')) === 0 ||
                            !valores[`${lead.ID}`]?.Parcelamento ||
                            valores[`${lead.ID}`]?.Parcelamento === '' ||
                            !vigencia[`${lead.ID}`]?.inicio ||
                            !vigencia[`${lead.ID}`]?.final;

                        return (
                            <div
                                key={lead.ID}
                                className={`bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative border-t-4 ${isSeguradoraPreenchida ? 'border-green-600' : 'border-amber-500'}`}
                            >
                                {/* COLUNA 1: Informações do Lead */}
                                <div className="col-span-1 border-b pb-4 lg:border-r lg:pb-0 lg:pr-6">

                                    {/* >>> NOVO: Lógica de Edição de Nome do Lead (SEMPRE ABERTO OU BLOQUEADO) <<< */}
                                    <div className="flex items-center gap-2 mb-2">
                                        {isSeguradoraPreenchida ? (
                                            // BLOQUEADO: Se a seguradora estiver preenchida
                                            <h3 className="text-xl font-bold text-gray-900">{nomeTemporario[lead.ID] || lead.name}</h3>
                                        ) : (
                                            // SEMPRE ABERTO: Se a seguradora NÃO estiver preenchida
                                            <div className="flex flex-col w-full">
                                                <input
                                                    type="text"
                                                    value={nomeTemporario[lead.ID] || ''}
                                                    onChange={(e) => setNomeTemporario(prev => ({ ...prev, [lead.ID]: e.target.value }))}
                                                    onBlur={(e) => handleNomeBlur(lead.ID, e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.currentTarget.blur();
                                                        }
                                                        // A lógica de 'Escape' foi removida, o campo fica sempre aberto até o blur.
                                                    }}
                                                    className="text-xl font-bold text-gray-900 border border-indigo-300 rounded-lg p-1 focus:ring-indigo-500 focus:border-indigo-500"
                                                    // autoFocus removido para evitar problemas de foco em múltiplos componentes
                                                />
                                                <span className='text-xs text-gray-500 mt-1'>Atualize o nome com o mesmo da proposta.</span>
                                            </div>
                                        )}
                                        {/* O botão de edição foi removido */}
                                    </div>
                                    {/* <<< FIM NOVO: Lógica de Edição de Nome do Lead >>> */}


                                    <div className="space-y-1 text-sm text-gray-700">
                                        <p><strong>Modelo:</strong> {lead.vehicleModel}</p>
                                        <p><strong>Ano/Modelo:</strong> {lead.vehicleYearModel}</p>
                                        <p><strong>Cidade:</strong> {lead.city}</p>
                                        <p><strong>Telefone:</strong> {lead.phone}</p>
                                        <p><strong>Tipo de Seguro:</strong> {lead.insuranceType}</p>
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

                                    {/* 1. Seguradora (Select) */}
                                    <div className="mb-4">
                                        <label className="text-xs font-semibold text-gray-600 block mb-1">Seguradora</label>
                                        <select
                                            value={valores[`${lead.ID}`]?.insurer || ''}
                                            onChange={(e) => handleInsurerChange(lead.ID, e.target.value)}
                                            disabled={isSeguradoraPreenchida}
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
                                            value={valores[`${lead.ID}`]?.MeioPagamento || ''}
                                            onChange={(e) => handleMeioPagamentoChange(lead.ID, e.target.value)}
                                            disabled={isSeguradoraPreenchida}
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
                                                value={valores[`${lead.ID}`]?.CartaoPortoNovo || ''}
                                                onChange={(e) => handleCartaoPortoChange(lead.ID, e.target.value)}
                                                disabled={isSeguradoraPreenchida}
                                                className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500"
                                            >
                                                <option value=""> </option>
                                                <option value="Sim">Sim</option>
                                                <option value="Não">Não</option>
                                            </select>
                                        </div>
                                    )}

                                    {/* 4., 5., 6. Demais campos (Prêmio, Comissão, Parcelamento) */}
                                    <div className="grid grid-cols-2 gap-3 mt-4"> {/* Adicionado mt-4 para espaçamento após os novos campos */}
                                        {/* Prêmio Líquido (Input) */}
                                        <div>
                                            <label className="text-xs font-semibold text-gray-600 block mb-1">Prêmio Líquido</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold text-sm">R$</span>
                                                <input
                                                    type="text"
                                                    placeholder="0,00"
                                                    value={premioLiquidoInputDisplay[`${lead.ID}`] || ''}
                                                    onChange={(e) => handlePremioLiquidoChange(lead.ID, e.target.value)}
                                                    onBlur={() => handlePremioLiquidoBlur(lead.ID)}
                                                    disabled={isSeguradoraPreenchida}
                                                    className="w-full p-2 pl-8 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500 text-right"
                                                />
                                            </div>
                                        </div>

                                        {/* Comissão (Input) */}
                                        <div>
                                            <label className="text-xs font-semibold text-gray-600 block mb-1">Comissão (%)</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 font-bold text-sm">%</span>
                                                <input
                                                    type="text"
                                                    placeholder="0,00"
                                                    value={valores[`${lead.ID}`]?.Comissao || ''}
                                                    onChange={(e) => handleComissaoChange(lead.ID, e.target.value)}
                                                    onBlur={() => handleComissaoBlur(lead.ID)}
                                                    disabled={isSeguradoraPreenchida}
                                                    className="w-full p-2 pl-8 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500 text-right"
                                                />
                                            </div>
                                        </div>

                                        {/* Parcelamento (Select) */}
                                        <div className="col-span-2">
                                            <label className="text-xs font-semibold text-gray-600 block mb-1">Parcelamento</label>
                                            <select
                                                value={valores[`${lead.ID}`]?.Parcelamento || ''}
                                                onChange={(e) => handleParcelamentoChange(lead.ID, e.target.value)}
                                                disabled={isSeguradoraPreenchida}
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
                                        <label htmlFor={`vigencia-inicio-${lead.ID}`} className="text-xs font-semibold text-gray-600 block mb-1">Início</label>
                                        <input
                                            id={`vigencia-inicio-${lead.ID}`}
                                            type="date"
                                            value={vigencia[`${lead.ID}`]?.inicio || ''}
                                            onChange={(e) => handleVigenciaInicioChange(lead.ID, e.target.value)}
                                            disabled={isSeguradoraPreenchida}
                                            className="w-full p-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 disabled:cursor-not-allowed transition duration-150 focus:ring-green-500 focus:border-green-500"
                                        />
                                    </div>

                                    {/* Vigência Final (Readonly) */}
                                    <div className="mb-6">
                                        <label htmlFor={`vigencia-final-${lead.ID}`} className="text-xs font-semibold text-gray-600 block mb-1">Término (Automático)</label>
                                        <input
                                            id={`vigencia-final-${lead.ID}`}
                                            type="date"
                                            value={vigencia[`${lead.ID}`]?.final || ''}
                                            readOnly
                                            disabled={true}
                                            className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-100 cursor-not-allowed"
                                        />
                                    </div>

                                    {/* Botão de Ação */}
                                    {!isSeguradoraPreenchida ? (
                                        <button
                                            onClick={async () => {
                                                await onConfirmInsurer(
                                                    lead.ID,
                                                    valores[`${lead.ID}`]?.PremioLiquido === null ? null : valores[`${lead.ID}`]?.PremioLiquido / 100,
                                                    valores[`${lead.ID}`]?.insurer, // Valor da seguradora local
                                                    parseFloat(String(valores[`${lead.ID}`]?.Comissao || '0').replace(',', '.')),
                                                    valores[`${lead.ID}`]?.Parcelamento,
                                                    vigencia[`${lead.ID}`]?.inicio,
                                                    vigencia[`${lead.ID}`]?.final,
                                                    // Meio de Pagamento e Cartão Porto Novo na Confirmação
                                                    valores[`${lead.ID}`]?.MeioPagamento || '',
                                                    valores[`${lead.ID}`]?.CartaoPortoNovo || ''
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
