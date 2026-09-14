// ============================================================
// src/generators/plantuml.js — Generador de diagramas PlantUML
// Produce código PlantUML en notación de entidad-relación (ER)
// que el servidor renderiza como imagen PNG. NO usa IA.
// ============================================================

/**
 * Genera el código PlantUML completo para el diagrama ER del modelo.
 *
 * @param {Object} modelo - Modelo JSON con entidades y relaciones
 * @returns {string} Código PlantUML listo para renderizar
 */
function generarPlantUML(modelo) {
  const lineas = [];

  lineas.push('@startuml');
  lineas.push("' Diagrama ER generado automáticamente por ModelGen");
  lineas.push(`' Versión del modelo: ${modelo.version || 1}`);
  lineas.push('');

  // Estilo oscuro coherente con la interfaz web
  lineas.push('skinparam entity {');
  lineas.push('  BackgroundColor #16213e');
  lineas.push('  BorderColor     #e94560');
  lineas.push('  FontColor       #eaeaea');
  lineas.push('  AttributeIconSize 0');
  lineas.push('}');
  lineas.push('skinparam ArrowColor       #e94560');
  lineas.push('skinparam backgroundColor  #0f3460');
  lineas.push('skinparam defaultFontName  Monospaced');
  lineas.push('skinparam defaultFontColor #eaeaea');
  lineas.push('');

  // Declarar cada entidad con sus atributos
  for (const entidad of modelo.entidades) {
    lineas.push(declararEntidad(entidad));
    lineas.push('');
  }

  // Declarar las relaciones entre entidades
  for (const relacion of (modelo.relaciones || [])) {
    lineas.push(declararRelacion(relacion));
  }

  lineas.push('');
  lineas.push('@enduml');

  return lineas.join('\n');
}

/**
 * Genera el bloque de entidad en PlantUML con todos sus atributos.
 * Las claves primarias se marcan con <<PK>> y las únicas con <<UK>>.
 *
 * @param {Object} entidad - Entidad del modelo
 * @returns {string} Bloque entity de PlantUML
 */
function declararEntidad(entidad) {
  const lineas = [`entity "${entidad.nombre}" as ${entidad.nombre} {`];

  // Separar la PK del resto para mostrarla primero
  const pk     = (entidad.campos || []).filter(c => c.primaryKey);
  const resto  = (entidad.campos || []).filter(c => !c.primaryKey);

  for (const campo of pk) {
    lineas.push(`  * ${campo.nombre} : ${campo.tipo} <<PK>>`);
  }

  if (pk.length > 0 && resto.length > 0) {
    lineas.push('  --');
  }

  for (const campo of resto) {
    const marca = campo.unique
      ? ' <<UK>>'
      : campo.nullable === false
        ? ' {NOT NULL}'
        : '';
    lineas.push(`  ${campo.nombre} : ${campo.tipo}${marca}`);
  }

  lineas.push('}');
  return lineas.join('\n');
}

/**
 * Genera la línea de relación entre dos entidades en notación PlantUML ERD.
 *
 * @param {Object} relacion - Relación del modelo
 * @returns {string} Línea de relación PlantUML
 */
function declararRelacion(relacion) {
  // Notación crow's foot estándar
  const notaciones = {
    'one-to-one':   '||--||',
    'one-to-many':  '||--o{',
    'many-to-one':  '}o--||',
    'many-to-many': '}o--o{'
  };

  const notacion = notaciones[relacion.tipo] || '--';
  return `${relacion.de} ${notacion} ${relacion.a} : "${relacion.nombre}"`;
}

module.exports = { generarPlantUML };
