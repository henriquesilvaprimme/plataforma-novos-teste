import { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { getApp } from 'firebase/app';

type User = { uid: string; tipo: 'Admin' | 'Usuario' | string };
type Lead = { id: string; usuarioId: string; [key: string]: any };

export function useLeadsFechadosRealtimeTS(user?: User) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setLeads([]);
      setLoading(false);
      return;
    }

    const db = getFirestore(getApp());
    const col = collection(db, 'leadsFechados');
    let q;

    if (user.tipo === 'Admin') {
      q = query(col, orderBy('closedAt', 'desc'));
    } else if (user.tipo === 'Usuario') {
      q = query(col, where('usuarioId', '==', user.uid), orderBy('closedAt', 'desc'));
    } else {
      setLeads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(q,
      snapshot => {
        const items: Lead[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Lead));
        setLeads(items);
        setLoading(false);
      },
      err => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return { leads, loading, error };
}
