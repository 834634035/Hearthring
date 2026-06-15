import { useMemo, useState } from "react";
import { getInteractionById, type ChapterInteractionDefinition } from "../chapterInteractions";
import { CHAPTER_QUESTLINE, getNextQuest } from "../chapterQuestline";
import { CHAPTER_SCENES } from "../chapterScenes";
import { ThreeHearthScene } from "../components/ThreeHearthScene";

export function HearthPage() {
  const [sceneId, setSceneId] = useState(CHAPTER_SCENES[0]!.id);
  const [completedQuestIds, setCompletedQuestIds] = useState<string[]>([]);
  const [completedInteractionIds, setCompletedInteractionIds] = useState<string[]>([]);
  const [recentDiscovery, setRecentDiscovery] = useState<ChapterInteractionDefinition | null>(null);
  const activeScene = CHAPTER_SCENES.find((scene) => scene.id === sceneId) ?? CHAPTER_SCENES[0]!;
  const activeQuest = CHAPTER_QUESTLINE.find((quest) => !completedQuestIds.includes(quest.id)) ?? null;

  const inventoryItems = useMemo(
    () =>
      completedInteractionIds
        .map((id) => getInteractionById(id))
        .filter((interaction): interaction is ChapterInteractionDefinition => Boolean(interaction)),
    [completedInteractionIds]
  );

  const activeQuestReady = activeQuest
    ? activeQuest.requiredInteractionIds.every((id) => completedInteractionIds.includes(id))
    : false;

  const handleInteractionComplete = (interaction: ChapterInteractionDefinition) => {
    setCompletedInteractionIds((current) => (current.includes(interaction.id) ? current : [...current, interaction.id]));
    setRecentDiscovery(interaction);
  };

  const handleQuestComplete = (questId: string) => {
    const quest = CHAPTER_QUESTLINE.find((item) => item.id === questId);
    if (!quest) return;
    if (!quest.requiredInteractionIds.every((id) => completedInteractionIds.includes(id))) return;

    setCompletedQuestIds((current) => (current.includes(questId) ? current : [...current, questId]));
    setRecentDiscovery(null);
    const nextQuest = getNextQuest(questId);
    if (nextQuest) setSceneId(nextQuest.sceneId);
  };

  return (
    <main className="game-screen">
      <ThreeHearthScene
        key={activeScene.id}
        sceneDefinition={activeScene}
        activeQuest={activeQuest}
        completedInteractionIds={completedInteractionIds}
        onInteractionComplete={handleInteractionComplete}
        onQuestComplete={handleQuestComplete}
      />

      <section className="game-hud game-hud-title" aria-label="当前场景">
        <p className="eyebrow">Playable Chapter Prototype</p>
        <h1>{activeScene.name}</h1>
        <p>{activeScene.subtitle}</p>
      </section>

      <section className="game-hud game-hud-scenes" aria-label="第一章场景切换">
        {CHAPTER_SCENES.map((scene) => (
          <button
            className={scene.id === sceneId ? "hearth-scene-tab active" : "hearth-scene-tab"}
            key={scene.id}
            onClick={() => setSceneId(scene.id)}
            type="button"
          >
            <span>{scene.type}</span>
            <strong>{scene.name}</strong>
          </button>
        ))}
      </section>

      <section className="game-hud game-hud-quest">
        <div>
          <p className="eyebrow">Chapter Questline</p>
          <h2>{activeQuest ? activeQuest.title : "第一章任务线已完成"}</h2>
          <p>{activeQuest ? activeQuest.summary : "火塘、药草地、溪谷、猎场和共猎草场已经形成第一章闭环。"}</p>
        </div>
        <div className="hearth-quest-objectives">
          {activeQuest ? (
            <>
              <span>
                找 {activeQuest.npcName} · {CHAPTER_SCENES.find((scene) => scene.id === activeQuest.sceneId)?.name}
              </span>
              <ul>
                {activeQuest.requiredInteractionIds.map((interactionId, index) => {
                  const interaction = getInteractionById(interactionId);
                  const done = completedInteractionIds.includes(interactionId);
                  return (
                    <li className={done ? "objective-done" : ""} key={interactionId}>
                      {done ? "已完成" : "未完成"} · {activeQuest.objectives[index] ?? interaction?.label}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <span>
              已完成 {CHAPTER_QUESTLINE.length} / {CHAPTER_QUESTLINE.length}
            </span>
          )}
        </div>
        <div className="hearth-quest-actions">
          <span>
            {completedQuestIds.length} / {CHAPTER_QUESTLINE.length}
          </span>
          {activeQuest && activeQuest.sceneId !== sceneId ? (
            <button className="secondary-button" type="button" onClick={() => setSceneId(activeQuest.sceneId)}>
              前往任务场景
            </button>
          ) : null}
          {activeQuest && activeQuest.sceneId === sceneId ? (
            <span className={activeQuestReady ? "quest-ready" : "quest-waiting"}>
              {activeQuestReady ? "可向 NPC 回报" : "先完成场景互动"}
            </span>
          ) : null}
        </div>
      </section>

      <section className="game-hud game-hud-inventory">
        <div>
          <p className="eyebrow">Inventory</p>
          <h2>任务物品</h2>
          {inventoryItems.length ? (
            <div className="inventory-list">
              {inventoryItems.map((item) => (
                <span key={item.id}>{item.itemName}</span>
              ))}
            </div>
          ) : (
            <p>靠近发光标记，按 F 互动。</p>
          )}
        </div>
        <div>
          <p className="eyebrow">Latest Discovery</p>
          <h2>{recentDiscovery ? recentDiscovery.label : "暂无新发现"}</h2>
          <p>{recentDiscovery ? recentDiscovery.description : "世界会记住你碰过的东西。"}</p>
        </div>
      </section>
    </main>
  );
}
