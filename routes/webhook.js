const express = require("express");
const twilio = require("twilio");
const { procesarMensaje } = require("../bot");

const router = express.Router();

function validarTwilio(req, res, next) {
  if (!process.env.TWILIO_AUTH_TOKEN) return next();
  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    req.headers["x-twilio-signature"],
    `${req.protocol}://${req.get("host")}${req.originalUrl}`,
    req.body
  );
  if (!isValid && process.env.NODE_ENV === "production") return res.status(403).send("Forbidden");
  next();
}

router.post("/whatsapp", validarTwilio, async (req, res) => {
  const mensajeEntrante = req.body.Body;
  const numeroRemitente = req.body.From;
  console.log(`[${new Date().toISOString()}] De ${numeroRemitente}: ${mensajeEntrante}`);

  if (!mensajeEntrante || mensajeEntrante.trim() === "") {
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("No entendí tu mensaje. ¿Podés escribirme de nuevo?");
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  try {
    const respuesta = await procesarMensaje(mensajeEntrante.trim());
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message(respuesta);
    res.type("text/xml");
    return res.send(twiml.toString());
  } catch (error) {
    console.error("Error:", error);
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message("Hubo un error. Intentá de nuevo.");
    res.type("text/xml");
    return res.send(twiml.toString());
  }
});

router.get("/whatsapp", (req, res) => {
  res.json({ status: "ok", mensaje: "Webhook activo" });
});

module.exports = router;
