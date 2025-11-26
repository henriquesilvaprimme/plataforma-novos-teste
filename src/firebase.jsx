// Importa as funções do SDK
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Configuração do Firebase (copie do painel do Firebase)
const firebaseConfig = {
  apiKey: "AIzaSyAMLDTyqFCQhfll1yPMxUtttgjIxCisIP4",
  authDomain: "painel-de-leads-novos.firebaseapp.com",
  projectId: "painel-de-leads-novos",
  storageBucket: "painel-de-leads-novos.firebasestorage.app",
  messagingSenderId: "630294246900",
  appId: "1:630294246900:web:764b52308c2ffa805175a1"
};

// Inicializa o app Firebase
const app = initializeApp(firebaseConfig);

// Exporta o banco Firestore
export const db = getFirestore(app);
