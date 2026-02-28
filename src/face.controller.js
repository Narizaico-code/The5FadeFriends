import { describeFace, proposeHaircutImage } from "../services/genaiService.js";

export async function analyzeFace(req, res, next) {
  try {
    const { imageBase64, imagePath, mimeType } = req.body || {};

    if (!imageBase64 && !imagePath) {
      return res.status(400).json({ message: "Proporciona imageBase64 o imagePath" });
    }

    const faceSummary = await describeFace({ imageBase64, imagePath, mimeType });
    const haircutImageBase64 = await proposeHaircutImage(faceSummary);

    res.json({ faceSummary, haircutImageBase64 });
  } catch (err) {
    next(err);
  }
}
