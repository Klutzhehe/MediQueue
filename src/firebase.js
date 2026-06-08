// =====================================================
// FIREBASE CONFIGURATION
// =====================================================
// Replace the values below with your actual Firebase project config.
// You can find these in Firebase Console > Project Settings > Your apps
// IMPORTANT: Make sure to set the databaseId to "components"
// =====================================================

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCp6hXvAAhZoPTJQHfP6rIUJeyAQsarw0g",
  authDomain: "circuitcraft-emporium.firebaseapp.com",
  projectId: "circuitcraft-emporium",
  storageBucket: "circuitcraft-emporium.firebasestorage.app",
  messagingSenderId: "581211443696",
  appId: "1:581211443696:web:7559e2d40117b86f13b9f5",
};

const app = initializeApp(firebaseConfig);

// Connect to the "components" Firestore database as specified by user
export const db = getFirestore(app, "components");
console.log("🔥 Firestore Initialized:", db ? "SUCCESS (components)" : "FAILED");
export const auth = getAuth(app);
export default app;
