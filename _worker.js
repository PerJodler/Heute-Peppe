export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/cloud") {
      if (!env.DB) {
        return json({ error: "Cloudflare-D1-Binding 'DB' fehlt." }, 500);
      }

      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS backups (
          sync_id TEXT PRIMARY KEY,
          auth_token TEXT NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `).run();

      if (request.method === "PUT") {
        let body;
        try { body = await request.json(); }
        catch { return json({ error: "Ungültige Anfrage." }, 400); }

        const { syncId, token, payload } = body || {};
        if (!validId(syncId) || !validToken(token) || typeof payload !== "string" || payload.length > 2_000_000) {
          return json({ error: "Ungültige Backup-Daten." }, 400);
        }

        const existing = await env.DB.prepare(
          "SELECT auth_token FROM backups WHERE sync_id = ?"
        ).bind(syncId).first();

        if (existing && existing.auth_token !== token) {
          return json({ error: "Cloud-Code ist für dieses Backup nicht berechtigt." }, 403);
        }

        const updatedAt = new Date().toISOString();
        await env.DB.prepare(`
          INSERT INTO backups (sync_id, auth_token, payload, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(sync_id) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
        `).bind(syncId, token, payload, updatedAt).run();

        return json({ ok: true, updatedAt });
      }

      if (request.method === "GET") {
        const syncId = url.searchParams.get("syncId") || "";
        const token = request.headers.get("X-Sync-Token") || "";
        if (!validId(syncId) || !validToken(token)) {
          return json({ error: "Ungültiger Cloud-Code." }, 400);
        }

        const row = await env.DB.prepare(
          "SELECT auth_token, payload, updated_at FROM backups WHERE sync_id = ?"
        ).bind(syncId).first();

        if (!row) return json({ error: "Noch kein Cloud-Backup gefunden." }, 404);
        if (row.auth_token !== token) return json({ error: "Cloud-Code ist nicht berechtigt." }, 403);

        return json({ ok: true, payload: row.payload, updatedAt: row.updated_at });
      }

      return json({ error: "Methode nicht erlaubt." }, 405);
    }

    return env.ASSETS.fetch(request);
  }
};

function validId(value) {
  return typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
}
function validToken(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
