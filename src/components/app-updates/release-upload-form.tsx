"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { startReleaseUpload, finishReleaseUpload } from "@/app/super-admin/app-updates/actions";

const BUCKET = "app-releases";

// Super admin uploads a new app build. The file goes straight to the private bucket (one-time link),
// then the server reads its version from inside the APK and checks it.
export function ReleaseUploadForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setResult({ ok: false, text: "Choose the app file (.apk) first." }); return; }
    setResult(null);
    try {
      setBusy("Preparing…");
      const start = await startReleaseUpload(file.name, file.size);
      if (start.error || !start.releaseId || !start.path || !start.token) { setResult({ ok: false, text: start.error ?? "Could not start the upload." }); return; }
      setBusy(`Uploading ${(file.size / 1048576).toFixed(1)} MB…`);
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(start.path, start.token, file, { contentType: "application/vnd.android.package-archive" });
      if (error) {
        await finishReleaseUpload(start.releaseId, ""); // removes the empty row
        setResult({ ok: false, text: `Upload failed: ${error.message}` });
        return;
      }
      setBusy("Checking the file…");
      const done = await finishReleaseUpload(start.releaseId, notes);
      setResult(done.error ? { ok: false, text: done.error } : { ok: true, text: done.success ?? "Uploaded." });
      if (!done.error) { setNotes(""); if (fileRef.current) fileRef.current.value = ""; router.refresh(); }
    } catch (e) {
      setResult({ ok: false, text: `Upload failed: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Upload a new app version</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Choose the <code>app-release.apk</code> built by <code>publish-app.command</code>. The version is read from the file.
          It must be signed with the same key as the app already on the phones, or phones will refuse it.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <input ref={fileRef} type="file" accept=".apk,application/vnd.android.package-archive" className="block max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm" disabled={!!busy} />
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed (optional)" maxLength={500} disabled={!!busy}
            className="h-9 min-w-[16rem] flex-1 rounded-lg border border-input bg-card px-3 text-sm" />
          <Button type="button" size="sm" onClick={upload} disabled={!!busy}><Upload className="h-3.5 w-3.5" /> {busy ?? "Upload"}</Button>
        </div>
        {result && (
          <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400" : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"}`}>
            {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}<span>{result.text}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
