import { useState } from "react";
import { CHAPTER_SCENES } from "../chapterScenes";
import { CHAPTER_QUESTLINE, getNextQuest } from "../chapterQuestline";
import { ThreeHearthScene } from "../components/ThreeHearthScene";

export function HearthPage() {
  const [sceneId, setSceneId] = useState(CHAPTER_SCENES[0]!.id);
  const [completedQuestIds, setCompletedQuestIds] = useState<string[]>([]);
  const activeScene = CHAPTER_SCENES.find((scene) => scene.id === sceneId) ?? CHAPTER_SCENES[0]!;
  const activeQuest = CHAPTER_QUESTLINE.find((quest) => !completedQuestIds.includes(quest.id)) ?? null;

  const handleQuestComplete = (questId: string) => {
    setCompletedQuestIds((current) => (current.includes(questId) ? current : [...current, questId]));
    const nextQuest = getNextQuest(questId);
    if (nextQuest) setSceneId(nextQuest.sceneId);
  };

  return (
    <div className="page-stack hearth-page">
      <section className="page-header">
        <div>
          <p className="eyebrow">Three.js Prototype</p>
          <h1>{activeScene.name}</h1>
          <p className="dashboard-subtitle">{activeScene.subtitle}</p>
        </div>
        <div className="status-pill">{activeScene.type}</div>
      </section>

      <section className="hearth-scene-tabs" aria-label="第一章场景切换">
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

      <section className="hearth-quest-panel">
        <div>
          <p className="eyebrow">Chapter Questline</p>
          <h2>{activeQuest ? activeQuest.title : "第一章任务线已跑通"}</h2>
          <p>{activeQuest ? activeQuest.summary : "灰芽寻火的原型流程已经全部完成，可以继续补采集、战斗与奖励系统。"}</p>
        </div>
        <div className="hearth-quest-objectives">
          {activeQuest ? (
            <>
              <span>
                找 {activeQuest.npcName} · {CHAPTER_SCENES.find((scene) => scene.id === activeQuest.sceneId)?.name}
              </span>
              <ul>
                {activeQuest.objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
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
        </div>
      </section>

      <section className="panel hearth-panel">
        <ThreeHearthScene
          key={activeScene.id}
          sceneDefinition={activeScene}
          activeQuest={activeQuest}
          onQuestComplete={handleQuestComplete}
        />
      </section>
    </div>
  );
}
