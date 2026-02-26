export default function MeetingsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 bg-muted rounded w-36" />
        <div className="h-9 bg-muted rounded w-32" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-20 bg-muted rounded-lg" />
        ))}
      </div>
    </div>
  )
}
