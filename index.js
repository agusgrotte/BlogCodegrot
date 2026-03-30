require("dotenv").config();
const express = require("express");
const { inicializar } = require("./db");

async function main() {
  await inicializar();

  const webhookRouter = require("./routes/webhook");
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use("/webhook", webhookRouter);

  app.get("/", (req, res) => {
    res.json({ status: "ok", servicio: "WhatsApp Ecommerce Bot", version: "1.0.0" });
  });

  app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
  });
}

main().catch(console.error);


