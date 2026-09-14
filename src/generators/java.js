// ============================================================
// src/generators/java.js — Generador de clases Java con JPA
// Produce clases Java con atributos privados, getters, setters
// y anotaciones JPA básicas para mapeo objeto-relacional.
// NO usa IA: transforma directamente el modelo JSON.
// ============================================================

/**
 * Genera el código Java completo con todas las clases JPA del modelo.
 * Cada entidad produce una clase separada dentro del mismo fichero de salida.
 *
 * @param {Object} modelo - Modelo JSON con entidades y relaciones
 * @returns {string} Código Java con todas las clases del modelo
 */
function generarJava(modelo) {
  const bloques = [];

  bloques.push('// ============================================================');
  bloques.push('// Clases Java generadas automáticamente por ModelGen');
  bloques.push(`// Versión del modelo: ${modelo.version || 1}`);
  bloques.push(`// Fecha: ${new Date().toISOString()}`);
  bloques.push('// Requiere: JPA 2.x (javax.persistence) o Jakarta EE');
  bloques.push('// ============================================================');
  bloques.push('');

  for (const entidad of modelo.entidades) {
    bloques.push(generarClase(entidad, modelo.relaciones || []));
    bloques.push('');
    bloques.push('// ' + '='.repeat(60));
    bloques.push('');
  }

  return bloques.join('\n');
}

/**
 * Genera una clase Java completa con anotaciones JPA para una entidad.
 * Incluye imports necesarios, anotaciones de clase, atributos, constructor
 * vacío y métodos getter/setter para todos los campos y relaciones.
 *
 * @param {Object} entidad   - Entidad del modelo
 * @param {Array}  relaciones - Relaciones del modelo
 * @returns {string} Código Java completo de la clase
 */
function generarClase(entidad, relaciones) {
  const lineas      = [];
  const nombreClase = capitalizar(entidad.nombre);

  // Calcular imports necesarios según los tipos y relaciones usados
  const imports = calcularImports(entidad, relaciones);
  for (const imp of imports) lineas.push(imp);
  lineas.push('');

  // Javadoc de la clase
  lineas.push('/**');
  lineas.push(` * Entidad JPA para la tabla "${entidad.nombre.toLowerCase()}".`);
  lineas.push(' * Generada automáticamente por ModelGen.');
  lineas.push(' */');

  // Anotaciones JPA de la clase
  lineas.push('@Entity');
  lineas.push(`@Table(name = "${entidad.nombre.toLowerCase()}")`);
  lineas.push(`public class ${nombreClase} implements Serializable {`);
  lineas.push('');
  lineas.push('  private static final long serialVersionUID = 1L;');
  lineas.push('');

  // Atributos propios de la entidad
  for (const campo of (entidad.campos || [])) {
    lineas.push(...declararAtributo(campo));
    lineas.push('');
  }

  // Atributos de relaciones (referencias a otras entidades)
  const relacionesSalientes = relaciones.filter(r => r.de === entidad.nombre);
  for (const rel of relacionesSalientes) {
    lineas.push(...declararAtributoRelacion(rel));
    lineas.push('');
  }

  // Constructor vacío requerido por la especificación JPA
  lineas.push('  /**');
  lineas.push('   * Constructor vacío requerido por JPA.');
  lineas.push('   */');
  lineas.push(`  public ${nombreClase}() {}`);
  lineas.push('');

  // Getters y setters de atributos propios
  for (const campo of (entidad.campos || [])) {
    lineas.push(...generarGetterSetter(campo));
  }

  // Getters y setters de relaciones
  for (const rel of relacionesSalientes) {
    lineas.push(...generarGetterSetterRelacion(rel));
  }

  lineas.push('}');

  return lineas.join('\n');
}

/**
 * Calcula los imports Java necesarios para la clase según sus tipos y relaciones.
 *
 * @param {Object} entidad    - Entidad del modelo
 * @param {Array}  relaciones - Relaciones del modelo
 * @returns {Array<string>} Lista de sentencias import
 */
function calcularImports(entidad, relaciones) {
  const imports = new Set([
    'import javax.persistence.*;',
    'import java.io.Serializable;'
  ]);

  // Tipos que necesitan import adicional
  const tipos = (entidad.campos || []).map(c => c.tipo);
  if (tipos.includes('date') || tipos.includes('datetime')) {
    imports.add('import java.util.Date;');
  }

  // Relaciones con colecciones necesitan List
  const relsSalientes = relaciones.filter(r => r.de === entidad.nombre);
  const tieneColeccion = relsSalientes.some(
    r => r.tipo === 'one-to-many' || r.tipo === 'many-to-many'
  );
  if (tieneColeccion) {
    imports.add('import java.util.List;');
    imports.add('import java.util.ArrayList;');
  }

  return Array.from(imports).sort();
}

/**
 * Declara un atributo Java con sus anotaciones JPA.
 *
 * @param {Object} campo - Campo del modelo
 * @returns {Array<string>} Líneas del atributo
 */
function declararAtributo(campo) {
  const lineas   = [];
  const tipoJava = mapearTipoJava(campo.tipo);

  if (campo.primaryKey) {
    lineas.push('  @Id');
    lineas.push('  @GeneratedValue(strategy = GenerationType.IDENTITY)');
  } else {
    // Construir anotación @Column con restricciones
    const atribs = [];
    if (campo.nullable === false) atribs.push('nullable = false');
    if (campo.unique)             atribs.push('unique = true');
    lineas.push(atribs.length > 0
      ? `  @Column(${atribs.join(', ')})`
      : '  @Column');

    // Anotación @Temporal para tipos de fecha
    if (campo.tipo === 'date')     lineas.push('  @Temporal(TemporalType.DATE)');
    if (campo.tipo === 'datetime') lineas.push('  @Temporal(TemporalType.TIMESTAMP)');
  }

  lineas.push(`  private ${tipoJava} ${campo.nombre};`);
  return lineas;
}

/**
 * Declara el atributo Java que representa una relación JPA.
 *
 * @param {Object} relacion - Relación del modelo
 * @returns {Array<string>} Líneas del atributo de relación
 */
function declararAtributoRelacion(relacion) {
  const lineas        = [];
  const claseDestino  = capitalizar(relacion.a);
  const nombreCampo   = relacion.a.toLowerCase();

  switch (relacion.tipo) {
    case 'one-to-one':
      lineas.push('  @OneToOne');
      lineas.push(`  @JoinColumn(name = "${nombreCampo}_id")`);
      lineas.push(`  private ${claseDestino} ${nombreCampo};`);
      break;

    case 'many-to-one':
      lineas.push('  @ManyToOne(fetch = FetchType.LAZY)');
      lineas.push(`  @JoinColumn(name = "${nombreCampo}_id")`);
      lineas.push(`  private ${claseDestino} ${nombreCampo};`);
      break;

    case 'one-to-many':
      lineas.push(`  @OneToMany(mappedBy = "${relacion.de.toLowerCase()}", cascade = CascadeType.ALL, orphanRemoval = true)`);
      lineas.push(`  private List<${claseDestino}> ${nombreCampo}s = new ArrayList<>();`);
      break;

    case 'many-to-many':
      lineas.push('  @ManyToMany');
      lineas.push('  @JoinTable(');
      lineas.push(`    name = "${relacion.nombre.toLowerCase()}",`);
      lineas.push(`    joinColumns        = @JoinColumn(name = "${relacion.de.toLowerCase()}_id"),`);
      lineas.push(`    inverseJoinColumns = @JoinColumn(name = "${relacion.a.toLowerCase()}_id")`);
      lineas.push('  )');
      lineas.push(`  private List<${claseDestino}> ${nombreCampo}s = new ArrayList<>();`);
      break;

    default:
      lineas.push(`  // Relación desconocida: ${relacion.tipo}`);
  }

  return lineas;
}

/**
 * Genera el getter y setter para un campo de la entidad.
 *
 * @param {Object} campo - Campo del modelo
 * @returns {Array<string>} Líneas del getter y setter
 */
function generarGetterSetter(campo) {
  const lineas   = [];
  const tipo     = mapearTipoJava(campo.tipo);
  const nombre   = capitalizar(campo.nombre);

  lineas.push(`  public ${tipo} get${nombre}() {`);
  lineas.push(`    return ${campo.nombre};`);
  lineas.push('  }');
  lineas.push('');
  lineas.push(`  public void set${nombre}(${tipo} ${campo.nombre}) {`);
  lineas.push(`    this.${campo.nombre} = ${campo.nombre};`);
  lineas.push('  }');
  lineas.push('');

  return lineas;
}

/**
 * Genera el getter y setter para un atributo de relación.
 *
 * @param {Object} relacion - Relación del modelo
 * @returns {Array<string>} Líneas del getter y setter
 */
function generarGetterSetterRelacion(relacion) {
  const lineas     = [];
  const claseDestino = capitalizar(relacion.a);
  const esColeccion  = relacion.tipo === 'one-to-many' || relacion.tipo === 'many-to-many';
  const nombreCampo  = relacion.a.toLowerCase() + (esColeccion ? 's' : '');
  const tipoJava     = esColeccion ? `List<${claseDestino}>` : claseDestino;
  const nombreGetter = capitalizar(nombreCampo);

  lineas.push(`  public ${tipoJava} get${nombreGetter}() {`);
  lineas.push(`    return ${nombreCampo};`);
  lineas.push('  }');
  lineas.push('');
  lineas.push(`  public void set${nombreGetter}(${tipoJava} ${nombreCampo}) {`);
  lineas.push(`    this.${nombreCampo} = ${nombreCampo};`);
  lineas.push('  }');
  lineas.push('');

  return lineas;
}

/**
 * Mapea los tipos del modelo a tipos Java.
 *
 * @param {string} tipo - Tipo del campo en el modelo
 * @returns {string} Tipo Java (clase boxed para nulabilidad)
 */
function mapearTipoJava(tipo) {
  const mapa = {
    string:   'String',
    integer:  'Integer',
    float:    'Double',
    boolean:  'Boolean',
    date:     'Date',
    datetime: 'Date',
    text:     'String'
  };
  return mapa[tipo] || 'String';
}

/**
 * Capitaliza la primera letra de una cadena.
 *
 * @param {string} str - Cadena a capitalizar
 * @returns {string} Cadena con primera letra en mayúscula
 */
function capitalizar(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = { generarJava };
