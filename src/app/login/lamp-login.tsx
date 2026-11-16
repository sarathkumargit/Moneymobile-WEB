"use client";

/**
 * Sign-in page with the 3D desk lamp. The page starts dark; pulling the lamp's cord (or the
 * "Turn on the light" button / Enter key) switches the light on and the sign-in card appears.
 *
 * The form is the same as before: it posts to the existing `login` server action with the same
 * field names. It stays in the page while hidden (so password managers still find it), and:
 *  - after a failed sign-in (?error=…) the light starts ON, so the message is visible;
 *  - if the browser cannot run 3D (no WebGL, or the scene crashes) the light starts ON with no lamp.
 */

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, Eye, EyeOff, Smartphone } from "lucide-react";
import { login } from "./actions";

const LampScene = dynamic(() => import("./lamp-scene"), { ssr: false });

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Short switch "click" made with Web Audio (no sound file). */
function useSwitchSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  return useCallback((turningOn: boolean) => {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = ctxRef.current ?? (ctxRef.current = new AC());
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime;
      // the click: a very short burst of filtered noise
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = turningOn ? 2600 : 1900;
      band.Q.value = 0.9;
      const ng = ctx.createGain();
      ng.gain.value = 0.32;
      noise.connect(band).connect(ng).connect(ctx.destination);
      noise.start(now);
      // the soft "thunk" of the switch
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);
      og.gain.setValueAtTime(0.0001, now);
      og.gain.exponentialRampToValueAtTime(0.1, now + 0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      osc.connect(og).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      /* sound is optional */
    }
  }, []);
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 h-12 w-full rounded-xl bg-[#0071e3] text-[15px] font-semibold text-white transition-colors hover:bg-[#0a7cf0] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0071e3]/40 disabled:opacity-70"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

const inputCls =
  "h-[46px] w-full rounded-xl border border-[#2c313a] bg-[#0f1116] px-3.5 text-[15px] text-[#eef0f3] placeholder:text-[#6f7784] transition-colors focus-visible:border-[#0071e3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0071e3]/25";
const labelCls = "mb-1.5 block text-[13px] font-medium text-[#d3d6dc]";

function Logo({ dim = false }: { dim?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#0071e3]">
        <Smartphone className="h-[18px] w-[18px] text-white" aria-hidden />
      </div>
      <span className={`text-[15px] font-semibold tracking-tight ${dim ? "text-[#c9cdd4]" : "text-[#ece8df]"}`}>MoneyMobile</span>
    </div>
  );
}

export function LampLogin({ error }: { error: string | null }) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [on, setOn] = useState(!!error);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const click = useSwitchSound();

  const lamp = webgl === true && !failed;
  const lit = on || webgl === false || failed;

  useEffect(() => {
    let ok = false;
    try {
      const c = document.createElement("canvas");
      ok = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch { ok = false; }
    setWebgl(ok);
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const toggle = useCallback(() => {
    setOn((was) => {
      const next = !was;
      click(next);
      // On a computer, put the cursor in Email once the card is visible (not on phones: it opens the keyboard).
      if (next && window.matchMedia("(pointer: fine)").matches) {
        window.setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 450);
      }
      return next;
    });
  }, [click]);

  // Enter / Space turns the light on (when nothing else has focus).
  useEffect(() => {
    if (lit) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.closest("input, textarea, select, button, a")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lit, toggle]);

  // The hidden card can't be tabbed into or read out.
  useEffect(() => {
    const el = cardRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = !lit;
  }, [lit]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#08090b] text-white">
      {/* Room: dark, and warm where the light falls once it is on */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse 60% 65% at 30% 55%, #161920 0%, #0b0d11 60%, #07080a 100%)" }}
      />
      <div
        aria-hidden
        className={`absolute inset-0 hidden transition-opacity duration-700 lg:block ${lit ? "opacity-100" : "opacity-0"}`}
        style={{ background: "radial-gradient(ellipse 55% 70% at 72% 50%, rgba(255,196,122,0.20) 0%, rgba(255,196,122,0.06) 45%, rgba(0,0,0,0) 75%)" }}
      />
      <div
        aria-hidden
        className={`absolute inset-0 transition-opacity duration-700 lg:hidden ${lit ? "opacity-100" : "opacity-0"}`}
        style={{ background: "radial-gradient(ellipse 80% 60% at 55% 66%, rgba(255,196,122,0.20) 0%, rgba(255,196,122,0.06) 45%, rgba(0,0,0,0) 75%)" }}
      />

      {lamp && (
        <SceneBoundary onError={() => setFailed(true)}>
          <LampScene on={on} onPull={toggle} reducedMotion={reducedMotion} hintRef={hintRef} />
        </SceneBoundary>
      )}

      {/* Logo while the room is dark (the card has its own) */}
      <div className={`pointer-events-none absolute left-5 top-6 transition-opacity duration-500 lg:left-10 lg:top-8 ${lit ? "opacity-0" : "opacity-100"}`}>
        <Logo dim />
      </div>

      {/* No visible instructions: keyboard and screen-reader users still get a (hidden) way in. Enter also works. */}
      {!lit && (
        <button type="button" onClick={toggle} className="sr-only">
          Turn on the light to sign in
        </button>
      )}

      {/* Sign-in card */}
      <div
        ref={cardRef}
        aria-hidden={!lit}
        className={`absolute inset-x-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] mx-auto max-h-[calc(100dvh-2.5rem)] max-w-[400px] overflow-y-auto transition-[opacity,transform,filter] duration-500 ease-out lg:inset-x-auto lg:bottom-auto lg:right-[7vw] lg:top-1/2 lg:w-[400px] lg:-translate-y-1/2 ${
          lit ? "scale-100 opacity-100 blur-0 delay-200" : "pointer-events-none scale-[0.97] opacity-0 blur-[2px]"
        }`}
      >
        <section
          aria-labelledby="signin-title"
          className="flex flex-col gap-5 rounded-[22px] border border-[rgba(255,214,150,0.24)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.55)] backdrop-blur-sm lg:gap-[22px] lg:p-9"
          style={{ background: "linear-gradient(120deg, rgba(255,214,150,0.13), rgba(20,22,28,0.9) 50%)" }}
        >
          <Logo />
          <div>
            <h1 id="signin-title" className="text-[26px] font-semibold tracking-tight text-[#f6f2ea] lg:text-[30px]">
              Welcome back
            </h1>
            <p className="mt-1.5 text-sm text-[#b8bdc7]">Sign in to your shop workspace.</p>
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          <form action={login} className="flex flex-col gap-4">
            <div>
              <label htmlFor="email" className={labelCls}>Email</label>
              <input ref={emailRef} id="email" name="email" type="email" placeholder="you@shop.com" required autoComplete="email" className={inputCls} />
            </div>
            <div>
              <label htmlFor="password" className={labelCls}>Password</label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className={`${inputCls} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-[#8a93a1] hover:text-[#c9cdd4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0071e3]/50"
                >
                  {showPw ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </div>
            <SubmitButton />
          </form>

          <p className="text-center text-xs text-[#9aa1ad]">
            Accounts are created by your administrator. Contact them if you can&apos;t sign in.
          </p>
        </section>
      </div>
    </main>
  );
}
