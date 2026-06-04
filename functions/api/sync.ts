// Cloudflare Pages Function：整图加密快照的云端存取。
// 服务端只见到一串密文(已端到端加密)+ 一个不可反推的存储 ID，看不到任何明文。
//
// GET  /api/sync?id=<storageId>  → 取回该 ID 的密文快照（无则 404）
// PUT  /api/sync?id=<storageId>  → 用请求体（密文 JSON）覆盖该 ID 的快照
//
// 需要在 Pages 项目里绑定一个 KV namespace，变量名为 CAIRN_KV。

interface Env {
  CAIRN_KV: {
    get(key: string): Promise<string | null>
    put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>
  }
}

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })

export const onRequest = async (context: {
  request: Request
  env: Env
}): Promise<Response> => {
  const { request, env } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (!env.CAIRN_KV) {
    return json({ error: '未绑定 KV：请在 Pages 项目里把 KV namespace 绑定为 CAIRN_KV。' }, 500)
  }

  const id = new URL(request.url).searchParams.get('id')
  if (!id || !/^[a-f0-9]{64}$/.test(id)) {
    return json({ error: '缺少或非法的 id（应为 64 位 hex 存储 ID）。' }, 400)
  }

  const key = `snapshot:${id}`

  if (request.method === 'GET') {
    const value = await env.CAIRN_KV.get(key)
    if (value == null) return json({ error: 'not found' }, 404)
    return new Response(value, {
      status: 200,
      headers: { 'content-type': 'application/json', ...CORS_HEADERS },
    })
  }

  if (request.method === 'PUT') {
    const body = await request.text()
    if (body.length > 24 * 1024 * 1024) {
      return json({ error: '快照过大（超过 24MB）。' }, 413)
    }
    await env.CAIRN_KV.put(key, body)
    return json({ ok: true })
  }

  return json({ error: 'method not allowed' }, 405)
}
