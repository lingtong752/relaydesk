const cardStyle =
  "border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:12px;background:rgba(15,23,42,0.35);display:grid;gap:8px;";

function renderState(root, state) {
  const activeRun = state.pluginContext?.activeRun;
  const latestSession =
    state.selectedSession || state.pluginContext?.latestSessions?.[0] || null;

  root.innerHTML = "";

  const header = document.createElement("div");
  header.style.cssText = "display:flex;justify-content:space-between;gap:12px;align-items:flex-start;";
  header.innerHTML = `
    <div>
      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.65;">Demo plugin</div>
      <h3 style="margin:4px 0 0;font-size:18px;">Session Deck</h3>
    </div>
    <span style="font-size:12px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);">
      ${state.realtimeState}
    </span>
  `;

  const metrics = document.createElement("div");
  metrics.style.cssText = "display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));";

  const cards = [
    {
      title: "Project",
      body: `${state.pluginContext?.projectName || state.projectId}\n${state.projectRootPath}`
    },
    {
      title: "Providers",
      body: state.pluginContext?.activeProviders?.join(", ") || "No active providers"
    },
    {
      title: "Focused session",
      body: latestSession
        ? `${latestSession.title}\n${latestSession.provider} · ${latestSession.origin}`
        : "No active session"
    },
    {
      title: "Run",
      body: activeRun ? `${activeRun.objective}\n${activeRun.status}` : "No active surrogate run"
    }
  ];

  for (const card of cards) {
    const article = document.createElement("article");
    article.style.cssText = cardStyle;
    article.innerHTML = `
      <div style="font-size:12px;opacity:0.65;">${card.title}</div>
      <div style="white-space:pre-wrap;line-height:1.5;">${card.body}</div>
    `;
    metrics.appendChild(article);
  }

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";

  const output = document.createElement("pre");
  output.style.cssText =
    "margin:0;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,0.1);background:rgba(2,6,23,0.4);font-size:12px;overflow:auto;max-height:240px;";
  output.textContent = "Click a host RPC action to inspect runtime data.";

  function createButton(label, methodId) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText =
      "border:none;border-radius:999px;padding:10px 14px;background:#0f766e;color:white;cursor:pointer;";
    button.addEventListener("click", async () => {
      output.textContent = `Running ${methodId}...`;
      const result = await bridge.callRpc(methodId);
      output.textContent = JSON.stringify(result, null, 2);
    });
    return button;
  }

  actions.appendChild(createButton("Load context", "context-snapshot"));
  actions.appendChild(createButton("Load task board", "task-board"));

  root.appendChild(header);
  root.appendChild(metrics);
  root.appendChild(actions);
  root.appendChild(output);
}

export function renderRelayDeskPlugin(root, bridge) {
  let currentState = bridge.getState();
  renderState(root, currentState);

  const unsubscribe = bridge.subscribe((nextState) => {
    currentState = nextState;
    renderState(root, currentState);
  });

  return () => {
    unsubscribe();
    root.innerHTML = "";
  };
}
