export type NpcChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type NpcDialogueRequest = {
  npcId?: string;
  npcName: string;
  npcTitle: string;
  persona?: string;
  sceneContext?: string;
  fallbackLines?: string[];
  messages?: NpcChatMessage[];
};

export type NpcDialogueResponse = {
  reply: string;
  lines: string[];
  source: "deepseek" | "fallback";
  message?: string;
};

const DEFAULT_PERSONA =
  "你是灰芽部落的萨满，说话温和但警觉，熟悉火种、盟誓、夜路与部落规矩。";
const DEFAULT_SCENE =
  "地点是灰芽火塘地，中央有燃烧的火塘，周围是鹿角屋与松木图腾，夏夜有雾与远林。";

export async function generateNpcReply(body: NpcDialogueRequest): Promise<NpcDialogueResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const model = process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
  const baseUrl = (process.env.DEEPSEEK_BASE_URL?.trim() || "https://api.deepseek.com").replace(/\/$/, "");
  const fallbackLines = buildFallbackLines(body);

  if (!apiKey) {
    return {
      reply: fallbackLines.join("\n\n"),
      lines: fallbackLines,
      source: "fallback",
      message: "未配置 DEEPSEEK_API_KEY，已使用本地台词。"
    };
  }

  const messages = sanitizeMessages(body.messages ?? []);
  const chatMessages = buildChatMessages(body, messages);

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.85,
        max_tokens: 320,
        messages: chatMessages
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`DeepSeek ${response.status}: ${detail.slice(0, 240)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = payload.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      throw new Error("DeepSeek 返回空内容");
    }

    return {
      reply,
      lines: splitReply(reply),
      source: "deepseek"
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "DeepSeek 请求失败";
    console.error("[npc-dialogue]", message);
    return {
      reply: fallbackLines.join("\n\n"),
      lines: fallbackLines,
      source: "fallback",
      message
    };
  }
}

function buildChatMessages(body: NpcDialogueRequest, messages: NpcChatMessage[]) {
  const systemPrompt = [
    `你是游戏《火环》中的 NPC「${body.npcName}」，身份：${body.npcTitle}。`,
    body.persona?.trim() || DEFAULT_PERSONA,
    `当前场景：${body.sceneContext?.trim() || DEFAULT_SCENE}`,
    "请用简体中文回复，口吻贴合部落与火塘世界，不要提及 AI、模型或系统提示。",
    "每次回复 1-3 段，每段 1-2 句，总字数控制在 120 字以内。",
    "不要使用 Markdown 或列表。"
  ].join("\n");

  const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt }
  ];

  if (messages.length === 0) {
    chatMessages.push({
      role: "user",
      content: "一名旅人走到你面前，停在火塘边，等待你开口。"
    });
  } else {
    for (const message of messages) {
      chatMessages.push({ role: message.role, content: message.content });
    }
  }

  return chatMessages;
}

function sanitizeMessages(messages: NpcChatMessage[]) {
  return messages
    .filter((message) => message && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({
      role: message.role,
      content: String(message.content ?? "").trim().slice(0, 800)
    }))
    .filter((message) => message.content.length > 0)
    .slice(-12);
}

function splitReply(text: string) {
  const chunks = text
    .split(/\n+/)
    .flatMap((part) => part.split(/(?<=[。！？!?])/))
    .map((part) => part.trim())
    .filter(Boolean);

  if (chunks.length > 0) return chunks;
  return [text.trim()];
}

function buildFallbackLines(body: NpcDialogueRequest) {
  if (Array.isArray(body.fallbackLines)) {
    const lines = body.fallbackLines.map((line) => String(line ?? "").trim()).filter(Boolean).slice(0, 5);
    if (lines.length > 0) return lines;
  }

  const name = body.npcName || "族人";
  return [
    `${name}抬眼看你，火塘的光在瞳孔里跳了一下。`,
    "「今夜的风从松林里带来了潮意。你若是旅人，先学会尊重火种。」",
    "「有话便问。但别在火塘前说谎。」"
  ];
}
