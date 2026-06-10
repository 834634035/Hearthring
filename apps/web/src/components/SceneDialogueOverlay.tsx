import { useEffect, useRef, useState } from "react";
import { fetchNpcDialogue, type NpcChatMessage } from "../npcDialogueApi";
import type { NpcDialoguePayload } from "../villageNpcs";

type SceneDialogueOverlayProps = {
  nearNpc: { id: string; name: string; title: string } | null;
  dialogue: NpcDialoguePayload | null;
  onClose: () => void;
};

export function SceneDialogueOverlay({ nearNpc, dialogue, onClose }: SceneDialogueOverlayProps) {
  const [messages, setMessages] = useState<NpcChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [source, setSource] = useState<"deepseek" | "fallback" | null>(null);
  const [notice, setNotice] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!dialogue) {
      setMessages([]);
      setInput("");
      setLoading(false);
      setError("");
      setSource(null);
      setNotice("");
      return;
    }

    let cancelled = false;
    const requestId = ++requestIdRef.current;

    void (async () => {
      setLoading(true);
      setError("");
      setNotice("");
      setMessages([]);
      try {
        const result = await fetchNpcDialogue({
          npcId: dialogue.id,
          npcName: dialogue.name,
          npcTitle: dialogue.title,
          persona: dialogue.persona,
          sceneContext: dialogue.sceneContext,
          messages: []
        });
        if (cancelled || requestId !== requestIdRef.current) return;
        setMessages([{ role: "assistant", content: result.reply }]);
        setSource(result.source);
        if (result.message) setNotice(result.message);
      } catch (err) {
        if (cancelled || requestId !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : "对话加载失败");
        setMessages([{ role: "assistant", content: dialogue.fallbackLines.join("\n") }]);
        setSource("fallback");
      } finally {
        if (!cancelled && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dialogue]);

  useEffect(() => {
    const node = bodyRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, loading]);

  async function sendMessage(text: string) {
    if (!dialogue || loading) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const nextMessages: NpcChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const result = await fetchNpcDialogue({
        npcId: dialogue.id,
        npcName: dialogue.name,
        npcTitle: dialogue.title,
        persona: dialogue.persona,
        sceneContext: dialogue.sceneContext,
        messages: nextMessages
      });
      setMessages([...nextMessages, { role: "assistant", content: result.reply }]);
      setSource(result.source);
      if (result.message) setNotice(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setLoading(false);
    }
  }

  if (dialogue) {
    return (
      <div className="scene-dialogue-backdrop" role="presentation" onClick={onClose}>
        <section
          className="scene-dialogue"
          role="dialog"
          aria-modal="true"
          aria-labelledby="scene-dialogue-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="scene-dialogue-header">
            <div>
              <p className="scene-dialogue-eyebrow">
                {dialogue.title}
                {source === "deepseek" ? " · DeepSeek" : source === "fallback" ? " · 本地台词" : ""}
              </p>
              <h2 id="scene-dialogue-title">{dialogue.name}</h2>
            </div>
            <button type="button" className="scene-dialogue-close" onClick={onClose} aria-label="关闭对话">
              ×
            </button>
          </header>
          <div className="scene-dialogue-body" ref={bodyRef}>
            {messages.length === 0 && loading ? (
              <div className="scene-dialogue-row scene-dialogue-row-npc">
                <div className="scene-dialogue-avatar" aria-hidden="true">
                  {dialogue.name.slice(0, 1)}
                </div>
                <div className="scene-dialogue-bubble scene-dialogue-bubble-npc scene-dialogue-bubble-typing">
                  <p className="scene-dialogue-status">萨满正在组织语言…</p>
                </div>
              </div>
            ) : null}
            {messages.map((message, index) => {
              const isNpc = message.role === "assistant";
              return (
                <div
                  key={`${message.role}-${index}`}
                  className={isNpc ? "scene-dialogue-row scene-dialogue-row-npc" : "scene-dialogue-row scene-dialogue-row-player"}
                >
                  {isNpc ? (
                    <div className="scene-dialogue-avatar" aria-hidden="true">
                      {dialogue.name.slice(0, 1)}
                    </div>
                  ) : null}
                  <div
                    className={
                      isNpc
                        ? "scene-dialogue-bubble scene-dialogue-bubble-npc"
                        : "scene-dialogue-bubble scene-dialogue-bubble-player"
                    }
                  >
                    <p>{message.content}</p>
                  </div>
                  {!isNpc ? (
                    <div className="scene-dialogue-avatar scene-dialogue-avatar-player" aria-hidden="true">
                      我
                    </div>
                  ) : null}
                </div>
              );
            })}
            {loading && messages.length > 0 ? (
              <div className="scene-dialogue-row scene-dialogue-row-npc">
                <div className="scene-dialogue-avatar" aria-hidden="true">
                  {dialogue.name.slice(0, 1)}
                </div>
                <div className="scene-dialogue-bubble scene-dialogue-bubble-npc scene-dialogue-bubble-typing">
                  <p className="scene-dialogue-status">思考中…</p>
                </div>
              </div>
            ) : null}
            {error ? <p className="scene-dialogue-error">{error}</p> : null}
            {notice ? <p className="scene-dialogue-notice">{notice}</p> : null}
          </div>
          <footer className="scene-dialogue-footer">
            <form
              className="scene-dialogue-form"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage(input);
              }}
            >
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="继续提问…"
                disabled={loading}
                aria-label="对话输入"
              />
              <button type="submit" className="scene-dialogue-button" disabled={loading || !input.trim()}>
                发送
              </button>
            </form>
            <button type="button" className="scene-dialogue-button scene-dialogue-button-ghost" onClick={onClose}>
              结束对话 · Esc
            </button>
          </footer>
        </section>
      </div>
    );
  }

  if (!nearNpc) return null;

  return (
    <div className="scene-interact-prompt" aria-live="polite">
      按 <kbd>E</kbd> 与 {nearNpc.name} 对话
    </div>
  );
}
