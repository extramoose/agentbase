export default function EssaysLoading() {
  return (
    <div className="flex h-full animate-pulse">
      <div className="w-80 border-r border-border p-4 space-y-3">
        <div className="h-8 bg-muted rounded w-full" />
        <div className="h-9 bg-muted rounded w-full" />
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-20 bg-muted rounded" />
        ))}
      </div>
      <div className="flex-1 p-6 space-y-4">
        <div className="h-8 bg-muted rounded w-64" />
        <div className="h-6 bg-muted rounded w-48" />
        <div className="h-96 bg-muted rounded" />
      </div>
    </div>
  )
}
