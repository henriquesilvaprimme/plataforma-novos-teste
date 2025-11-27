import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, RefreshCcw } from 'lucide-react';
import { db } from '../firebase';
import {
  collection,
  getDocs,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

const GerenciarUsuarios = () => {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [senhaVisivel, setSenhaVisivel] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  const normalizeUser = (docId, data = {}) => {
    return {
      id: String(docId),
      usuario: data.usuario ?? data.login ?? data.user ?? '',
      nome: data.nome ?? data.name ?? '',
      email: data.email ?? '',
      senha: data.senha ?? data.password ?? '',
      status: data.status ?? 'Ativo',
      tipo: data.tipo ?? data.type ?? 'Usuario',
      // mantém todos os dados brutos caso precise
      ...data,
    };
  };

  // listener em tempo real
  useEffect(() => {
    setLoading(true);
    setError(null);

    try {
      const collRef = collection(db, 'usuarios');
      const unsub = onSnapshot(
        collRef,
        (snapshot) => {
          const lista = snapshot.docs.map((d) => normalizeUser(d.id, d.data()));

          // opcional: ordena por id (ou outro campo) — aqui por nome
          lista.sort((a, b) => {
            const na = (a.nome || '').toLowerCase();
            const nb = (b.nome || '').toLowerCase();
            return na.localeCompare(nb);
          });

          setUsuarios(lista);
          setLoading(false);
          setIsRefreshing(false);
        },
        (err) => {
          console.error('Erro no listener de usuarios:', err);
          setError('Erro ao carregar usuários. Tente novamente mais tarde.');
          setLoading(false);
          setIsRefreshing(false);
        }
      );

      return () => unsub();
    } catch (err) {
      console.error('Erro ao iniciar listener de usuarios:', err);
      setError('Erro ao carregar usuários. Tente novamente mais tarde.');
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // fetch manual (para o botão de refresh)
  const fetchUsuariosFromFirebase = async () => {
    setError(null);
    setIsRefreshing(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'usuarios'));
      const lista = [];
      querySnapshot.forEach((docSnap) => {
        lista.push(normalizeUser(docSnap.id, docSnap.data()));
      });

      lista.sort((a, b) => {
        const na = (a.nome || '').toLowerCase();
        const nb = (b.nome || '').toLowerCase();
        return na.localeCompare(nb);
      });

      setUsuarios(lista);
    } catch (err) {
      console.error('Erro ao buscar usuários do Firebase:', err);
      setError('Erro ao carregar usuários. Tente novamente mais tarde.');
      setUsuarios([]);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchUsuariosFromFirebase();
  };

  // Atualiza status/tipo do usuário (usa updateDoc no Firebase)
  const atualizarStatusUsuario = async (id, novoStatus = null, novoTipo = null) => {
    const usuarioIndex = usuarios.findIndex((u) => String(u.id) === String(id));
    if (usuarioIndex === -1) {
      console.warn(`Usuário com ID ${id} não encontrado localmente para atualização.`);
      return;
    }

    const usuarioAtual = usuarios[usuarioIndex];
    const novoEstadoUsuario = { ...usuarioAtual };
    if (novoStatus !== null) novoEstadoUsuario.status = novoStatus;
    if (novoTipo !== null) novoEstadoUsuario.tipo = novoTipo;

    // Atualização otimista local
    setUsuarios((prev) =>
      prev.map((u, idx) => (idx === usuarioIndex ? novoEstadoUsuario : u))
    );

    try {
      const userRef = doc(db, 'usuarios', String(id));
      const dataToUpdate = {};
      if (novoStatus !== null) dataToUpdate.status = novoStatus;
      if (novoTipo !== null) dataToUpdate.tipo = novoTipo;
      dataToUpdate.updatedAt = serverTimestamp();

      await updateDoc(userRef, dataToUpdate);
      // sucesso — o listener onSnapshot manterá tudo sincronizado
    } catch (err) {
      console.error('Erro ao atualizar usuário no Firebase:', err);
      alert('Erro ao atualizar usuário. Por favor, tente novamente.');

      // Reverte a alteração local em caso de erro
      setUsuarios((prev) =>
        prev.map((u, idx) => (idx === usuarioIndex ? usuarioAtual : u))
      );
    }
  };

  const handleToggleStatus = (id, statusAtual) => {
    const novoStatus = statusAtual === 'Ativo' ? 'Inativo' : 'Ativo';
    atualizarStatusUsuario(id, novoStatus);
  };

  const handleToggleTipo = (id, tipoAtual) => {
    const novoTipo = tipoAtual === 'Admin' ? 'Usuario' : 'Admin';
    atualizarStatusUsuario(id, null, novoTipo);
  };

  const toggleVisibilidadeSenha = (id) => {
    setSenhaVisivel((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-20 w-20 border-t-2 border-b-2 border-indigo-500"></div>
        <p className="ml-4 text-lg text-gray-700">Carregando usuários...</p>
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-center text-red-600 font-medium text-lg">{error}</div>;
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-3xl font-bold text-indigo-700">Gerenciar Usuários</h2>
        <button
          title="Clique para atualizar os dados"
          onClick={handleRefresh}
          className="p-2 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-all duration-200 ease-in-out flex items-center justify-center shadow-sm"
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <svg className="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <RefreshCcw size={20} />
          )}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg shadow-md">
          <thead className="bg-indigo-100">
            <tr>
              <th className="py-3 px-6 text-left">ID</th>
              <th className="py-3 px-6 text-left">Nome</th>
              <th className="py-3 px-6 text-left">Usuário</th>
              <th className="py-3 px-6 text-left">E-mail</th>
              <th className="py-3 px-6 text-left">Senha</th>
              <th className="py-3 px-6 text-left">Status</th>
              <th className="py-3 px-6 text-left">Tipo</th>
              <th className="py-3 px-6 text-left">Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.length > 0 ? (
              usuarios.map((usuario) => (
                <tr key={usuario.id} className="border-b hover:bg-gray-50 transition">
                  <td className="py-3 px-6">{usuario.id}</td>
                  <td className="py-3 px-6">{usuario.nome}</td>
                  <td className="py-3 px-6">{usuario.usuario}</td>
                  <td className="py-3 px-6">{usuario.email}</td>
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-2">
                      <input
                        type={senhaVisivel[usuario.id] ? 'text' : 'password'}
                        value={usuario.senha}
                        readOnly
                        className="border rounded px-2 py-1 w-32 text-sm"
                      />
                      <button
                        onClick={() => toggleVisibilidadeSenha(usuario.id)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        {senhaVisivel[usuario.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-6">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        usuario.status === 'Ativo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {usuario.status}
                    </span>
                  </td>
                  <td className="py-3 px-6">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        usuario.tipo === 'Admin' ? 'bg-blue-100 text-blue-700' : ''
                      }`}
                    >
                      {usuario.tipo === 'Admin' ? 'Admin' : 'Usuário Comum'}
                    </span>
                  </td>
                  <td className="py-3 px-6 flex gap-4 items-center">
                    <button
                      onClick={() => handleToggleStatus(usuario.id, usuario.status)}
                      className={`px-4 py-2 rounded-lg font-medium ${
                        usuario.status === 'Ativo'
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-green-500 text-white hover:bg-green-600'
                      } transition`}
                    >
                      {usuario.status === 'Ativo' ? 'Desativar' : 'Ativar'}
                    </button>
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        checked={usuario.tipo === 'Admin'}
                        onChange={() => handleToggleTipo(usuario.id, usuario.tipo)}
                        className="form-checkbox h-4 w-4 text-blue-600"
                      />
                      Admin
                    </label>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="py-6 text-center text-gray-600 text-lg">Nenhum usuário encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GerenciarUsuarios;
