export default function CrmLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 bg-muted rounded w-24" />
        <div className="flex gap-2">
          <div className="h-9 bg-muted rounded w-28" />
          <div className="h-9 bg-muted rounded w-28" />
        </div>
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-14 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  )
}
