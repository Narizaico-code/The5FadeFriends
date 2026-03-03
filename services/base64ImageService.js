import fs from "fs/promises";
import path from "path";

export class Base64ImageService {
  static toBuffer(base64) {
    if (!base64) throw new Error("imageBase64 requerido");
    return Buffer.from(base64, "base64");
  }

  static async saveToTemp({ base64, mimeType = "image/png", filename = "preview.png" }) {
    const buffer = this.toBuffer(base64);
    const safeName = filename.replace(/[^\w.-]/g, "_");
    const tmpDir = path.join(process.cwd(), "tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, safeName);
    await fs.writeFile(filePath, buffer);
    return { filePath, mimeType };
  }
}
