const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const port = Number(process.env.PORT || 5173);
const YUANQI_PATH = "/openapi/v1/agent/chat/completions";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".glb": "model/gltf-binary",
};

function stripBom(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim();
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        req.destroy(new Error("request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("invalid json body"));
      }
    });
    req.on("error", reject);
  });
}

function toYuanqiMessages(messages) {
  const list = Array.isArray(messages) ? messages.slice(-40) : [];
  const normalized = [];
  for (const item of list) {
    const role = item.role === "assistant" || item.role === "ai" ? "assistant" : "user";
    const content = typeof item.content === "string" ? item.content : JSON.stringify(item.content || "");
    const text = stripBom(content);
    if (!text) continue;
    const last = normalized[normalized.length - 1];
    if (last && last.role === role) {
      last.content[0].text += `\n${text}`;
    } else if (role === "user" || normalized.length) {
      normalized.push({ role, content: [{ type: "text", text }] });
    }
  }
  while (normalized.length && normalized[0].role === "assistant") normalized.shift();
  while (normalized.length && normalized[normalized.length - 1].role === "assistant") normalized.pop();
  return normalized;
}

function postJson(hostname, payload, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        method: "POST",
        path: YUANQI_PATH,
        headers,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode || 500, body: raw });
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`upstream request timeout after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function parseSse(raw) {
  let content = "";
  let requestId = "";
  let usage = {};
  for (const line of String(raw || "").split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const chunk = line.slice(5).trim();
    if (!chunk || chunk === "[DONE]") continue;
    try {
      const parsed = JSON.parse(chunk);
      if (parsed.id) requestId = parsed.id;
      if (parsed.usage) usage = parsed.usage;
      const delta = parsed.choices && parsed.choices[0] && parsed.choices[0].delta;
      if (delta && typeof delta.content === "string") content += delta.content;
    } catch {
      // Ignore malformed SSE lines.
    }
  }
  return { content, requestId, usage };
}

function parseChatResponse(raw, streamMode) {
  const trimmed = String(raw || "").trim();
  if (streamMode || trimmed.startsWith("data:") || trimmed.includes("\ndata:")) {
    const parsed = parseSse(raw);
    if (parsed.content) {
      return {
        content: parsed.content,
        requestId: parsed.requestId,
        usage: parsed.usage,
        raw: { streamed: true },
      };
    }
  }

  const parsed = JSON.parse(trimmed || "{}");
  const first = (parsed.choices && parsed.choices[0]) || {};
  const message = first.message || {};
  let content = typeof message.content === "string" ? message.content : "";
  if (!content && Array.isArray(message.content)) {
    content = message.content
      .filter((part) => part && part.type === "text" && part.text)
      .map((part) => part.text)
      .join("");
  }
  return {
    content,
    requestId: parsed.id || "",
    finishReason: first.finish_reason || "",
    usage: parsed.usage || {},
    raw: parsed,
  };
}

async function callYuanqi(messages, userId) {
  const appkey = stripBom(process.env.YUANQI_APPKEY);
  const assistantId = stripBom(
    process.env.YUANQI_ASSISTANT_ID ||
      process.env.YUANQI_ASSISTANT ||
      process.env.YUANQI_ASSISTAN ||
      process.env.YUANQI_APP_ID
  );

  if (!appkey || !assistantId) {
    throw new Error("未配置 YUANQI_APPKEY / YUANQI_ASSISTANT_ID 环境变量");
  }

  const yuanqiMessages = toYuanqiMessages(messages);
  if (!yuanqiMessages.length) {
    throw new Error("messages 不能为空，且需要以用户消息开头");
  }

  const requestBase = {
    assistant_id: assistantId,
    user_id: stripBom(userId).slice(0, 128) || "web-guest",
    messages: yuanqiMessages,
  };

  const hosts =
    process.env.YUANQI_API_BASE === "yuanqi"
      ? [{ hostname: "yuanqi.tencent.com", extraHeaders: {} }]
      : [
          { hostname: "open.hunyuan.tencent.com", extraHeaders: { "X-Source": "openapi" } },
          { hostname: "yuanqi.tencent.com", extraHeaders: {} },
        ];
  const streamModes = ["omit", true];
  const timeoutMs = Number(process.env.YUANQI_UPSTREAM_TIMEOUT_MS || 30000);
  let lastError = "";

  for (const host of hosts) {
    for (const streamMode of streamModes) {
      const body =
        streamMode === "omit"
          ? requestBase
          : {
              ...requestBase,
              stream: streamMode,
            };
      const payload = JSON.stringify(body);
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appkey}`,
        "Content-Length": Buffer.byteLength(payload),
        ...host.extraHeaders,
      };

      try {
        const response = await postJson(host.hostname, payload, headers, timeoutMs);
        if (response.statusCode !== 200) {
          lastError = `HTTP ${response.statusCode}: ${response.body.slice(0, 500)}`;
          continue;
        }
        const parsed = parseChatResponse(response.body, streamMode === true);
        if (parsed.content) return parsed;
        lastError = "模型返回内容为空";
      } catch (error) {
        lastError = error && error.message ? error.message : "upstream request failed";
      }
    }
  }
  throw new Error(lastError || "大模型调用失败");
}

async function handleChat(req, res) {
  try {
    const body = await readRequestJson(req);
    const result = await callYuanqi(body.messages || [], body.user_id || "web-guest");
    const usage = result.usage || {};
    sendJson(res, 200, {
      ok: true,
      content: result.content,
      reply: result.content,
      requestId: result.requestId || "",
      finishReason: result.finishReason || "stop",
      promptTokens: Number(usage.prompt_tokens || 0),
      completionTokens: Number(usage.completion_tokens || 0),
      totalTokens: Number(usage.total_tokens || 0),
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error && error.message ? error.message : "大模型调用失败",
    });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const requestPath =
    url.pathname === "/"
      ? "index.html"
      : decodeURIComponent(url.pathname).replace(/^[/\\]+/, "");
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(rootDir, safePath);
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") {
    handleChat(req, res);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Method Not Allowed");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`webapp server listening on http://127.0.0.1:${port}`);
});
