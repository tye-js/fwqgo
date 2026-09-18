"use client";

import { useEffect, useLayoutEffect, useRef, type ComponentProps } from "react";
import { Textarea } from "@/components/ui/textarea";

function resizeInput(element: HTMLTextAreaElement) {
  if (!element.clientWidth) return;
  element.style.height = "auto";
  const borderHeight = element.offsetHeight - element.clientHeight;
  element.style.height = `${element.scrollHeight + borderHeight}px`;
}

// Titles and slugs stay single-line values, but wrap visually without scrolling.
export function ArticleTextInput({
  className = "",
  value,
  defaultValue,
  onChange,
  onKeyDown,
  ...props
}: Omit<ComponentProps<"textarea">, "ref">) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (ref.current) resizeInput(ref.current);
  }, [value, defaultValue]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let previousWidth = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === previousWidth) return;
      previousWidth = element.clientWidth;
      resizeInput(element);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Textarea
      {...props}
      ref={ref}
      value={value}
      defaultValue={defaultValue}
      rows={1}
      wrap="soft"
      className={`min-h-11 resize-none overflow-hidden whitespace-pre-wrap break-all [field-sizing:content] ${className}`}
      onChange={(event) => {
        const normalizedValue = event.currentTarget.value.replace(/[\r\n]/g, "");
        if (event.currentTarget.value !== normalizedValue) {
          event.currentTarget.value = normalizedValue;
        }
        resizeInput(event.currentTarget);
        onChange?.(event);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
          event.preventDefault();
        }
      }}
    />
  );
}
