'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const baseControl =
  'w-full rounded-[10px] border border-line bg-card px-3 text-[13px] text-ink placeholder:text-muted transition-colors focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-[#f6f3ec] disabled:text-muted'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(baseControl, 'h-9.5', className)} {...props} />
  )
)
Input.displayName = 'Input'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        baseControl,
        'h-9.5 appearance-none bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%2712%27%20height%3D%2712%27%20viewBox%3D%270%200%2012%2012%27%3E%3Cpath%20fill%3D%27%2368685f%27%20d%3D%27M6%208.2L1.4%203.6l.9-.9L6%206.4l3.7-3.7.9.9z%27%2F%3E%3C%2Fsvg%3E")] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
)
Select.displayName = 'Select'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(baseControl, 'min-h-[84px] resize-y py-2.5', className)} {...props} />
  )
)
Textarea.displayName = 'Textarea'

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-[11px] font-semibold tracking-wide text-graphite', className)}
      {...props}
    />
  )
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label?: string
  hint?: string
  error?: string | null
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <p className="mt-1 text-[11px] text-critical">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

export function SearchInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <svg
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.2-3.2" />
      </svg>
      <input
        className={cn(baseControl, 'h-9.5 pl-9', props.type === 'search' ? 'pr-9' : '')}
        {...props}
      />
    </div>
  )
}

export function Checkbox({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-[13px] text-graphite', className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-line accent-[#f08a42]"
        {...props}
      />
      <span className="leading-snug">{label}</span>
    </label>
  )
}
