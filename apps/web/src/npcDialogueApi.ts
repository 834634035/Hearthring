import { getAuthToken } from "./api";

export type NpcChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type NpcDialogueRequest = {
  npcId: string;
  npcName: string;
  npcTitle: string;
  persona?: string;
  sceneContext?: string;
  messages: NpcChatMessage[];
};

export type NpcDialogueResponse = {
  reply: string;
  lines: string[];
  source: "deepseek" | "fallback";
  message?: string;
};

export async function fetchNpcDialogue(payload: NpcDialogueRequest) {
  const response = await fetch("/api/npc/dialogue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "NPC 对话请求失败");
  }

  return response.json() as Promise<NpcDialogueResponse>;
}
