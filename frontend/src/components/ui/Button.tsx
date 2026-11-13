'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-medium transition-all duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-white shadow-brand hover:bg-primary-hover active:translate-y-px',
        secondary:
          'border border-line bg-card text-ink hover:border-line-strong hover:bg-[#fcfaf5] shadow-[0_1px_1px_rgba(37,39,32,0.03)]',
        soft: 'bg-soft text-primary-hover border border-primary/15 hover:bg-[#ffe6d3]',
        ghost: 'text-secondary hover:bg-[#efece3] hover:text-ink',
        dark: 'bg-graphite text-[#f8f6f0] hover:bg-[#24231f]',
        danger: 'border border-critical/20 bg-critical-soft text-critical hover:bg-[#fbdcdc]',
        link: 'text-primary-hover underline-offset-4 hover:underline px-0',
      },
      size: {
        sm: 'h-8 px-3 text-xs [&_svg]:size-3.5',
        md: 'h-9.5 px-4 text-[13px] [&_svg]:size-4',
        lg: 'h-11 px-5 text-sm [&_svg]:size-4.5',
        icon: 'h-9 w-9 [&_svg]:size-4',
        iconSm: 'h-8 w-8 [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={asChild ? undefined : disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
