interface EntityGridProps {
  children: React.ReactNode
  columns?: number
}

export function EntityGrid({ children, columns = 3 }: EntityGridProps) {
  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      }}
    >
      {children}
    </div>
  )
}
