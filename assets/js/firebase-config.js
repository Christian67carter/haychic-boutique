// HAYCHIC Boutique — shared Firebase setup.
// Loaded after the firebase-app/firestore/auth compat SDK <script> tags.
const firebaseConfig = {
  apiKey: "AIzaSyAoHJvYgKl0Z6Gok71OCmyoFPmFLHTXOJw",
  authDomain: "haychic-boutique.firebaseapp.com",
  projectId: "haychic-boutique",
  storageBucket: "haychic-boutique.firebasestorage.app",
  messagingSenderId: "1031594771270",
  appId: "1:1031594771270:web:5b8d88b0a05b0f291b5b47"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();
