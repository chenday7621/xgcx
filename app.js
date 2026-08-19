const appRoot = document.querySelector("#app");
const toastNode = document.querySelector("#toast");

const store = {
  get(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

const teams = [
  { id: "1", name: "EDG", image: "./assets/home/team-edg.png", background: "./assets/home/bg-edg.jpg", bonds: "Meiko&Scout", spirit: "团结拼搏", theme: "edg" },
  { id: "2", name: "AG超玩会", image: "./assets/home/team-ag.png", background: "./assets/home/bg-ag.jpg", bonds: "一诺&Cat", spirit: "永不言弃", theme: "ag" },
  { id: "3", name: "狼队", image: "./assets/home/team-wolves.png", background: "./assets/home/bg-wolves.png", bonds: "Fly&胖皇", spirit: "坚韧不拔", theme: "wolves" },
  { id: "4", name: "TES", image: "./assets/home/team-tes.png", background: "./assets/home/bg-tes.png", bonds: "knight&JackeyLove", spirit: "无畏前行", theme: "tes" },
];

const cities = [
  { id: "1", name: "上海", image: "./assets/route/city-shanghai.png" },
  { id: "2", name: "成都", image: "./assets/route/city-chengdu.png" },
  { id: "3", name: "北京", image: "./assets/route/city-beijing.png" },
];

const quickQuestions = ["EDG选手的羁绊故事", "什么是电竞精神？", "生成我的文旅路线", "AR场馆在哪里？"];
const homeQuestions = ["EDG选手的羁绊故事", "KPL总决赛夺冠时刻", "电竞精神是什么", "成都AG主场有什么"];

const state = {
  page: location.hash.replace("#", "") || "home",
  messages: [],
  typing: false,
  emotion: "neutral",
  selectedTeam: -1,
  selectedCity: -1,
  routes: store.get("myRoutes", []),
  currentRoute: null,
  heroIndex: 0,
  cameraStream: null,
  cameraEnabled: false,
  cameraFacing: "environment",
  scanning: false,
  scanProgress: 0,
  heroVisible: false,
  arHistory: store.get("arScanHistory", []),
};

let scanTimer = null;
let toastTimer = null;

function asset(path) {
  return `./assets/${path}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function now() {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function showToast(message) {
  clearTimeout(toastTimer);
  toastNode.textContent = message;
  toastNode.classList.add("show");
  toastTimer = setTimeout(() => toastNode.classList.remove("show"), 2600);
}

function setPage(page, options = {}) {
  if (!["home", "chat", "ar", "journey"].includes(page)) page = "home";
  if (state.page === "ar" && page !== "ar") stopCamera();
  state.page = page;
  if (options.prefill) state.prefill = options.prefill;
  history.replaceState(null, "", `#${page}`);
  document.querySelectorAll(".web-nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.page === page);
  });
  render();
}

function particles() {
  const colors = ["#ff4444", "#ffd700", "#00ccff", "#9966ff"];
  return Array.from({ length: 26 }, (_, index) => {
    const size = 2 + (index % 4);
    return `<i class="particle" style="top:${(index * 37) % 96}%;left:${(index * 61 + 9) % 97}%;width:${size}px;height:${size}px;background:${colors[index % colors.length]};box-shadow:0 0 ${size * 3}px ${colors[index % colors.length]};animation-delay:${(index % 9) * -.43}s"></i>`;
  }).join("");
}

function corners() {
  return `<i class="panel-corner corner-tl"></i><i class="panel-corner corner-tr"></i><i class="panel-corner corner-bl"></i><i class="panel-corner corner-br"></i>`;
}

function welcomeByTime() {
  const hour = new Date().getHours();
  if (hour < 6) return { image: asset("home/night-title.png"), message: "想了解哪个选手的励志故事？" };
  if (hour < 12) return { image: asset("home/morning-title.png"), message: "新的一天，为你喜欢的战队加油！" };
  if (hour < 18) return { image: asset("home/afternoon-title.png"), message: "今天有比赛，来聊聊赛况吧！" };
  return { image: asset("home/evening-title.png"), message: "今晚有精彩对决，想了解什么？" };
}

function teamCard(team, selectable = false) {
  const selected = selectable && teams[state.selectedTeam]?.id === team.id;
  return `<button type="button" class="team-card team-${team.theme}${selected ? " selected" : ""}" ${selectable ? `data-team-index="${teams.indexOf(team)}"` : `data-team-chat="${escapeHtml(team.name)}"`}>
    <img class="team-bg" src="${team.background}" alt="" />
    <span class="team-glow"></span>
    <img class="team-logo" src="${team.image}" alt="${escapeHtml(team.name)} 战队图标" />
    <span class="team-name">${escapeHtml(team.name)}</span>
    <span class="team-bonds">${escapeHtml(team.bonds)}</span>
    <span class="team-spirit">${escapeHtml(team.spirit)}</span>
    <span class="team-diamond">◆</span>
    ${selected ? '<span class="team-check">✓</span>' : ""}
  </button>`;
}

function renderHome() {
  const greeting = welcomeByTime();
  return `<section class="page home-page">
    <div class="cosmos-bg"><div>${particles()}</div></div>
    <div class="home-content">
      <header class="home-nav"><img src="${asset("home/nav-home.png")}" alt="首页" /></header>
      <div class="home-hero">
        <img class="rank-emblem" src="${asset("home/rank-emblem.png")}" alt="电竞段位徽章" />
        <img class="home-hero-title" src="${asset("home/hero-title.png")}" alt="电竞文旅 AI" />
        <i class="energy-line energy-a"></i><i class="energy-line energy-b"></i>
      </div>
      <section class="welcome-card ornate-panel">
        ${corners()}
        <div class="welcome-visual"><img src="${asset("home/moon-stage.png")}" alt="月夜电竞舞台" /></div>
        <div class="welcome-copy">
          <img class="welcome-title" src="${greeting.image}" alt="时段问候" />
          <div class="welcome-message">${greeting.message}</div>
          <div class="welcome-suggestions">${homeQuestions.map((question) => `<button type="button" class="suggestion-tag" data-chat-question="${question}">${question}</button>`).join("")}</div>
        </div>
      </section>
      <section class="core-entries" aria-label="核心功能">
        ${entryCard("chat", "AI情感对话", ["懂你的情绪", "传递电竞精神"], "home/bg-chat.jpg")}
        ${entryCard("ar", "AR奇幻扫描", ["线下打卡", "虚拟赛场重现"], "home/bg-ar.jpg")}
        ${entryCard("journey", "电竞文旅路线", ["个性定制", "深度打卡体验"], "home/bg-route.jpg")}
      </section>
      <section class="team-section">
        <div class="team-heading"><img src="${asset("home/teams-title.png")}" alt="热门战队羁绊" /></div>
        <div class="team-scroll">${teams.map((team) => teamCard(team)).join("")}</div>
      </section>
    </div>
  </section>`;
}

function entryCard(page, title, descriptions, background) {
  const spriteClass = page === "chat" ? "chat" : page === "ar" ? "ar" : "route";
  return `<button type="button" class="entry-card entry-${spriteClass}" data-goto="${page}">
    <img class="entry-bg" src="${asset(background)}" alt="" />
    <span class="entry-icon-zone"><span class="feature-icon-crop"><img class="feature-sprite sprite-${spriteClass}" src="${asset("home/feature-icons.png")}" alt="" /></span></span>
    <span class="entry-copy"><strong class="entry-title">${title}</strong>${descriptions.map((text) => `<span class="entry-desc">${text}</span>`).join("")}<i class="entry-divider"></i><i class="entry-chevron">⌄</i></span>
  </button>`;
}

function subHeader(title, imageBack = true) {
  return `<header class="sub-header">
    <button type="button" class="back-btn${imageBack ? "" : " text-back"}" data-goto="home" aria-label="返回首页">${imageBack ? `<img src="${asset("chat/back.png")}" alt="" />` : "‹"}</button>
    <div class="sub-header-title">${title}</div>
  </header>`;
}

function renderChat() {
  return `<section class="page subpage chat-page">
    <img class="page-background" src="${asset("chat/background.png")}" alt="" />
    ${subHeader("AI对话")}
    <div class="chat-hero"><img src="${asset("chat/hero-title.png")}" alt="AI 情感助手，专业" /></div>
    <main class="chat-messages" data-chat-scroll>
      ${state.messages.length ? state.messages.map(messageTemplate).join("") : welcomePanel()}
      ${state.typing ? `<div class="message-item"><div class="message-content"><img class="chat-avatar" src="${asset("chat/robot.png")}" alt="AI" /><div class="bubble typing-bubble"><i class="typing-dot"></i><i class="typing-dot"></i><i class="typing-dot"></i></div></div></div>` : ""}
    </main>
    <footer class="chat-input-area">
      <form class="input-wrapper" data-chat-form>
        <img class="input-frame" src="${asset("chat/input-frame.png")}" alt="" />
        <input class="chat-input" name="message" value="${escapeHtml(state.prefill || "")}" placeholder="问我任何电竞问题..." autocomplete="off" />
        <button type="submit" class="send-btn${state.prefill ? " active" : ""}" aria-label="发送"><img src="${asset("chat/send-button.png")}" alt="" /></button>
      </form>
      <div class="input-hint">支持：选手羁绊 · 赛事精神 · 文旅路线 · AR扫描</div>
    </footer>
  </section>`;
}

function welcomePanel() {
  return `<section class="welcome-panel">
    <img class="welcome-panel-frame" src="${asset("chat/welcome-panel.png")}" alt="" />
    <div class="welcome-inner">
      <div class="welcome-top">
        <img class="welcome-avatar" src="${asset("chat/robot.png")}" alt="电竞 AI 助手" />
        <div><div class="welcome-text">你好！我是你的电竞AI助手</div><div class="welcome-desc">我能：解读选手羁绊 · 传递赛事精神 · 规划文旅路线</div></div>
      </div>
      <div class="quick-title">你可以问我：</div>
      <div class="quick-questions">${quickQuestions.map((question) => `<button type="button" class="quick-tag" data-send-question="${question}"><img src="${asset("chat/quick-frame.png")}" alt="" /><span>${question}</span></button>`).join("")}</div>
    </div>
  </section>`;
}

function messageTemplate(message) {
  const ai = message.role === "ai";
  return `<article class="message-item${ai ? "" : " user"}">
    <div class="message-content">
      ${ai ? `<img class="chat-avatar" src="${asset("chat/robot.png")}" alt="AI" />` : '<span class="chat-avatar user-avatar">召</span>'}
      <div class="bubble${message.isError ? " error" : ""}">${escapeHtml(message.content)}
        ${message.suggestions?.length ? `<div class="bubble-suggestions">${message.suggestions.map((item) => `<button type="button" data-send-question="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>` : ""}
        <div class="message-time">${message.time || ""}</div>
      </div>
    </div>
  </article>`;
}

function renderAR() {
  const hero = state.heroIndex === 0 ? { name: "牛魔", title: "无畏战魂", effect: "坚毅守护" } : { name: "测试机器人", title: "RobotExpressive", effect: "示例模型" };
  const status = state.scanning ? "扫描中" : state.scanProgress >= 100 ? "已识别" : state.cameraEnabled ? "已授权" : "待启动";
  const hint = state.scanning ? "请缓慢移动摄像头，让系统识别平面" : state.scanProgress >= 100 ? "识别完成，可显示英雄投影" : state.cameraEnabled ? "移动设备扫描地面或桌面" : "请授权摄像头后开始AR扫描";
  return `<section class="page subpage ar-page">
    <div class="star-field"></div>
    ${subHeader("AR扫描", false)}
    <main class="ar-content">
      <div class="ar-frame-wrap">
        <div class="ar-stage">
          ${state.cameraEnabled ? '<video class="ar-video" autoplay muted playsinline data-camera></video>' : `<div class="camera-placeholder"><p>需要摄像头授权才能开启AR</p><button type="button" class="authorize-btn" data-authorize-camera><img src="${asset("ar/authorize-button.png")}" alt="授权摄像头" /></button></div>`}
          ${state.heroVisible ? `<div class="hero-projection"><strong>${hero.name}</strong><span>${hero.title}</span><small>${hero.effect}</small></div>` : ""}
        </div>
        <img class="scan-frame" src="${asset("ar/scan-frame.png")}" alt="AR 扫描框" />
        <section class="scan-status">
          <img class="status-frame" src="${asset("ar/status-frame.png")}" alt="" />
          <div class="status-content"><div class="status-title">AR状态：${status}</div><div class="status-hint">${hint}</div><div class="progress"><div class="progress-bar" style="width:${state.scanProgress}%"></div></div></div>
        </section>
      </div>
      <div class="scan-button-row"><button type="button" class="scan-button" data-toggle-scan><img src="${asset(state.scanning ? "ar/scan-button-blank.png" : "ar/scan-button.png")}" alt="" />${state.scanning ? "<span>停止扫描</span>" : ""}</button></div>
      <div class="hero-picker"><label for="hero-select">选择英雄</label><select id="hero-select" data-hero-select><option value="0"${state.heroIndex === 0 ? " selected" : ""}>牛魔</option><option value="1"${state.heroIndex === 1 ? " selected" : ""}>测试机器人</option></select></div>
      <div class="action-grid">
        <button type="button" class="action-btn" data-ar-action="camera"><img src="${asset("ar/action-camera.png")}" alt="切换镜头" /></button>
        <button type="button" class="action-btn" data-ar-action="hero"><img src="${asset("ar/action-hero.png")}" alt="显示或隐藏英雄" /></button>
        <button type="button" class="action-btn" data-ar-action="ai"><img src="${asset("ar/action-ai.png")}" alt="询问 AI" /></button>
        <button type="button" class="action-btn" data-ar-action="detail"><img src="${asset("ar/action-detail.png")}" alt="英雄详情" /></button>
      </div>
      ${state.arHistory.length ? `<section class="ar-history"><h3>识别历史</h3>${state.arHistory.map((item) => `<div class="history-chip">${escapeHtml(item)}</div>`).join("")}</section>` : ""}
    </main>
  </section>`;
}

function renderJourney() {
  const ready = state.selectedTeam >= 0 && state.selectedCity >= 0;
  return `<section class="page subpage journey-page">
    <img class="page-background" src="${asset("route/background.png")}" alt="" />
    ${subHeader("")}
    <div class="journey-hero"><img src="${asset("route/hero.png")}" alt="电竞文旅路线，专属定制，深度打卡" /></div>
    <main class="route-shell">
      ${corners()}
      <img class="section-heading" src="${asset("route/heading-teams.png")}" alt="选择你的战队" />
      <div class="route-team-grid">${teams.map((team) => teamCard(team, true)).join("")}</div>
      <img class="section-heading heading-city" src="${asset("route/heading-city.png")}" alt="选择目的城市" />
      <div class="city-grid">${cities.map((city, index) => `<button type="button" class="city-item${state.selectedCity === index ? " selected" : ""}" data-city-index="${index}"><img src="${city.image}" alt="${city.name}" />${state.selectedCity === index ? '<i class="city-dot"></i>' : ""}</button>`).join("")}</div>
      <button type="button" class="generate-btn${ready ? " ready" : ""}" data-generate-route><img src="${asset("route/generate-button.png")}" alt="生成我的文旅路线" />${state.generating ? "<span>生成专属路线中...</span>" : ""}</button>
      ${state.currentRoute ? routeResult(state.currentRoute) : ""}
      <section class="history-section">
        <img class="section-heading heading-history" src="${asset("route/heading-history.png")}" alt="我的路线" />
        <div class="history-panel"><img class="history-frame" src="${asset("route/history-frame.png")}" alt="" />
          ${state.routes.length ? `<div class="route-history">${state.routes.map((route, index) => `<button type="button" class="route-history-item${state.currentRoute?.id === route.id ? " active" : ""}" data-route-index="${index}"><span class="route-history-badge">${route.city}</span><span class="route-history-copy"><strong>${escapeHtml(route.title)}</strong><small>${escapeHtml(route.description)}</small></span></button>`).join("")}</div>` : `<img class="empty-route" src="${asset("route/empty-route.png")}" alt="还没有生成路线" />`}
        </div>
      </section>
      <img class="footer-tip" src="${asset("route/footer-tip.png")}" alt="每一座城市都有属于你的电竞故事" />
    </main>
  </section>`;
}

function routeResult(route) {
  return `<section class="route-result"><header class="route-result-header"><span class="route-badge">${route.city}</span><div class="route-title">${escapeHtml(route.title)}</div><div class="route-meta"><span>◆ ${route.nodes.length}个打卡点</span><span>◆ 约4小时</span></div></header>
    <div class="timeline">${route.nodes.map((node, index) => `<div class="timeline-item"><div class="timeline-marker"><i class="timeline-dot"></i>${index < route.nodes.length - 1 ? '<i class="timeline-line"></i>' : ""}</div><div class="timeline-copy"><div class="timeline-num">第${index + 1}站</div><div class="timeline-card"><strong>${escapeHtml(node.name)}</strong><p>${escapeHtml(node.description)}</p></div></div></div>`).join("")}</div>
    <button type="button" class="ar-route-btn" data-goto="ar">开始AR打卡 →</button>
  </section>`;
}

function render() {
  const previousScrollTop = appRoot.querySelector(".page")?.scrollTop || 0;
  const templates = { home: renderHome, chat: renderChat, ar: renderAR, journey: renderJourney };
  appRoot.innerHTML = (templates[state.page] || renderHome)();
  bindPageEvents();
  if (state.page === "chat") {
    const scroll = appRoot.querySelector("[data-chat-scroll]");
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
    if (state.prefill) appRoot.querySelector(".chat-input")?.focus();
  }
  if (state.page === "ar" && state.cameraEnabled) attachCamera();
  if (state.page !== "chat") {
    const page = appRoot.querySelector(".page");
    if (page) page.scrollTop = previousScrollTop;
  }
}

function bindPageEvents() {
  appRoot.querySelectorAll("[data-goto]").forEach((node) => node.addEventListener("click", () => setPage(node.dataset.goto)));
  appRoot.querySelectorAll("[data-chat-question]").forEach((node) => node.addEventListener("click", () => setPage("chat", { prefill: node.dataset.chatQuestion })));
  appRoot.querySelectorAll("[data-team-chat]").forEach((node) => node.addEventListener("click", () => setPage("chat", { prefill: `请介绍一下${node.dataset.teamChat}战队的故事` })));
  appRoot.querySelectorAll("[data-send-question]").forEach((node) => node.addEventListener("click", () => sendMessage(node.dataset.sendQuestion)));
  const input = appRoot.querySelector(".chat-input");
  input?.addEventListener("input", (event) => {
    state.prefill = event.target.value;
    appRoot.querySelector(".send-btn")?.classList.toggle("active", Boolean(event.target.value.trim()));
  });
  appRoot.querySelector("[data-chat-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(new FormData(event.currentTarget).get("message") || "");
  });
  appRoot.querySelectorAll("[data-team-index]").forEach((node) => node.addEventListener("click", () => { state.selectedTeam = Number(node.dataset.teamIndex); render(); }));
  appRoot.querySelectorAll("[data-city-index]").forEach((node) => node.addEventListener("click", () => { state.selectedCity = Number(node.dataset.cityIndex); render(); }));
  appRoot.querySelector("[data-generate-route]")?.addEventListener("click", generateRoute);
  appRoot.querySelectorAll("[data-route-index]").forEach((node) => node.addEventListener("click", () => { state.currentRoute = state.routes[Number(node.dataset.routeIndex)]; render(); }));
  appRoot.querySelector("[data-authorize-camera]")?.addEventListener("click", authorizeCamera);
  appRoot.querySelector("[data-toggle-scan]")?.addEventListener("click", toggleScan);
  appRoot.querySelector("[data-hero-select]")?.addEventListener("change", (event) => { state.heroIndex = Number(event.target.value); render(); });
  appRoot.querySelectorAll("[data-ar-action]").forEach((node) => node.addEventListener("click", () => handleARAction(node.dataset.arAction)));
}

async function sendMessage(text) {
  const content = String(text).trim();
  if (!content || state.typing) return;
  state.prefill = "";
  state.emotion = recognizeEmotion(content);
  state.messages.push({ role: "user", content, time: now() });
  state.typing = true;
  render();
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: store.get("webUserId", "web-guest"),
        messages: state.messages.map((message) => ({ role: message.role === "ai" ? "assistant" : "user", content: message.content })),
      }),
    });
    let result;
    try { result = await response.json(); } catch { throw new Error(`接口响应异常（HTTP ${response.status}）`); }
    if (!response.ok || !result.ok) throw new Error(result.error || `接口调用失败（HTTP ${response.status}）`);
    const reply = result.content || result.reply;
    if (!reply) throw new Error("模型返回内容为空");
    state.messages.push({ role: "ai", content: reply, time: now(), suggestions: suggestionsFor(content) });
    const history = store.get("chatHistory", []);
    store.set("chatHistory", [...history, { date: new Date().toISOString(), messages: state.messages.slice(-10) }].slice(-20));
  } catch (error) {
    state.messages.push({ role: "ai", content: error.message || "抱歉，我遇到了一些问题，请稍后重试。", time: now(), isError: true });
  } finally {
    state.typing = false;
    render();
  }
}

function recognizeEmotion(text) {
  if (/燃|热血|夺冠|加油|激动/.test(text)) return "passionate";
  if (/回忆|曾经|怀念|经典/.test(text)) return "nostalgic";
  if (/为什么|怎么|什么|哪里|如何/.test(text)) return "curious";
  return "neutral";
}

function suggestionsFor(text) {
  if (/路线|旅游|文旅|打卡/.test(text)) return ["查看我的路线详情", "开始AR打卡"];
  if (/EDG|战队|选手|羁绊/.test(text)) return ["查看AR夺冠场景", "生成专属文旅路线"];
  return ["了解更多赛事精神", "生成文旅路线", "AR虚拟打卡"];
}

function generateRoute() {
  if (state.selectedTeam < 0) return showToast("请先选择一个战队");
  if (state.selectedCity < 0) return showToast("请先选择一个城市");
  const team = teams[state.selectedTeam].name;
  const city = cities[state.selectedCity].name;
  const route = {
    id: Date.now(), team, city,
    title: `${team}专属文旅路线`,
    description: `${city} · 5个电竞打卡点`,
    nodes: [
      { name: `${city}电竞中心`, description: "参观职业赛场并完成打卡" },
      { name: `${team}战队展馆`, description: "了解战队历史和荣耀" },
      { name: "选手应援墙", description: "留言支持喜欢的选手" },
      { name: "电竞主题餐厅", description: "品尝赛事主题美食" },
      { name: "周边商店", description: "购买正版周边纪念品" },
    ],
  };
  state.currentRoute = route;
  state.routes = [route, ...state.routes].slice(0, 10);
  store.set("myRoutes", state.routes);
  render();
  requestAnimationFrame(() => appRoot.querySelector(".route-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
}

async function authorizeCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return showToast("当前浏览器不支持摄像头调用");
  try {
    stopCamera();
    state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: state.cameraFacing }, audio: false });
    state.cameraEnabled = true;
    render();
  } catch (error) {
    state.cameraEnabled = false;
    showToast(error.name === "NotAllowedError" ? "摄像头权限被拒绝，请在浏览器设置中开启" : "摄像头启动失败，请检查设备占用情况");
  }
}

function attachCamera() {
  const video = appRoot.querySelector("[data-camera]");
  if (video && state.cameraStream) video.srcObject = state.cameraStream;
}

function stopCamera() {
  if (state.cameraStream) state.cameraStream.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
  state.cameraEnabled = false;
  clearInterval(scanTimer);
  state.scanning = false;
}

function toggleScan() {
  if (!state.cameraEnabled) return authorizeCamera();
  if (state.scanning) {
    clearInterval(scanTimer);
    state.scanning = false;
    render();
    return;
  }
  state.scanning = true;
  state.heroVisible = false;
  state.scanProgress = 0;
  render();
  scanTimer = setInterval(() => {
    state.scanProgress = Math.min(100, state.scanProgress + 8);
    if (state.scanProgress >= 100) {
      clearInterval(scanTimer);
      state.scanning = false;
      state.heroVisible = true;
      const heroName = state.heroIndex === 0 ? "牛魔" : "测试机器人";
      const record = `🛡️ ${heroName} · ${now()}`;
      state.arHistory = [record, ...state.arHistory].slice(0, 10);
      store.set("arScanHistory", state.arHistory);
    }
    render();
  }, 320);
}

async function handleARAction(action) {
  if (action === "camera") {
    state.cameraFacing = state.cameraFacing === "environment" ? "user" : "environment";
    if (state.cameraEnabled) await authorizeCamera(); else showToast("授权摄像头后即可切换镜头");
  } else if (action === "hero") {
    state.heroVisible = !state.heroVisible;
    render();
  } else if (action === "ai") {
    setPage("chat", { prefill: `请介绍英雄${state.heroIndex === 0 ? "牛魔" : "测试机器人"}的背景和玩法建议` });
  } else {
    showToast("英雄完整资料功能正在接入中");
  }
}

document.querySelectorAll(".web-nav-item").forEach((item) => item.addEventListener("click", () => setPage(item.dataset.page)));
window.addEventListener("hashchange", () => setPage(location.hash.replace("#", "") || "home"));
window.addEventListener("beforeunload", stopCamera);
setPage(state.page);
