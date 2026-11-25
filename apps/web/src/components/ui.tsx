import * as DialogPrimitive from '@radix-ui/react-dialog';
import {cva, type VariantProps} from 'class-variance-authority';
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import {X} from 'lucide-react';
import {cn} from '../lib/utils.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand-500 text-white hover:bg-brand-600',
        secondary: 'bg-ink-700 text-slate-100 hover:bg-ink-600',
        outline: 'border border-ink-600 bg-transparent text-slate-200 hover:bg-ink-800',
        ghost: 'text-slate-300 hover:bg-ink-800 hover:text-white',
        danger: 'bg-rose-600 text-white hover:bg-rose-700',
      },
      size: {
        default: 'h-9 px-4 text-sm',
        sm: 'h-7 px-2.5 text-xs',
        lg: 'h-11 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {variant: 'default', size: 'default'},
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({className, variant, size, ...props}: ButtonProps) {
  return <button className={cn(buttonVariants({variant, size}), className)} {...props} />;
}

export function Input({className, ...props}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({className, ...props}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border border-ink-600 bg-ink-900 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400',
        className,
      )}
      {...props}
    />
  );
}

export function Select({className, ...props}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 w-full rounded-lg border border-ink-600 bg-ink-900 px-2 text-sm text-slate-100 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400',
        className,
      )}
      {...props}
    />
  );
}

export function Card({className, ...props}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-ink-700 bg-ink-850 shadow-[0_10px_40px_rgba(0,0,0,0.25)]',
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-ink-600 bg-ink-800 px-2 py-0.5 text-[11px] font-medium text-slate-300',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[min(520px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-ink-600 bg-ink-850 p-6 shadow-2xl focus:outline-none">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold text-white">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-slate-400">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close dialog">
                <X className="h-4 w-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
          {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: {id: string; label: string; icon?: ReactNode}[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-ink-900 p-1" role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === tab.id
              ? 'bg-ink-700 text-white shadow'
              : 'text-slate-400 hover:text-slate-200',
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span title={label} className="inline-flex">
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
      {hint ? <span className="block text-[11px] text-slate-500">{hint}</span> : null}
    </label>
  );
}
