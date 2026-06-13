// firebase-config.js
// Fill in your Firebase Project details below to connect to a live Firebase instance.
// If apiKey is empty or contains PLACEHOLDER, the system automatically falls back to Demo Mode (localStorage).

export const firebaseConfig = {
  apiKey: "AIzaSyBRmPs_88ze07LzYjsX6tKEFhyqdbBDXuU",
  authDomain: "cosmoteam-5acc5.firebaseapp.com",
  projectId: "cosmoteam-5acc5",
  storageBucket: "cosmoteam-5acc5.firebasestorage.app",
  messagingSenderId: "706721429290",
  appId: "1:706721429290:web:e260c2a36aa602b8f89053",
  measurementId: "G-042JDNWCLD"
};

// Automatically determine if we should run in demo mode (local storage)
export const isDemoMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("YOUR_API_KEY") || firebaseConfig.apiKey === "";
