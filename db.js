const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "negocio.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    precio REAL NOT NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha DATE NOT NULL DEFAULT (DATE('now', 'localtime')),
    tipo TEXT NOT NULL CHECK(tipo IN ('venta', 'gasto')),
    descripcion TEXT NOT NULL,
    monto REAL NOT NULL,
    categoria TEXT NOT NULL,
    canal TEXT,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
  );
`);

function obtenerProductos() {
  return db.prepare("SELECT * FROM productos ORDER BY nombre ASC").all();
}
function guardarProducto(nombre, precio) {
  return db.prepare(`
    INSERT INTO productos (nombre, precio) VALUES (?, ?)
    ON CONFLICT(nombre) DO UPDATE SET precio = excluded.precio
  `).run(nombre, precio);
}
function guardarRegistro({ fecha, tipo, descripcion, monto, categoria, canal }) {
  return db.prepare(`
    INSERT INTO registros (fecha, tipo, descripcion, monto, categoria, canal)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(fecha || new Date().toISOString().split("T")[0], tipo, descripcion, monto, categoria, canal || null);
}
function obtenerResumenPeriodo(fechaDesde, fechaHasta) {
  const ventas = db.prepare(`SELECT SUM(monto) as total, COUNT(*) as cantidad, canal FROM registros WHERE tipo='venta' AND fecha BETWEEN ? AND ? GROUP BY canal`).all(fechaDesde, fechaHasta);
  const gastos = db.prepare(`SELECT SUM(monto) as total, COUNT(*) as cantidad, categoria FROM registros WHERE tipo='gasto' AND fecha BETWEEN ? AND ? GROUP BY categoria`).all(fechaDesde, fechaHasta);
  const totalVentas = db.prepare(`SELECT COALESCE(SUM(monto),0) as total FROM registros WHERE tipo='venta' AND fecha BETWEEN ? AND ?`).get(fechaDesde, fechaHasta);
  const totalGastos = db.prepare(`SELECT COALESCE(SUM(monto),0) as total FROM registros WHERE tipo='gasto' AND fecha BETWEEN ? AND ?`).get(fechaDesde, fechaHasta);
  return { ventas, gastos, totalVentas: totalVentas.total, totalGastos: totalGastos.total, ganancia: totalVentas.total - totalGastos.total };
}
function obtenerProductosMasRentables() {
  return db.prepare(`SELECT descripcion, SUM(monto) as total_ingresos, COUNT(*) as cantidad_ventas FROM registros WHERE tipo='venta' GROUP BY descripcion ORDER BY total_ingresos DESC LIMIT 5`).all();
}
function fechaHoy() { return new Date().toISOString().split("T")[0]; }
function inicioMesActual() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,"0")}-01`;
}
function inicioSemanaActual() {
  const hoy = new Date();
  const d = hoy.getDay();
  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() - (d === 0 ? 6 : d - 1));
  return inicio.toISOString().split("T")[0];
}

module.exports = { obtenerProductos, guardarProducto, guardarRegistro, obtenerResumenPeriodo, obtenerProductosMasRentables, fechaHoy, inicioMesActual, inicioSemanaActual };

