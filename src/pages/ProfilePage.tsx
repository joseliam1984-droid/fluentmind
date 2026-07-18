import { useAuth } from '@/features/auth/hooks/useAuth'
import { logout } from '@/features/auth/services/authService'
import { useNavigate } from 'react-router-dom'

export default function ProfilePage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <div className="flex flex-col items-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-full bg-neutral-800 flex items-center justify-center text-3xl mb-4">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="w-20 h-20 rounded-full"
              />
            ) : (
              '👤'
            )}
          </div>
          <h2 className="text-xl font-bold">
            {user?.displayName || 'Usuario'}
          </h2>
          <p className="text-sm text-neutral-500">{user?.email}</p>
        </div>

        {/* Info */}
        <div className="space-y-3 mb-8">
          <div className="flex justify-between py-3 px-4 rounded-xl bg-neutral-900 border border-neutral-800">
            <span className="text-neutral-500">Nombre</span>
            <span>{user?.displayName || '—'}</span>
          </div>
          <div className="flex justify-between py-3 px-4 rounded-xl bg-neutral-900 border border-neutral-800">
            <span className="text-neutral-500">Correo</span>
            <span className="text-sm">{user?.email || '—'}</span>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full py-3 px-6 rounded-xl bg-red-900/30 text-red-400 border border-red-800/50 font-medium hover:bg-red-900/50 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
