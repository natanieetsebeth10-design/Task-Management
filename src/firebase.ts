import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { environment } from './environments/environment';
const firebaseConfig = {//API key stuff
  apiKey: "AIzaSyDt5tBvea66N5bz5gljxTf40OrzGP_dlpg",
  authDomain: "task-management-app-4a42e.firebaseapp.com",
  projectId: "task-management-app-4a42e",
  storageBucket: "task-management-app-4a42e.firebasestorage.app",
  messagingSenderId: "180963241731",
  appId: "1:180963241731:web:df75c573f05ee8f8608336",
  measurementId: "G-W9EMZX70M0"
};
export const app = initializeApp(environment.firebase);
export const auth = getAuth(app);
export const db = getFirestore(app);
// This creates an Authentication service for your Firebase app and this creates a connection to Cloud Firestore, Firebase's NoSQL database.