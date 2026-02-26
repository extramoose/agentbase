export default function GroceryLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 bg-muted rounded w-32" />
        <div className="h-9 bg-muted rounded w-28" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="space-y-2">
            <div className="h-5 bg-muted rounded w-24" />
            <div className="h-10 bg-muted rounded-lg" />
            <div className="h-10 bg-muted rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
