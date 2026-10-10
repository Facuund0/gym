/*
  Escritura mínima de celdas sobre el XML de una hoja .xlsx.

  ¿Por qué no usar una librería como exceljs? Porque al reescribir el archivo
  pierden o rompen cosas de la planilla original (formato condicional, imágenes
  del logo, validaciones). Editando solo las celdas necesarias en el XML, la
  planilla exportada queda IDÉNTICA a la original con los datos cargados.
*/

export type CellValue = string | number | { formula: string } | null | undefined;

const COL_RE = /^([A-Z]+)(\d+)$/;

export function colToNumber(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function splitRef(ref: string): { col: string; row: number } {
  const m = COL_RE.exec(ref);
  if (!m) throw new Error(`Referencia inválida: ${ref}`);
  return { col: m[1], row: Number(m[2]) };
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // caracteres de control no permitidos en XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function buildCell(ref: string, style: string | null, value: CellValue): string {
  const s = style ? ` s="${style}"` : "";
  if (value === null || value === undefined || value === "") return `<c r="${ref}"${s}/>`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s}><v>${value}</v></c>`;
  }
  if (typeof value === "object") {
    return `<c r="${ref}"${s}><f>${escapeXml(value.formula.replace(/^=/, ""))}</f></c>`;
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

/** Regex que encuentra una celda (autocerrada o con contenido) por referencia exacta. */
function cellRegex(ref: string): RegExp {
  return new RegExp(`<c r="${ref}"(?=[\\s/>])([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`);
}

function styleOf(attrs: string): string | null {
  const m = / s="(\d+)"/.exec(attrs);
  return m ? m[1] : null;
}

/** Inserta/reemplaza el valor de una celda dentro del XML de la hoja. */
export function setCell(sheetXml: string, ref: string, value: CellValue): string {
  const { col, row } = splitRef(ref);
  const rowRe = new RegExp(`<row r="${row}"(?=[\\s>/])([^>]*?)(/>|>([\\s\\S]*?)</row>)`);
  const rowMatch = rowRe.exec(sheetXml);

  if (!rowMatch) {
    // La fila no existe: la insertamos en orden.
    const newRow = `<row r="${row}">${buildCell(ref, null, value)}</row>`;
    const rows = [...sheetXml.matchAll(/<row r="(\d+)"/g)];
    const after = rows.find((m) => Number(m[1]) > row);
    if (after && after.index !== undefined) {
      return sheetXml.slice(0, after.index) + newRow + sheetXml.slice(after.index);
    }
    return sheetXml.replace("</sheetData>", `${newRow}</sheetData>`);
  }

  const [whole, rowAttrs, closing, inner = ""] = rowMatch;
  const selfClosed = closing === "/>";
  let content = selfClosed ? "" : inner;

  const cm = cellRegex(ref).exec(content);
  if (cm) {
    const style = styleOf(cm[1]);
    content = content.replace(cm[0], buildCell(ref, style, value));
  } else {
    // Insertar respetando el orden de columnas.
    const target = colToNumber(col);
    const cells = [...content.matchAll(/<c r="([A-Z]+)\d+"/g)];
    const next = cells.find((m) => colToNumber(m[1]) > target);
    const cell = buildCell(ref, null, value);
    if (next && next.index !== undefined) content = content.slice(0, next.index) + cell + content.slice(next.index);
    else content += cell;
  }

  const rebuilt = `<row r="${row}"${rowAttrs}>${content}</row>`;
  return sheetXml.replace(whole, rebuilt);
}

export function setCells(sheetXml: string, values: Record<string, CellValue>): string {
  let xml = sheetXml;
  for (const [ref, v] of Object.entries(values)) {
    if (v === undefined) continue;
    xml = setCell(xml, ref, v);
  }
  return xml;
}
