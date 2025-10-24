import { useEffect, useRef, useState } from "react";

async function ensureSW() {
  if (!("serviceWorker" in navigator))
    throw new Error("ServiceWorker unsupported");
  await navigator.serviceWorker.register("/sw.js", { type: "module" });
  await navigator.serviceWorker.ready;
}

type VFile = { path: string; content: string; type?: string };

class VirtualSession {
  id = Math.random().toString(36).slice(2);
  files = new Map<string, VFile>();
  mount(files: VFile[]) {
    this.files.clear();
    for (const f of files) {
      const p = "/" + (f.path || "").replace(/^\/+/, "");
      this.files.set(p, { ...f, path: p });
    }
    const ch = new BroadcastChannel("vfs");
    ch.postMessage({ id: this.id, files: [...this.files.values()] });
    ch.close();
  }
  base() {
    return `/virtual/${this.id}`;
  }
  url(rel: string) {
    return `${this.base()}/${rel.replace(/^\/+/, "")}`;
  }
}

type InputWithDir = React.DetailedHTMLProps<
  React.InputHTMLAttributes<HTMLInputElement>,
  HTMLInputElement
> & { webkitdirectory?: boolean | string; directory?: boolean | string };

export default function App() {
  const [session, setSession] = useState<VirtualSession | null>(null);
  const [jsFiles, setJsFiles] = useState<string[]>([]);
  const [entry, setEntry] = useState<string>("");
  const [status, setStatus] = useState<string>("idle");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    ensureSW().catch((e) => setStatus("SW error: " + e?.message));
  }, []);

  const onPick: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const fileList = Array.from(e.target.files || []);
    if (!fileList.length) return;

    setStatus("reading files…");
    const v = new VirtualSession();
    const vfiles: VFile[] = await Promise.all(
      fileList.map(async (f) => {
        const path = (f as any).webkitRelativePath || f.name;
        const content = await f.text();
        let type = "";
        if (path.endsWith(".js") || path.endsWith(".mjs"))
          type = "text/javascript";
        else if (path.endsWith(".json")) type = "application/json";
        else if (path.endsWith(".css")) type = "text/css";
        else if (path.endsWith(".html")) type = "text/html";
        return { path, content, type };
      })
    );
    v.mount(vfiles);
    setSession(v);

    const js = vfiles
      .map((f) => (f.path.startsWith("/") ? f.path : "/" + f.path))
      .filter((p) => p.endsWith(".js") || p.endsWith(".mjs"))
      .sort((a, b) => a.localeCompare(b));

    const preferred =
      js.find((p) => /(^|\/)main\.m?js$/.test(p)) ||
      js.find((p) => /(^|\/)index\.m?js$/.test(p)) ||
      js[0] ||
      "";
    setJsFiles(js);
    setEntry(preferred);
    setStatus(`loaded ${vfiles.length} files`);
  };

  const run = async () => {
    if (!session || !entry || !iframeRef.current) return;
    const absEntry = new URL(
      session.url(entry.replace(/^\//, "")),
      window.location.origin
    ).href;

    // Диагностика: пингуем SW и проверяем, что файл доступен
    const ping = await fetch(
      `${window.location.origin}${session.base()}/__ping`
    )
      .then((r) => r.text())
      .catch(() => null);
    if (ping !== "ok") {
      setStatus(
        "SW not ready (no ping). Reload page, check /sw.js scope, or hard refresh."
      );
      return;
    }
    const list = await fetch(
      `${window.location.origin}${session.base()}/__list`
    )
      .then((r) => r.json())
      .catch(() => null);
    console.log("VFS list:", list);

    // Быстрый пробный fetch entry
    const head = await fetch(absEntry, { cache: "no-store" }).catch(() => null);
    if (!head || !head.ok) {
      setStatus(`entry not reachable: ${absEntry}`);
      return;
    }
    setStatus("running…");

    const runnerUrl = `/runner.html?entry=${encodeURIComponent(absEntry)}`;
    const ifr = iframeRef.current;
    ifr.setAttribute("sandbox", "allow-scripts allow-same-origin");
    ifr.src = runnerUrl;
  };

  const DirInput = (props: InputWithDir) => <input {...props} />;

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        maxWidth: 960,
        margin: "24px auto",
        padding: "0 16px",
      }}
    >
      <h2 style={{ margin: 0 }}>Browser ESM Runner</h2>
      <small style={{ opacity: 0.7 }}>{status}</small>

      <DirInput
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        onChange={onPick}
        style={{ maxWidth: 420 }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ minWidth: 60 }}>Entry:</label>
        <select
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          disabled={!jsFiles.length}
          style={{ flex: 1, padding: 6 }}
        >
          {jsFiles.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button onClick={run} disabled={!entry} style={{ padding: "8px 12px" }}>
          Запустить
        </button>
      </div>

      <iframe
        ref={iframeRef}
        style={{
          width: "100%",
          height: "60vh",
          border: "1px solid #ddd",
          borderRadius: 10,
          background: "white",
        }}
      />
    </div>
  );
}
