import { describeFace, proposeHaircutImage } from "../services/genaiService.js";

function sanitizeBase64(b64) {
  if (!b64) return b64;
  const idx = b64.indexOf(",");
  if (b64.startsWith("data:") && idx !== -1) b64 = b64.slice(idx + 1);
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return undefined;
  return b64.replace(/\s+/g, "");
}

export async function analyzeFace(req, res, next) {
  try {
    // Cuando viene como form-data, los campos de texto llegan en req.body
    // y el archivo en req.file
    const {
      imageBase64,
      imagePath,
      mimeType,
      haircutName,
      description,
      length,
      style,
    } = req.body || {};

    const file = req.file;

    // Prioridad: archivo subido > imageBase64 en body
    const resolvedImageBase64 = file
      ? file.buffer.toString("base64")
      : imageBase64;
    const resolvedMimeType = file ? file.mimetype : mimeType;

    const cleanBase64 = resolvedImageBase64
      ? sanitizeBase64(resolvedImageBase64)
      : undefined;

    if (resolvedImageBase64 && !cleanBase64) {
      return res.status(400).json({ message: "imageBase64 no es válido" });
    }
    if (cleanBase64 && cleanBase64.length < 64) {
      return res.status(400).json({ message: "imageBase64 demasiado corto" });
    }
    if (!resolvedImageBase64 && !imagePath) {
      return res
        .status(400)
        .json({ message: "Proporciona una imagen (file, imageBase64 o imagePath)" });
    }

    // 1. Analizar el rostro
    const faceSummary = await describeFace({
      imageBase64: cleanBase64,
      imagePath,
      mimeType: resolvedMimeType,
    });

    // 2. Generar imagen con el corte solicitado
    const haircutImageBase64 = await proposeHaircutImage(faceSummary, {
      imageBase64: cleanBase64,
      imagePath,
      mimeType: resolvedMimeType,
      haircutName,
      description,
      length,
      style,
    });

    res.json({
      faceSummary,
      haircutImageBase64,
      haircutParams: {
        haircutName: haircutName || null,
        description: description || null,
        length: length || null,
        style: style || null,
      },
    });
  } catch (err) {
    next(err);
  }
}