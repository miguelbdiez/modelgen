// ============================================================
// src/generators/mysql.js — Generador de SQL para MySQL
// Produce sentencias CREATE TABLE con claves primarias,
// foráneas, índices únicos y tablas de relación many-to-many.
// NO usa IA: transforma directamente el modelo JSON.
// ============================================================

/**
 * Genera el script SQL completo de MySQL a partir del modelo de datos.
 *
 * @param {Object} modelo - Modelo JSON con entidades y relaciones
 * @returns {string} Script SQL listo para ejecutar en MySQL
 */
function generarMySQL(modelo) {
  const bloques = [];

  bloques.push('-- ============================================================');
  bloques.push('-- Script SQL generado automáticamente por ModelGen');
  bloques.push(`-- Versión del modelo: ${modelo.version || 1}`);
  bloques.push(`-- Fecha: ${new Date().toISOString()}`);
  bloques.push('-- ============================================================');
  bloques.push('');
  bloques.push('SET FOREIGN_KEY_CHECKS = 0;');
  bloques.push('');

  // Generar CREATE TABLE para cada entidad
  for (const entidad of modelo.entidades) {
    bloques.push(generarTabla(entidad));
    bloques.push('');
  }

  // Tablas intermedias para relaciones many-to-many
  const manyToMany = (modelo.relaciones || []).filter(r => r.tipo === 'many-to-many');
  for (const rel of manyToMany) {
    bloques.push(generarTablaRelacion(rel));
    bloques.push('');
  }

  // ALTER TABLE para relaciones one-to-many y many-to-one
  const conFK = (modelo.relaciones || []).filter(
    r => r.tipo === 'one-to-many' || r.tipo === 'many-to-one'
  );
  if (conFK.length > 0) {
    bloques.push('-- ── Claves foráneas ───────────────────────────────────────');
    for (const rel of conFK) {
      bloques.push(generarClaveForanea(rel));
      bloques.push('');
    }
  }

  bloques.push('SET FOREIGN_KEY_CHECKS = 1;');

  return bloques.join('\n');
}

/**
 * Genera la sentencia CREATE TABLE para una entidad del modelo.
 *
 * @param {Object} entidad - Entidad del modelo
 * @returns {string} Sentencia CREATE TABLE completa
 */
function generarTabla(entidad) {
  const columnas      = [];
  const restricciones = [];

  for (const campo of (entidad.campos || [])) {
    columnas.push(`  ${definirColumna(campo)}`);

    // Índice único para campos marcados como unique (salvo la PK)
    if (campo.unique && !campo.primaryKey) {
      restricciones.push(
        `  UNIQUE KEY uk_${entidad.nombre.toLowerCase()}_${campo.nombre} (${campo.nombre})`
      );
    }
  }

  // Clave primaria
  const pk = (entidad.campos || []).find(c => c.primaryKey);
  if (pk) {
    restricciones.push(`  PRIMARY KEY (${pk.nombre})`);
  }

  const todasLasLineas = [...columnas, ...restricciones];

  return [
    `-- Entidad: ${entidad.nombre}`,
    `CREATE TABLE IF NOT EXISTS \`${entidad.nombre.toLowerCase()}\` (`,
    todasLasLineas.join(',\n'),
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;'
  ].join('\n');
}

/**
 * Genera la definición de una columna SQL a partir de un campo del modelo.
 *
 * @param {Object} campo - Campo de la entidad
 * @returns {string} Definición de columna (sin coma final)
 */
function definirColumna(campo) {
  const tipo = mapearTipoSQL(campo.tipo);
  let def = `\`${campo.nombre}\` ${tipo}`;

  // Las claves primarias enteras se auto-incrementan
  if (campo.primaryKey && campo.tipo === 'integer') {
    def += ' AUTO_INCREMENT';
  }

  // NOT NULL cuando nullable es explícitamente false o es clave primaria
  if (campo.nullable === false || campo.primaryKey) {
    def += ' NOT NULL';
  }

  return def;
}

/**
 * Mapea los tipos del modelo a tipos de datos de MySQL.
 *
 * @param {string} tipo - Tipo del campo en el modelo
 * @returns {string} Tipo SQL de MySQL
 */
function mapearTipoSQL(tipo) {
  const mapa = {
    string:   'VARCHAR(255)',
    integer:  'INT',
    float:    'DECIMAL(10,2)',
    boolean:  'TINYINT(1)',
    date:     'DATE',
    datetime: 'DATETIME',
    text:     'TEXT'
  };
  return mapa[tipo] || 'VARCHAR(255)';
}

/**
 * Genera la tabla intermedia para una relación many-to-many.
 * Contiene las claves foráneas a ambas entidades que participan.
 *
 * @param {Object} relacion - Relación de tipo many-to-many
 * @returns {string} Sentencia CREATE TABLE para la tabla de relación
 */
function generarTablaRelacion(relacion) {
  const nombreTabla = relacion.nombre.toLowerCase();
  const col1 = `${relacion.de.toLowerCase()}_id`;
  const col2 = `${relacion.a.toLowerCase()}_id`;

  return [
    `-- Tabla de relación many-to-many: ${relacion.nombre}`,
    `CREATE TABLE IF NOT EXISTS \`${nombreTabla}\` (`,
    `  \`${col1}\` INT NOT NULL,`,
    `  \`${col2}\` INT NOT NULL,`,
    `  PRIMARY KEY (\`${col1}\`, \`${col2}\`),`,
    `  FOREIGN KEY (\`${col1}\`) REFERENCES \`${relacion.de.toLowerCase()}\`(id) ON DELETE CASCADE,`,
    `  FOREIGN KEY (\`${col2}\`) REFERENCES \`${relacion.a.toLowerCase()}\`(id) ON DELETE CASCADE`,
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;'
  ].join('\n');
}

/**
 * Genera el ALTER TABLE para añadir una clave foránea a una relación
 * de tipo one-to-many o many-to-one.
 *
 * @param {Object} relacion - Relación del modelo
 * @returns {string} Sentencia ALTER TABLE con FOREIGN KEY
 */
function generarClaveForanea(relacion) {
  // En one-to-many la FK va en la tabla del lado "many"
  const tablaConFK       = relacion.tipo === 'one-to-many'
    ? relacion.a.toLowerCase()
    : relacion.de.toLowerCase();
  const tablaReferenciada = relacion.tipo === 'one-to-many'
    ? relacion.de.toLowerCase()
    : relacion.a.toLowerCase();
  const columnaFK = `${tablaReferenciada}_id`;

  return [
    `-- Relación ${relacion.tipo}: ${relacion.de} → ${relacion.a}`,
    `ALTER TABLE \`${tablaConFK}\``,
    `  ADD COLUMN IF NOT EXISTS \`${columnaFK}\` INT NULL,`,
    `  ADD FOREIGN KEY (\`${columnaFK}\`) REFERENCES \`${tablaReferenciada}\`(id) ON DELETE SET NULL;`
  ].join('\n');
}

module.exports = { generarMySQL };
