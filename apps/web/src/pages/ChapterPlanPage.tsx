import { useEffect, useMemo, useState } from "react";

interface ChapterPurpose {
  emotion: string;
  worldbuilding: string;
  gameplay: string;
  plot: string;
}

interface ChapterScene {
  id: string;
  name: string;
  type: string;
  summary: string;
  interactions: string[];
  assetIds: string[];
}

interface ChapterCharacter {
  id: string;
  name: string;
  role: string;
  tribeName: string;
  secretLevel: number;
  knowledge: string;
  motivation: string;
}

interface ChapterQuest {
  id: string;
  title: string;
  sceneId: string;
  objectives: string[];
  conflict: string;
  reward: string;
}

interface ChapterContentPack {
  id: string;
  title: string;
  purpose: ChapterPurpose;
  scenes: ChapterScene[];
  characters: ChapterCharacter[];
  quests: ChapterQuest[];
  databaseSuggestions: Record<string, string[]>;
  writingRules: string[];
}

const purposeLabels: Record<keyof ChapterPurpose, string> = {
  emotion: "情绪目标",
  worldbuilding: "世界观目标",
  gameplay: "玩法目标",
  plot: "剧情目标"
};

const databaseLabels: Record<string, string> = {
  characters: "人物",
  settlements: "地点",
  resources: "资源",
  events: "事件"
};

export function ChapterPlanPage() {
  const [contentPack, setContentPack] = useState<ChapterContentPack | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/content/first-chapter-content-pack.json")
      .then((response) => {
        if (!response.ok) throw new Error("第一章资料包读取失败");
        return response.json() as Promise<ChapterContentPack>;
      })
      .then(setContentPack)
      .catch((caught: Error) => setError(caught.message));
  }, []);

  const sceneById = useMemo(() => {
    return new Map(contentPack?.scenes.map((scene) => [scene.id, scene.name]) ?? []);
  }, [contentPack]);

  if (error) {
    return (
      <div className="page-stack chapter-page">
        <section className="page-header dashboard-hero">
          <div>
            <p className="eyebrow">Chapter Plan</p>
            <h1>第一章资料包</h1>
          </div>
        </section>
        <div className="error-line">{error}</div>
      </div>
    );
  }

  if (!contentPack) {
    return (
      <div className="page-stack chapter-page">
        <section className="page-header dashboard-hero">
          <div>
            <p className="eyebrow">Chapter Plan</p>
            <h1>正在展开第一章资料包...</h1>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack chapter-page">
      <section className="page-header chapter-hero">
        <div>
          <p className="eyebrow">Chapter Plan</p>
          <h1>{contentPack.title}</h1>
          <p className="chapter-subtitle">
            把灰芽火塘、寻芽礼、小猎、共猎和苦水线索串成可落地的第一章内容包。
          </p>
        </div>
        <div className="chapter-hero-stats" aria-label="第一章内容统计">
          <span>
            <strong>{contentPack.scenes.length}</strong>
            场景
          </span>
          <span>
            <strong>{contentPack.characters.length}</strong>
            人物
          </span>
          <span>
            <strong>{contentPack.quests.length}</strong>
            任务
          </span>
        </div>
      </section>

      <section className="chapter-purpose-grid">
        {(Object.entries(contentPack.purpose) as [keyof ChapterPurpose, string][]).map(([key, value]) => (
          <article className="chapter-purpose-card" key={key}>
            <span>{purposeLabels[key]}</span>
            <p>{value}</p>
          </article>
        ))}
      </section>

      <section className="chapter-main-grid">
        <article className="panel chapter-scenes-panel">
          <div className="panel-title">
            <div>
              <h2>第一章场景</h2>
              <span>每个地点都绑定了可用模型资产与交互内容</span>
            </div>
            <strong className="panel-stat">{contentPack.scenes.length}</strong>
          </div>
          <div className="chapter-scene-grid">
            {contentPack.scenes.map((scene) => (
              <section className="chapter-scene-card" key={scene.id}>
                <div className="chapter-card-head">
                  <span>{scene.type}</span>
                  <strong>{scene.name}</strong>
                </div>
                <p>{scene.summary}</p>
                <div className="chapter-chip-row">
                  {scene.interactions.map((interaction) => (
                    <span className="chapter-chip" key={interaction}>
                      {interaction}
                    </span>
                  ))}
                </div>
                <details className="chapter-assets">
                  <summary>模型资产 {scene.assetIds.length}</summary>
                  <ul>
                    {scene.assetIds.map((assetId) => (
                      <li key={assetId}>{assetId}</li>
                    ))}
                  </ul>
                </details>
              </section>
            ))}
          </div>
        </article>

        <article className="panel chapter-quests-panel">
          <div className="panel-title">
            <div>
              <h2>任务链</h2>
              <span>从火塘日常推进到王兽异常前兆</span>
            </div>
          </div>
          <ol className="chapter-quest-list">
            {contentPack.quests.map((quest, index) => (
              <li className="chapter-quest-item" key={quest.id}>
                <div className="chapter-quest-index">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <span className="timeline-meta">{sceneById.get(quest.sceneId) ?? quest.sceneId}</span>
                  <strong>{quest.title}</strong>
                  <p>{quest.conflict}</p>
                  <div className="chapter-objectives">
                    {quest.objectives.map((objective) => (
                      <span key={objective}>{objective}</span>
                    ))}
                  </div>
                  <small>{quest.reward}</small>
                </div>
              </li>
            ))}
          </ol>
        </article>
      </section>

      <section className="chapter-support-grid">
        <article className="panel">
          <div className="panel-title">
            <div>
              <h2>核心人物</h2>
              <span>秘密层级越高，越接近青岚身世真相</span>
            </div>
          </div>
          <div className="chapter-character-grid">
            {contentPack.characters.map((character) => (
              <section className="chapter-character-card" key={character.id}>
                <div>
                  <strong>{character.name}</strong>
                  <span>{character.tribeName}</span>
                </div>
                <p>{character.role}</p>
                <meter min={0} max={5} value={character.secretLevel} aria-label={`${character.name} 秘密层级`} />
                <small>{character.motivation}</small>
              </section>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <div>
              <h2>可写入资料库</h2>
              <span>下一步可以把这些条目导入后台管理</span>
            </div>
          </div>
          <div className="chapter-database-list">
            {Object.entries(contentPack.databaseSuggestions).map(([key, items]) => (
              <section key={key}>
                <strong>{databaseLabels[key] ?? key}</strong>
                <div className="chapter-chip-row">
                  {items.map((item) => (
                    <span className="chapter-chip dark" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </section>

      <section className="panel chapter-rules-panel">
        <div className="panel-title">
          <div>
            <h2>写作约束</h2>
            <span>防止第一章过早泄露主线真相</span>
          </div>
        </div>
        <ul className="chapter-rule-list">
          {contentPack.writingRules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
