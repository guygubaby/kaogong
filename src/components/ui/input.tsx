import type { ComponentProps } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
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
type SelectProps = Omit<
  ComponentProps<typeof SelectPrimitive.Trigger>,
  'value' | 'onChange' | 'children'
> & {
  value: string
  onValueChange: (value: string) => void
  options: readonly { value: string; label: string; disabled?: boolean }[]
  placeholder?: string
  name?: string
  required?: boolean
  size?: 'default' | 'compact'
}
export function Select({
  value,
  onValueChange,
  options,
  placeholder = '请选择',
  name,
  required,
  disabled,
  size = 'default',
  className,
  ...props
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      name={name}
      required={required}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        className={cn(
          'group flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-input bg-background px-3.5 text-left text-sm transition-colors outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground data-[state=open]:border-primary/40 data-[state=open]:bg-secondary [&>span:first-child]:truncate',
          size === 'compact'
            ? 'h-9 border-transparent bg-secondary text-xs text-primary'
            : 'h-11',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            size={15}
            className="shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className="z-100 max-h-(--radix-select-content-available-height) max-w-[min(32rem,calc(100vw-1.5rem))] min-w-(--radix-select-trigger-width) overflow-hidden rounded-2xl border border-border bg-background p-1.5 shadow-xl shadow-primary/10"
        >
          <SelectPrimitive.ScrollUpButton className="flex h-7 items-center justify-center text-muted-foreground">
            <ChevronUp size={14} />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-0.5">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex min-h-10 cursor-default items-center rounded-xl py-2.5 pr-10 pl-3 text-sm leading-5 text-foreground outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-muted data-[state=checked]:bg-primary/8 data-[state=checked]:text-primary"
              >
                <SelectPrimitive.ItemText>
                  <span className="break-all">{option.label}</span>
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center">
                  <Check size={15} strokeWidth={2.2} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex h-7 items-center justify-center text-muted-foreground">
            <ChevronDown size={14} />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
