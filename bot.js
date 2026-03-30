const Anthropic = require("@anthropic-ai/sdk");
const db = require("./db");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TOOLS = [
  {
    name: "registrar_venta",
    description: "Registra una venta en la base de datos.",
    input_schema: {
      type: "object",
      properties: {
        descripcion: { type: "string", description: "Nombre del producto vendido" },
        monto: { type: "number", description: "Monto en pesos" },
        canal: { type: "string", enum: ["Tiendanube", "Instagram", "WooCommerce", "Otro"] },
        fecha: { type: "string", description: "Fecha YYYY-MM-DD, si no se menciona usar hoy" },
      },
      required: ["descripcion", "monto", "canal"],
    },
  },
  {
    name: "registrar_gasto",
    description: "Registra un gasto en la base de datos.",
    input_schema: {
      type: "object",
      properties: {
        descripcion: { type: "string", description: "Descripción del gasto" },
        monto: { type: "number", description: "Monto en pesos" },
        categoria: { type: "string", enum: ["materia_prima", "publicidad", "envios", "gastos_fijos", "otros"] },
        fecha: { type: "string", description: "Fecha YYYY-MM-DD, si no se menciona usar hoy" },
      },
      required: ["descripcion", "monto", "categoria"],
    },
  },
  {
    name: "guardar_producto",
    description: "Guarda o actualiza un producto con su precio.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        precio: { type: "number" },
      },
      required: ["nombre", "precio"],
    },
  },
  {
    name: "consultar_resumen",
    description: "Consulta un resumen financiero de un período.",
    input_schema: {
      type: "object",
      properties: {
        periodo: { type: "string", enum: ["hoy", "semana", "mes", "personalizado"] },
        fecha_desde: { type: "string" },
        fecha_hasta: { type: "string" },
      },
      required: ["periodo"],
    },
  },
  {
    name: "consultar_productos_rentables",
    description: "Consulta los productos más vendidos o rentables.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
];

function ejecutarTool(toolName, toolInput) {
  const hoy = db.fechaHoy();
  if (toolName === "registrar_venta") {
    db.guardarRegistro({ fecha: toolInput.fecha || hoy, tipo: "venta", descripcion: toolInput.descripcion, monto: toolInput.monto, categoria: "ventas", canal: toolInput.canal });
    return { ok: true, mensaje: `Venta registrada: ${toolInput.descripcion} por $${toolInput.monto.toLocaleString("es-AR")} via ${toolInput.canal}` };
  }
  if (toolName === "registrar_gasto") {
    db.guardarRegistro({ fecha: toolInput.fecha || hoy, tipo: "gasto", descripcion: toolInput.descripcion, monto: toolInput.monto, categoria: toolInput.categoria, canal: null });
    return { ok: true, mensaje: `Gasto registrado: ${toolInput.descripcion} por $${toolInput.monto.toLocaleString("es-AR")}` };
  }
  if (toolName === "guardar_producto") {
    db.guardarProducto(toolInput.nombre, toolInput.precio);
    return { ok: true, mensaje: `Producto guardado: ${toolInput.nombre} a $${toolInput.precio.toLocaleString("es-AR")}` };
  }
  if (toolName === "consultar_resumen") {
    let fechaDesde, fechaHasta = hoy;
    if (toolInput.periodo === "hoy") fechaDesde = hoy;
    else if (toolInput.periodo === "semana") fechaDesde = db.inicioSemanaActual();
    else if (toolInput.periodo === "mes") fechaDesde = db.inicioMesActual();
    else { fechaDesde = toolInput.fecha_desde || db.inicioMesActual(); fechaHasta = toolInput.fecha_hasta || hoy; }
    return { ok: true, datos: db.obtenerResumenPeriodo(fechaDesde, fechaHasta), desde: fechaDesde, hasta: fechaHasta };
  }
  if (toolName === "consultar_productos_rentables") {
    return { ok: true, datos: db.obtenerProductosMasRentables() };
  }
  return { ok: false, mensaje: "Tool desconocido" };
}

async function procesarMensaje(mensajeUsuario) {
  const productos = db.obtenerProductos();
  const productosCtx = productos.length > 0
    ? productos.map(p => `- ${p.nombre}: $${p.precio.toLocaleString("es-AR")}`).join("\n")
    : "(Sin productos cargados aún)";

  const systemPrompt = `Sos el asistente financiero de un negocio de e-commerce argentino que vende productos físicos (cuadros, velas, etc.) por Tiendanube, Instagram y WooCommerce.

Tu trabajo es registrar ventas, gastos y productos, y dar resúmenes financieros cuando te los pidan.

PRODUCTOS CARGADOS EN EL SISTEMA:
${productosCtx}

REGLAS IMPORTANTES:
- Si el usuario menciona un producto del catálogo al registrar una venta y no dice el monto, usá el precio del catálogo.
- Si no sabés el monto y el producto no está en el catálogo, preguntale el precio.
- Si el usuario dice que vendió algo pero no aclara el canal, usá "Instagram" por defecto.
- Si el usuario menciona un envío, registralo como gasto de categoría "envios".
- Si menciona Meta Ads o publicidad, registralo como "publicidad".
- Si menciona tela, materiales o insumos, registralo como "materia_prima".
- Usá las tools disponibles para registrar o consultar datos ANTES de responder.
- Respondé SIEMPRE en español rioplatense, de forma corta y directa (máximo 3-4 líneas).
- Sin markdown, texto plano solamente.
- Cuando confirmés un registro, incluí el monto con el símbolo $.
- La fecha de hoy es: ${db.fechaHoy()}`;

  const messages = [{ role: "user", content: mensajeUsuario }];
  let respuestaFinal = "";
  let iteraciones = 0;

  while (iteraciones < 5) {
    iteraciones++;
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      const t = response.content.find(b => b.type === "text");
      respuestaFinal = t ? t.text : "Listo.";
      break;
    }
    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === "tool_use") {
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(ejecutarTool(block.name, block.input)) });
        }
      }
      messages.push({ role: "user", content: toolResults });
      continue;
    }
    const t = response.content.find(b => b.type === "text");
    respuestaFinal = t ? t.text : "No entendí bien, ¿podés repetirlo?";
    break;
  }

  return respuestaFinal || "Ocurrió un problema procesando tu mensaje.";
}

module.exports = { procesarMensaje };

