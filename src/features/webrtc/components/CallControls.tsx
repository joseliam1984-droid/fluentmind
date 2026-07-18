interface CallControlsProps {
  onStartCall?: () => void
  onEndCall?: () => void
  disabled?: boolean
}

export default function CallControls({ disabled }: CallControlsProps) {
  return (
    <div className="flex items-center justify-center gap-4 p-4">
      <button
        disabled={disabled}
        className="w-14 h-14 rounded-full bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white text-xl transition-colors"
        aria-label="Iniciar llamada"
      >
        📞
      </button>
      <button
        disabled={disabled}
        className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white text-xl transition-colors"
        aria-label="Finalizar llamada"
      >
        ✕
      </button>
    </div>
  )
}
