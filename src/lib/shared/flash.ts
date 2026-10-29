import { cookies } from "next/headers";

export type Flash = { message: string; type: "success" | "error"; t: number };

// Server actions call this to show a toast after they run. Read back in the dashboard shell.
export function setFlash(message: string, type: "success" | "error" = "success") {
  try {
    cookies().set("flash", JSON.stringify({ message, type, t: Date.now() }), { maxAge: 15, path: "/", httpOnly: false, sameSite: "lax" });
  } catch { /* called outside a request scope — ignore */ }
}

export function readFlash(): Flash | null {
  try {
    const v = cookies().get("flash")?.value;
    return v ? (JSON.parse(v) as Flash) : null;
  } catch { return null; }
}
