import { useMemo } from "react";
import { Platform, Text, TextStyle, View } from "react-native";
import { Bloque, Span, parsear } from "../lib/richText";
import { abrirAdjunto } from "../lib/storage";
import { colors, fonts } from "../lib/theme";

// Pinta la `descripcion` con formato de un evento o una actividad. El texto con
// marcas se parsea a bloques (lib/richText) y se dibuja con <Text> y <View>:
// no hay WebView ni HTML de por medio.

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

// De las Source Sans/Serif solo están cargadas las variantes regular y bold
// (app/_layout.tsx), así que la negrita cambia de familia en vez de pedir
// fontWeight. La cursiva queda sintetizada por el sistema.
function fuente(span: Span, serif: boolean): string {
  if (span.codigo) return MONO;
  if (serif) return span.negrita ? fonts.serifBold : fonts.serifSemibold;
  return span.negrita ? fonts.sansBold : fonts.sans;
}

function estilo(span: Span, serif: boolean): TextStyle {
  const decoracion = [
    span.subrayado || span.enlace ? "underline" : null,
    span.tachado ? "line-through" : null,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    fontFamily: fuente(span, serif),
    fontStyle: span.cursiva ? "italic" : "normal",
    textDecorationLine: (decoracion || "none") as TextStyle["textDecorationLine"],
    ...(span.enlace ? { color: colors.tertiary } : null),
  };
}

function Spans({ spans, serif = false }: { spans: Span[]; serif?: boolean }) {
  return (
    <>
      {spans.map((span, i) => (
        <Text
          key={i}
          style={estilo(span, serif)}
          // abrirAdjunto valida que sea https:// antes de abrir nada.
          onPress={span.enlace ? () => abrirAdjunto(span.enlace) : undefined}
          suppressHighlighting={!span.enlace}
        >
          {span.texto}
        </Text>
      ))}
    </>
  );
}

function BloqueView({ bloque, primero }: { bloque: Bloque; primero: boolean }) {
  switch (bloque.tipo) {
    case "h1":
      return (
        <Text
          style={{ fontFamily: fonts.serifSemibold, lineHeight: 28 }}
          className={`text-xl text-ink ${primero ? "" : "mt-4"}`}
        >
          <Spans spans={bloque.spans} serif />
        </Text>
      );

    case "h2":
      return (
        <Text
          style={{ fontFamily: fonts.serifSemibold, lineHeight: 24 }}
          className={`text-[17px] text-ink ${primero ? "" : "mt-3.5"}`}
        >
          <Spans spans={bloque.spans} serif />
        </Text>
      );

    case "h3":
      return (
        <Text
          style={{ fontFamily: fonts.sansSemibold, lineHeight: 22 }}
          className={`text-[15px] text-ink ${primero ? "" : "mt-3"}`}
        >
          <Spans spans={bloque.spans} />
        </Text>
      );

    case "cita":
      return (
        <View className={`border-l-2 border-gold/40 pl-3 ${primero ? "" : "mt-2.5"}`}>
          <Text style={{ fontFamily: fonts.sans, lineHeight: 24 }} className="text-base text-ink-variant">
            <Spans spans={bloque.spans} />
          </Text>
        </View>
      );

    case "item":
      return (
        <View className={`flex-row ${primero ? "" : "mt-1"}`}>
          <Text
            style={{ fontFamily: fonts.sans, lineHeight: 24, width: 22 }}
            className="text-base text-ink-muted"
          >
            {bloque.marcador}
          </Text>
          <Text style={{ fontFamily: fonts.sans, lineHeight: 24 }} className="flex-1 text-base text-ink">
            <Spans spans={bloque.spans} />
          </Text>
        </View>
      );

    default:
      return (
        <Text
          style={{ fontFamily: fonts.sans, lineHeight: 24 }}
          className={`text-base text-ink ${primero ? "" : "mt-2.5"}`}
        >
          <Spans spans={bloque.spans} />
        </Text>
      );
  }
}

export function RichTextView({
  descripcion,
  className,
}: {
  descripcion: string | null | undefined;
  className?: string;
}) {
  const bloques = useMemo(() => parsear(descripcion), [descripcion]);
  if (!bloques.length) return null;
  return (
    <View className={className}>
      {bloques.map((bloque, i) => (
        <BloqueView key={i} bloque={bloque} primero={i === 0} />
      ))}
    </View>
  );
}
