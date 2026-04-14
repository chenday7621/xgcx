const app = getApp();

Page({
  data: {
    messages: [],
    inputText: "",
    isTyping: false,
    scrollToView: "",
    emotionStyle: { name: "专业", color: "#ffffff", emoji: "🎮" },
    quickQuestions: [
      { id: 1, text: "EDG选手的羁绊故事" },
      { id: 2, text: "什么是电竞精神？" },
      { id: 3, text: "生成我的文旅路线" },
      { id: 4, text: "AR场馆在哪里？" },
    ],
    model: "hunyuan-lite",
    temperature: 0.7,
  },

  onLoad(options) {
    if (options.prefill) this.setData({ inputText: decodeURIComponent(options.prefill) });
    if (options.team) this.setData({ inputText: `请介绍一下${options.team}战队的故事` });
    this.updateEmotionDisplay();
  },

  onShow() {
    this.updateEmotionDisplay();
  },

  updateEmotionDisplay() {
    const style = app.getEmotionStyle(app.globalData.emotion || "neutral");
    this.setData({ emotionStyle: style });
  },

  onInputChange(e) {
    this.setData({ inputText: e.detail.value });
  },

  onQuickQuestion(e) {
    this.setData({ inputText: e.currentTarget.dataset.question });
    this.sendMessage();
  },

  onSuggestionTap(e) {
    this.setData({ inputText: e.currentTarget.dataset.suggestion });
    this.sendMessage();
  },

  async sendMessage() {
    const message = (this.data.inputText || "").trim();
    if (!message) return;

    const emotion = app.recognizeEmotion(message);
    const userMsg = {
      id: Date.now(),
      role: "user",
      content: message,
      time: this.formatTime(new Date()),
      emotionEmoji: this.getEmotionEmoji(emotion),
    };

    this.setData({
      messages: [...this.data.messages, userMsg],
      inputText: "",
      isTyping: true,
    });
    this.scrollToBottom();

    try {
      const response = await this.callAIAPI();
      const aiMsg = {
        id: Date.now() + 1,
        role: "ai",
        content: response.content,
        time: this.formatTime(new Date()),
        emotion: app.globalData.emotion,
        suggestions: this.generateSuggestions(message),
        meta: response.meta,
      };

      this.setData({ messages: [...this.data.messages, aiMsg], isTyping: false });
      this.scrollToBottom();
      this.saveChatHistory();
    } catch (error) {
      const errorMsg = {
        id: Date.now() + 1,
        role: "ai",
        content: error.message || "抱歉，我遇到了一些问题，请稍后重试。",
        time: this.formatTime(new Date()),
        isError: true,
      };
      this.setData({ messages: [...this.data.messages, errorMsg], isTyping: false });
      this.scrollToBottom();
    }
  },

  async callAIAPI() {
    const messages = this.data.messages
      .filter((m) => m.role === "user" || m.role === "ai")
      .map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content }));

    const callData = {
      model: this.data.model,
      messages,
      temperature: this.data.temperature,
    };

    const cloudRes = await wx.cloud.callFunction({ name: "hunyuanChat", data: callData });
    const result = (cloudRes && cloudRes.result) || {};
    if (!result.ok) {
      const reason = [result.code, result.error].filter(Boolean).join(": ");
      throw new Error(reason || "云函数调用失败");
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
  },

  generateSuggestions(userMessage) {
    const lowerMsg = userMessage.toLowerCase();
    const suggestions = [];
    if (lowerMsg.includes("羁绊") || lowerMsg.includes("选手")) {
      suggestions.push("查看他们的AR夺冠场景", "生成专属文旅路线");
    }
    if (lowerMsg.includes("精神") || lowerMsg.includes("故事")) {
      suggestions.push("了解相关赛事精神", "探索更多战队故事");
    }
    if (lowerMsg.includes("路线") || lowerMsg.includes("旅游") || lowerMsg.includes("打卡")) {
      suggestions.push("查看我的路线详情", "分享到朋友圈");
    }
    if (suggestions.length === 0) suggestions.push("了解更多相关信息", "生成文旅路线", "AR虚拟打卡");
    return suggestions.slice(0, 3);
  },

  getEmotionEmoji(emotion) {
    const emojis = { passionate: "🔥", nostalgic: "💫", curious: "⭐", confused: "🤝", neutral: "🎮" };
    return emojis[emotion] || "🎮";
  },

  formatTime(date) {
    return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  },

  scrollToBottom() {
    setTimeout(() => this.setData({ scrollToView: `msg-${this.data.messages.length - 1}` }), 100);
  },

  saveChatHistory() {
    const history = wx.getStorageSync("chatHistory") || [];
    history.push({ date: new Date().toDateString(), messages: this.data.messages.slice(-10) });
    wx.setStorageSync("chatHistory", history);
  },

  clearChat() {
    wx.showModal({
      title: "确认清空",
      content: "确定要清空当前对话吗？",
      confirmColor: "#e63028",
      success: (res) => {
        if (res.confirm) this.setData({ messages: [] });
      },
    });
  },

  goBack() {
    wx.navigateBack();
  },
});
