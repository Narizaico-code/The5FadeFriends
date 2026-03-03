import { describeFace, proposeHaircutImage } from "../services/genaiService.js";

export async function analyzeFace(req, res, next) {
  try {
    const { imageBase64, imagePath, mimeType } = req.body || {};
    const file = req.file;

    const resolvedImageBase64 = file ? file.buffer.toString("base64") : imageBase64;
    const resolvedMimeType = file ? file.mimetype : mimeType;

    if (!resolvedImageBase64 && !imagePath) {
      return res.status(400).json({ message: "Proporciona imageBase64 o imagePath" });
    }

    const faceSummary = await describeFace({ imageBase64: resolvedImageBase64, imagePath, mimeType: resolvedMimeType });
    const haircutImageBase64 = await proposeHaircutImage(faceSummary, {
      imageBase64: resolvedImageBase64,
      imagePath,
      mimeType: resolvedMimeType,
    });

    res.json({ faceSummary, haircutImageBase64 });
  } catch (err) {
    next(err);
  }
}
