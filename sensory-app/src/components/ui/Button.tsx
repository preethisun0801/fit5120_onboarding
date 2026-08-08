import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "ghost";

export default function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base = "px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<Variant, string> = {
    primary: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90",
    outline: "border border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-muted-bg)]",
    ghost: "text-[var(--color-foreground)] hover:bg-[var(--color-muted-bg)]",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}