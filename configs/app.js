import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import { corsOptions } from "./cors-configuration.js";
import faceRoutes from "../src/face.routes.js";
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

app.use("/the5fadefriends/api/v1/face", faceRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
