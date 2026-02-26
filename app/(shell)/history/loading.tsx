export default function HistoryLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 bg-muted rounded w-28" />
        <div className="h-9 bg-muted rounded w-32" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="h-12 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  )
}
