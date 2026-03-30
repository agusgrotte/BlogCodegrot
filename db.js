const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "negocio.db");
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db;

async function inicializar() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
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

  guardar();
}

function guardar() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
  guardar();
}

function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function obtenerProductos() {
  return all("SELECT * FROM productos ORDER BY nombre ASC");
}

function guardarProducto(nombre, precio) {
  run(`INSERT INTO productos (nombre, precio) VALUES (?, ?)
       ON CONFLICT(nombre) DO UPDATE SET precio = excluded.precio`, [nombre, precio]);
}

function guardarRegistro({ fecha, tipo, descripcion, monto, categoria, canal }) {
  run(`INSERT INTO registros (fecha, tipo, descripcion, monto, categoria, canal)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [fecha || fechaHoy(), tipo, descripcion, monto, categoria, canal || null]);
}

function obtenerResumenPeriodo(fechaDesde, fechaHasta) {
  const ventas = all(`SELECT SUM(monto) as total, COUNT(*) as cantidad, canal FROM registros WHERE tipo='venta' AND fecha BETWEEN ? AND ? GROUP BY canal`, [fechaDesde, fechaHasta]);
  const gastos = all(`SELECT SUM(monto) as total, COUNT(*) as cantidad, categoria FROM registros WHERE tipo='gasto' AND fecha BETWEEN ? AND ? GROUP BY categoria`, [fechaDesde, fechaHasta]);
  const tv = get(`SELECT COALESCE(SUM(monto),0) as total FROM registros WHERE tipo='venta' AND fecha BETWEEN ? AND ?`, [fechaDesde, fechaHasta]);
  const tg = get(`SELECT COALESCE(SUM(monto),0) as total FROM registros WHERE tipo='gasto' AND fecha BETWEEN ? AND ?`, [fechaDesde, fechaHasta]);
  return { ventas, gastos, totalVentas: tv.total, totalGastos: tg.total, ganancia: tv.total - tg.total };
}

function obtenerProductosMasRentables() {
  return all(`SELECT descripcion, SUM(monto) as total_ingresos, COUNT(*) as cantidad_ventas FROM registros WHERE tipo='venta' GROUP BY descripcion ORDER BY total_ingresos DESC LIMIT 5`);
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

module.exports = {
  inicializar, obtenerProductos, guardarProducto, guardarRegistro,
  obtenerResumenPeriodo, obtenerProductosMasRentables,
  fechaHoy, inicioMesActual, inicioSemanaActual,
};
