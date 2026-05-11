import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import type { JSX } from 'react'
import { cn } from '@renderer/lib/utils'

export function ScrollArea({
  className,
  children,
  ...props
}: ScrollAreaPrimitive.ScrollAreaProps): JSX.Element {
  return (
    <ScrollAreaPrimitive.Root className={cn('overflow-hidden', className)} {...props}>
      <ScrollAreaPrimitive.Viewport className="h-full w-full">{children}</ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        className="flex touch-none select-none bg-transparent p-0.5"
        orientation="vertical"
      >
        <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-muted-foreground/30" />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  )
}
