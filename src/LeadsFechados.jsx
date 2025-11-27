// src/LeadsFechados.jsx
import React, { useEffect, useState } from 'react';
import { getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot
} from 'firebase/firestore';

/**
 * Componente que lista leads fechados.
 * Props:
 * - currentUser: objeto do usuário { uid: string, tipo: 'Admin' | 'Usuario' }
 *
 * Regras:
 * - Admin vê todos os documentos de 'leadsFechados'
 * - Usuario vê apenas documentos com campo usuarioId igual ao seu uid
 */
export default function LeadsFechados({ currentUser }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Se não houver usuário logado, limpa e retorna
    if (!currentUser) {
      setLeads([]);
      setLoading(false);
      return;
    }

    const app = getApp(); // pressupõe que firebase já foi inicializado em outro lugar
    const db = getFirestore(app);
    const colRef = collection(db, 'leadsFechados');

    let q;
    if (currentUser.tipo === 'Admin') {
      // Admin: traz todos
      q = query(colRef, orderBy('closedAt', 'desc'));
    } else if (currentUser.tipo === 'Usuario') {
      // Usuário comum: apenas os leads do próprio usuarioId
      q = query(colRef, where('usuarioId', '==', currentUser.uid), orderBy('closedAt', 'desc'));
    } else {
      // Outros tipos: nenhuma leitura por padrão
      setLeads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setLeads(items);
        setLoading(false);
      },
      (err) => {
        console.error('Erro ao escutar leadsFechados:', err);
        setError(err);
        setLoading(false);
      }
    );

    // cleanup
    return () => unsubscribe();
  }, [currentUser]);

  if (loading) return <div>Carregando leads fechados...</div>;
  if (error) return <div>Erro ao carregar leads: {String(error.message || error)}</div>;
  if (!leads.length) return <div>Nenhum lead fechado encontrado.</div>;

  return (
    <div>
      <h2>Leads Fechados</h2>
      <ul>
        {leads.map((lead) => (
          <li key={lead.id} style={{ marginBottom: 12 }}>
            <strong>{lead.nome || lead.title || 'Sem título'}</strong>
            <div>id: {lead.id}</div>
            <div>usuarioId: {lead.usuarioId}</div>
            {lead.closedAt && (
              <div>Fechado em: {new Date(lead.closedAt.seconds ? lead.closedAt.seconds * 1000 : lead.closedAt).toLocaleString()}</div>
            )}
            {/* Exiba outros campos conforme necessário */}
          </li>
        ))}
      </ul>
    </div>
  );
}
