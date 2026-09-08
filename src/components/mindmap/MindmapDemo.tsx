'use client';

import { useEffect, useRef, useState } from 'react';

interface MindmapDemoProps {
  onClose: () => void;
}

const DEMO_NODES = [
  { id: 'root', final: { x: 50, y: 45 }, scatter: { x: 52, y: 22 }, size: 'root' },
  { id: 'top', final: { x: 45, y: 14 }, scatter: { x: 30, y: 16 }, size: 'dark' },
  { id: 'left', final: { x: 20, y: 51 }, scatter: { x: 12, y: 38 }, size: 'dark' },
  { id: 'left-far', final: { x: 4, y: 50 }, scatter: { x: 7, y: 76 }, size: 'light' },
  { id: 'right', final: { x: 77, y: 45 }, scatter: { x: 88, y: 29 }, size: 'dark' },
  { id: 'right-far', final: { x: 94, y: 60 }, scatter: { x: 96, y: 75 }, size: 'light' },
  { id: 'bottom', final: { x: 43, y: 80 }, scatter: { x: 26, y: 88 }, size: 'dark' },
];

const SLIDE_DURATION = [6000, 4500, 7000];

function FingerPointer({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 80 80" aria-hidden="true">
      <path d="M37 66 25 53c-4-4 2-10 6-6l5 5V26c0-7 10-7 10 0v17l3-4c4-5 11 0 7 5l-4 6 4-4c5-4 10 3 5 7l-5 5 3-1c6-3 9 5 4 8l-11 8c-7 4-16 2-21-4Z" />
      <path d="M44 18v-7" />
    </svg>
  );
}

function DemoDotGraph({ settled, dimmed = false }: { settled: boolean; dimmed?: boolean }) {
  return (
    <div className={`mindmap-demo-dot-graph ${settled ? 'is-settled' : ''} ${dimmed ? 'is-dimmed' : ''}`}>
      <svg className="mindmap-demo-dot-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {DEMO_NODES.filter(node => node.id !== 'root').map(node => <line key={node.id} x1="50" y1="45" x2={node.final.x} y2={node.final.y} />)}
      </svg>
      {DEMO_NODES.map(node => {
        const position = settled ? node.final : node.scatter;
        return <span key={node.id} className={`mindmap-demo-dot mindmap-demo-dot--${node.size} ${node.id === 'right' ? 'mindmap-demo-dot--target' : ''}`} style={{ left: `${position.x}%`, top: `${position.y}%` }} />;
      })}
      <p className="mindmap-demo-root-label">给周末留出不赶时间的完整体验</p>
    </div>
  );
}

export default function MindmapDemo({ onClose }: MindmapDemoProps) {
  const [slide, setSlide] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timer.current = setTimeout(() => setSlide(current => (current + 1) % 3), SLIDE_DURATION[slide]);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [slide]);

  return (
    <section className="mindmap-demo" aria-label="脑图体验示例">
      <button className="mindmap-demo-close-icon" onClick={onClose} type="button" aria-label="关闭示例">×</button>

      <div className="mindmap-demo-viewport">
        <div className="mindmap-demo-track" style={{ transform: `translateX(-${slide * 100}%)` }}>
          <article className={`mindmap-demo-slide mindmap-demo-slide--notes ${slide === 0 ? 'is-active' : ''}`} aria-hidden={slide !== 0}>
            <div className="mindmap-demo-note-page">
              <p className="mindmap-demo-note-title">周末下午看电影计划</p>
              <section className="mindmap-demo-source-card">
                <p className="mindmap-demo-section-label">⌄&nbsp; 提炼原文</p>
                <p>最近有一些热门电影上映，想挑一个周末去看电影。尽量在下午吧，早上睡个懒觉，起床吃午饭、化妆后再出门。</p>
              </section>
              <section className="mindmap-demo-points-card">
                <p className="mindmap-demo-section-label">⌄&nbsp; 看见自己</p>
                <div className="mindmap-demo-point-row mindmap-demo-point-row--target">
                  <div><b>想周末看电影</b><span>最近热门电影上映，计划周末挑一个时间去看。</span></div>
                  <span className="mindmap-demo-plus-real">+</span>
                  <span className="mindmap-demo-magnifier"><span>+</span></span>
                  <FingerPointer className="mindmap-demo-finger mindmap-demo-finger--tap" />
                </div>
                <div className="mindmap-demo-point-row"><div><b>偏好下午场次</b><span>下午的时间安排更从容，也不用赶早。</span></div><span className="mindmap-demo-plus-real">+</span></div>
                <div className="mindmap-demo-point-row"><div><b>周末作息安排</b><span>睡懒觉、吃午饭、化妆后再出门。</span></div><span className="mindmap-demo-plus-real">+</span></div>
              </section>
            </div>
            <div className="mindmap-demo-real-toast"><span>✓</span> 已加入脑图</div>
          </article>

          <article className={`mindmap-demo-slide mindmap-demo-slide--graph ${slide === 1 ? 'is-active' : ''}`} aria-hidden={slide !== 1}>
            <DemoDotGraph settled={slide === 1} />
            <div className="mindmap-demo-graph-toast"><span>✓</span> 分析关联关系，形成聚合图</div>
          </article>

          <article className={`mindmap-demo-slide mindmap-demo-slide--overlay ${slide === 2 ? 'is-active' : ''}`} aria-hidden={slide !== 2}>
            <div className="mindmap-demo-real-page">
              <DemoDotGraph settled dimmed />
              <p className="mindmap-demo-exit">退出</p>
              <div className="mindmap-demo-nav-mock"><span>⌁<small>记录</small></span><span className="is-current">♧<small>脑图</small></span><span>◷<small>历史</small></span></div>
            </div>
            <div className="mindmap-demo-overlay-backdrop" aria-hidden="true" />
            <div className="mindmap-demo-overlay-card">
              <div className="mindmap-demo-overlay-scroll">
                <div className="mindmap-demo-overlay-list">
                  <p><b>给周末留出不赶时间的完整体验</b><span>把观影安排和留白时间放在一起，周末会更从容。</span></p>
                  <p><b>提前预留化妆与通勤时间</b><span>不赶时间，才能真正享受这段安排。</span></p>
                  <p><b>不把一天排得太满</b><span>留出一点空白，休息才不会变成赶行程。</span></p>
                </div>
              </div>
            </div>
            <div className="mindmap-demo-overlay-caption"><span>✓</span>点击任一节点，即可回顾一组相关联的内容</div>
          </article>
        </div>
      </div>

      <div className="mindmap-demo-pagination" aria-label={`第 ${slide + 1} 页，共 3 页`}>
        {[0, 1, 2].map(index => <span key={index} className={index === slide ? 'is-active' : ''} />)}
      </div>
    </section>
  );
}
