// Firebase is loaded lazily so local/offline play can boot without CDN access.
const productionAuthHostnames = new Set([
  "cosmiczip.net",
  "www.cosmiczip.net"
]);

const authDomain = productionAuthHostnames.has(window.location.hostname)
  ? "cosmiczip.net"
  : "zipzip-d8d69.firebaseapp.com";

const firebaseConfig = {
  apiKey: "AIzaSyBNl4-fwt3BoZ-ERO1JUOo8cFwrqndlU_k",
  authDomain,
  projectId: "zipzip-d8d69",
  storageBucket: "zipzip-d8d69.firebasestorage.app",
  messagingSenderId: "331899133054",
  appId: "1:331899133054:web:19a3a18e212caa7bf6cc2f",
  measurementId: "G-Z9SPKPG8JG"
};

let servicesPromise = null;

export async function getFirebaseServices() {
  if (!servicesPromise) {
    servicesPromise = (async () => {
      const [{ initializeApp }, { getAuth, useDeviceLanguage }, { getFirestore }] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"),
        import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js")
      ]);

      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);
      useDeviceLanguage(auth);
      const db = getFirestore(app);

      console.log("Firebase initialized:", app.name);
      return { app, auth, db };
    })().catch((error) => {
      servicesPromise = null;
      throw error;
    });
  }

  return servicesPromise;
}
