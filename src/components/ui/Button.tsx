import type { ButtonHTMLAttributes } from "react"

type ButtonVariant = "primary" | "secondary"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
}

const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: "bg-[#111111] text-white",
  secondary: "bg-[#f5f5f5] text-[#111111]",
}

export const Button = ({
  className = "",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) => (
  <button
    className={`h-12 rounded-full px-8 font-medium disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariantClasses[variant]} ${className}`}
    type={type}
    {...props}
  />
)
