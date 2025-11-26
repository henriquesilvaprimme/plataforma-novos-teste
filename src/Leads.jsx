import React, { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

const Leads = () => {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregarLeads() {
      try {
        const querySnapshot = await getDocs(collection(db, "leads"));
        const lista = [];

        querySnapshot.forEach((doc) => {
          lista.push({
            id: doc.id,
            ...doc.data(),
          });
        });

        setLeads(lista);
      } catch (error) {
        console.error("Erro ao buscar leads:", error);
      } finally {
        setLoading(false);
      }
    }

    carregarLeads();
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Leads Cadastrados</h1>

      {loading ? (
        <p>Carregando leads...</p>
      ) : leads.length === 0 ? (
        <p>Nenhum lead encontrado.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {leads.map((lead) => (
            <li
              key={lead.id}
              style={{
                background: "#f4f4f4",
                padding: "15px",
                marginBottom: "10px",
                borderRadius: "8px",
              }}
            >
              <p><strong>Nome:</strong> {lead.nome}</p>
              <p><strong>Modelo do Veículo:</strong> {lead.modeloVeiculo}</p>
              <p><strong>Ano/Modelo:</strong> {lead.anoModelo}</p>
              <p><strong>Cidade:</strong> {lead.cidade}</p>
              <p><strong>Telefone:</strong> {lead.telefone}</p>
              <p><strong>Tipo de Seguro:</strong> {lead.tipoSeguro}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Leads;
