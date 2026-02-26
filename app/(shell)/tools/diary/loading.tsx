export default function DiaryLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 bg-muted rounded w-40" />
        <div className="flex gap-2">
          <div className="h-9 bg-muted rounded w-9" />
          <div className="h-9 bg-muted rounded w-9" />
        </div>
      </div>
      <div className="h-64 bg-muted rounded-xl" />
    </div>
  )
}
