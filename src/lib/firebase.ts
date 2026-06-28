import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, doc, getDocFromServer } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD6fEZF2VucKTPh0Y7ou2XU57nYVtLSgQc",
  authDomain: "zippy-precinct-qwrl4.firebaseapp.com",
  projectId: "zippy-precinct-qwrl4",
  storageBucket: "zippy-precinct-qwrl4.firebasestorage.app",
  messagingSenderId: "1061648037020",
  appId: "1:1061648037020:web:cc199dd6c7a47cceee6959"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
const auth = getAuth(app);

// Initialize Firestore with custom database ID and long-polling to prevent WebSocket errors in sandboxed iframes
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, "ai-studio-d4852645-8fad-4847-99da-15e429eda0b7");

// Initialize Firebase Storage
const storage = getStorage(app);

// Validate Connection to Firestore on boot (as required by firebase-integration skill)
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firebase connection verified successfully.");
  } catch (error) {
    if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('Could not reach Cloud Firestore backend'))) {
      console.warn("Please check your Firebase configuration: Client is currently operating in offline cache mode.");
    } else {
      console.log("Firestore connection test completed (ignore permission-denied for non-existent test doc).");
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export { app, auth, db, storage };
