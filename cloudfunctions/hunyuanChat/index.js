const crypto = require("crypto");
const https = require("https");

const ENDPOINT = "hunyuan.tencentcloudapi.com";
const SERVICE = "hunyuan";
const VERSION = "2023-09-01";
const ACTION = "ChatCompletions";
const ALGORITHM = "TC3-HMAC-SHA256";

function sha256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function hmacSha256(key, content, encoding) {
  return crypto.createHmac("sha256", key).update(content, "utf8").digest(encoding);
}

function parseEnvFloat(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function resolveMaxTokens(event) {
  if (event && typeof event.maxTokens === "number" && Number.isInteger(event.maxTokens) && event.maxTokens > 0) {
    return event.maxTokens;
  }
  const raw = process.env.HUNYUAN_MAX_TOKENS;
  if (raw === undefined || raw === "") return undefined;
  const n = parseInt(String(raw), 10);
  if (Number.isFinite(n) && n > 0) return n;
  return undefined;
}

function buildAuthorization({
  secretId,
  secretKey,
  timestamp,
  date,
  requestPayload,
}) {
  const httpRequestMethod = "POST";
  const canonicalUri = "/";
  const canonicalQueryString = "";
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${ENDPOINT}\n`;
  const signedHeaders = "content-type;host";
  const hashedRequestPayload = sha256(requestPayload);
  const canonicalRequest =
    `${httpRequestMethod}\n` +
    `${canonicalUri}\n` +
    `${canonicalQueryString}\n` +
    `${canonicalHeaders}\n` +
    `${signedHeaders}\n` +
    `${hashedRequestPayload}`;

  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const hashedCanonicalRequest = sha256(canonicalRequest);
  const stringToSign =
    `${ALGORITHM}\n` +
    `${timestamp}\n` +
    `${credentialScope}\n` +
    `${hashedCanonicalRequest}`;

  const secretDate = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, SERVICE);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256(secretSigning, stringToSign, "hex");

  const authorization =
    `${ALGORITHM} ` +
    `Credential=${secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;
  return authorization;
}

function postJson(payload, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: ENDPOINT,
        method: "POST",
        path: "/",
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

    req.on("error", (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

function bodySnippet(body, maxLen) {
  const s = body || "";
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "...";
}

exports.main = async (event) => {
  // 部署校验：日志里应出现本行；若仍是 Hello World，说明线上未更新为本文件
  console.log("[hunyuanChat] MixCloud handler active");

  // 控制台粘贴密钥时易带入首尾空格/换行，会导致混元返回 SecretId is not found
  const secretId = String(process.env.TENCENT_SECRET_ID || "").trim();
  const secretKey = String(process.env.TENCENT_SECRET_KEY || "").trim();
  const model = (event && event.model) || process.env.HUNYUAN_MODEL || "hunyuan-lite";
  const messages = (event && event.messages) || [];
  const defaultTemperature = parseEnvFloat("HUNYUAN_TEMPERATURE", 0.7);
  const temperature =
    event && typeof event.temperature === "number" ? event.temperature : defaultTemperature;
  const maxTokens = resolveMaxTokens(event);

  // debug: 只返回是否读到环境变量，绝不回显密钥
  if (event && event.debug === true) {
    return {
      ok: true,
      debug: {
        hasSecretId: Boolean(secretId),
        hasSecretKey: Boolean(secretKey),
        secretIdSuffix: secretId ? secretId.slice(-4) : "",
        region: process.env.HUNYUAN_REGION || "ap-guangzhou",
        model: model,
        defaultTemperature,
        resolvedMaxTokens: maxTokens,
      },
    };
  }

  if (!secretId || !secretKey) {
    return {
      ok: false,
      error: "云函数环境变量未配置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY",
    };
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      ok: false,
      error: "messages 不能为空",
    };
  }

  const requestBody = {
    Model: model,
    Messages: messages.map((m) => ({
      Role: m.role,
      Content: m.content,
    })),
    Stream: false,
    Temperature: temperature,
  };
  if (maxTokens !== undefined) {
    requestBody.MaxTokens = maxTokens;
  }

  const requestPayload = JSON.stringify(requestBody);

  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const authorization = buildAuthorization({
    secretId,
    secretKey,
    timestamp,
    date,
    requestPayload,
  });

  const headers = {
    Authorization: authorization,
    "Content-Type": "application/json; charset=utf-8",
    Host: ENDPOINT,
    "X-TC-Action": ACTION,
    "X-TC-Timestamp": String(timestamp),
    "X-TC-Version": VERSION,
    "X-TC-Region": process.env.HUNYUAN_REGION || "ap-guangzhou",
  };

  try {
    const res = await postJson(requestPayload, headers);
    const rawText = res.body || "";

    if (res.statusCode !== 200) {
      let detail = bodySnippet(rawText, 500);
      try {
        const errParsed = JSON.parse(rawText);
        const errMsg =
          (errParsed.Response && errParsed.Response.Error && errParsed.Response.Error.Message) ||
          errParsed.message ||
          detail;
        detail = typeof errMsg === "string" ? errMsg : detail;
      } catch (_) {
        /* keep snippet */
      }
      return {
        ok: false,
        error: `HTTP ${res.statusCode}: ${detail}`,
        httpStatus: res.statusCode,
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText || "{}");
    } catch (parseErr) {
      return {
        ok: false,
        error: "响应不是合法 JSON: " + bodySnippet(rawText, 200),
      };
    }

    const apiError = parsed.Response && parsed.Response.Error;
    if (apiError) {
      return {
        ok: false,
        error: apiError.Message || "混元接口调用失败",
        code: apiError.Code || "",
        requestId: parsed.Response.RequestId || "",
      };
    }

    const resp = parsed.Response || {};
    const choices = resp.Choices || [];
    const content =
      (choices[0] && choices[0].Message && choices[0].Message.Content) || "";
    const finishReason = (choices[0] && choices[0].FinishReason) || "";
    const usage = resp.Usage || {};
    const promptTokens =
      usage.PromptTokens != null ? Number(usage.PromptTokens) : 0;
    const completionTokens =
      usage.CompletionTokens != null ? Number(usage.CompletionTokens) : 0;
    const totalTokens = usage.TotalTokens != null ? Number(usage.TotalTokens) : 0;
    const requestId = resp.RequestId || "";

    return {
      ok: true,
      content,
      reply: content,
      promptTokens,
      completionTokens,
      totalTokens,
      finishReason,
      requestId,
      raw: resp,
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : "调用失败",
    };
  }
};
