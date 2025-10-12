import { createClient } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabaseClient" 

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL

const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vars.",
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: "admin" | "miner"
  rfid: string | null
  created_at: string
  updated_at: string
}

export interface SensorReading {
  id: string
  miner_id: string
  rfid: string | null
  heart_rate: number
  air_toxicity: number
  zone: string
  gps_latitude: number
  gps_longitude: number
  temperature: number
  humidity: number
  created_at: string
}
