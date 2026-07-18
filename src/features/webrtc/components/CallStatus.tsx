interface CallStatusProps {
  status?: string
}

export default function CallStatus({ status }: CallStatusProps) {
  return (
    <div className="text-center py-2">
      <p className="text-sm text-neutral-500">
        {status || 'Sin llamada activa'}
      </p>
    </div>
  )
}
