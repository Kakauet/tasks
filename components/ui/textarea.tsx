import * as React from 'react'

import { cn } from '@/lib/utils'

type TextareaProps = React.ComponentProps<'textarea'> & {
  autoResize?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ autoResize = false, className, onInput, value, ...props }, forwardedRef) => {
  const internalRef = React.useRef<HTMLTextAreaElement | null>(null)

  React.useImperativeHandle(forwardedRef, () => internalRef.current as HTMLTextAreaElement)

  const resizeToContent = React.useCallback(() => {
    const textarea = internalRef.current
    if (!autoResize || !textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [autoResize])

  React.useLayoutEffect(resizeToContent, [resizeToContent, value])

  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-lg border border-input bg-background/70 px-3 py-2.5 text-base leading-6 shadow-sm shadow-black/[0.015] transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted-foreground/80 focus-visible:border-primary/65 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        autoResize && 'resize-none overflow-y-auto',
        className,
      )}
      ref={internalRef}
      value={value}
      onInput={(event) => {
        resizeToContent()
        onInput?.(event)
      }}
      {...props}
    />
  )
})
Textarea.displayName = 'Textarea'

export { Textarea }
export type { TextareaProps }
