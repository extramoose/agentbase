'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface DateInputProps extends Omit<React.ComponentProps<typeof Input>, 'type'> {}

function DateInput({ className, onChange, ...props }: DateInputProps) {
  const todayStr = new Date().toISOString().split('T')[0]

  const handleToday = () => {
    onChange?.({ target: { value: todayStr } } as React.ChangeEvent<HTMLInputElement>)
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="date"
        onChange={onChange}
        className={cn(
          '[&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100',
          className,
        )}
        {...props}
      />
      <button
        type="button"
        onClick={handleToday}
        className="shrink-0 text-xs px-2 py-1.5 rounded-md border border-input text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        Today
      </button>
    </div>
  )
}

export { DateInput }
