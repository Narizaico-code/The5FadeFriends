import { Router } from "express";
import { analyzeFace } from "./face.controller.js";

const router = Router();

router.post("/analyze", analyzeFace);

export default router;
