import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass-card rounded-2xl p-6 transition-all", className)} {...props}>
      {children}
    </div>
  );
}

export function Button({ 
  className, variant = "primary", size = "default", isLoading, children, ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "default" | "lg" | "icon";
  isLoading?: boolean;
}) {
  const variants = {
    primary: "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:-translate-y-0.5 border border-white/10",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    outline: "border-2 border-border bg-transparent hover:border-primary/50 hover:bg-primary/5 text-foreground",
    ghost: "bg-transparent hover:bg-white/5 text-foreground",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/20",
  };
  
  const sizes = {
    sm: "px-3 py-1.5 text-sm rounded-lg",
    default: "px-4 py-2.5 rounded-xl font-medium",
    lg: "px-6 py-3 text-lg rounded-xl font-semibold",
    icon: "p-2 rounded-xl",
  };

  return (
    <button
      className={cn(
        "relative inline-flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {children}
    </button>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex w-full rounded-xl border-2 border-border bg-black/20 px-4 py-3 text-sm text-foreground shadow-inner transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary/50 focus-visible:bg-black/40 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[120px] w-full rounded-xl border-2 border-border bg-black/20 px-4 py-3 text-sm text-foreground shadow-inner transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary/50 focus-visible:bg-black/40 disabled:cursor-not-allowed disabled:opacity-50 resize-y",
          className
        )}
        {...props}
      />
    );
  }
);

export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("text-sm font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wider", className)} {...props}>
      {children}
    </label>
  );
}

export function Select({ 
  className, options, value, onChange, ...props 
}: React.SelectHTMLAttributes<HTMLSelectElement> & { 
  options: {value: string; label: string}[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className={cn(
          "appearance-none flex w-full rounded-xl border-2 border-border bg-black/20 px-4 py-3 text-sm text-foreground shadow-inner transition-colors focus-visible:outline-none focus-visible:border-primary/50 focus-visible:bg-black/40 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-card text-foreground">
            {opt.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-muted-foreground">
        <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
      </div>
    </div>
  );
}
