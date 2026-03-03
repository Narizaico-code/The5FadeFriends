import { Base64ImageService } from "../services/base64ImageService.js";

export async function previewImage(req, res, next) {
  try {
    const { imageBase64, mimeType = "image/png" } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "imageBase64 es requerido" });
    const buffer = Base64ImageService.toBuffer(imageBase64);
    res.set("Content-Type", mimeType);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function saveImage(req, res, next) {
  try {
    const { imageBase64, mimeType = "image/png", filename = "preview.png" } = req.body;
    if (!imageBase64) return res.status(400).json({ message: "imageBase64 es requerido" });
    const { filePath } = await Base64ImageService.saveToTemp({ base64: imageBase64, mimeType, filename });
    res.status(201).json({ filePath });
  } catch (err) {
    next(err);
  }
}
