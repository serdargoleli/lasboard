import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import type { JSX } from 'react'
import { cn } from '@renderer/lib/utils'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export function DropdownMenuContent({
  className,
  ...props
}: DropdownMenuPrimitive.DropdownMenuContentProps): JSX.Element {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        className={cn(
          'z-50 min-w-36 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg',
          className
        )}
        sideOffset={6}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  className,
  ...props
}: DropdownMenuPrimitive.DropdownMenuItemProps): JSX.Element {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'flex h-8 cursor-default select-none items-center rounded px-2 text-sm outline-none focus:bg-muted',
        className
      )}
      {...props}
    />
  )
}
