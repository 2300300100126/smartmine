"use client"

import type React from "react"

import { useState } from "react"
import { LogIn, Loader2 } from "lucide-react"
import { useAuth } from "../contexts/AuthContext"

interface LoginProps {
  onNavigate: (page: string) => void
}

export default function Login({ onNavigate }: LoginProps) {
  const { signIn, resendConfirmation } = useAuth() // get resend helper
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [resentNotice, setResentNotice] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError("")
    setNeedsConfirmation(false)
    setResentNotice("")

    const { error: signInError } = await signIn(formData.email, formData.password)

    if (signInError) {
      const msg = signInError.message || "Failed to sign in. Please check your credentials."
      setError(msg)

      const lower = msg.toLowerCase()
      if (
        lower.includes("confirm") || // "Email not confirmed" / "Please confirm"
        lower.includes("not confirmed") ||
        lower.includes("email not confirmed") ||
        lower.includes("email confirmation")
      ) {
        setNeedsConfirmation(true)
      }

      setIsSubmitting(false)
    } else {
      onNavigate("dashboard")
    }
  }

  const handleResend = async () => {
    setIsResending(true)
    setResentNotice("")
    setError("")
    try {
      const { error } = await resendConfirmation(formData.email)
      if (error) {
        setError(error.message || "Could not resend confirmation email. Try again later.")
      } else {
        setResentNotice("Confirmation email resent. Please check your inbox and spam folder.")
      }
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYgMi42ODYgNiA2cy0yLjY4NiA2LTYgNi02LTIuNjg2LTYtNiAyLjY4Ni02IDYtNnoiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLW9wYWNpdHk9Ii4xIi8+PC9nPjwvc3ZnPg==')] opacity-10"></div>

      <div className="max-w-md w-full space-y-8 relative">
        <div className="text-center">
          <button
            onClick={() => onNavigate("home")}
            className="text-4xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent mb-2 hover:from-amber-300 hover:to-orange-400 transition-all"
          >
            SmartMine
          </button>
          <h2 className="mt-6 text-3xl font-bold text-white">Sign in to your account</h2>
          <p className="mt-2 text-sm text-gray-400">Access the mining safety dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800 text-sm">{error}</p>
                {needsConfirmation && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={isResending}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-amber-700 hover:text-amber-800 disabled:opacity-60"
                    >
                      {isResending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Resending confirmation...
                        </>
                      ) : (
                        <>Resend confirmation email</>
                      )}
                    </button>
                    {resentNotice && <p className="text-green-700 text-xs mt-2">{resentNotice}</p>}
                  </div>
                )}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                placeholder="you@example.com"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                placeholder="••••••••"
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold py-3 px-6 rounded-lg transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  Sign In
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Don't have an account?{" "}
              <button
                onClick={() => onNavigate("signup")}
                className="font-semibold text-amber-600 hover:text-amber-700 transition-colors"
              >
                Sign up here
              </button>
            </p>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={() => onNavigate("home")}
            className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            ← Back to home
          </button>
        </div>
      </div>
    </div>
  )
}
