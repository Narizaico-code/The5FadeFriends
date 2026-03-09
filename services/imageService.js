import fs from "fs/promises";
import path from "path";

export function parseBase64Image(base64, mimeType = "image/jpeg") {
  if (!base64) {
    throw new Error("No se proporciono imagen en base64");
  }

  const dataUrlMatch = base64.match(/^data:(.+);base64,(.*)$/);
  if (dataUrlMatch) {
    return { base64: dataUrlMatch[2], mimeType: dataUrlMatch[1] };
  }

  return { base64, mimeType };
}

export function toDataUrl(base64, mimeType) {
  return `data:${mimeType};base64,${base64}`;
}

export async function saveBase64ImageToFolder(base64, mimeType, folderPath) {
  const extension = mimeType === "image/png" ? ".png" : ".jpg";
  const fileName = `image_${Date.now()}${extension}`;
  const absolutePath = path.join(folderPath, fileName);

  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(absolutePath, Buffer.from(base64, "base64"));

  return { fileName, absolutePath };
}
