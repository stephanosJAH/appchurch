// Descripciones con formato de eventos y actividades.
//
// El formato guardado es **texto plano con marcas** tipo markdown, en la misma
// columna `text` de siempre: no hay migración, no cambia el RLS y las
// descripciones cargadas antes siguen siendo válidas (son markdown sin ninguna
// marca). Tampoco hay dependencias nuevas ni WebView: el editor
// (components/RichTextEditor) es un TextInput con una barra que inserta las
// marcas, y la lectura (components/RichTextView) parsea acá y dibuja con
// <Text>/<View>.
//
// Marcas soportadas:
//   # Título        ## Subtítulo      ### Sub-subtítulo
//   - viñeta        1. numerada       > cita
//   **negrita**     _cursiva_         __subrayado__
//   ~~tachado~~     `código`          [texto](https://…)
// Una línea en blanco separa párrafos; un salto simple es un salto de línea.
// Se puede escapar cualquier marca con \ (por ejemplo \*).

export type Marca = {
  negrita?: boolean;
  cursiva?: boolean;
  subrayado?: boolean;
  tachado?: boolean;
  codigo?: boolean;
  enlace?: string;
};

export type Span = Marca & { texto: string };

export type TipoBloque = "parrafo" | "h1" | "h2" | "h3" | "cita" | "item";

export type Bloque = {
  tipo: TipoBloque;
  spans: Span[];
  /** Solo en "item": la viñeta o el número ya formateado. */
  marcador?: string;
};

/* ==================== Compatibilidad con HTML viejo ==================== */

// Durante un intento previo el editor guardaba HTML. Si alguna descripción
// quedó así, se la degrada a texto plano en vez de mostrar las etiquetas
// crudas. No intenta recuperar el formato: son pocas o ninguna.
const RE_ETIQUETA_HTML =
  /<\/?(?:p|br|div|h[1-6]|ul|ol|li|strong|b|em|i|u|s|a|blockquote|pre|code|span)\b[^>]*>/i;

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
};

function normalizar(descripcion: string | null | undefined): string {
  const texto = (descripcion ?? "").replace(/\r\n?/g, "\n");
  if (!RE_ETIQUETA_HTML.test(texto)) return texto;
  return texto
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|pre)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entera, cuerpo: string) => {
      if (cuerpo[0] !== "#") return ENTIDADES[cuerpo.toLowerCase()] ?? entera;
      const codigo =
        cuerpo[1] === "x" || cuerpo[1] === "X"
          ? parseInt(cuerpo.slice(2), 16)
          : parseInt(cuerpo.slice(1), 10);
      const valido =
        Number.isFinite(codigo) &&
        codigo > 0 &&
        codigo <= 0x10ffff &&
        !(codigo >= 0xd800 && codigo <= 0xdfff);
      return valido ? String.fromCodePoint(codigo) : entera;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ============================ Parser inline ============================ */

const ESCAPABLES = "*_~`[]\\#>-";

// Orden importante: los de dos caracteres se prueban antes que los de uno,
// si no `__subrayado__` se leería como `_cursiva_` abierta.
const DELIMITADORES: { marca: string; aplica: Marca; literal?: boolean }[] = [
  { marca: "**", aplica: { negrita: true } },
  { marca: "__", aplica: { subrayado: true } },
  { marca: "~~", aplica: { tachado: true } },
  { marca: "`", aplica: { codigo: true }, literal: true },
  { marca: "_", aplica: { cursiva: true } },
];

const RE_ENLACE = /^\[([^\]]*)\]\(([^)\s]+)\)/;

function parsearInline(texto: string, heredada: Marca, salida: Span[]): void {
  let buffer = "";
  let i = 0;

  const volcar = () => {
    if (buffer) {
      salida.push({ texto: buffer, ...heredada });
      buffer = "";
    }
  };

  while (i < texto.length) {
    const resto = texto.slice(i);

    // \* escapa la marca y deja el carácter literal.
    if (resto[0] === "\\" && resto.length > 1 && ESCAPABLES.includes(resto[1])) {
      buffer += resto[1];
      i += 2;
      continue;
    }

    const enlace = resto.match(RE_ENLACE);
    if (enlace) {
      volcar();
      const etiqueta = enlace[1] || enlace[2];
      parsearInline(etiqueta, { ...heredada, enlace: enlace[2] }, salida);
      i += enlace[0].length;
      continue;
    }

    const delimitador = DELIMITADORES.find((d) => resto.startsWith(d.marca));
    if (delimitador) {
      const desde = i + delimitador.marca.length;
      const cierre = texto.indexOf(delimitador.marca, desde);
      // Sin cierre, o vacío (`****`), la marca es texto común.
      if (cierre > desde) {
        volcar();
        const interior = texto.slice(desde, cierre);
        const marca = { ...heredada, ...delimitador.aplica };
        if (delimitador.literal) salida.push({ texto: interior, ...marca });
        else parsearInline(interior, marca, salida);
        i = cierre + delimitador.marca.length;
        continue;
      }
    }

    buffer += texto[i];
    i += 1;
  }
  volcar();
}

function inline(texto: string): Span[] {
  const spans: Span[] = [];
  parsearInline(texto, {}, spans);
  return spans.filter((span) => span.texto.length > 0);
}

// Un bloque que quedó solo con espacios (por ejemplo al escribir "**   **") no
// aporta nada y si se dibuja deja un hueco.
function tieneTexto(spans: Span[]): boolean {
  return spans.some((span) => span.texto.trim().length > 0);
}

/* ============================ Parser de bloques ============================ */

const RE_TITULO = /^(#{1,3})\s+(.*)$/;
const RE_CITA = /^>\s?(.*)$/;
const RE_VINETA = /^[-*]\s+(.*)$/;
const RE_NUMERADA = /^(\d{1,3})[.)]\s+(.*)$/;

/** Prefijos de bloque, para que el editor pueda alternarlos por línea. */
export const RE_PREFIJO_BLOQUE = /^(#{1,3}\s+|>\s?|[-*]\s+|\d{1,3}[.)]\s+)/;

export function parsear(descripcion: string | null | undefined): Bloque[] {
  const texto = normalizar(descripcion);
  if (!texto.trim()) return [];

  const bloques: Bloque[] = [];
  // Los párrafos y las citas juntan líneas consecutivas; el resto es una
  // línea = un bloque.
  let buffer: string[] = [];
  let tipoBuffer: "parrafo" | "cita" | null = null;

  const volcarBuffer = () => {
    if (buffer.length && tipoBuffer) {
      const spans = inline(buffer.join("\n"));
      if (tieneTexto(spans)) bloques.push({ tipo: tipoBuffer, spans });
    }
    buffer = [];
    tipoBuffer = null;
  };

  const agregarSuelto = (tipo: TipoBloque, contenido: string, marcador?: string) => {
    volcarBuffer();
    const spans = inline(contenido);
    if (tieneTexto(spans)) bloques.push({ tipo, spans, marcador });
  };

  for (const linea of texto.split("\n")) {
    if (!linea.trim()) {
      volcarBuffer();
      continue;
    }

    const titulo = linea.match(RE_TITULO);
    if (titulo) {
      const nivel = titulo[1].length;
      agregarSuelto(nivel === 1 ? "h1" : nivel === 2 ? "h2" : "h3", titulo[2]);
      continue;
    }

    const vineta = linea.match(RE_VINETA);
    if (vineta) {
      agregarSuelto("item", vineta[1], "•");
      continue;
    }

    const numerada = linea.match(RE_NUMERADA);
    if (numerada) {
      agregarSuelto("item", numerada[2], `${Number(numerada[1])}.`);
      continue;
    }

    const cita = linea.match(RE_CITA);
    if (cita) {
      if (tipoBuffer !== "cita") volcarBuffer();
      tipoBuffer = "cita";
      buffer.push(cita[1]);
      continue;
    }

    if (tipoBuffer !== "parrafo") volcarBuffer();
    tipoBuffer = "parrafo";
    buffer.push(linea);
  }
  volcarBuffer();

  return bloques;
}

/* ============================ Utilidades ============================ */

/** Para los previews cortados con numberOfLines y para el buscador. */
export function aTextoPlano(descripcion: string | null | undefined): string {
  if (!descripcion) return "";
  return parsear(descripcion)
    .map((bloque) => bloque.spans.map((span) => span.texto).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Una descripción que solo tiene marcas sueltas o espacios no es una descripción. */
export function estaVacio(descripcion: string | null | undefined): boolean {
  return !aTextoPlano(descripcion);
}
