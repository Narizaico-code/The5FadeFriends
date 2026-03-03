import fs from "fs/promises";
import path from "path";
import { VertexAI } from "@google-cloud/vertexai";

const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
const GOOGLE_VERTEX_LOCATION = process.env.GOOGLE_VERTEX_LOCATION || "us-central1";

if (!GOOGLE_PROJECT_ID) {
  throw new Error("Falta GOOGLE_PROJECT_ID en el entorno");
}

const vertex = new VertexAI({ project: GOOGLE_PROJECT_ID, location: GOOGLE_VERTEX_LOCATION });

const TEXT_MODEL = process.env.VERTEX_TEXT_MODEL || "gemini-1.5-flash-001"; // Ajusta al release disponible en tu región
const IMAGE_MODEL = process.env.VERTEX_IMAGE_MODEL || "imagen-3.0-generate"; // Ajusta al release disponible en tu región

async function generateWithRetry(fn, { retries = 3, baseDelayMs = 1000 } = {}) {
  let attempt = 0;
  // Retry on quota / transient errors
  const retriableCodes = new Set([429, 503]);
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const code = err?.code || err?.status;
      const isRetriable = retriableCodes.has(Number(code)) || retriableCodes.has(code);
      if (!isRetriable || attempt >= retries) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt); // simple exponential backoff
      await new Promise((res) => setTimeout(res, delay));
      attempt += 1;
    }
  }
}

async function loadImageAsBase64FromPath(imagePath) {
  const file = await fs.readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : "image/jpeg";
  return { base64: file.toString("base64"), mime };
}

export async function describeFace({ imageBase64, imagePath, mimeType }) {
  const hasPath = Boolean(imagePath);
  const { base64, mime } = hasPath
    ? await loadImageAsBase64FromPath(imagePath)
    : { base64: imageBase64, mime: mimeType || "image/jpeg" };

  if (!base64) {
    throw new Error("No se proporciono imagen en base64");
  }

  const textModel = vertex.getGenerativeModel({ model: TEXT_MODEL });
  const response = await generateWithRetry(() =>
    textModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: "Analiza el rostro y devuelve: forma de cara, textura de cabello, lineas faciales y estilo recomendado en tono breve." },
            { inlineData: { data: base64, mimeType: mime } },
          ],
        },
      ],
    })
  );

  const parts = response.response?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((p) => p.text)
    .filter(Boolean)
    .join(" ");
}

export async function proposeHaircutImage(promptSummary, { imageBase64, imagePath, mimeType }) {
  const hasPath = Boolean(imagePath);
  const original = hasPath
    ? await loadImageAsBase64FromPath(imagePath)
    : { base64: imageBase64, mime: mimeType || "image/jpeg" };

  const model = vertex.getGenerativeModel({ model: IMAGE_MODEL });
  const result = await generateWithRetry(() =>
    model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Retrato realista, iluminacion suave, fondo neutro. Rasgos: ${promptSummary}. Estilo: corte degradado moderno The5FadeFriends.`,
            },
            original.base64 ? { inlineData: { data: original.base64, mimeType: original.mime } } : null,
          ].filter(Boolean),
        },
      ],
    })
  );

  const image = result.response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!image) {
    throw new Error("No se recibio imagen generada");
  }

  return image;
}
