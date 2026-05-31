# Cairn

> 显化你和 AI 学习时的探索过程本身，并在该收的时候帮你收。

完整产品理念见 [`SPEC.md`](./SPEC.md)。这是 **v1 demo**。

## 这版做了什么（v1）

- **对话学习**：你问，老师答（流式）。
- **一张从探索里长出来的图**：你看不见的「观察者」边看边把概念画成**递归嵌套的力导向图**——中心是当前节点、四周是子节点、横切连接是带标签的连线。一次看一层：**点子节点钻进子图（放大＝扩散），点中心 / 面包屑回上层（缩小＝收拢）**，可拖拽排布、滚轮缩放。
- **核心循环**：观察者**提方向 → 你决定推不推（点 chip）→ 该收时它逼你用一句话说出主干**。
  - 节点是探索长出来的，没钻过的点是「空」的——空本身是信息。
  - 横切连接（`A ≈ B`、`是主干`）把树连成图。
- **本地优先**：图、对话、你的 key 全在浏览器 IndexedDB 里，**从不上传**。

三条铁律在代码里的落点：收拢必须你亲手写（`CollapsePrompt`，AI 绝不替你印）；摩擦长成对话的下一句、问连接/预测/压缩而非定义（观察者 prompt）；深度 AI 默认自己猜，只在承重岔路口才把选择权抛给你（`DirectionChips` 的 `loadBearing` 分支）。

**没做的（spec 里「往后推」的）**：漂亮画布、四种戳的精细玩法、伴侣人格 / 跨会话记忆 / 跨图连接。图现在丑——赌的是判断准不准，不是好不好看。

## 跑起来

```bash
npm install
npm run dev
```

打开 http://localhost:5173 ，**选接口形态、粘你自己的 API Key**（BYOK，存本地）。

## 支持的模型接口

两种形态 ＋ 可自定义 base URL，所以官方和第三方都能接：

- **Anthropic**：官方，或任何 Anthropic 兼容 / 代理端点。
- **OpenAI 兼容**：官方 OpenAI，或 OpenRouter、DeepSeek、Together、本地 Ollama/LM Studio… 凡是 OpenAI 兼容协议的都行，base URL 填它们的地址即可。

> ⚠️ 浏览器直连要求端点放行跨域(CORS)。第三方代理 / 本地基本都放行；**官方 `api.openai.com` 默认不放行**——直连请用支持 CORS 的端点，否则就得加一层薄代理（即 spec 里"做托管服务才上后端"那一天）。

## 技术栈

纯前端、无后端：**React + Vite + TypeScript**，`idb`（IndexedDB）存储，浏览器直连（`dangerouslyAllowBrowser`）。调模型抽成 `src/llm/` 一层，按 provider 分发：`@anthropic-ai/sdk` ＋ `openai`。

产品 IP ≈ `src/prompts.ts` 里的**观察者 prompt** ＋ 不断生长的递归图（JSON）。其余都是水管。

```
src/
  prompts.ts     观察者 / 老师 prompt + 结构化输出契约 ← 全部 IP 在这
  llm/
    shared.ts    两套循环的跨 provider 契约
    anthropic.ts Anthropic 实现（messages + tool_use）
    openai.ts    OpenAI 兼容实现（chat.completions + function calling）
    index.ts     按 provider 分发；store 只跟这层打交道
  store.ts       核心循环串联 + 把观察者结果对齐进图
  db.ts          IndexedDB（本地优先）
  types.ts       递归图数据模型
  components/     全是水管
```

## 待办

- ⚠️ 动手前核对 `docs.claude.com`：浏览器直连 header / SDK flag 的当前细节、以及模型 ID（`KeyGate` 里可改）。
- **真正没验的赌注**：观察者在「提方向」和「感知该收了」上判断得准不准、跟你对不对得上。下一步是拿一段现成对话喂进去，看它提的方向和喊停的时机，对得上你真实的「啊哈」和「这条够了」吗。验完才知道这产品立不立得住。
