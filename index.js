"use strict";

import "dotenv/config";
import app from "./configs/app.js";
import { dbConnection } from "./configs/db.js";

const PORT = process.env.PORT || 3000;

await dbConnection();

app.listen(PORT, () => {
  console.log(`API escuchando en puerto ${PORT}`);
});
