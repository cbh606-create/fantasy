import { SignIn } from "@clerk/nextjs"

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-canvas)] px-6 py-16">
      <SignIn
        appearance={{
          elements: {
            cardBox: "shadow-none",
            card: "shadow-none",
            formButtonPrimary:
              "bg-[var(--color-ink)] text-white hover:bg-neutral-700",
            formFieldInput: "bg-[var(--color-soft-cloud)]",
          },
        }}
      />
    </main>
  )
}
