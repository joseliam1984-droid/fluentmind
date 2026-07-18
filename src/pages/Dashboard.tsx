import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/features/auth/hooks/useAuth'

const quickActions = [
  { icon: '🌐', label: 'Traducir', path: '/' },
  { icon: '📞', label: 'Llamadas', path: '/calls' },
  { icon: '📖', label: 'Vocabulario', path: '/vocab' },
  { icon: '👤', label: 'Perfil', path: '/profile' },
]

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      {/* User info */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center text-2xl mb-3 overflow-hidden">
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
          ) : (
            '👤'
          )}
        </div>
        <h2 className="text-xl font-bold">{user?.displayName || 'Usuario'}</h2>
        <p className="text-sm text-neutral-500">{user?.email}</p>
      </div>

      {/* Quick actions */}
      <div className="w-full max-w-sm">
        <p className="text-neutral-500 mb-6">
          Tu asistente de comunicación con IA
        </p>

        <div className="grid grid-cols-2 gap-4">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition-colors"
            >
              <span className="text-3xl">{action.icon}</span>
              <span className="text-sm font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
