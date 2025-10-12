"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { User } from "@supabase/supabase-js"
import { supabase, type UserProfile } from "../lib/supabase"

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: "admin" | "miner",
    rfid?: string,
  ) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  resendConfirmation: (email: string) => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      ;(async () => {
        setUser(session?.user ?? null)
        if (session?.user) {
          await loadProfile(session.user.id)
        } else {
          setProfile(null)
          setLoading(false)
        }
      })()
    })

    return () => subscription.unsubscribe()
  }, [])

  const logActivity = async (
    email: string,
    activityType: "signup" | "login" | "logout",
    status: "success" | "failed",
    userId?: string,
  ) => {
    try {
      await supabase.from("user_activity_log").insert({
        user_id: userId || null,
        email,
        activity_type: activityType,
        status,
        ip_address: null,
        user_agent: navigator.userAgent,
      })
    } catch (error) {
      console.error("Error logging activity:", error)
    }
  }

  const insertSignupLog = async (params: {
    email: string
    fullName: string
    role: "admin" | "miner"
    rfid?: string
    status: "attempted" | "success" | "failed" | "exists"
    userId?: string
  }) => {
    const { email, fullName, role, rfid, status, userId } = params
    try {
      await supabase.from("user_signups").insert({
        email,
        full_name: fullName,
        role,
        rfid: rfid || null,
        status,
        user_id: userId || null,
      })
    } catch (e) {
      console.error("[v0] insertSignupLog failed:", e)
    }
  }

  const isMissingProfilesTable = (err: any) => {
    const msg = String(err?.message ?? "")
    const code = String(err?.code ?? "")
    return (
      code === "42P01" || // relation does not exist
      (/user_profiles/i.test(msg) && (/schema cache/i.test(msg) || /does not exist/i.test(msg)))
    )
  }

  const loadProfile = async (userId: string) => {
    try {
      let { data, error } = await supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle()

      if (error) {
        if (isMissingProfilesTable(error)) {
          console.warn("[v0] user_profiles table missing. Skipping profile load until table exists.")
          setProfile(null)
          return
        }
        throw error
      }

      if (!data) {
        const { data: authUser } = await supabase.auth.getUser()
        if (authUser?.user) {
          const metadata = authUser.user.user_metadata
          const { error: upsertError } = await supabase.from("user_profiles").upsert(
            {
              id: userId,
              email: authUser.user.email || "",
              full_name: metadata?.full_name || "User",
              role: metadata?.role || "admin",
              rfid: metadata?.rfid || null,
            },
            { onConflict: "id" },
          )

          if (upsertError) {
            if (isMissingProfilesTable(upsertError)) {
              console.warn("[v0] user_profiles table missing during upsert. Skipping profile creation.")
            } else {
              console.error("Error creating profile:", upsertError)
            }
          } else {
            const { data: newProfile } = await supabase.from("user_profiles").select("*").eq("id", userId).maybeSingle()
            data = newProfile || data
          }
        }
      }

      setProfile(data)
    } catch (error) {
      console.error("Error loading profile:", error)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        await logActivity(email, "login", "failed")
        return { error }
      }

      if (data.user) {
        await logActivity(email, "login", "success", data.user.id)
      }

      return { error: null }
    } catch (error) {
      await logActivity(email, "login", "failed")
      return { error: error as Error }
    }
  }

  const signUp = async (email: string, password: string, fullName: string, role: "admin" | "miner", rfid?: string) => {
    try {
      const metadata: Record<string, string> = {
        full_name: fullName,
        role,
      }
      if (role === "miner" && rfid) {
        metadata.rfid = rfid
      }

      await insertSignupLog({ email, fullName, role, rfid, status: "attempted" })

      const resp = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
          role,
          rfid: role === "miner" ? (rfid ?? null) : null,
        }),
      })

      let json: any = null
      try {
        json = await resp.json()
      } catch {
        json = { ok: false, error: "Unexpected response" }
      }

      const isExists =
        resp.status === 409 ||
        resp.status === 422 ||
        (typeof json?.error === "string" &&
          (/EMAIL_EXISTS/i.test(json.error) ||
            /email_exists/i.test(json.error) ||
            /already.*registered/i.test(json.error) ||
            /already.*exists/i.test(json.error) ||
            /exists/i.test(json.error)))

      if (!resp.ok && !json?.ok && !isExists) {
        await logActivity(email, "signup", "failed")
        await insertSignupLog({ email, fullName, role, rfid, status: "failed" })
        return { error: new Error(json?.error || "Failed to create account") }
      }

      // Immediately sign in the user (covers both fresh create and existing user)
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr) {
        await logActivity(email, "signup", "failed")
        await insertSignupLog({ email, fullName, role, rfid, status: isExists ? "exists" : "failed" })
        return {
          error: isExists ? new Error("Account already exists. Please sign in with your password.") : signInErr,
        }
      }

      if (signInData.user) {
        await logActivity(email, "signup", "success", signInData.user.id)
        await insertSignupLog({ email, fullName, role, rfid, status: "success", userId: signInData.user.id })
        await loadProfile(signInData.user.id)
      }

      return { error: null }
    } catch (error) {
      await logActivity(email, "signup", "failed")
      await insertSignupLog({ email, fullName, role, rfid, status: "failed" })
      return { error: error as Error }
    }
  }

  const signOut = async () => {
    if (user?.email) {
      await logActivity(user.email, "logout", "success", user.id)
    }
    await supabase.auth.signOut()
    setProfile(null)
  }

  const resendConfirmation = async (email: string) => {
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      })
      if (error) return { error }
      return { error: null }
    } catch (e) {
      return { error: e as Error }
    }
  }

  const value = {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    resendConfirmation,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
