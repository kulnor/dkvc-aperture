"use client"

import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { CheckIcon, ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Menu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />
}

function MenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

function MenuContent({ className, children, ...props }: MenuPrimitive.Popup.Props) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner sideOffset={4} align="end" className="z-50 outline-none">
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            "min-w-40 overflow-hidden rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
            className
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function MenuItem({
  className,
  inset,
  icon,
  children,
  ...props
}: MenuPrimitive.Item.Props & { inset?: boolean; icon?: React.ReactNode }) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-muted data-highlighted:text-foreground",
        // Reserve the same left gutter as checkbox/radio items so every row's
        // text aligns; a leading icon sits in that gutter rather than inline.
        inset || icon ? "pl-7" : "pl-2",
        className
      )}
      {...props}
    >
      {icon ? <span className="absolute left-2 flex items-center">{icon}</span> : null}
      {children}
    </MenuPrimitive.Item>
  )
}

function MenuSubmenu({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="menu-submenu" {...props} />
}

function MenuSubmenuTrigger({
  className,
  inset,
  icon,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & { inset?: boolean; icon?: React.ReactNode }) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="menu-submenu-trigger"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-muted data-highlighted:text-foreground data-[popup-open]:bg-muted data-[popup-open]:text-foreground",
        inset || icon ? "pl-7" : "pl-2",
        className
      )}
      {...props}
    >
      {icon ? <span className="absolute left-2 flex items-center">{icon}</span> : null}
      {children}
      <ChevronRightIcon className="ml-auto size-3.5 text-muted-foreground" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function MenuSubmenuContent({ className, children, ...props }: MenuPrimitive.Popup.Props) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        side="right"
        align="start"
        sideOffset={4}
        className="z-50 outline-none"
      >
        <MenuPrimitive.Popup
          data-slot="menu-submenu-content"
          className={cn(
            "min-w-40 overflow-hidden rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
            className
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function MenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="menu-radio-group" {...props} />
}

function MenuRadioItem({ className, children, ...props }: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="menu-radio-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-2 pl-7 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-muted data-highlighted:text-foreground",
        className
      )}
      {...props}
    >
      <MenuPrimitive.RadioItemIndicator className="absolute left-2 flex items-center">
        <CheckIcon className="size-3.5" />
      </MenuPrimitive.RadioItemIndicator>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

function MenuCheckboxItem({ className, children, ...props }: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="menu-checkbox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-2 pl-7 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-muted data-highlighted:text-foreground",
        className
      )}
      {...props}
    >
      <MenuPrimitive.CheckboxItemIndicator className="absolute left-2 flex items-center">
        <CheckIcon className="size-3.5" />
      </MenuPrimitive.CheckboxItemIndicator>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function MenuGroupLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="menu-group-label"
      className={cn("px-2 py-1 text-[10px] text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSubmenu,
  MenuSubmenuTrigger,
  MenuSubmenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuCheckboxItem,
  MenuSeparator,
  MenuGroupLabel,
}
