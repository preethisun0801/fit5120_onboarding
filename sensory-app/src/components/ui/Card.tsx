import type { HTMLAttributes } from "react";

export default function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl p-4 ${className}`}
      {...props}
    />
  );
}