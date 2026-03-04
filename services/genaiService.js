import pkg from "@google-cloud/vertexai";
const { VertexAI } = pkg;

import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import path from "path";

// ── Configuración ─────────────────────────────────────────────────────────────
const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
const GOOGLE_VERTEX_LOCATION = process.env.GOOGLE_VERTEX_LOCATION || "us-central1";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GOOGLE_PROJECT_ID) throw new Error("Falta GOOGLE_PROJECT_ID en el entorno");
if (!GEMINI_API_KEY) throw new Error("Falta GEMINI_API_KEY en el entorno");

const TEXT_MODEL = process.env.VERTEX_TEXT_MODEL || "gemini-1.5-flash";
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview";

// Cliente Vertex AI — para describeFace
const vertex = new VertexAI({
  project: GOOGLE_PROJECT_ID,
  location: GOOGLE_VERTEX_LOCATION,
});

// Cliente Gemini AI Studio — para edición de imagen
const geminiAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ── Helpers ───────────────────────────────────────────────────────────────────
function sanitizeBase64(b64) {
  if (!b64) return b64;
  const idx = b64.indexOf(",");
  if (b64.startsWith("data:") && idx !== -1) return b64.slice(idx + 1);
  return b64.replace(/\s+/g, "");
}

async function generateWithRetry(fn, { retries = 3, baseDelayMs = 1000 } = {}) {
  let attempt = 0;
  const retriableCodes = new Set([429, 503]);
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const code = err?.code || err?.status;
      const isRetriable =
        retriableCodes.has(Number(code)) || retriableCodes.has(code);
      if (!isRetriable || attempt >= retries) {
        err._attempt = attempt;
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
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

/**
 * Construye el prompt de edición a partir de los parámetros del corte.
 * Todos los campos son opcionales — si no se pasan se usa un fade moderno por defecto.
 *
 * @param {string} faceSummary   - Análisis del rostro devuelto por describeFace
 * @param {object} haircutOptions
 * @param {string} [haircutOptions.haircutName]   - Nombre del corte (ej: "undercut", "pompadour")
 * @param {string} [haircutOptions.description]   - Descripción libre del corte deseado
 * @param {string} [haircutOptions.length]        - Largo: "short" | "medium" | "long"
 * @param {string} [haircutOptions.style]         - Estilo: "classic" | "modern" | "urban"
 */
function buildHaircutPrompt(faceSummary, haircutOptions = {}) {
  const { haircutName, description, length, style } = haircutOptions;

  // Construir descripción del corte solicitado
  const haircutParts = [];

  if (haircutName) haircutParts.push(`haircut name: ${haircutName}`);
  if (description) haircutParts.push(`description: ${description}`);
  if (length)      haircutParts.push(`length: ${length}`);
  if (style)       haircutParts.push(`style: ${style}`);

  const haircutSpec =
    haircutParts.length > 0
      ? haircutParts.join(", ")
      : "modern fade haircut (short sides with skin fade, slightly longer on top)";

  return (
    `You are a professional photo editor for a barbershop. ` +
    `Edit ONLY the hairstyle of the person in this photo. ` +
    `Apply the following haircut — ${haircutSpec}. ` +
    `Make the result hyper-realistic, as if done by a professional barber. ` +
    `STRICTLY PRESERVE: face identity, skin tone, facial structure, eye color, ` +
    `eyebrows, beard, mustache, background, lighting and clothing. ` +
    `Do NOT alter anything except the hair on top of the head and sides. ` +
    `Face analysis for reference: ${faceSummary}.`
  );
}

// ── describeFace (Vertex AI) ──────────────────────────────────────────────────
export async function describeFace({ imageBase64, imagePath, mimeType }) {
  const hasPath = Boolean(imagePath);
  const { base64, mime } = hasPath
    ? await loadImageAsBase64FromPath(imagePath)
    : { base64: sanitizeBase64(imageBase64), mime: mimeType || "image/jpeg" };

  if (!base64) throw new Error("No se proporcionó imagen en base64");

  const textModel = vertex.getGenerativeModel({ model: TEXT_MODEL });

  const response = await generateWithRetry(() =>
    textModel.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text:
                "Analiza el rostro y devuelve de forma concisa: " +
                "forma de cara, textura y color de cabello actual, " +
                "líneas faciales destacadas, y el estilo de corte más recomendado " +
                "según las características del rostro.",
            },
            { inlineData: { data: base64, mimeType: mime } },
          ],
        },
      ],
    })
  );

  const parts = response.response?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text).filter(Boolean).join(" ");
}

// ── proposeHaircutImage (Gemini AI Studio) ────────────────────────────────────
/**
 * @param {string} faceSummary          - Resultado de describeFace
 * @param {object} options
 * @param {string} [options.imageBase64]
 * @param {string} [options.imagePath]
 * @param {string} [options.mimeType]
 * @param {string} [options.haircutName]   - Nombre del corte
 * @param {string} [options.description]   - Descripción libre
 * @param {string} [options.length]        - Largo deseado
 * @param {string} [options.style]         - Estilo deseado
 */
export async function proposeHaircutImage(
  faceSummary,
  { imageBase64, imagePath, mimeType, haircutName, description, length, style } = {}
) {
  const hasPath = Boolean(imagePath);
  const { base64, mime } = hasPath
    ? await loadImageAsBase64FromPath(imagePath)
    : { base64: sanitizeBase64(imageBase64), mime: mimeType || "image/jpeg" };

  if (!base64) throw new Error("No se proporcionó imagen para editar");

  const referenceBytes = Buffer.byteLength(base64, "base64");
  if (referenceBytes < 1024)
    throw new Error("La imagen de referencia es demasiado pequeña (<1KB)");
  if (referenceBytes > 8 * 1024 * 1024)
    throw new Error("La imagen de referencia supera 8MB; reduce tamaño o compresión");

  const editPrompt = buildHaircutPrompt(faceSummary, {
    haircutName,
    description,
    length,
    style,
  });

  console.info("[gemini-image] Editando imagen", {
    model: GEMINI_IMAGE_MODEL,
    mime,
    referenceBytes,
    haircutName,
    length,
    style,
  });

  const response = await generateWithRetry(() =>
    geminiAI.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mime, data: base64 } },
            { text: editPrompt },
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    })
  );

  const rawCandidate = response?.candidates?.[0];
console.log("[debug] candidate completo:", JSON.stringify(rawCandidate, null, 2));

const parts = rawCandidate?.content?.parts ?? [];
const imagePart = parts.find((p) => p.inlineData?.data);
  if (!imagePart) {
    const textParts = parts.filter((p) => p.text).map((p) => p.text).join(" ");
    console.error("[gemini-image] Sin imagen en respuesta. Texto:", textParts);
    throw new Error(
      "Gemini no devolvió una imagen. " +
        (textParts
          ? `Motivo: ${textParts}`
          : "Revisa la consola para más detalles.")
    );
  }

  return imagePart.inlineData.data;
}