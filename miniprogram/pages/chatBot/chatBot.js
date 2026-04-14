// pages/chatBot/chatBot.js
Page({
  /**
   * 页面的初始数据
   */
  data: {
    chatMode: "model", // bot: agent 模式，model：直连大模型
    showBotAvatar: true, // 是否在对话框左侧显示头像
    // envShareConfig: {
    //   // 不使用环境共享，请删除此配置或配置EnvShareConfig:null
    //   // 资源方 AppID
    //   resourceAppid: "wx7ac1bfecc7bf5f4f",
    //   // 资源方环境 ID
    //   resourceEnv: "chriscc-demo-7ghlpjf846d46d2d",
    // },
    agentConfig: {
      botId: "agent-ryan-3ghdryeyb5ad5812", //  bot ID 或者 agent ID,
      allowWebSearch: true, // 允许客户端选择启用联网搜索（仅对配置型 agent 生效）
      allowUploadFile: true, // 允许上传文件（仅对配置型 agent 生效）
      allowPullRefresh: true, // 允许下拉刷新（仅对配置型 agent 生效）
      allowUploadImage: true, // 允许上传图片（仅对配置型 agent 生效）
      showToolCallDetail: true, // 展示 toolCall 细节（仅对配置型 agent 生效）
      allowMultiConversation: true, // 允许多轮对话（仅对配置型 agent 生效）
      allowVoice: true, // 允许语音输入（仅对配置型 agent 生效）
      showBotName: true, // 是否展示 bot 名称（仅对配置型 agent 生效）
      // 前端工具列表（仅对云托管或者云函数 agent 生效）
      tools: [
        {
          name: "get_weather",
          description: "获取指定城市的天气",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
          // 同步函数示例
          handler: (params) => {
            const { city } = params;
            return `城市${city}的天气是晴朗的，温度是25摄氏度，无风`;
          }
        },
        {
          name: "get_location",
          description: "获取指定城市的经纬度",
          parameters: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
          // 异步函数示例
          handler: async (params) => {
            const { city } = params;
            // 模拟网络延迟
            return new Promise((resolve) => {
              setTimeout(() => {
                resolve(`城市${city}的位置是东经114.305556度，北纬22.543056度`);
              }, 2000);
            });
          },
        },
      ],
    },
    modelConfig: {
      modelProvider: "hunyuan-exp", // 腾讯混元（云开发可用通道）
      quickResponseModel: "hunyuan-lite", // 先用通用混元文本模型，稳定且成本低
      logo: "", // model 头像
      welcomeMsg: "你好，我是腾讯混元助手", // model 欢迎语
      temperature: 0.7, // 与云函数 / Spring 默认一致；也可在云函数环境变量 HUNYUAN_TEMPERATURE 覆盖
      // maxTokens: 2048, // 需要限制输出长度时取消注释并设为正整数
    },
  },
  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {},

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {},

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {},

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {},

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {},

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {},

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {},

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {},
});
