export default function LibraryLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 bg-muted rounded w-28" />
        <div className="flex gap-2">
          <div className="h-9 bg-muted rounded w-24" />
          <div className="h-9 bg-muted rounded w-28" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-36 bg-muted rounded-xl" />
        ))}
      </div>
    </div>
  )
}
