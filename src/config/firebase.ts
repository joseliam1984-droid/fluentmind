import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyDGWI26p3INJX5hAqY1Egvyppt1wPn0WFs",
  authDomain: 'fluentmind-43693.firebaseapp.com',
  projectId: 'fluentmind-43693',
  storageBucket: 'fluentmind-43693.firebasestorage.app',
  messagingSenderId: '31323709750',
  appId: '1:31323709750:web:8e86ddfbb5711938005397',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export default app
