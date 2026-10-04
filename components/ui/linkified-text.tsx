"use client"

import type { SyntheticEvent } from "react"

import { cn, getLinkifiedSegments, getShortUrlLabel } from "@/lib/utils"

interface LinkifiedTextProps {
  text: string
  as?: "span" | "p" | "div"
  className?: string
  linkClassName?: string
  maxLinkLength?: number
}

export function LinkifiedText({
  text,
  as = "span",
  className,
  linkClassName,
  maxLinkLength = 40,
}: LinkifiedTextProps) {
  const Component = as
  const segments = getLinkifiedSegments(text)

  const stopPropagation = (event: SyntheticEvent<HTMLAnchorElement>) => {
    event.stopPropagation()
  }

  return (
    <Component className={cn("break-words", className)}>
      {segments.length === 0
        ? text
        : segments.map((segment, index) => {
            if (segment.type === "text") {
              return segment.value
            }

            return (
              <a
                key={`${segment.href}-${index}`}
                href={segment.href}
                target="_blank"
                rel="noreferrer noopener"
                title={segment.value}
                draggable={false}
                className={cn(
                  "inline underline underline-offset-4 decoration-primary/45 transition-colors hover:text-primary hover:decoration-primary",
                  linkClassName,
                )}
                onClick={stopPropagation}
                onMouseDown={stopPropagation}
                onPointerDown={stopPropagation}
                onDragStart={stopPropagation}
              >
                {getShortUrlLabel(segment.value, maxLinkLength)}
              </a>
            )
          })}
    </Component>
  )
}
