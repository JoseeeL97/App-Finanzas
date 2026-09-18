const express = require("express");
const path = require("path");

function createApp() {
  const app = express();
  const frontendDir = path.join(__dirname, "..");

  app.use(express.json());

  app.get("/", (req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });

  app.use("/css", express.static(path.join(frontendDir, "css")));
  app.use("/js", express.static(path.join(frontendDir, "js")));

  app.use("/api/transactions", require("./routes/transactions"));
  app.use("/api/categories", require("./routes/categories"));
  app.use("/api/budgets", require("./routes/budgets"));
  app.use("/api/dashboard", require("./routes/dashboard"));

  app.get("/{*splat}", (req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Error interno del servidor" });
  });

  return app;
}

function startServer() {
  const { initialize } = require("./database/db");
  initialize();
  const app = createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
  });
}

module.exports = { createApp, startServer };

if (require.main === module) {
  startServer();
}