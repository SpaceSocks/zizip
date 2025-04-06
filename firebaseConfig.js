// Import the necessary functions from the Firebase SDK
// Using the CDN URLs for direct browser import
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBNl4-fwt3BoZ-ERO1JUOo8cFwrqndlU_k",
  authDomain: "zipzip-d8d69.firebaseapp.com",
  projectId: "zipzip-d8d69",
  storageBucket: "zipzip-d8d69.firebasestorage.app", // Your confirmed value
  messagingSenderId: "331899133054",
  appId: "1:331899133054:web:19a3a18e212caa7bf6cc2f",
  measurementId: "G-Z9SPKPG8JG"
};

// Initialize Firebase Core App
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and Firestore
const auth = getAuth(app);
const db = getFirestore(app);

// Export the initialized services so other parts of our game can use them
export { app, auth, db };

console.log("Firebase Initialized:", app.name); // For debugging
