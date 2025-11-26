// src/services/leads.js
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const leadsCollection = collection(db, "leads");

/**
 * cria um lead simples no Firestore
 * leadObj: { nome, email, telefone, plano, observacoes }
 */
export async function criarLead(leadObj) {
  try {
    const docRef = await addDoc(leadsCollection, {
      ...leadObj,
      status: "novo",
      createdAt: serverTimestamp()
    });
    return { id: docRef.id };
  } catch (err) {
    console.error("Erro ao criar lead:", err);
    throw err;
  }
}
