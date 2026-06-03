// Cloudflare Pages Functions 薄代理：把同源 /api/<provider>/... 透传到上游 LLM 端点。
// 用途：官方 api.openai.com 默认不放行浏览器跨域(CORS)。让前端把 baseURL 指向本站
// /api/openai/v1（同源，无 CORS），由这里在服务端转发到官方，即可直连。
// 安全：只放行白名单里的上游，避免变成开放代理。key 仍由用户的请求自带，本站不存、不碰。

const UPSTREAMS: Record<string, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
}

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': '*',
  'access-control-max-age': '86400',
}

export const onRequest = async (context: {
  request: Request
  params: { path?: string[] }
}): Promise<Response> => {
  const { request, params } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const segments = params.path ?? []
  const provider = segments[0]
  const upstreamBase = provider ? UPSTREAMS[provider] : undefined

  if (!upstreamBase) {
    return new Response(
      JSON.stringify({
        error: `不支持的代理目标：${provider ?? '(空)'}。仅允许 openai / anthropic。`,
      }),
      { status: 404, headers: { 'content-type': 'application/json', ...CORS_HEADERS } },
    )
  }

  const search = new URL(request.url).search
  const target = `${upstreamBase}/${segments.slice(1).join('/')}${search}`

  // new Request(target, request) 原样克隆 method / headers / body（含流式），只换地址。
  const upstream = await fetch(new Request(target, request))

  // 透传上游响应（含 SSE 流），叠加 CORS 头以防从别的源调用。
  const headers = new Headers(upstream.headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v)

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}
