import { Router } from "express";
import { previewImage, saveImage } from "./image.controller.js";

const router = Router();

router.post("/preview", previewImage);
router.post("/save", saveImage);

export default router;
