const https = require("https");
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 腾讯元器 OpenAPI
 * - 文档 curl：`https://yuanqi.tencent.com/...` + `Authorization`（无 X-Source）
 * - 官方 Python 示例：`https://open.hunyuan.tencent.com/...` + `X-Source: openapi`
 * 文档：https://yuanqi.tencent.com/guide/publish-agent-api-documentation
 */
const YUANQI_PATH = "/openapi/v1/agent/chat/completions";

function bodySnippet(body, maxLen) {
  const s = body || "";
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "...";
}

function postJson(hostname, path, payload, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        method: "POST",
        path,
        headers,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 500,
            body: raw,
          });
        });
      }
    );

    if (timeoutMs && Number(timeoutMs) > 0) {
      req.setTimeout(Number(timeoutMs), () => {
        req.destroy(new Error(`upstream request timeout after ${timeoutMs}ms`));
      });
    }
    req.on("error", (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

/**
 * 将混元/前端使用的 { role, content: string } 转为元器要求的 content 数组格式。
 * 最多保留 40 条（元器限制）。
 */
function stripBom(s) {
  return String(s || "").replace(/^\uFEFF/, "").trim();
}

function toYuanqiMessages(messages) {
  const list = Array.isArray(messages) ? messages.slice(-40) : [];
  return list.map((m) => {
    const role = m.role === "assistant" ? "assistant" : "user";
    const text =
      typeof m.content === "string"
        ? m.content
        : m.content != null
          ? JSON.stringify(m.content)
          : "";
    return {
      role,
      content: [{ type: "text", text: stripBom(text) }],
    };
  });
}

/**
 * 元器要求 messages 中 user / assistant 严格交替；合并连续同角色，去掉空文本，且必须以 user 开头。
 */
function normalizeYuanqiMessages(messages) {
  const mapped = toYuanqiMessages(messages);
  const withText = mapped.filter((m) => {
    const t = (m.content[0] && m.content[0].text) || "";
    return t.length > 0;
  });
  const merged = [];
  for (const m of withText) {
    if (merged.length === 0) {
      if (m.role === "assistant") {
        continue;
      }
      merged.push({ role: m.role, content: [{ type: "text", text: m.content[0].text }] });
      continue;
    }
    const last = merged[merged.length - 1];
    if (last.role === m.role) {
      last.content[0].text = `${last.content[0].text}\n${m.content[0].text}`;
    } else {
      merged.push({ role: m.role, content: [{ type: "text", text: m.content[0].text }] });
    }
  }
  while (merged.length && merged[merged.length - 1].role === "assistant") {
    merged.pop();
  }
  while (merged.length && merged[0].role === "assistant") {
    merged.shift();
  }
  return merged;
}

function pickYuanqiErrorMessage(parsed, rawText) {
  if (!parsed || typeof parsed !== "object") return bodySnippet(rawText, 500);
  const err = parsed.error;
  const candidates = [
    err && typeof err === "object" && err.message,
    typeof err === "string" ? err : "",
    parsed.message,
    parsed.msg,
    parsed.detail,
    parsed.reason,
  ].filter((x) => typeof x === "string" && x);
  const specific = candidates.find((x) => x && x !== "请求参数有误");
  if (specific) return specific;
  return candidates[0] || bodySnippet(rawText, 500);
}

/** 解析 stream:true 时的 SSE（data: {...} 行） */
function parseSSEAssistantText(raw) {
  let text = "";
  let requestId = "";
  let usage = {};
  for (const line of String(raw || "").split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const chunk = line.slice(5).trim();
    if (!chunk || chunk === "[DONE]") continue;
    try {
      const j = JSON.parse(chunk);
      if (j.id) requestId = j.id;
      if (j.usage) usage = j.usage;
      const ch0 = j.choices && j.choices[0];
      if (!ch0 || !ch0.delta) continue;
      const d = ch0.delta;
      if (typeof d.content === "string" && d.content && (d.role === "assistant" || !d.role)) {
        text += d.content;
      }
    } catch (_) {
      /* skip bad line */
    }
  }
  return { text, requestId, usage };
}

function buildYuanqiAttemptList(apiMode) {
  const hunyuan = { hostname: "open.hunyuan.tencent.com", headers: { "X-Source": "openapi" } };
  const yuanqi = { hostname: "yuanqi.tencent.com", headers: {} };
  if (apiMode === "yuanqi") return [yuanqi];
  if (apiMode === "hunyuan_open" || apiMode === "hunyuan") return [hunyuan];
  return [hunyuan, yuanqi];
}

/**
 * 依次尝试：各网关 × (stream:false, stream:true)。文档 curl 默认 stream:true，部分环境对 false 校验更严。
 */
function buildBodyForStreamMode(requestBase, streamMode) {
  if (streamMode === "omit") {
    const { assistant_id, user_id, messages, custom_variables } = requestBase;
    const o = { assistant_id, user_id, messages };
    if (custom_variables) o.custom_variables = custom_variables;
    return o;
  }
  return { ...requestBase, stream: streamMode };
}

async function postYuanqiWithFallback(appkey, requestBase, apiMode) {
  const hosts = buildYuanqiAttemptList(apiMode);
  // 云函数默认 30s 时限：减少组合爆炸 + 给上游请求加硬超时，避免整体超时。
  const streamModes = ["omit", true];
  const upstreamTimeoutMs = Number(process.env.YUANQI_UPSTREAM_TIMEOUT_MS || "9000");
  const deadlineMs = Number(process.env.YUANQI_DEADLINE_MS || "26000");
  const startedAt = Date.now();
  let last = null;

  for (const host of hosts) {
    for (const streamMode of streamModes) {
      if (Date.now() - startedAt >= deadlineMs) {
        return last;
      }
      const body = buildBodyForStreamMode(requestBase, streamMode);
      const payload = JSON.stringify(body);
      const len = Buffer.byteLength(payload, "utf8");
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appkey}`,
        "Content-Length": len,
        ...host.headers,
      };
      const attempt = `${host.hostname} stream=${streamMode === "omit" ? "omit" : streamMode}`;
      const remaining = Math.max(1000, deadlineMs - (Date.now() - startedAt));
      const thisTimeoutMs = Math.min(upstreamTimeoutMs, remaining);
      console.log(`[hunyuanChat] attempt=${attempt} timeoutMs=${thisTimeoutMs}`);
      let res;
      try {
        res = await postJson(
          host.hostname,
          YUANQI_PATH,
          payload,
          headers,
          thisTimeoutMs
        );
      } catch (e) {
        const msg = e && e.message ? String(e.message) : "upstream request failed";
        // 部分控制台可能吞掉 console.error，这里用 log 确保可见
        console.log(`[hunyuanChat] request error attempt=${attempt} msg=${msg}`);
        last = {
          statusCode: 599,
          body: JSON.stringify({ error: msg, attempt }),
          attempt,
          requestError: msg,
        };
        continue;
      }
      last = { ...res, attempt };
      if (res.statusCode !== 200) {
        console.error(`[hunyuanChat] ${attempt} HTTP ${res.statusCode}`, bodySnippet(res.body, 2000));
        if (res.statusCode !== 400 && res.statusCode !== 404) {
          return last;
        }
        continue;
      }
      const raw = res.body || "";
      const trimmed = raw.trim();
      const looksLikeSse =
        trimmed.startsWith("data:") || trimmed.includes("\r\ndata:") || trimmed.includes("\ndata:");
      if (looksLikeSse || streamMode === true) {
        const { text, requestId, usage } = parseSSEAssistantText(raw);
        if (text.length > 0) {
          return {
            statusCode: 200,
            body: raw,
            attempt,
            parsedStream: true,
            content: text,
            requestId,
            usage,
          };
        }
      }
      try {
        const parsed = JSON.parse(trimmed || "{}");
        last = { ...res, attempt, parsedJson: parsed };
        const choices = parsed.choices || [];
        const first = choices[0] || {};
        const msg = first.message || {};
        let content = typeof msg.content === "string" ? msg.content : "";
        if (!content && Array.isArray(msg.content)) {
          content = msg.content
            .filter((p) => p && p.type === "text" && p.text)
            .map((p) => p.text)
            .join("");
        }
        if (content || first.finish_reason === "stop" || first.finish_reason === "length") {
          return {
            statusCode: 200,
            body: raw,
            attempt,
            parsedStream: false,
            parsed,
            content,
            first,
          };
        }
      } catch (e) {
        console.error(`[hunyuanChat] ${attempt} parse err`, e);
      }
    }
  }
  return last;
}

exports.main = async (event) => {
  console.log("[hunyuanChat] Yuanqi agent handler active");

  const appkey = stripBom(process.env.YUANQI_APPKEY || "");
  let assistantId = stripBom(
    process.env.YUANQI_ASSISTANT_ID || process.env.YUANQI_APP_ID || ""
  );
  if (
    process.env.YUANQI_ALLOW_EVENT_ASSISTANT_ID === "1" &&
    event &&
    typeof event.assistant_id === "string" &&
    stripBom(event.assistant_id)
  ) {
    assistantId = stripBom(event.assistant_id);
  }

  if (event && event.debug === true) {
    return {
      ok: true,
      debug: {
        hasAppkey: Boolean(appkey),
        hasAssistantId: Boolean(assistantId),
        assistantIdSuffix: assistantId ? assistantId.slice(-4) : "",
      },
    };
  }

  if (!appkey || !assistantId) {
    return {
      ok: false,
      error:
        "云函数环境变量未配置 YUANQI_APPKEY / YUANQI_ASSISTANT_ID（助手 ID 见元器：应用发布 → 体验链接中的 appid）",
    };
  }

  const messages = (event && event.messages) || [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      ok: false,
      error: "messages 不能为空",
    };
  }

  let userId = "";
  try {
    const wxContext = cloud.getWXContext();
    userId = wxContext.OPENID || wxContext.FROM_OPENID || "";
  } catch (_) {
    userId = "";
  }
  if (event && event.user_id) {
    userId = String(event.user_id);
  }
  if (!userId) {
    userId = "guest";
  }
  userId = stripBom(userId).slice(0, 128) || "guest";

  const yuanqiMessages = normalizeYuanqiMessages(messages);
  if (!yuanqiMessages.length) {
    return {
      ok: false,
      error: "有效消息为空：请检查对话内容或消息角色（需以用户消息开头）",
    };
  }

  const requestBase = {
    assistant_id: assistantId,
    user_id: userId,
    messages: yuanqiMessages,
  };
  if (event && event.custom_variables && typeof event.custom_variables === "object") {
    requestBase.custom_variables = event.custom_variables;
  }

  const apiMode = stripBom(process.env.YUANQI_API_BASE || "");

  try {
    const res = await postYuanqiWithFallback(appkey, requestBase, apiMode);
    const rawText = res.body || "";

    if (res.statusCode !== 200) {
      let detail = bodySnippet(rawText, 500);
      try {
        const errParsed = JSON.parse(rawText);
        detail = pickYuanqiErrorMessage(errParsed, rawText);
      } catch (_) {
        /* keep detail from raw */
      }
      const upstreamSnippet = bodySnippet(rawText, 800);
      const traceMatch = rawText.match(/"traceId"\s*:\s*"([^"]+)"/);
      const traceHint = traceMatch ? ` traceId=${traceMatch[1]}（可连同请求时间发给元器支持/队友核对 appid 与 appkey 是否同一应用）` : "";
      return {
        ok: false,
        error: `HTTP ${res.statusCode}: ${detail}${upstreamSnippet ? ` | 上游: ${upstreamSnippet}` : ""}${traceHint}`,
        httpStatus: res.statusCode,
        upstreamBody: upstreamSnippet,
        attempt: res.attempt || "",
        hint:
          res.statusCode === 400
            ? "400 多为凭证与助手不匹配：YUANQI_ASSISTANT_ID 须为「应用发布→体验链接」的 appid；YUANQI_APPKEY 须为同一智能体「API 管理」中的 key；智能体需已发布且开通 API。可设 YUANQI_API_BASE=hunyuan_open 或 yuanqi 只测单一网关。"
            : "",
      };
    }

    if (res.parsedStream) {
      const usage = res.usage || {};
      return {
        ok: true,
        content: res.content || "",
        reply: res.content || "",
        promptTokens: usage.prompt_tokens != null ? Number(usage.prompt_tokens) : 0,
        completionTokens: usage.completion_tokens != null ? Number(usage.completion_tokens) : 0,
        totalTokens: usage.total_tokens != null ? Number(usage.total_tokens) : 0,
        finishReason: "stop",
        requestId: res.requestId || "",
        raw: { streamed: true, attempt: res.attempt },
      };
    }

    const parsed = res.parsed;
    if (!parsed) {
      return {
        ok: false,
        error: "响应解析失败: " + bodySnippet(rawText, 200),
        attempt: res.attempt || "",
      };
    }

    const first = res.first || (parsed.choices && parsed.choices[0]) || {};
    const msg = first.message || {};
    let content = typeof res.content === "string" ? res.content : "";
    if (!content && typeof msg.content === "string") content = msg.content;
    if (!content && Array.isArray(msg.content)) {
      content = msg.content
        .filter((p) => p && p.type === "text" && p.text)
        .map((p) => p.text)
        .join("");
    }

    const finishReason = first.finish_reason || "";
    if (finishReason === "sensitive") {
      return {
        ok: false,
        error: "内容未通过审核",
        finishReason,
        requestId: parsed.id || "",
      };
    }
    if (finishReason === "tool_fail") {
      return {
        ok: false,
        error: "智能体工具调用失败",
        finishReason,
        requestId: parsed.id || "",
      };
    }

    const usage = parsed.usage || {};
    const promptTokens = usage.prompt_tokens != null ? Number(usage.prompt_tokens) : 0;
    const completionTokens =
      usage.completion_tokens != null ? Number(usage.completion_tokens) : 0;
    const totalTokens = usage.total_tokens != null ? Number(usage.total_tokens) : 0;
    const requestId = parsed.id || "";

    return {
      ok: true,
      content,
      reply: content,
      promptTokens,
      completionTokens,
      totalTokens,
      finishReason,
      requestId,
      raw: parsed,
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : "调用失败",
    };
  }
};
