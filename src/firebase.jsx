// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// se quiser analytics:
// import { getAnalytics } from "firebase/analytics";

// Pegando as variáveis do Vite (import.meta.env)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID // opcional
};

if (!firebaseConfig.apiKey) {
  console.warn("VITE_FIREBASE_API_KEY não definido — verifique variáveis de ambiente");
}

const app = initializeApp(firebaseConfig);

// Exporte os módulos que for usar no app:
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
// export const analytics = getAnalytics(app);

export default app;
