const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MODEL_FILES = Object.freeze({
  "hero-daji":
    "cloud://cloud1-d9gd58pgib59d7259.636c-cloud1-d9gd58pgib59d7259-1420321518/daji.glb",
  "hero-jialuo":
    "cloud://cloud1-d9gd58pgib59d7259.636c-cloud1-d9gd58pgib59d7259-1420321518/jialuo-v1.glb",
});

exports.main = async (event) => {
  const modelId = event && event.modelId ? String(event.modelId) : "hero-daji";
  const fileID = MODEL_FILES[modelId];
  if (!fileID) throw new Error("AR_MODEL_NOT_ALLOWED");

  const result = await cloud.getTempFileURL({
    fileList: [fileID],
  });
  const file = result && result.fileList && result.fileList[0];

  if (!file || Number(file.status || 0) !== 0 || !file.tempFileURL) {
    const reason = file && file.errMsg ? file.errMsg : "EMPTY_TEMP_FILE_URL";
    throw new Error(`AR_MODEL_URL_FAILED: ${reason}`);
  }

  return {
    ok: true,
    modelId,
    fileID,
    tempFileURL: file.tempFileURL,
  };
};
