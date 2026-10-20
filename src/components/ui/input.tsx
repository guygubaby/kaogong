import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-12 w-full rounded-xl border border-input bg-background px-4 text-sm transition-shadow outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        className,
      )}
      {...props}
    />
  )
}
