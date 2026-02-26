export default function Loading() {
  return (
    <div className="p-8 space-y-4 animate-pulse">
      <div className="h-8 bg-muted rounded w-48" />
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-xl" />)}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-32 bg-muted rounded-xl" />)}
      </div>
    </div>
  )
}
