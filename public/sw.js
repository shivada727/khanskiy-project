self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const sessions = new Map(); // id -> Map(path -> {content,type})

const ch = new BroadcastChannel("vfs");
ch.onmessage = (e) => {
  const { id, files } = e.data || {};
  if (!id || !files) return;
  const m = new Map();
  for (const f of files) {
    const p = "/" + String(f.path || "").replace(/^\/+/, "");
    m.set(p, f);
  }
  sessions.set(id, m);
};

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith("/virtual/")) return;
  event.respondWith(handleVirtual(url));
});

function mimeFrom(p) {
  if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
  if (p.endsWith(".json")) return "application/json";
  if (p.endsWith(".css")) return "text/css";
  if (p.endsWith(".html")) return "text/html";
  return "text/plain";
}

async function handleVirtual(url) {
  // /virtual/<id>/__ping, /__list для диагностики
  const [, , id, ...rest] = url.pathname.split("/");
  if (rest.length === 1 && rest[0] === "__ping") {
    return new Response("ok", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  if (rest.length === 1 && rest[0] === "__list") {
    const store = sessions.get(id);
    const keys = store ? Array.from(store.keys()) : [];
    return new Response(JSON.stringify({ id, count: keys.length, keys }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const store = sessions.get(id);
  if (!store) return new Response("Session not found", { status: 404 });

  let reqPath = "/" + rest.join("/");
  if (reqPath.endsWith("/")) reqPath += "index.js";

  const candidates = [reqPath, reqPath + ".js"];
  for (const p of candidates) {
    const f = store.get(p);
    if (f) {
      return new Response(f.content, {
        status: 200,
        headers: { "Content-Type": f.type || mimeFrom(p) },
      });
    }
  }
  return new Response("Not found: " + reqPath, { status: 404 });
}
