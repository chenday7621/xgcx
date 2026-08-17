const app = getApp();

Page({
  data: {
    particles: [],
    welcomeEmoji: "🎮",
    welcomeTitle: "欢迎来到电竞世界",
    welcomeTitleImage: "/imgs/home/night-title.png",
    welcomeMessage: "今天想了解什么电竞故事呢？",
    suggestions: [
      { id: 1, text: "EDG选手的羁绊故事" },
      { id: 2, text: "KPL总决赛夺冠时刻" },
      { id: 3, text: "电竞精神是什么" },
      { id: 4, text: "成都AG主场有什么" },
    ],
    hotTeams: [
      { id: 1, name: "EDG", image: "/imgs/home/team-edg.png", background: "/imgs/home/bg-edg.jpg", color: "linear-gradient(135deg, #555b68, #151820)", logoText: "EDG", bonds: "Meiko&Scout", spirit: "团结拼搏", theme: "edg", delayClass: "delay-7" },
      { id: 2, name: "AG超玩会", image: "/imgs/home/team-ag.png", background: "/imgs/home/bg-ag.jpg", color: "linear-gradient(135deg, #f0443c, #700508)", logoText: "AG", bonds: "一诺&Cat", spirit: "永不言弃", theme: "ag", delayClass: "delay-8" },
      { id: 3, name: "狼队", image: "/imgs/home/team-wolves.png", background: "/imgs/home/bg-wolves.png", color: "linear-gradient(135deg, #ffd700, #b77800)", logoText: "狼", bonds: "Fly&胖皇", spirit: "坚韧不拔", theme: "wolves", delayClass: "delay-9" },
      { id: 4, name: "TES", image: "/imgs/home/team-tes.png", background: "/imgs/home/bg-tes.png", color: "linear-gradient(135deg, #e8342f, #7d0710)", logoText: "TES", bonds: "knight&JackeyLove", spirit: "无畏前行", theme: "tes", delayClass: "delay-10" },
    ],
    pageLoaded: false,
    contentVisible: false,
  },

  onLoad() {
    this._isPageActive = true;
    this.generateParticles();
    this.updateWelcomeByTime();

    // 页面加载动画 - 延迟显示内容，创造渐进式入场
    this.pageLoadTimer = setTimeout(() => {
      if (!this._isPageActive) {
        return;
      }
      this.setData({
        pageLoaded: true,
        contentVisible: true
      });
    }, 300);
  },

  onUnload() {
    this._isPageActive = false;
    this.clearPageTimers();
  },

  onHide() {
    // 开发者工具热重载和切后台时，也要停止动画避免空页面 setData
    this._isPageActive = false;
    this.clearPageTimers();
  },

  onShow() {
    this._isPageActive = true;
    if (!this.particleInterval) {
      this.generateParticles();
    }
    this.updateWelcomeByTime();
    const emotion = app.globalData.emotion;
    if (emotion && emotion !== "neutral") this.updateWelcomeByEmotion(emotion);
  },

  clearPageTimers() {
    if (this.particleInterval) {
      clearInterval(this.particleInterval);
      this.particleInterval = null;
    }
    if (this.pageLoadTimer) {
      clearTimeout(this.pageLoadTimer);
      this.pageLoadTimer = null;
    }
  },

  generateParticles() {
    if (this.particleInterval) {
      clearInterval(this.particleInterval);
      this.particleInterval = null;
    }
    const particles = [];
    const colors = [
      { color: '#ff4444', glow: 'rgba(255, 68, 68, 0.6)' },
      { color: '#ffd700', glow: 'rgba(255, 215, 0, 0.6)' },
      { color: '#00ccff', glow: 'rgba(0, 204, 255, 0.6)' },
      { color: '#9966ff', glow: 'rgba(153, 102, 255, 0.6)' }
    ];

    for (let i = 0; i < 30; i += 1) {
      const colorIndex = Math.floor(Math.random() * 4);
      const angle = Math.random() * Math.PI * 2;
      const distance = 20 + Math.random() * 80;
      const size = 4 + Math.random() * 8;

      particles.push({
        id: i,
        top: Math.random() * 100,
        left: Math.random() * 100,
        color: colors[colorIndex].color,
        glow: colors[colorIndex].glow,
        size: size,
        sizeDouble: size * 2, // 预计算
        speedX: (Math.random() - 0.5) * 0.02,
        speedY: (Math.random() - 0.5) * 0.02,
        opacity: 0.3 + Math.random() * 0.4,
        angle,
        distance,
      });
    }

    if (!this._isPageActive) {
      return;
    }
    this.setData({ particles });

    // 动态更新粒子位置
    this.particleInterval = setInterval(() => {
      if (!this._isPageActive) {
        this.clearPageTimers();
        return;
      }
      const particles = this.data.particles.map(p => {
        let newAngle = p.angle + 0.01;
        let newX = 50 + Math.cos(newAngle) * p.distance;
        let newY = 50 + Math.sin(newAngle) * p.distance;

        return {
          ...p,
          angle: newAngle,
          top: Math.max(5, Math.min(95, newY + (Math.random() - 0.5) * 2)),
          left: Math.max(5, Math.min(95, newX + (Math.random() - 0.5) * 2)),
        };
      });
      this.setData({ particles });
    }, 50);
  },

  updateWelcomeByTime() {
    const hour = new Date().getHours();
    let emoji = "🔥";
    let title = "下午好，召唤师";
    let titleImage = "/imgs/home/afternoon-title.png";
    let message = "今天有比赛，来聊聊赛况吧！";

    if (hour < 6) {
      emoji = "🌙";
      title = "深夜时光";
      titleImage = "/imgs/home/night-title.png";
      message = "想了解哪个选手的励志故事？";
    } else if (hour < 12) {
      emoji = "☀️";
      title = "早安，召唤师";
      titleImage = "/imgs/home/morning-title.png";
      message = "新的一天，为你喜欢的战队加油！";
    } else if (hour >= 18) {
      emoji = "🌆";
      title = "晚上好";
      titleImage = "/imgs/home/evening-title.png";
      message = "今晚有精彩对决，想了解什么？";
    }
    this.setData({
      welcomeEmoji: emoji,
      welcomeTitle: title,
      welcomeTitleImage: titleImage,
      welcomeMessage: message,
    });
  },

  updateWelcomeByEmotion(emotion) {
    const style = app.getEmotionStyle(emotion);
    this.setData({
      welcomeEmoji: style.emoji,
      welcomeTitle: `检测到${style.name}模式`,
      welcomeMessage: "我会用更贴合你状态的方式和你聊电竞。",
    });
  },

  onSuggestionTap(e) {
    const message = e.currentTarget.dataset.message;
    app.safeNavigateTo(`/pages/chat/chat?prefill=${encodeURIComponent(message)}`).catch((err) => {
      console.error("navigate to chat failed", err);
    });
  },

  onEntryTap(e) {
    app.safeNavigateTo(e.currentTarget.dataset.path).catch((err) => {
      console.error("navigate to entry failed", err);
    });
  },

  onTeamTap(e) {
    const team = e.currentTarget.dataset.team;
    app.safeNavigateTo(`/pages/chat/chat?team=${team}`).catch((err) => {
      console.error("navigate to team chat failed", err);
    });
  },
});
