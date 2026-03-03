import pkg from '@google-cloud/vertexai';
const { VertexAI } = pkg;

// Esta es la librería que acabas de instalar
import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform';

import fs from "fs/promises";
import path from "path";

const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
const GOOGLE_VERTEX_LOCATION = process.env.GOOGLE_VERTEX_LOCATION || "us-central1";

const vertex = new VertexAI({ project: GOOGLE_PROJECT_ID, location: GOOGLE_VERTEX_LOCATION });

// Nuevo cliente para usar la cuota de "Online Prediction" de 10
const predictionServiceClient = new PredictionServiceClient({
    apiEndpoint: `${GOOGLE_VERTEX_LOCATION}-aiplatform.googleapis.com`,
});

if (!GOOGLE_PROJECT_ID) {
  throw new Error("Falta GOOGLE_PROJECT_ID en el entorno");
}

const TEXT_MODEL = process.env.VERTEX_TEXT_MODEL || "gemini-1.5-flash-001"; // Ajusta al release disponible en tu región
const IMAGE_MODEL = process.env.VERTEX_IMAGE_MODEL || "imagen-3.0-generate"; // Ajusta al release disponible en tu región

function sanitizeBase64(b64) {
  if (!b64) return b64;
  // Quita prefijo data URI si viene incluido
  const idx = b64.indexOf(",");
  if (b64.startsWith("data:") && idx !== -1) {
    return b64.slice(idx + 1);
  }
  // Quita espacios o saltos de línea accidentales
  return b64.replace(/\s+/g, "");
}

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
        // Adjuntar info mínima del request si existe
        err._attempt = attempt;
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
    : { base64: sanitizeBase64(imageBase64), mime: mimeType || "image/jpeg" };

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

export async function proposeHaircutImage(promptSummary, { imageBase64, imagePath, mimeType } = {}) {
  const endpoint = `projects/${GOOGLE_PROJECT_ID}/locations/${GOOGLE_VERTEX_LOCATION}/publishers/google/models/${IMAGE_MODEL}`;

  // Si se proporciona path, cargar el archivo; si no, usar el base64 del request
  const hasPath = Boolean(imagePath);
  const { base64, mime } = hasPath
    ? await loadImageAsBase64FromPath(imagePath)
    : { base64: sanitizeBase64(imageBase64), mime: mimeType || "image/png" };

  if (!base64) {
    throw new Error("No se proporcionó imagen para image-to-image");
  }

  const referenceBytes = Buffer.byteLength(base64, "base64");
  if (referenceBytes < 1024) {
    throw new Error("La imagen de referencia es demasiado pequeña (<1KB)");
  }
  if (referenceBytes > 8 * 1024 * 1024) {
    throw new Error("La imagen de referencia supera 8MB; reduce tamaño o compresión");
  }

  const prompt = `Preserve the subject identity. Hyper-realistic male portrait, studio lighting. Face features (from analysis): ${promptSummary}. Hairstyle: Modern fade haircut. Keep skin tone and facial structure.`;

  const instance = {
    prompt,
    // Imagen de referencia en base64, sin data URI
    image: { bytesBase64Encoded: base64, mimeType: mime },
  };

  const parameters = {
    sampleCount: 1,
  };

  // Validación mínima para evitar INTERNAL 13 por inputs inválidos
  if (!instance.image.bytesBase64Encoded || instance.image.bytesBase64Encoded.length < 64) {
    throw new Error("La imagen de referencia es vacía o demasiado pequeña");
  }

  // Log de depuración (no incluye base64 completo)
  console.info("[imagen3] referencia", { mime, referenceBytes, location: GOOGLE_VERTEX_LOCATION, model: IMAGE_MODEL });

  const [response] = await generateWithRetry(async () => {
    return await predictionServiceClient.predict({
      endpoint,
      instances: [helpers.toValue(instance)],
      parameters: helpers.toValue(parameters),
    });
  });

  const predictions = response.predictions;
  const imageResultBase64 = predictions?.[0]?.structValue?.fields?.bytesBase64Encoded?.stringValue;

  if (!imageResultBase64) {
    throw new Error("No se pudo generar la imagen. Verifica la consola de Google Cloud.");
  }

  return imageResultBase64;
}