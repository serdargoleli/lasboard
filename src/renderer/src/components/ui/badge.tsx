import * as React from 'react'
import type { JSX } from 'react'
import { cn } from '@renderer/lib/utils'

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded border border-border px-1.5 text-[11px] font-medium text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}
