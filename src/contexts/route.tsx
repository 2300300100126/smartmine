import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name, role, rfid } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 })
    }

    const supabaseUrl = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ ok: false, error: "Server not configured for sign-up." }, { status: 500 })
    }

    const admin = createClient(supabaseUrl, serviceKey)

    // Create the user and mark email as confirmed so no confirmation is needed
    let userData: any = null
    try {
      const res = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: full_name ?? null,
          role: role ?? null,
          rfid: rfid ?? null,
        },
      })
      userData = res.data
    } catch (createErr: any) {
      const message = createErr?.message || ""
      const status = createErr?.status
      const emailExists =
        status === 422 ||
        /email_exists/i.test(message) ||
        /already.*registered/i.test(message) ||
        /already.*exists/i.test(message)

      // Log attempted/failed/existing signup
      await admin
        .from("user_signups")
        .insert({
          email,
          status: emailExists ? "exists" : "failed",
          full_name: full_name ?? null,
          role: role ?? null,
          rfid: rfid ?? null,
          error_message: message,
        })
        .catch(() => {})

      return NextResponse.json(
        { ok: false, error: emailExists ? "EMAIL_EXISTS" : message },
        { status: emailExists ? 409 : 400 },
      )
    }

    // Log successful signup
    await admin
      .from("user_signups")
      .insert({
        user_id: userData?.user?.id ?? null,
        email,
        status: "success",
        full_name: full_name ?? null,
        role: role ?? null,
        rfid: rfid ?? null,
      })
      .catch(() => {})

    const createdUserId = userData?.user?.id as string | undefined
    if (createdUserId) {
      await admin
        .from("user_profiles")
        .upsert(
          {
            id: createdUserId,
            email,
            full_name: full_name ?? "",
            role: (role as string) ?? "miner",
            rfid: rfid ?? null,
          },
          { onConflict: "id" },
        )
        .catch(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 })
  }
}
