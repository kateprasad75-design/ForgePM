import { useState, useRef, useEffect, useCallback, useReducer } from "react";

/* ═══════════════════════════════════════════════════════════════════
   FORGE PM — THE CURSOR FOR PRODUCT MANAGERS
   Layout: Activity Bar → Sidebar → Main Workspace → AI Co-pilot
═══════════════════════════════════════════════════════════════════ */

// ── GLOBAL AI CALL ────────────────────────────────────────────────
async function streamAI(systemPrompt, userPrompt, onChunk) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      stream: true,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error("API " + res.status);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of dec.decode(value).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const d = JSON.parse(line.slice(6));
        if (d.delta?.text) { full += d.delta.text; onChunk(full); }
      } catch {}
    }
  }
  return full;
}

// ── MARKDOWN RENDERER ─────────────────────────────────────────────
function MD({ text, compact }) {
  if (!text) return null;
  const fs = compact ? 12 : 13;
  return (
    <div style={{ fontSize: fs, lineHeight: 1.75, color: "#c9d1d9" }}>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) return <h2 key={i} style={{ fontSize: compact ? 14 : 16, fontWeight: 700, color: "#f0f6fc", margin: "18px 0 8px", fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: -0.4 }}>{line.slice(3)}</h2>;
        if (line.startsWith("### ")) return <h3 key={i} style={{ fontSize: 11, fontWeight: 600, color: "#7d8590", textTransform: "uppercase", letterSpacing: 1, margin: "14px 0 5px", fontFamily: "'IBM Plex Mono', monospace" }}>{line.slice(4)}</h3>;
        if (line.startsWith("#### ")) return <h4 key={i} style={{ fontSize: fs, fontWeight: 700, color: "#e6edf3", margin: "10px 0 4px" }}>{line.slice(5)}</h4>;
        if (line.match(/^[-•]\s/)) return <div key={i} style={{ display: "flex", gap: 8, margin: "3px 0", paddingLeft: 4 }}><span style={{ color: "#6366f1", flexShrink: 0, marginTop: "0.2em", fontSize: 10 }}>◆</span><span>{inl(line.slice(2))}</span></div>;
        if (line.match(/^\d+\.\s/)) { const m = line.match(/^(\d+)\.\s(.*)/); return <div key={i} style={{ display: "flex", gap: 10, margin: "4px 0", paddingLeft: 4 }}><span style={{ color: "#6366f1", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, flexShrink: 0, minWidth: 16 }}>{m[1]}.</span><span>{inl(m[2])}</span></div>; }
        if (line.startsWith("- [ ] ")) return <div key={i} style={{ display: "flex", gap: 8, margin: "3px 0" }}><div style={{ width: 13, height: 13, border: "1px solid rgba(99,102,241,0.4)", borderRadius: 3, flexShrink: 0, marginTop: 3 }} /><span>{inl(line.slice(6))}</span></div>;
        if (line === "---") return <hr key={i} style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.07)", margin: "12px 0" }} />;
        if (!line.trim()) return <div key={i} style={{ height: compact ? 4 : 6 }} />;
        return <p key={i} style={{ margin: "2px 0" }}>{inl(line)}</p>;
      })}
    </div>
  );
}
function inl(t) {
  return t.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} style={{ color: "#f0f6fc", fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i} style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", padding: "1px 5px", borderRadius: 3, fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.9em" }}>{p.slice(1, -1)}</code>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={i} style={{ color: "#8b949e" }}>{p.slice(1, -1)}</em>;
    return p;
  });
}

// ── INITIAL STATE ──────────────────────────────────────────────────
const INITIAL_STATE = {
  project: {
    name: "My Product",
    problem: "",
    vision: "",
    stage: "idea", // idea | building | launched
  },
  problemAnalysis: null,
  productVision: null,
  prd: { content: "", generated: false },
  roadmap: {
    now: [
      { id: "r1", title: "Core user authentication", theme: "Foundation", status: "in-progress" },
      { id: "r2", title: "Primary feature MVP", theme: "Core Value", status: "planned" },
    ],
    next: [
      { id: "r3", title: "Onboarding flow redesign", theme: "Activation", status: "planned" },
      { id: "r4", title: "Integrations with key tools", theme: "Ecosystem", status: "planned" },
    ],
    later: [
      { id: "r5", title: "Mobile application", theme: "Expansion", status: "planned" },
      { id: "r6", title: "Enterprise tier features", theme: "Monetisation", status: "planned" },
    ],
  },
  backlog: [
    { id: "T-001", title: "Setup project scaffolding", type: "chore", points: 2, priority: "P0", status: "done", sprint: 1 },
    { id: "T-002", title: "User auth — signup / login", type: "feature", points: 5, priority: "P0", status: "in-progress", sprint: 1 },
    { id: "T-003", title: "Core data model", type: "feature", points: 8, priority: "P0", status: "planned", sprint: 1 },
    { id: "T-004", title: "Primary happy path flow", type: "feature", points: 13, priority: "P1", status: "planned", sprint: 2 },
    { id: "T-005", title: "Empty states & error handling", type: "feature", points: 3, priority: "P1", status: "planned", sprint: 2 },
    { id: "T-006", title: "Analytics instrumentation", type: "chore", points: 3, priority: "P2", status: "planned", sprint: 2 },
    { id: "T-007", title: "Email notifications", type: "feature", points: 5, priority: "P2", status: "planned", sprint: 3 },
    { id: "T-008", title: "Performance optimisation", type: "chore", points: 5, priority: "P3", status: "planned", sprint: 3 },
  ],
  decisions: [],
  aiMessages: [],
};

// ── COLOR SYSTEM ───────────────────────────────────────────────────
const C = {
  bg: "#0D1117",
  surface: "#161B22",
  surfaceHover: "#1C2128",
  border: "rgba(255,255,255,0.07)",
  borderActive: "rgba(99,102,241,0.5)",
  text: "#e6edf3",
  textMuted: "#7d8590",
  textFaint: "#3d444d",
  accent: "#6366f1",
  accentHover: "#818cf8",
  accentBg: "rgba(99,102,241,0.12)",
  green: "#3fb950",
  yellow: "#d29922",
  red: "#f85149",
  orange: "#e3b341",
};

const statusColors = {
  "planned": { bg: "rgba(110,118,129,0.15)", text: "#8b949e", border: "rgba(110,118,129,0.3)" },
  "in-progress": { bg: "rgba(99,102,241,0.12)", text: "#a5b4fc", border: "rgba(99,102,241,0.3)" },
  "done": { bg: "rgba(63,185,80,0.12)", text: "#3fb950", border: "rgba(63,185,80,0.3)" },
  "blocked": { bg: "rgba(248,81,73,0.12)", text: "#f85149", border: "rgba(248,81,73,0.3)" },
};

const priorityColors = {
  "P0": "#f85149", "P1": "#e3b341", "P2": "#6366f1", "P3": "#8b949e"
};

// ── SHARED COMPONENTS ─────────────────────────────────────────────
function Badge({ label, color, bg, border }) {
  return (
    <span style={{
      fontSize: 10, padding: "2px 7px", borderRadius: 4,
      background: bg || "rgba(99,102,241,0.12)",
      color: color || "#a5b4fc",
      border: `1px solid ${border || "rgba(99,102,241,0.25)"}`,
      fontFamily: "'IBM Plex Mono', monospace",
      letterSpacing: 0.3, whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

function AIButton({ onClick, loading, label, small }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      background: loading ? "rgba(99,102,241,0.08)" : C.accentBg,
      border: `1px solid ${loading ? "rgba(99,102,241,0.2)" : "rgba(99,102,241,0.35)"}`,
      borderRadius: small ? 6 : 7,
      color: "#a5b4fc",
      padding: small ? "5px 12px" : "8px 18px",
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: small ? 10 : 11,
      letterSpacing: 0.5,
      cursor: loading ? "not-allowed" : "pointer",
      display: "flex", alignItems: "center", gap: 6,
      transition: "all 0.15s",
      flexShrink: 0,
    }}>
      {loading
        ? <><span style={{ display: "inline-block", width: 10, height: 10, border: "1.5px solid rgba(99,102,241,0.3)", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Generating…</>
        : <><span style={{ fontSize: 12 }}>✦</span> {label}</>
      }
    </button>
  );
}

function SectionHeader({ title, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: -0.3 }}>{title}</h2>
      {action}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      padding: "18px 20px",
      ...style,
    }}>{children}</div>
  );
}

function Input({ value, onChange, placeholder, multiline, rows, style }) {
  const props = {
    value, onChange,
    placeholder,
    style: {
      width: "100%", background: "rgba(255,255,255,0.03)",
      border: `1px solid ${C.border}`,
      borderRadius: 7, color: C.text,
      fontFamily: "'Bricolage Grotesque', sans-serif",
      fontSize: 13, lineHeight: 1.6,
      padding: "10px 13px", outline: "none",
      resize: multiline ? "vertical" : "none",
      transition: "border 0.15s",
      ...style,
    },
  };
  return multiline ? <textarea rows={rows || 4} {...props} /> : <input {...props} />;
}

// ══════════════════════════════════════════════════════════════════
// MODULE: PROBLEM SPACE
// ══════════════════════════════════════════════════════════════════
function ProblemSpace({ state, setState }) {
  const [problemText, setProblemText] = useState(state.project.problem);
  const [loading, setLoading] = useState({ analysis: false, vision: false });
  const [activeTab, setActiveTab] = useState("define");

  const runAnalysis = async () => {
    if (!problemText.trim()) return;
    setLoading(l => ({ ...l, analysis: true }));
    setState(s => ({ ...s, project: { ...s.project, problem: problemText }, problemAnalysis: "" }));
    try {
      await streamAI(
        "You are a world-class product strategist. Be sharp, specific, and opinionated. No generic observations.",
        `Deeply analyse this problem: "${problemText}"

## Problem Analysis

### The Real Problem (Root Cause)
What is ACTUALLY happening beneath the surface? Peel back to the root cause.

### Who Suffers Most
Define the primary sufferer precisely — role, context, frequency of pain.

### Pain Severity
How often? Cost (time/money/emotion)? Current workarounds? Why workarounds fail?

### The Opportunity
What precise gap exists? Quantify if possible. Is this a vitamin or painkiller?

### 5 Whys Breakdown
Chain from symptom → root cause.

### Market Signals
Why is NOW the right time to solve this?

### Verdict
One paragraph: should someone build this? Why?`,
        (t) => setState(s => ({ ...s, problemAnalysis: t }))
      );
    } finally { setLoading(l => ({ ...l, analysis: false })); }
  };

  const runVision = async () => {
    if (!problemText.trim()) return;
    setLoading(l => ({ ...l, vision: true }));
    setState(s => ({ ...s, productVision: "" }));
    try {
      await streamAI(
        "You are a visionary product leader. Be bold, specific, and inspiring.",
        `Based on this problem: "${problemText}"

## Product Vision

### The Core Insight
The single non-obvious insight that makes this product possible.

### Product Concept
What exactly we're building — 2 crisp sentences.

### The Magic Moment
The first moment a user feels the product truly works. Describe it vividly.

### Why Now
What changed in tech, behaviour, or market that makes this buildable today?

### North Star
One sentence defining success in 3 years.

### What We Are NOT
3 explicit boundaries — what this product will never be.

### Analogies
"It's like X but for Y" — 2-3 powerful analogies.`,
        (t) => setState(s => ({ ...s, productVision: t }))
      );
      setActiveTab("vision");
    } finally { setLoading(l => ({ ...l, vision: false })); }
  };

  const TABS = [
    { id: "define", label: "Define Problem" },
    { id: "analysis", label: "Analysis", badge: state.problemAnalysis ? "✓" : null },
    { id: "vision", label: "Product Vision", badge: state.productVision ? "✓" : null },
  ];

  return (
    <div style={{ padding: "24px 28px", height: "100%", overflow: "auto" }}>
      <SectionHeader title="Problem Space" action={
        <div style={{ display: "flex", gap: 8 }}>
          <AIButton onClick={runAnalysis} loading={loading.analysis} label="Analyse Problem" small />
          <AIButton onClick={runVision} loading={loading.vision} label="Build Vision" small />
        </div>
      } />

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: "transparent", border: "none",
            borderBottom: activeTab === t.id ? `2px solid ${C.accent}` : "2px solid transparent",
            padding: "8px 14px", cursor: "pointer",
            color: activeTab === t.id ? C.accent : C.textMuted,
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: 13, fontWeight: activeTab === t.id ? 600 : 400,
            display: "flex", alignItems: "center", gap: 6,
            transition: "all 0.15s",
          }}>
            {t.label}
            {t.badge && <span style={{ fontSize: 9, color: C.green, fontFamily: "'IBM Plex Mono', monospace" }}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {activeTab === "define" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 800 }}>
          <Card>
            <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>Core Problem Statement</div>
            <textarea
              value={problemText}
              onChange={e => setProblemText(e.target.value)}
              placeholder="Describe the problem you're solving in detail...&#10;&#10;Who has this problem? How often? What do they do today? What does it cost them?"
              style={{
                width: "100%", minHeight: 120, background: "rgba(255,255,255,0.02)",
                border: `1px solid ${C.border}`, borderRadius: 7, color: C.text,
                fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 14, lineHeight: 1.7,
                padding: "12px 14px", resize: "vertical", outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <AIButton onClick={runAnalysis} loading={loading.analysis} label="Analyse this problem" />
              <AIButton onClick={runVision} loading={loading.vision} label="Build product vision" />
            </div>
          </Card>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card>
              <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>Project Name</div>
              <Input value={state.project.name} onChange={e => setState(s => ({ ...s, project: { ...s.project, name: e.target.value } }))} placeholder="Your product name" />
            </Card>
            <Card>
              <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>Stage</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["idea", "building", "launched"].map(s => (
                  <button key={s} onClick={() => setState(st => ({ ...st, project: { ...st.project, stage: s } }))} style={{
                    flex: 1, padding: "8px 4px",
                    background: state.project.stage === s ? C.accentBg : "transparent",
                    border: `1px solid ${state.project.stage === s ? C.borderActive : C.border}`,
                    borderRadius: 6, color: state.project.stage === s ? "#a5b4fc" : C.textMuted,
                    fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 12, cursor: "pointer",
                    textTransform: "capitalize",
                  }}>{s}</button>
                ))}
              </div>
            </Card>
          </div>

          {/* Example problems */}
          <div>
            <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.textFaint, letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" }}>Example Problems</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                "Restaurant owners lose 30% revenue to no-shows with no affordable reservation management tool",
                "Remote teams can't tell if colleagues are focused or available — constant interruptions destroy flow",
                "First-gen students miss out on billions in financial aid because the process is confusing and opaque",
                "Freelancers waste 6+ hours weekly on invoicing, chasing payments, and tracking expenses",
              ].map((ex, i) => (
                <button key={i} onClick={() => setProblemText(ex)} style={{
                  background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`,
                  borderRadius: 7, padding: "10px 14px", textAlign: "left",
                  color: C.textMuted, fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontSize: 12, cursor: "pointer", transition: "all 0.15s",
                }}>
                  <span style={{ color: C.accent, marginRight: 8 }}>→</span>{ex}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "analysis" && (
        <div style={{ maxWidth: 800 }}>
          {!state.problemAnalysis ? (
            <Card style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🧠</div>
              <div style={{ color: C.textMuted, marginBottom: 16 }}>No analysis yet. Define your problem first.</div>
              <AIButton onClick={() => { setActiveTab("define"); }} label="Go to Problem Definition" />
            </Card>
          ) : (
            <Card><MD text={state.problemAnalysis} /></Card>
          )}
        </div>
      )}

      {activeTab === "vision" && (
        <div style={{ maxWidth: 800 }}>
          {!state.productVision ? (
            <Card style={{ textAlign: "center", padding: "48px 24px" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💡</div>
              <div style={{ color: C.textMuted, marginBottom: 16 }}>Generate analysis first, then build the product vision.</div>
            </Card>
          ) : (
            <Card><MD text={state.productVision} /></Card>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MODULE: ROADMAP
// ══════════════════════════════════════════════════════════════════
function Roadmap({ state, setState }) {
  const [loading, setLoading] = useState(false);
  const [newItem, setNewItem] = useState({ col: null, title: "", theme: "" });

  const generateRoadmap = async () => {
    if (!state.project.problem) return;
    setLoading(true);
    try {
      let raw = "";
      await streamAI(
        "You are a senior PM. Return ONLY valid JSON, no markdown, no explanation.",
        `Create a product roadmap for this problem: "${state.project.problem}"

Return JSON exactly like this:
{
  "now": [
    {"id":"r1","title":"Feature name","theme":"Theme","status":"planned"},
    {"id":"r2","title":"Feature name","theme":"Theme","status":"in-progress"}
  ],
  "next": [
    {"id":"r3","title":"Feature name","theme":"Theme","status":"planned"},
    {"id":"r4","title":"Feature name","theme":"Theme","status":"planned"}
  ],
  "later": [
    {"id":"r5","title":"Feature name","theme":"Theme","status":"planned"},
    {"id":"r6","title":"Feature name","theme":"Theme","status":"planned"}
  ]
}

NOW = Sprint 1-4 (core loop, must-have for product to exist)
NEXT = Sprint 5-12 (retention and growth features)
LATER = Month 6+ (scale, moats, expansion)

Generate 3-4 items per column. Use real feature names.`,
        (t) => { raw = t; }
      );
      try {
        const clean = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        setState(s => ({ ...s, roadmap: parsed }));
      } catch {}
    } finally { setLoading(false); }
  };

  const addItem = (col) => {
    if (!newItem.title.trim()) return;
    const id = "r" + Date.now();
    setState(s => ({
      ...s,
      roadmap: {
        ...s.roadmap,
        [col]: [...s.roadmap[col], { id, title: newItem.title, theme: newItem.theme || "General", status: "planned" }]
      }
    }));
    setNewItem({ col: null, title: "", theme: "" });
  };

  const removeItem = (col, id) => {
    setState(s => ({ ...s, roadmap: { ...s.roadmap, [col]: s.roadmap[col].filter(i => i.id !== id) } }));
  };

  const updateStatus = (col, id, status) => {
    setState(s => ({
      ...s,
      roadmap: {
        ...s.roadmap,
        [col]: s.roadmap[col].map(i => i.id === id ? { ...i, status } : i)
      }
    }));
  };

  const COLUMNS = [
    { key: "now", label: "NOW", sub: "Months 1–2", color: "#3fb950", icon: "🟢" },
    { key: "next", label: "NEXT", sub: "Months 3–5", color: "#e3b341", icon: "🟡" },
    { key: "later", label: "LATER", sub: "Months 6+", color: "#6366f1", icon: "🔵" },
  ];

  const themeColors = ["#6366f1", "#3fb950", "#e3b341", "#f85149", "#06b6d4", "#ec4899"];
  const themeMap = {};
  let ci = 0;
  [...(state.roadmap.now || []), ...(state.roadmap.next || []), ...(state.roadmap.later || [])].forEach(item => {
    if (!themeMap[item.theme]) { themeMap[item.theme] = themeColors[ci % themeColors.length]; ci++; }
  });

  return (
    <div style={{ padding: "24px 28px", height: "100%", display: "flex", flexDirection: "column" }}>
      <SectionHeader title="Product Roadmap" action={
        <AIButton onClick={generateRoadmap} loading={loading} label={state.roadmap.now?.length ? "Regenerate Roadmap" : "Generate from Problem"} small />
      } />

      {/* Theme legend */}
      {Object.keys(themeMap).length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {Object.entries(themeMap).map(([theme, color]) => (
            <div key={theme} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", background: color + "15", border: `1px solid ${color}30`, borderRadius: 20, fontSize: 11, color }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
              {theme}
            </div>
          ))}
        </div>
      )}

      {/* Columns */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, overflow: "auto" }}>
        {COLUMNS.map(col => (
          <div key={col.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Col header */}
            <div style={{
              background: col.color + "12", border: `1px solid ${col.color}25`,
              borderRadius: 9, padding: "10px 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: col.color, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>{col.label}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1 }}>{col.sub}</div>
              </div>
              <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted }}>{(state.roadmap[col.key] || []).length} items</div>
            </div>

            {/* Items */}
            <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
              {(state.roadmap[col.key] || []).map(item => (
                <div key={item.id} style={{
                  background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: "11px 13px",
                  position: "relative",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1, fontSize: 13, color: C.text, lineHeight: 1.4, fontWeight: 500 }}>{item.title}</div>
                    <button onClick={() => removeItem(col.key, item.id)} style={{ background: "none", border: "none", color: C.textFaint, cursor: "pointer", fontSize: 14, flexShrink: 0, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: (themeMap[item.theme] || C.accent) + "15", color: themeMap[item.theme] || C.accent, fontFamily: "'IBM Plex Mono', monospace" }}>{item.theme}</div>
                    <select value={item.status} onChange={e => updateStatus(col.key, item.id, e.target.value)} style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      background: statusColors[item.status]?.bg || "transparent",
                      border: `1px solid ${statusColors[item.status]?.border || C.border}`,
                      color: statusColors[item.status]?.text || C.textMuted,
                      fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer", outline: "none",
                    }}>
                      <option value="planned">planned</option>
                      <option value="in-progress">in-progress</option>
                      <option value="done">done</option>
                      <option value="blocked">blocked</option>
                    </select>
                  </div>
                </div>
              ))}

              {/* Add item */}
              {newItem.col === col.key ? (
                <div style={{ background: C.surface, border: `1px solid ${C.borderActive}`, borderRadius: 8, padding: "11px 13px" }}>
                  <input value={newItem.title} onChange={e => setNewItem(n => ({ ...n, title: e.target.value }))} placeholder="Feature title…" onKeyDown={e => e.key === "Enter" && addItem(col.key)} autoFocus style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 13, marginBottom: 6 }} />
                  <input value={newItem.theme} onChange={e => setNewItem(n => ({ ...n, theme: e.target.value }))} placeholder="Theme…" style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: C.textMuted, fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 11 }} />
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button onClick={() => addItem(col.key)} style={{ fontSize: 11, padding: "4px 10px", background: C.accentBg, border: `1px solid ${C.borderActive}`, borderRadius: 5, color: "#a5b4fc", cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" }}>Add</button>
                    <button onClick={() => setNewItem({ col: null, title: "", theme: "" })} style={{ fontSize: 11, padding: "4px 10px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 5, color: C.textMuted, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setNewItem({ col: col.key, title: "", theme: "" })} style={{ background: "transparent", border: `1px dashed ${C.border}`, borderRadius: 8, padding: "10px", color: C.textFaint, cursor: "pointer", fontSize: 12, fontFamily: "'Bricolage Grotesque', sans-serif", transition: "all 0.15s" }}>
                  + Add item
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MODULE: PRD
// ══════════════════════════════════════════════════════════════════
function PRDModule({ state, setState }) {
  const [loading, setLoading] = useState(false);
  const [featureIdea, setFeatureIdea] = useState("");

  const generate = async () => {
    const src = featureIdea.trim() || state.project.problem;
    if (!src) return;
    setLoading(true);
    setState(s => ({ ...s, prd: { content: "", generated: false } }));
    try {
      await streamAI(
        "You are a senior PM writing production-ready documentation. Be specific, technical, and opinionated.",
        `Write a complete PRD for: "${src}"
${state.project.problem ? `\nProduct context: ${state.project.problem}` : ""}

## [Feature/Product Name] — Product Requirements Document
**Status:** Draft | **Version:** 1.0 | **Date:** ${new Date().toLocaleDateString()}

### TL;DR
Two sentences: what we're building and why it matters.

### Problem Statement
Full problem context. Who has it, how often, what it costs them.

### Goals
- Goal 1 → **Metric:** How we measure it
- Goal 2 → **Metric:** How we measure it
- Goal 3 → **Metric:** How we measure it

### Non-Goals
What we are explicitly NOT doing in v1.

### User Stories
6 user stories in: "As a [persona], I want to [action] so that [outcome]"

### Functional Requirements
10+ numbered, specific, testable requirements.

### Technical Requirements
Performance, security, integration, and infrastructure requirements.

### Edge Cases & Error States
8+ specific edge cases the engineering team must handle.

### Acceptance Criteria
Clear, testable criteria for each major requirement area.

### Dependencies & Risks

### Open Questions
What must be answered before build starts?`,
        (t) => setState(s => ({ ...s, prd: { content: t, generated: false } }))
      );
      setState(s => ({ ...s, prd: { ...s.prd, generated: true } }));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: "24px 28px", height: "100%", display: "flex", flexDirection: "column" }}>
      <SectionHeader title="PRD — Product Requirements" action={
        <AIButton onClick={generate} loading={loading} label="Generate PRD" small />
      } />

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input
          value={featureIdea}
          onChange={e => setFeatureIdea(e.target.value)}
          onKeyDown={e => e.key === "Enter" && generate()}
          placeholder={state.project.problem ? "Enter a specific feature (or leave blank to use the main problem)…" : "What are you building? Describe the feature or product…"}
          style={{
            flex: 1, background: "rgba(255,255,255,0.03)",
            border: `1px solid ${C.border}`, borderRadius: 7,
            color: C.text, fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: 13, padding: "9px 13px", outline: "none",
          }}
        />
        <AIButton onClick={generate} loading={loading} label="Generate" small />
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {!state.prd.content ? (
          <Card style={{ textAlign: "center", padding: "60px 24px" }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>📄</div>
            <div style={{ fontSize: 15, color: C.text, fontWeight: 600, marginBottom: 8 }}>No PRD generated yet</div>
            <div style={{ color: C.textMuted, fontSize: 13, marginBottom: 20, maxWidth: 360, margin: "0 auto 20px" }}>
              Describe a feature or use your problem statement to generate a complete, production-ready PRD with user stories, requirements, and acceptance criteria.
            </div>
          </Card>
        ) : (
          <Card style={{ maxWidth: 820 }}>
            <MD text={state.prd.content} />
          </Card>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MODULE: BACKLOG
// ══════════════════════════════════════════════════════════════════
function Backlog({ state, setState }) {
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [newTicket, setNewTicket] = useState(null);
  const [editId, setEditId] = useState(null);

  const generateTickets = async () => {
    if (!state.project.problem && !state.prd.content) return;
    setLoading(true);
    try {
      let raw = "";
      await streamAI(
        "You are a senior PM. Return ONLY valid JSON array, no markdown fences.",
        `Generate sprint tickets for: "${state.project.problem || "this product"}"

Return a JSON array:
[
  {"id":"T-001","title":"Ticket title","type":"feature","points":5,"priority":"P0","status":"planned","sprint":1},
  ...
]

Types: feature, bug, chore
Points: 1,2,3,5,8,13
Priority: P0 (critical), P1 (high), P2 (medium), P3 (low)
Sprint: 1, 2, or 3

Generate 10 realistic tickets covering: auth, core data model, primary user flows, error states, analytics, and key features.`,
        (t) => { raw = t; }
      );
      try {
        const clean = raw.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) setState(s => ({ ...s, backlog: parsed }));
      } catch {}
    } finally { setLoading(false); }
  };

  const updateTicket = (id, field, value) => {
    setState(s => ({ ...s, backlog: s.backlog.map(t => t.id === id ? { ...t, [field]: value } : t) }));
  };

  const addTicket = () => {
    const id = "T-" + String(state.backlog.length + 1).padStart(3, "0");
    const ticket = { id, title: "New ticket", type: "feature", points: 3, priority: "P2", status: "planned", sprint: 1 };
    setState(s => ({ ...s, backlog: [ticket, ...s.backlog] }));
    setEditId(id);
  };

  const filtered = state.backlog.filter(t =>
    filter === "all" ? true :
    filter === "sprint1" ? t.sprint === 1 :
    filter === "in-progress" ? t.status === "in-progress" :
    filter === "done" ? t.status === "done" : true
  );

  const FILTERS = [
    { id: "all", label: "All" },
    { id: "sprint1", label: "Sprint 1" },
    { id: "in-progress", label: "In Progress" },
    { id: "done", label: "Done" },
  ];

  const typeIcon = { feature: "✦", bug: "⚠", chore: "⚙" };
  const typeColor = { feature: C.accent, bug: C.red, chore: C.textMuted };

  const totalPoints = filtered.reduce((a, t) => a + (t.points || 0), 0);
  const donePoints = filtered.filter(t => t.status === "done").reduce((a, t) => a + (t.points || 0), 0);

  return (
    <div style={{ padding: "24px 28px", height: "100%", display: "flex", flexDirection: "column" }}>
      <SectionHeader title="Backlog" action={
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addTicket} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 12px", color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, cursor: "pointer" }}>+ Add Ticket</button>
          <AIButton onClick={generateTickets} loading={loading} label="Generate from PRD" small />
        </div>
      } />

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        {[
          { label: "Total", value: state.backlog.length, color: C.text },
          { label: "Points", value: `${donePoints}/${totalPoints}`, color: C.accent },
          { label: "In Progress", value: state.backlog.filter(t => t.status === "in-progress").length, color: "#e3b341" },
          { label: "Done", value: state.backlog.filter(t => t.status === "done").length, color: C.green },
        ].map(s => (
          <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 14px", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: s.color, fontFamily: "'IBM Plex Mono', monospace" }}>{s.value}</span>
            <span style={{ fontSize: 11, color: C.textMuted }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 12, borderBottom: `1px solid ${C.border}` }}>
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            background: "transparent", border: "none",
            borderBottom: filter === f.id ? `2px solid ${C.accent}` : "2px solid transparent",
            padding: "7px 14px", cursor: "pointer",
            color: filter === f.id ? C.accent : C.textMuted,
            fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 12,
            fontWeight: filter === f.id ? 600 : 400,
          }}>{f.label}</button>
        ))}
      </div>

      {/* Ticket table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 60px 50px 60px 80px 70px", gap: 0, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted, padding: "6px 10px", letterSpacing: 0.5, borderBottom: `1px solid ${C.border}` }}>
          <span>ID</span><span>TITLE</span><span>TYPE</span><span>PTS</span><span>SPRINT</span><span>PRIORITY</span><span>STATUS</span>
        </div>
        {filtered.map(ticket => (
          <div key={ticket.id} onClick={() => setEditId(editId === ticket.id ? null : ticket.id)} style={{
            display: "grid",
            gridTemplateColumns: "70px 1fr 60px 50px 60px 80px 70px",
            gap: 0,
            padding: "10px 10px",
            borderBottom: `1px solid ${C.border}`,
            cursor: "pointer",
            background: editId === ticket.id ? "rgba(99,102,241,0.05)" : "transparent",
            transition: "background 0.1s",
            alignItems: "center",
          }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: C.textMuted }}>{ticket.id}</span>
            {editId === ticket.id ? (
              <input
                value={ticket.title}
                onChange={e => { e.stopPropagation(); updateTicket(ticket.id, "title", e.target.value); }}
                onClick={e => e.stopPropagation()}
                style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 13, width: "100%" }}
              />
            ) : (
              <span style={{ fontSize: 13, color: ticket.status === "done" ? C.textMuted : C.text, textDecoration: ticket.status === "done" ? "line-through" : "none" }}>{ticket.title}</span>
            )}
            <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: typeColor[ticket.type] }}>{typeIcon[ticket.type]} {ticket.type}</span>
            <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.text }}>{ticket.points}pt</span>
            <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted }}>S{ticket.sprint}</span>
            <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: priorityColors[ticket.priority], fontWeight: 600 }}>{ticket.priority}</span>
            <div onClick={e => e.stopPropagation()}>
              <select value={ticket.status} onChange={e => updateTicket(ticket.id, "status", e.target.value)} style={{
                fontSize: 10, padding: "3px 6px", borderRadius: 4,
                background: statusColors[ticket.status]?.bg || "transparent",
                border: `1px solid ${statusColors[ticket.status]?.border || C.border}`,
                color: statusColors[ticket.status]?.text || C.textMuted,
                fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer", outline: "none",
              }}>
                <option value="planned">planned</option>
                <option value="in-progress">in-progress</option>
                <option value="done">done</option>
                <option value="blocked">blocked</option>
              </select>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 24px", color: C.textMuted, fontSize: 13 }}>
            No tickets. Generate from your PRD or add manually.
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MODULE: DECISIONS
// ══════════════════════════════════════════════════════════════════
function Decisions({ state, setState }) {
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState("");
  const [activeDecision, setActiveDecision] = useState(null);
  const [analysis, setAnalysis] = useState({});

  const analyseDecision = async (d) => {
    setLoading(true);
    setAnalysis(a => ({ ...a, [d.id]: "" }));
    try {
      await streamAI(
        "You are a strategic product advisor. Be direct, specific, and give real recommendations.",
        `Analyse this PM decision: "${d.question}"
${state.project.problem ? `Product context: ${state.project.problem}` : ""}

## Decision Analysis

### The Core Tension
What two or more things are actually in conflict?

### Options
For each option (2-3 realistic options):
**Option: [Name]**
- What you gain
- What you give up
- Reversibility (easy/hard/impossible to undo)
- Who benefits, who doesn't

### Second-Order Consequences
3-5 non-obvious effects 6 months from now.

### Missing Information
What do you not know that you should find out before deciding?

### Recommendation
A direct recommendation with confidence level (High/Medium/Low) and why.

### The One Question
The single sharpest question that cuts to the heart of this decision.`,
        (t) => setAnalysis(a => ({ ...a, [d.id]: t }))
      );
    } finally { setLoading(false); }
  };

  const addDecision = () => {
    if (!decision.trim()) return;
    const d = { id: Date.now(), question: decision, date: new Date().toLocaleDateString(), resolved: false };
    setState(s => ({ ...s, decisions: [d, ...s.decisions] }));
    setDecision("");
    setActiveDecision(d.id);
    analyseDecision(d);
  };

  const EXAMPLES = [
    "Should we build our own auth system or use a third-party like Auth0?",
    "Do we launch with a freemium model or a free trial?",
    "Should we target SMBs first or go upmarket to enterprise?",
    "Should we build a mobile app now or focus on web first?",
  ];

  return (
    <div style={{ padding: "24px 28px", height: "100%", display: "flex", flexDirection: "column" }}>
      <SectionHeader title="Decision Log" />

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={decision}
          onChange={e => setDecision(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addDecision()}
          placeholder="What decision are you facing? Be specific…"
          style={{
            flex: 1, background: "rgba(255,255,255,0.03)",
            border: `1px solid ${C.border}`, borderRadius: 7,
            color: C.text, fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: 13, padding: "10px 13px", outline: "none",
          }}
        />
        <AIButton onClick={addDecision} loading={loading} label="Map Tradeoffs" small />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {EXAMPLES.map((ex, i) => (
          <button key={i} onClick={() => setDecision(ex)} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 16, padding: "4px 12px", fontSize: 11, color: C.textMuted, cursor: "pointer", fontFamily: "'Bricolage Grotesque', sans-serif" }}>
            {ex.slice(0, 48)}…
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex", gap: 16 }}>
        {/* Decision list */}
        <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {state.decisions.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: 12, textAlign: "center", paddingTop: 20 }}>No decisions logged yet.</div>
          ) : state.decisions.map(d => (
            <button key={d.id} onClick={() => setActiveDecision(d.id)} style={{
              background: activeDecision === d.id ? C.accentBg : C.surface,
              border: `1px solid ${activeDecision === d.id ? C.borderActive : C.border}`,
              borderRadius: 8, padding: "11px 13px", textAlign: "left", cursor: "pointer",
            }}>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.4, marginBottom: 5 }}>{d.question}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>{d.date}</span>
                {analysis[d.id] && <Badge label="analysed" color={C.green} bg={C.green + "15"} border={C.green + "30"} />}
              </div>
            </button>
          ))}
        </div>

        {/* Analysis */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {activeDecision && (
            <Card style={{ maxWidth: 700 }}>
              {analysis[activeDecision]
                ? <MD text={analysis[activeDecision]} />
                : <div style={{ display: "flex", alignItems: "center", gap: 10, color: C.textMuted, padding: "20px 0" }}>
                    <div style={{ width: 16, height: 16, border: `2px solid ${C.accentBg}`, borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                    Analysing decision…
                  </div>
              }
            </Card>
          )}
          {!activeDecision && state.decisions.length > 0 && (
            <div style={{ color: C.textMuted, fontSize: 13, paddingTop: 20 }}>Select a decision to see the analysis.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MODULE: DASHBOARD
// ══════════════════════════════════════════════════════════════════
function Dashboard({ state, setModule }) {
  const done = state.backlog.filter(t => t.status === "done").length;
  const inProgress = state.backlog.filter(t => t.status === "in-progress").length;
  const totalTickets = state.backlog.length;
  const roadmapItems = (state.roadmap.now?.length || 0) + (state.roadmap.next?.length || 0) + (state.roadmap.later?.length || 0);

  const QUICK = [
    { label: "Analyse a problem", icon: "🧠", module: "problem", desc: "Define and deeply analyse your core problem" },
    { label: "Build roadmap", icon: "🗺️", module: "roadmap", desc: "Now / Next / Later with AI generation" },
    { label: "Write a PRD", icon: "📄", module: "prd", desc: "Full requirements doc in seconds" },
    { label: "Manage backlog", icon: "🎫", module: "backlog", desc: "Tickets, prioritisation, sprint planning" },
    { label: "Map a decision", icon: "⚖️", module: "decisions", desc: "Tradeoffs, risks, and recommendations" },
  ];

  return (
    <div style={{ padding: "24px 28px", height: "100%", overflow: "auto" }}>
      <div style={{ maxWidth: 860 }}>
        {/* Welcome */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: -0.8, fontFamily: "'Bricolage Grotesque', sans-serif", marginBottom: 4 }}>
            {state.project.name}
          </h1>
          <div style={{ fontSize: 13, color: C.textMuted }}>
            {state.project.problem ? state.project.problem.slice(0, 120) + "…" : "Define your problem to get started →"}
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Roadmap Items", value: roadmapItems, color: "#6366f1", icon: "🗺️" },
            { label: "Backlog Tickets", value: totalTickets, color: "#e3b341", icon: "🎫" },
            { label: "In Progress", value: inProgress, color: "#06b6d4", icon: "▶" },
            { label: "Completed", value: done, color: "#3fb950", icon: "✓" },
          ].map(s => (
            <div key={s.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: s.color, fontFamily: "'IBM Plex Mono', monospace" }}>{s.value}</span>
              </div>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Quick Actions</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {QUICK.map(q => (
              <button key={q.module} onClick={() => setModule(q.module)} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 10, padding: "14px 16px", textAlign: "left",
                cursor: "pointer", transition: "all 0.15s",
              }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{q.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 4, fontFamily: "'Bricolage Grotesque', sans-serif" }}>{q.label}</div>
                <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>{q.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Recent decisions */}
        {state.decisions.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: C.textMuted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>Recent Decisions</div>
            {state.decisions.slice(0, 3).map(d => (
              <div key={d.id} onClick={() => setModule("decisions")} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "11px 14px", marginBottom: 6, cursor: "pointer" }}>
                <div style={{ fontSize: 13, color: C.text }}>{d.question}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4, fontFamily: "'IBM Plex Mono', monospace" }}>{d.date}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// AI CO-PILOT PANEL (always-on, context-aware like Cursor)
// ══════════════════════════════════════════════════════════════════
const PM_COPILOT_SYSTEM = `You are an elite PM co-pilot embedded inside a product management workspace called Forge PM. 

You have deep expertise in:
- Product strategy, roadmapping, user research, PRDs, tickets
- Feature prioritisation (RICE, ICE, MoSCoW, Kano)
- Agile, sprint planning, stakeholder management
- Metrics, OKRs, growth, retention, monetisation
- UX thinking, competitive analysis, go-to-market

BEHAVIOUR:
- Answer like a trusted senior PM colleague — direct, specific, opinionated
- You can see context about what module the PM is currently in
- Give ACTIONABLE answers, not generic advice
- For document requests, generate the full document immediately
- Call out risks, tradeoffs, and blindspots they haven't considered
- Be concise for simple questions, comprehensive for document generation
- When generating documents, use proper markdown with headers

The PM is using this tool to build their product. Help them move faster.`;

function CopilotPanel({ state, currentModule }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const moduleContext = {
    dashboard: "The PM is on the Dashboard overview.",
    problem: "The PM is in the Problem Space module, defining and analysing their core problem.",
    roadmap: "The PM is building a product roadmap.",
    prd: "The PM is writing a PRD (Product Requirements Document).",
    backlog: "The PM is managing their product backlog and tickets.",
    decisions: "The PM is logging and analysing product decisions.",
  };

  const SUGGESTIONS = {
    dashboard: ["How do I prioritise what to work on first?", "What should a PM do in week 1 of a new product?"],
    problem: ["What makes a problem worth solving?", "How do I validate this problem is real?", "Write a problem statement for my idea"],
    roadmap: ["What should be in MVP vs v2?", "How do I say no to stakeholders?", "What makes a good roadmap theme?"],
    prd: ["What makes a PRD great vs mediocre?", "How detailed should acceptance criteria be?", "What edge cases am I probably missing?"],
    backlog: ["How do I estimate story points?", "What is a good sprint velocity for a small team?", "How do I run a grooming session?"],
    decisions: ["How do I make a build vs buy decision?", "When should I delay a decision vs decide now?"],
  };

  const send = async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    setInput("");

    const ctx = moduleContext[currentModule] || "";
    const projectCtx = state.project.problem ? `\nProduct context: "${state.project.problem}"` : "";

    const userMsg = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: "assistant", content: "", streaming: true }]);
    setLoading(true);

    try {
      const apiMessages = history.map(m => ({ role: m.role, content: m.content }));
      apiMessages[apiMessages.length - 1].content = `[Context: ${ctx}${projectCtx}]\n\n${text}`;

      await streamAI(PM_COPILOT_SYSTEM, apiMessages.map(m => m.content).join("\n\nUser: "), (t) => {
        setMessages(prev => { const n = [...prev]; n[n.length - 1] = { role: "assistant", content: t, streaming: true }; return n; });
      });
      setMessages(prev => { const n = [...prev]; n[n.length - 1] = { ...n[n.length - 1], streaming: false }; return n; });
    } catch {
      setMessages(prev => { const n = [...prev]; n[n.length - 1] = { role: "assistant", content: "Something went wrong. Try again.", streaming: false }; return n; });
    } finally { setLoading(false); }
  };

  const isEmpty = messages.length === 0;
  const suggestions = SUGGESTIONS[currentModule] || SUGGESTIONS.dashboard;

  return (
    <div style={{ width: 320, flexShrink: 0, background: "#0D1117", borderLeft: `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>✦</div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: "'Bricolage Grotesque', sans-serif" }}>PM Co-Pilot</div>
          <div style={{ fontSize: 9, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>Context: {currentModule}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, animation: "pulse 2s infinite" }} />
          <span style={{ fontSize: 9, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>online</span>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px" }}>
        {isEmpty && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
              Ask me anything — I'm context-aware of what you're working on.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => send(s)} style={{
                  background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`,
                  borderRadius: 7, padding: "8px 10px", textAlign: "left",
                  color: C.textMuted, fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontSize: 11, cursor: "pointer", lineHeight: 1.4, transition: "all 0.1s",
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 14 }}>
            {m.role === "user" ? (
              <div style={{ display: "flex", gap: 7, justifyContent: "flex-end" }}>
                <div style={{ background: C.accentBg, border: `1px solid rgba(99,102,241,0.2)`, borderRadius: "10px 10px 3px 10px", padding: "8px 11px", maxWidth: "90%", fontSize: 12, color: "#c7d2fe", lineHeight: 1.55 }}>{m.content}</div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 7 }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, marginTop: 2 }}>✦</div>
                <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: "3px 10px 10px 10px", padding: "10px 12px", minHeight: 36 }}>
                  <MD text={m.content} compact />
                  {m.streaming && <span style={{ display: "inline-block", width: 2, height: 12, background: C.accent, marginLeft: 2, animation: "pulse 1s infinite", verticalAlign: "middle" }} />}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask anything…"
            rows={1}
            style={{
              flex: 1, background: "rgba(255,255,255,0.03)",
              border: `1px solid ${C.border}`, borderRadius: 8,
              color: C.text, fontFamily: "'Bricolage Grotesque', sans-serif",
              fontSize: 12, padding: "8px 10px", resize: "none", outline: "none",
              lineHeight: 1.5, minHeight: 36, maxHeight: 120,
            }}
            onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
          />
          <button onClick={() => send()} disabled={!input.trim() || loading} style={{
            width: 32, height: 32, flexShrink: 0,
            background: input.trim() && !loading ? C.accentBg : "rgba(255,255,255,0.03)",
            border: `1px solid ${input.trim() && !loading ? C.borderActive : C.border}`,
            borderRadius: 7, color: input.trim() && !loading ? "#a5b4fc" : C.textFaint,
            cursor: input.trim() && !loading ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, transition: "all 0.15s",
          }}>
            {loading ? <div style={{ width: 12, height: 12, border: "1.5px solid rgba(99,102,241,0.3)", borderTopColor: C.accent, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> : "↑"}
          </button>
        </div>
        <div style={{ fontSize: 9, color: C.textFaint, marginTop: 6, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace" }}>
          Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════
const NAV = [
  { id: "dashboard", icon: "⊞", label: "Dashboard" },
  { id: "problem", icon: "◉", label: "Problem Space" },
  { id: "roadmap", icon: "◫", label: "Roadmap" },
  { id: "prd", icon: "◧", label: "PRD" },
  { id: "backlog", icon: "◨", label: "Backlog" },
  { id: "decisions", icon: "◐", label: "Decisions" },
];

export default function ForgePM() {
  const [state, setState] = useState(INITIAL_STATE);
  const [module, setModule] = useState("dashboard");
  const [copilotOpen, setCopilotOpen] = useState(true);

  const current = NAV.find(n => n.id === module);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body, #root { height: 100%; }
        body { background: #0D1117; font-family: 'Bricolage Grotesque', sans-serif; overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.14); }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)} }
        button { font-family: 'Bricolage Grotesque', sans-serif; }
        input, textarea, select { font-family: 'Bricolage Grotesque', sans-serif; }
        textarea:focus, input:focus { border-color: rgba(99,102,241,0.5) !important; }
        select option { background: #161B22; }
      `}</style>

      <div style={{ height: "100vh", display: "flex", background: C.bg, color: C.text, overflow: "hidden" }}>

        {/* ── ACTIVITY BAR (leftmost, like VS Code) ── */}
        <div style={{
          width: 48, flexShrink: 0,
          background: "#010409",
          borderRight: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column",
          alignItems: "center", paddingTop: 8,
          gap: 2,
        }}>
          {/* Logo */}
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#fff", marginBottom: 10, flexShrink: 0 }}>F</div>

          {NAV.map(n => (
            <button key={n.id} onClick={() => setModule(n.id)} title={n.label} style={{
              width: 36, height: 36, borderRadius: 8,
              background: module === n.id ? "rgba(99,102,241,0.15)" : "transparent",
              border: module === n.id ? `1px solid rgba(99,102,241,0.3)` : "1px solid transparent",
              color: module === n.id ? "#a5b4fc" : "#7d8590",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, transition: "all 0.12s",
            }}>{n.icon}</button>
          ))}

          <div style={{ flex: 1 }} />

          {/* AI toggle */}
          <button onClick={() => setCopilotOpen(o => !o)} title="Toggle AI Co-Pilot" style={{
            width: 36, height: 36, borderRadius: 8,
            background: copilotOpen ? "rgba(99,102,241,0.15)" : "transparent",
            border: copilotOpen ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
            color: copilotOpen ? "#a5b4fc" : "#7d8590",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, marginBottom: 8,
          }}>✦</button>
        </div>

        {/* ── MAIN WORKSPACE ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* Title bar */}
          <div style={{
            height: 40, borderBottom: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", padding: "0 18px", gap: 10,
            background: "#010409", flexShrink: 0,
          }}>
            <span style={{ fontSize: 14, color: C.textMuted }}>{current?.icon}</span>
            <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{state.project.name}</span>
            <span style={{ color: C.textFaint, fontSize: 12 }}>/</span>
            <span style={{ fontSize: 12, color: C.accent }}>{current?.label}</span>

            {/* Breadcrumb pills */}
            <div style={{ display: "flex", gap: 6, marginLeft: 16 }}>
              {state.project.problem && <Badge label="problem defined" color={C.green} bg={C.green + "12"} border={C.green + "25"} />}
              {state.problemAnalysis && <Badge label="analysed" color={C.accent} bg={C.accentBg} border={C.borderActive} />}
              {state.prd.generated && <Badge label="PRD ready" color="#e3b341" bg="#e3b34112" border="#e3b34125" />}
            </div>

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, animation: "pulse 2.5s infinite" }} />
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>Forge PM</span>
            </div>
          </div>

          {/* Module content */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
            <div style={{ flex: 1, overflow: "auto", animation: "fadeIn 0.2s ease" }} key={module}>
              {module === "dashboard" && <Dashboard state={state} setModule={setModule} />}
              {module === "problem" && <ProblemSpace state={state} setState={setState} />}
              {module === "roadmap" && <Roadmap state={state} setState={setState} />}
              {module === "prd" && <PRDModule state={state} setState={setState} />}
              {module === "backlog" && <Backlog state={state} setState={setState} />}
              {module === "decisions" && <Decisions state={state} setState={setState} />}
            </div>

            {/* AI Co-Pilot Panel */}
            {copilotOpen && <CopilotPanel state={state} currentModule={module} />}
          </div>
        </div>
      </div>
    </>
  );
}
