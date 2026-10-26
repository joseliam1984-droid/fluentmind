import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'
import { logout } from '@/features/auth/services/authService'

const navItems = [
  { label: 'Traducir', icon: '🌐', path: '/translate', comingSoon: false },
  { label: 'Llamadas', icon: '📞', path: '/calls', comingSoon: false },
  { label: 'Vocabulario', icon: '📖', path: '/vocab', comingSoon: false },
  { label: 'Perfil', icon: '👤', path: '/profile', comingSoon: false },
]

export default function RootLayout() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <div className="flex flex-col min-h-dvh bg-neutral-950 text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧠</span>
          <h1 className="text-lg font-semibold tracking-tight">FluentMind</h1>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-neutral-400 hidden sm:block truncate max-w-40">
              {user.displayName || user.email}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
            title="Cerrar sesión"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="flex border-t border-neutral-800 bg-neutral-950">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            disabled={item.comingSoon}
            title={item.comingSoon ? 'Próximamente' : undefined}
            className="flex flex-col items-center gap-0.5 flex-1 py-2 text-xs text-neutral-500 hover:text-white transition-colors disabled:opacity-40 disabled:hover:text-neutral-500 disabled:cursor-not-allowed"
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
