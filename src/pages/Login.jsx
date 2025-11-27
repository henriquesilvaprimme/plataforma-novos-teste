import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

export default function Login() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro("");
    if (!usuario || !senha) {
      setErro("Preencha usuário e senha.");
      return;
    }

    setLoading(true);

    try {
      const usuariosRef = collection(db, "usuarios");
      const q = query(
        usuariosRef,
        where("usuario", "==", usuario),
        where("senha", "==", senha),
        where("status", "==", "Ativo")
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // Pegamos o primeiro documento que bateu com a consulta
        const docSnap = querySnapshot.docs[0];
        const userData = { id: docSnap.id, ...docSnap.data() };

        // Marca autenticação localmente (ajuste conforme seu fluxo)
        localStorage.setItem("auth", "true");
        localStorage.setItem("user", JSON.stringify(userData));

        navigate("/dashboard");
      } else {
        setErro("Usuário, senha ou status inválidos.");
      }
    } catch (err) {
      console.error("Erro ao consultar usuários no Firebase:", err);
      setErro("Erro ao processar login. Tente novamente mais tarde.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>
        {erro && <p className="text-red-500 text-sm mb-4">{erro}</p>}
        <input
          type="text"
          placeholder="Usuário"
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          className="w-full px-4 py-2 border rounded mb-4"
          required
        />
        <input
          type="password"
          placeholder="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full px-4 py-2 border rounded mb-4"
          required
        />
        <button
          type="submit"
          className={`w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-60`}
          disabled={loading}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
