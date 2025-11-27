// Import the functions you need from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDL34igUlLH0EE_PI2oKUey-lRXwCSePPI",
  authDomain: "black-iris-fleet.firebaseapp.com",
  projectId: "black-iris-fleet",
  storageBucket: "black-iris-fleet.firebasestorage.app",
  messagingSenderId: "731321972770",
  appId: "1:731321972770:web:9e6661dc622c82a801f27b",
  measurementId: "G-6K1PGMXLX7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Export services so admin.html can use them
export { app, auth, db, storage };


