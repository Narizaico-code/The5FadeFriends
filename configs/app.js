import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { corsOptions } from "./cors-configuration.js";
import faceRoutes from "../src/face.routes.js";
import imageRoutes from "../src/image.routes.js";
import { notFound, errorHandler } from "../middlewares/errorHandler.js";

const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    status: "up",
    service: "The5FadeFriends API",
  });
});

app.get("/list-models", async (_req, res, next) => {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const result = await ai.models.list();
    let page = result.page;
    const models = [];

    while (page.length > 0) {
      for (const model of page) {
        if (model.supportedActions?.includes("generateContent")) {
          models.push({
            name: model.name,
            displayName: model.displayName,
            actions: model.supportedActions,
          });
        }
      }
      page = result.hasNextPage() ? (await result.nextPage()).page : [];
    }

    res.json(models);
  } catch (err) {
    next(err);
  }
});

app.use("/the5fadefriends/api/v1/face", faceRoutes);
app.use("/the5fadefriends/api/v1/image", imageRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
