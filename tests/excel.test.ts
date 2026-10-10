import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { setCell } from "@/lib/excel/xlsxCells";
import { exerciseRow, fillPlanilla, summaryRow } from "@/lib/excel/planilla";

const TEMPLATE = path.resolve(import.meta.dirname, "../public/templates/planilla.xlsx");

describe("escritura de celdas", () => {
  const xml = '<worksheet><sheetData><row r="2"><c r="B2" s="5"/><c r="D2" s="7" t="s"><v>3</v></c></row></sheetData></worksheet>';

  it("reemplaza una celda existente conservando el estilo", () => {
    const out = setCell(xml, "D2", "Juan & Ana");
    expect(out).toContain('<c r="D2" s="7" t="inlineStr"><is><t xml:space="preserve">Juan &amp; Ana</t></is></c>');
  });

  it("inserta una celda nueva en orden de columna", () => {
    const out = setCell(xml, "C2", 4);
    expect(out.indexOf('r="B2"')).toBeLessThan(out.indexOf('r="C2"'));
    expect(out.indexOf('r="C2"')).toBeLessThan(out.indexOf('r="D2"'));
  });

  it("crea la fila si no existe", () => {
    const out = setCell(xml, "A5", { formula: "=SUM(A1:A4)" });
    expect(out).toContain('<row r="5"><c r="A5"><f>SUM(A1:A4)</f></c></row>');
  });

  it("no confunde B2 con B20", () => {
    const x = '<worksheet><sheetData><row r="2"><c r="B20" s="1"/><c r="B2" s="2"/></row></sheetData></worksheet>';
    expect(setCell(x, "B2", 1)).toContain('<c r="B2" s="2"><v>1</v></c>');
  });
});

describe("planilla GymRun", () => {
  it("ubica bien filas de la Semana 1 y de las demás", () => {
    expect(exerciseRow(1, 1, 1)).toBe(8);
    expect(exerciseRow(1, 6, 8)).toBe(75);
    expect(summaryRow(1, 1)).toBe(16);
    expect(exerciseRow(2, 1, 1)).toBe(7);
    expect(summaryRow(2, 6)).toBe(75);
  });

  it("completa la plantilla real sin romperla", async () => {
    const template = await readFile(TEMPLATE);
    const { bytes, warnings } = await fillPlanilla(template, {
      coachName: "Coach GymRun",
      studentName: "Juan Pérez",
      goal: "Ganar fuerza",
      startDate: "2026-10-12",
      weeks: 4,
      exercises: [
        {
          week: 1, day: 1, position: 1, name: "Sentadilla", category: "Cambio de nivel rodilla", sets: 4,
          rir_rpe: "RIR 2", rest: "2'", target_reps: "6-8", logged: [{ reps: 8, kg: 60 }, { reps: 7, kg: 62.5 }],
        },
        { week: 2, day: 3, position: 2, name: "Remo con barra", category: "Tracción horizontal", sets: 3 },
        { week: 1, day: 1, position: 9, name: "No entra", sets: 3 },
      ],
      sessions: [{ week: 1, day: 1, duration_min: 55, doms: 3, weigh_in_kg: 78.4, effort_rpe: 8, muscle_group: "Piernas" }],
      feedback: [{ week: 1, motivation: 8, sleep_hours: 7.5, favorite_exercises: "Sentadilla" }],
    });
    expect(warnings).toHaveLength(1);

    const zip = await JSZip.loadAsync(bytes);
    const wb = await zip.file("xl/workbook.xml")!.async("string");
    expect(wb).toContain('fullCalcOnLoad="1"');
    expect(wb).toMatch(/<sheet state="visible" name="Semana 4"/);
    expect(wb).toMatch(/<sheet state="hidden" name="Semana 5"/);

    const s1 = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
    expect(s1).toContain("Juan Pérez");
    expect(s1).toContain("Sentadilla · 6-8 reps");
    expect(s1).toMatch(/<c r="F8" s="\d+"><v>4<\/v><\/c>/);
    expect(s1).toMatch(/<c r="L8" s="\d+"><v>62.5<\/v><\/c>/);
    expect(s1).toMatch(/<c r="O16" s="\d+"><v>78.4<\/v><\/c>/);
    expect(s1).toContain("RPE 8");
    // la fórmula de tonelaje sigue intacta
    expect(s1).toContain("I8*J8+K8*L8+M8*N8+O8*P8+Q8*R8");
    // el logo y los dibujos siguen en el archivo
    expect(zip.file("xl/media/image1.png")).not.toBeNull();
  });
});
