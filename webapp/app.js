const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

const state = {
  page: "home",
  messages: [],
  input: "",
  typing: false,
  routes: store.get("myRoutes", []),
  currentRoute: null,
  teamIndex: -1,
  cityIndex: -1,
  scanning: false,
  scanProgress: 0,
  modelReady: true,
  heroPlaced: false,
  heroIndex: 0,
  arHistory: store.get("arScanHistory", []),
  emotion: "professional",
  chatError: "",
};

const data = {
  teams: [
    { name: "EDG", color: "linear-gradient(135deg, #ff4444, #ff8833)", bonds: "Meiko & Scout", spirit: "团结拼搏" },
    { name: "AG超玩会", color: "linear-gradient(135deg, #00ccff, #9966ff)", bonds: "一诺 & Cat", spirit: "永不言弃" },
    { name: "狼队", color: "linear-gradient(135deg, #ffd700, #ffaa00)", bonds: "Fly & 胖皇", spirit: "坚韧不拔" },
    { name: "TES", color: "linear-gradient(135deg, #66ff66, #00ccff)", bonds: "knight & JackeyLove", spirit: "无畏前行" },
  ],
  cities: ["上海", "成都", "北京"],
  heroes: ["牛魔", "伽罗", "杨玉环", "妲己", "瑶", "王昭君"],
  quickQuestions: ["EDG 选手的羁绊故事", "什么是电竞精神？", "生成我的文旅路线", "AR 场馆在哪？"],
};

const app = document.querySelector("#app");
const tabs = [...document.querySelectorAll(".tab")];
let scanTimer;
let typingTimer;

function now() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function setPage(page, options = {}) {
  state.page = page;
  if (options.prefill) state.input = options.prefill;
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.page === page));
  render();
}

function recognizeEmotion(text) {
  if (/热血|冠军|加油|冲|燃/.test(text)) return "passionate";
  if (/回忆|老|以前|青春|故事/.test(text)) return "nostalgic";
  if (/什么|为什么|如何|怎么|在哪/.test(text)) return "curious";
  return "professional";
}

function emotionStyle(type = state.emotion) {
  return {
    passionate: { name: "热血", emoji: "🔥", color: "#ff7755" },
    nostalgic: { name: "怀旧", emoji: "✨", color: "#ffe55c" },
    curious: { name: "好奇", emoji: "⭐", color: "#00ccff" },
    professional: { name: "专业", emoji: "🎮", color: "#ffd700" },
  }[type];
}

function particles() {
  const colors = ["#ff4444", "#ffd700", "#00ccff", "#9966ff"];
  return Array.from({ length: 22 }, (_, i) => {
    const color = colors[i % colors.length];
    const size = 3 + Math.random() * 5;
    return `<i class="particle" style="top:${Math.random() * 96}%;left:${Math.random() * 96}%;width:${size}px;height:${size}px;background:${color};box-shadow:0 0 ${size * 3}px ${color};animation-delay:${i * 0.13}s"></i>`;
  }).join("");
}

function bg() {
  return `<div class="screen-bg">${particles()}<span class="orb one"></span><span class="orb two"></span></div>`;
}

function render() {
  const pages = { home, chat, ar, journey, profile };
  app.innerHTML = pages[state.page]();
  bindPage();
  if (state.page === "chat") {
    const scroller = app.querySelector(".chat-messages");
    scroller.scrollTop = scroller.scrollHeight;
  }
}

function home() {
  const suggestions = ["EDG 选手的羁绊故事", "KPL 总决赛夺冠时刻", "电竞精神是什么？", "成都 AG 主场有什么？"];
  return `
    <section class="page">
      ${bg()}
      <div class="content">
        <header class="hero">
          <h1 class="title-glow">电竞文旅AI</h1>
          <p class="subtitle">探索电竞世界 · 感受赛事精神</p>
        </header>
        <article class="card">
          <div class="welcome-row">
            <div class="emoji-lg">🎮</div>
            <div>
              <div class="welcome-title">欢迎来到电竞世界</div>
              <div class="muted">今天想了解什么电竞故事呢？</div>
            </div>
          </div>
          <div class="tags">
            ${suggestions.map((item) => `<button class="tag" data-chat="${item}">${item}</button>`).join("")}
          </div>
        </article>
        <div>
          <button class="entry-card card" data-goto="chat"><span class="entry-icon">💬</span><span><span class="entry-title">AI情感对话</span><br><span class="muted">懂你的情绪 · 传递电竞精神</span></span></button>
          <button class="entry-card card" data-goto="ar"><span class="entry-icon">📷</span><span><span class="entry-title">AR奇幻扫描</span><br><span class="muted">线下打卡 · 虚拟赛场重现</span></span></button>
          <button class="entry-card card" data-goto="journey"><span class="entry-icon">🗺️</span><span><span class="entry-title">电竞文旅路线</span><br><span class="muted">个性定制 · 深度打卡体验</span></span></button>
        </div>
        <h2 class="section-title">⚡ 热门战队羁绊</h2>
        <div class="team-scroll">
          ${data.teams.map((team) => `
            <button class="team-card card" data-chat="请介绍 ${team.name} 战队的故事">
              <div class="team-logo" style="background:${team.color}">${team.name[0]}</div>
              <div class="team-name">${team.name}</div>
              <div class="muted">${team.bonds}</div>
              <div class="muted">${team.spirit}</div>
            </button>
          `).join("")}
        </div>
      </div>
    </section>`;
}

function chat() {
  const emotion = emotionStyle();
  const messages = state.messages.length ? state.messages.map(messageTemplate).join("") : `
    <div class="message-item">
      <div class="message-content">
        <div class="avatar">🤖</div>
        <div class="bubble">
          <b style="color:var(--primary-gold)">你好！我是你的电竞 AI 助手</b>
          <p class="muted">我能解读选手羁绊、传递赛事精神，也能帮你规划文旅路线。</p>
          <div class="quick-tags">${data.quickQuestions.map((q) => `<button class="quick-tag" data-chat="${q}">${q}</button>`).join("")}</div>
        </div>
      </div>
    </div>`;
  return `
    <section class="page chat-page">
      <header class="chat-header">
        <button class="icon-btn" data-goto="home">←</button>
        <div>
          <div class="ai-status"><span class="status-dot"></span>AI情感助手</div>
          <div class="emotion-badge" style="background:${emotion.color}">${emotion.emoji} ${emotion.name}</div>
        </div>
        <button class="clear-btn" data-clear-chat>清空</button>
      </header>
      <div class="chat-messages">
        ${messages}
        ${state.typing ? `<div class="message-content"><div class="avatar">🤖</div><div class="bubble typing"><span></span><span></span><span></span></div></div>` : ""}
        ${state.chatError ? `<div class="message-item"><div class="message-content"><div class="avatar">!</div><div class="bubble" style="border-color:rgba(230,48,40,.7)">${escapeHtml(state.chatError)}</div></div></div>` : ""}
      </div>
      <footer class="chat-input-area">
        <form class="input-wrapper" data-chat-form>
          <input class="chat-input" name="message" value="${escapeHtml(state.input)}" placeholder="问我任何电竞问题..." autocomplete="off" />
          <button class="send-btn" type="submit">发送</button>
        </form>
        <div class="input-hint">支持：选手羁绊 · 赛事精神 · 文旅路线 · AR扫描</div>
      </footer>
    </section>`;
}

function messageTemplate(msg) {
  return `
    <div class="message-item ${msg.role}">
      <div class="message-content">
        <div class="avatar">${msg.role === "user" ? "👤" : "🤖"}</div>
        <div class="bubble">
          ${escapeHtml(msg.content)}
          ${msg.suggestions?.length ? `<div class="suggestions">${msg.suggestions.map((s) => `<button class="suggestion-btn" data-chat="${s}">${s}</button>`).join("")}</div>` : ""}
          <div class="message-time">${msg.time}</div>
        </div>
      </div>
    </div>`;
}

function ar() {
  const hero = data.heroes[state.heroIndex];
  const status = state.scanning ? "扫描中" : state.heroPlaced ? "投影完成" : "待启动";
  return `
    <section class="page">
      <div class="ar-stage">
        <div class="hero-picker">
          <span>选择英雄</span>
          <select data-hero-select>${data.heroes.map((h, i) => `<option value="${i}" ${i === state.heroIndex ? "selected" : ""}>${h}</option>`).join("")}</select>
        </div>
        ${state.scanning ? `<div class="scan-line"></div>` : ""}
        <div class="ar-hero ${state.heroPlaced ? "show" : ""}">🛡️</div>
        <div class="scan-status">
          <div class="welcome-title">AR状态：${status}</div>
          <div class="muted">${state.heroPlaced ? `${hero} 已投影到虚拟赛场中心` : "点击扫描识别环境，再放置英雄模型"}</div>
          <div class="progress"><div class="progress-bar" style="width:${state.scanProgress}%"></div></div>
        </div>
      </div>
      <div class="control-row">
        <button class="control-btn" data-scan>${state.scanning ? "停止" : "扫描"}</button>
        <button class="control-btn">镜头</button>
        <button class="control-btn" data-place>放置</button>
      </div>
      <article class="card">
        <div class="info-row"><span>当前英雄</span><strong>${hero}</strong></div>
        <div class="info-row"><span>模型状态</span><strong class="success">已就绪</strong></div>
        <div class="btn-row">
          <button class="small-btn" data-chat="请介绍英雄 ${hero} 的背景和玩法建议">询问AI</button>
          <button class="small-btn" data-hero-info>英雄详情</button>
        </div>
      </article>
      ${state.arHistory.length ? `<article class="card"><div class="card-title">识别历史</div>${state.arHistory.map((h) => `<div class="history-row">${h}</div>`).join("")}</article>` : ""}
    </section>`;
}

function journey() {
  const team = data.teams[state.teamIndex];
  const city = data.cities[state.cityIndex];
  return `
    <section class="page">
      <header class="page-header">
        <div class="header-icon">🗺️</div>
        <h1 class="title-glow">电竞文旅路线</h1>
        <p class="subtitle">专属定制 · 深度打卡</p>
      </header>
      <article class="card">
        <div class="card-title">⚔️ 选择你的战队</div>
        <div class="team-grid">
          ${data.teams.map((t, i) => `<button class="select-card ${i === state.teamIndex ? "selected" : ""}" data-team="${i}"><div class="team-avatar">${t.name[0]}</div><div>${t.name}</div></button>`).join("")}
        </div>
      </article>
      <article class="card">
        <div class="card-title">📍 选择目的城市</div>
        ${data.cities.map((c, i) => `<button class="city-item ${i === state.cityIndex ? "selected" : ""}" data-city="${i}"><span class="city-icon">🏟️</span><span class="city-info"><b>${c}</b><br><span class="muted">电竞城市</span></span></button>`).join("")}
      </article>
      <button class="primary-btn gen-btn ${team && city ? "ready" : ""}" data-generate-route>${team && city ? "生成专属路线" : "先选择战队和城市"}</button>
      ${state.currentRoute ? routeCard(state.currentRoute) : ""}
      <article class="card">
        <div class="card-title">📌 我的路线 ${state.routes.length ? `(${state.routes.length})` : ""}</div>
        ${state.routes.length ? state.routes.map((r, i) => `<button class="history-row ${state.currentRoute?.id === r.id ? "active" : ""}" data-route="${i}"><span class="team-avatar">${r.city[0]}</span><span class="history-info"><b>${r.title}</b><br><span class="muted">${r.description}</span></span></button>`).join("") : `<div class="muted" style="text-align:center;padding:22px 0">还没有生成路线</div>`}
      </article>
    </section>`;
}

function routeCard(route) {
  return `
    <article class="card">
      <div class="tag">${route.city}</div>
      <h3>${route.title}</h3>
      <div class="route-meta"><span>📍 ${route.nodes.length} 个打卡点</span><span>⏱️ 约 4 小时</span></div>
      <div class="timeline">
        ${route.nodes.map((node, i) => `
          <div class="timeline-item">
            <div class="timeline-left"><span class="timeline-dot"></span>${i < route.nodes.length - 1 ? `<span class="timeline-line"></span>` : ""}</div>
            <div class="timeline-card"><b>第 ${i + 1} 站 · ${node.name}</b><br><span class="muted">${node.description}</span></div>
          </div>
        `).join("")}
      </div>
      <button class="primary-btn" data-goto="ar">开始 AR 打卡</button>
    </article>`;
}

function profile() {
  const stats = [
    ["打卡次数", state.arHistory.length],
    ["数字藏品", Math.max(0, state.arHistory.length - 1)],
    ["生成路线", state.routes.length],
    ["对话次数", state.messages.filter((m) => m.role === "user").length],
  ];
  const emotion = emotionStyle();
  return `
    <section class="page">
      ${bg()}
      <div class="content">
        <article class="card profile-head">
          <div class="profile-avatar">🎮</div>
          <div>
            <h2>电竞召唤师</h2>
            <div class="muted">${emotion.emoji} ${emotion.name}模式</div>
          </div>
        </article>
        <div class="stats">${stats.map(([label, value]) => `<article class="card stat-card"><div class="stat-value">${value}</div><div class="muted">${label}</div></article>`).join("")}</div>
        <article class="card">
          <button class="primary-btn gen-btn ready" data-goto="chat">进入 AI 对话</button>
          <button class="primary-btn gen-btn ready" data-goto="journey">查看我的路线</button>
        </article>
      </div>
    </section>`;
}

function makeRoute() {
  const team = data.teams[state.teamIndex];
  const city = data.cities[state.cityIndex];
  if (!team || !city) return;
  const route = {
    id: Date.now(),
    title: `${team.name}专属文旅路线`,
    city,
    description: `${city} · 5个电竞打卡点`,
    nodes: [
      { name: `${city}电竞中心`, description: "参观职业赛场并完成打卡" },
      { name: `${team.name}战队展馆`, description: "了解战队历史和荣耀时刻" },
      { name: "选手应援墙", description: "留言支持喜欢的选手" },
      { name: "电竞主题餐厅", description: "品尝赛事主题美食" },
      { name: "周边商店", description: "购买正版周边纪念品" },
    ],
  };
  state.currentRoute = route;
  state.routes = [route, ...state.routes].slice(0, 10);
  store.set("myRoutes", state.routes);
}

async function sendMessage(text) {
  const content = text.trim();
  if (!content) return;
  const emotion = recognizeEmotion(content);
  state.emotion = emotion;
  state.messages.push({ role: "user", content, time: now() });
  state.input = "";
  state.typing = true;
  state.chatError = "";
  render();

  try {
    const response = await callAIAPI();
    state.typing = false;
    state.messages.push({
      role: "ai",
      content: response.content,
      time: now(),
      suggestions: suggestionsFor(content),
      meta: response.meta,
    });
    saveChatHistory();
    render();
  } catch (error) {
    state.typing = false;
    state.chatError = error && error.message ? error.message : "大模型调用失败，请稍后重试。";
    state.messages.push({
      role: "ai",
      content: state.chatError,
      time: now(),
      isError: true,
    });
    render();
  }
}

async function callAIAPI() {
  const payload = {
    user_id: "web-guest",
    messages: state.messages
      .filter((message) => message.role === "user" || message.role === "ai")
      .map((message) => ({
        role: message.role === "ai" ? "assistant" : "user",
        content: message.content,
      })),
  };

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  let result = {};
  try {
    result = await response.json();
  } catch {
    throw new Error(`大模型接口响应异常：HTTP ${response.status}`);
  }
  if (!response.ok || !result.ok) {
    throw new Error(result.error || `大模型接口调用失败：HTTP ${response.status}`);
  }
  const content = result.content || result.reply;
  if (!content) throw new Error("模型返回内容为空");
  return {
    content,
    meta: {
      requestId: result.requestId,
      finishReason: result.finishReason,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.totalTokens,
    },
  };
}

function suggestionsFor(text) {
  if (/路线|旅游|文旅|打卡/.test(text)) return ["查看我的路线详情", "开始 AR 打卡"];
  if (/EDG|战队|选手/.test(text)) return ["查看 AR 夺冠场景", "生成专属文旅路线"];
  return ["了解更多赛事精神", "生成文旅路线", "AR 虚拟打卡"];
}

function saveChatHistory() {
  const history = store.get("chatHistory", []);
  history.push({
    date: new Date().toDateString(),
    messages: state.messages.slice(-10),
  });
  store.set("chatHistory", history.slice(-20));
}

function bindPage() {
  app.querySelectorAll("[data-goto]").forEach((el) => el.addEventListener("click", () => setPage(el.dataset.goto)));
  app.querySelectorAll("[data-chat]").forEach((el) => el.addEventListener("click", () => setPage("chat", { prefill: el.dataset.chat })));
  app.querySelector("[data-chat-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(new FormData(event.currentTarget).get("message") || "");
  });
  app.querySelector("[data-clear-chat]")?.addEventListener("click", () => {
    state.messages = [];
    render();
  });
  app.querySelector("[data-hero-select]")?.addEventListener("change", (event) => {
    state.heroIndex = Number(event.target.value);
    state.heroPlaced = false;
    state.scanProgress = 0;
    render();
  });
  app.querySelector("[data-scan]")?.addEventListener("click", toggleScan);
  app.querySelector("[data-place]")?.addEventListener("click", placeHero);
  app.querySelector("[data-hero-info]")?.addEventListener("click", () => alert(`${data.heroes[state.heroIndex]} · 英雄档案\n模型状态：已就绪\n推荐：进入 AI 对话生成玩法建议。`));
  app.querySelectorAll("[data-team]").forEach((el) => el.addEventListener("click", () => {
    state.teamIndex = Number(el.dataset.team);
    render();
  }));
  app.querySelectorAll("[data-city]").forEach((el) => el.addEventListener("click", () => {
    state.cityIndex = Number(el.dataset.city);
    render();
  }));
  app.querySelector("[data-generate-route]")?.addEventListener("click", () => {
    makeRoute();
    render();
  });
  app.querySelectorAll("[data-route]").forEach((el) => el.addEventListener("click", () => {
    state.currentRoute = state.routes[Number(el.dataset.route)];
    render();
  }));
}

function toggleScan() {
  if (state.scanning) {
    clearInterval(scanTimer);
    state.scanning = false;
    render();
    return;
  }
  state.scanning = true;
  state.scanProgress = 8;
  render();
  clearInterval(scanTimer);
  scanTimer = setInterval(() => {
    state.scanProgress = Math.min(100, state.scanProgress + 12);
    if (state.scanProgress >= 100) {
      clearInterval(scanTimer);
      state.scanning = false;
    }
    render();
  }, 280);
}

function placeHero() {
  state.heroPlaced = true;
  state.scanProgress = 100;
  const item = `🛡️ ${data.heroes[state.heroIndex]}投影 · ${now()}`;
  state.arHistory = [item, ...state.arHistory].slice(0, 10);
  store.set("arScanHistory", state.arHistory);
  render();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

tabs.forEach((tab) => tab.addEventListener("click", () => setPage(tab.dataset.page)));
render();
