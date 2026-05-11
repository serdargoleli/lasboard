import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { JSX } from 'react'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export function TooltipContent(props: TooltipPrimitive.TooltipContentProps): JSX.Element {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className="z-50 rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        sideOffset={6}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}
