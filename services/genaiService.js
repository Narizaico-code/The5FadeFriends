import fs from "fs/promises";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { VertexAI } from "@google-cloud/vertexai";

const GOOGLE_GENAI_API_KEY = process.env.GOOGLE_GENAI_API_KEY;
const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
const GOOGLE_VERTEX_LOCATION = process.env.GOOGLE_VERTEX_LOCATION || "us-central1";

if (!GOOGLE_GENAI_API_KEY) {
  throw new Error("Falta GOOGLE_GENAI_API_KEY en el entorno");
}

if (!GOOGLE_PROJECT_ID) {
  throw new Error("Falta GOOGLE_PROJECT_ID en el entorno");
}

const genAI = new GoogleGenAI({ apiKey: GOOGLE_GENAI_API_KEY });
const vertex = new VertexAI({ project: GOOGLE_PROJECT_ID, location: GOOGLE_VERTEX_LOCATION });

const FACE_MODEL = "gemini-3.0-flash";
const IMAGE_MODEL = "imagen-3.0-generate"; // Ajusta a la release disponible

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

  const response = await genAI.models.generateContent({
    model: FACE_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: "Analiza el rostro y devuelve: forma de cara, textura de cabello, lineas faciales y estilo recomendado en tono breve." },
          { inlineData: { data: base64, mimeType: mime } },
        ],
      },
    ],
  });

  return response.response?.text?.() ?? "";
}

export async function proposeHaircutImage(promptSummary) {
  const model = vertex.getGenerativeModel({ model: IMAGE_MODEL });
  const result = await model.generateContent([
    {
      text: `Retrato realista, iluminacion suave, fondo neutro. Rasgos: ${promptSummary}. Estilo: corte degradado moderno The5FadeFriends.`,
    },
  ]);

  const imageBase64 = result.response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!imageBase64) {
    throw new Error("No se recibio imagen generada");
  }

  return imageBase64;
}
