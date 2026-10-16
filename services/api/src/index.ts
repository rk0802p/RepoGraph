
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "RepoGraph API is running",
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`RepoGraph API running at http://localhost:${PORT}`);
});
