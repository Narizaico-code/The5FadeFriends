import { describeFace, proposeHaircutImage } from "../services/genaiService.js";

function sanitizeBase64(b64) {
  if (!b64) return b64;
  const idx = b64.indexOf(",");
  if (b64.startsWith("data:") && idx !== -1) {
    b64 = b64.slice(idx + 1);
  }
  // Solo permitir caracteres base64
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return undefined;
  return b64.replace(/\s+/g, "");
}

export async function analyzeFace(req, res, next) {
  try {
    const { imageBase64, imagePath, mimeType } = req.body || {};
    const file = req.file;

    const resolvedImageBase64 = file ? file.buffer.toString("base64") : imageBase64;
    const resolvedMimeType = file ? file.mimetype : mimeType;

    // Validación y limpieza de base64 si viene en el body (no aplica cuando usamos imagePath)
    const cleanBase64 = resolvedImageBase64 ? sanitizeBase64(resolvedImageBase64) : undefined;
    if (resolvedImageBase64 && !cleanBase64) {
      return res.status(400).json({ message: "imageBase64 no es válido" });
    }
    if (cleanBase64 && cleanBase64.length < 64) {
      return res.status(400).json({ message: "imageBase64 demasiado corto" });
    }

    if (!resolvedImageBase64 && !imagePath) {
      return res.status(400).json({ message: "Proporciona imageBase64 o imagePath" });
    }

    const faceSummary = await describeFace({ imageBase64: cleanBase64, imagePath, mimeType: resolvedMimeType });
    const haircutImageBase64 = await proposeHaircutImage(faceSummary, {
      imageBase64: cleanBase64,
      imagePath,
      mimeType: resolvedMimeType,
    });

    res.json({ faceSummary, haircutImageBase64 });
  } catch (err) {
    next(err);
  }
}
