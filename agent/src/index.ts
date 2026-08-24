import "dotenv/config";
import express from "express";
import cors from "cors";
import { env } from "./shared/env";
import { searchRouter } from "./routes/search.routes";

const app = express();

app.use(
  cors({
    origin: env.ALLOWED_ORIGIN,
  })
);

app.use(express.json());

app.use("/search", searchRouter);

const port = Number(env.PORT ?? 5000);
app.listen(port, () => {
  console.log(`server is now running on port ${port}`);
});
