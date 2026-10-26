import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/components/AuthProvider'
import { useAuth } from '@/features/auth/hooks/useAuth'
import RootLayout from '@/layouts/RootLayout'
import Dashboard from '@/pages/Dashboard'
import ProfilePage from '@/pages/ProfilePage'
import CallsPage from '@/features/calls/pages/CallsPage'
import LoginPage from '@/features/auth/pages/LoginPage'
import TranslatePage from '@/features/translation/TranslatePage'
import VocabularyPage from '@/features/vocabulary/VocabularyPage'

function AuthGate() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-neutral-950">
        <div className="text-center">
          <div className="animate-pulse text-6xl mb-4">🧠</div>
          <p className="text-neutral-500 text-sm">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/translate" element={<TranslatePage />} />
        <Route path="/vocab" element={<VocabularyPage />} />
        <Route path="/calls" element={<CallsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
