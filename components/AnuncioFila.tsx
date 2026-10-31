import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import { TIPOS_ANUNCIO, tintaListado } from "../lib/anuncios";
import { formatFechaCorta } from "../lib/date";
import { aTextoPlano } from "../lib/richText";
import { cardShadow, colors, fonts } from "../lib/theme";
import { Anuncio } from "../lib/types";
import { Card, Muted, Title } from "./ui";

// Anuncio en una fila, en el mismo estilo del listado (app/anuncios.tsx):
// ícono de contorno chico en el color del tipo, título, una línea del mensaje
// en texto plano y una línea de datos (tipo · a quién · fecha; el tipo en gris
// salvo el urgente). Sin leer = título más marcado y un punto navy. La
// comparten el feed de Inicio y el carrusel del detalle de ministerio; el
// cuerpo con formato vive en app/anuncios.tsx.
//
// `mostrarAlcance`: en el detalle de ministerio el nombre del ministerio sobra
// —ya estás adentro—, así que ahí la línea de datos dice solo la audiencia.
export function AnuncioFila({
  a,
  sinLeer,
  mostrarAlcance = true,
  onPress,
  style,
}: {
  a: Anuncio;
  sinLeer?: boolean;
  mostrarAlcance?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const tipo = TIPOS_ANUNCIO[a.tipo] ?? TIPOS_ANUNCIO.informacion;
  const tinta = tintaListado(a.tipo);
  const soloLideres = a.audiencia === "lideres";
  const contexto = soloLideres
    ? mostrarAlcance
      ? `${a.ministerio_nombre ?? "Ministerio"}, solo líderes`
      : "Solo líderes"
    : mostrarAlcance
      ? a.ministerio_nombre ?? "Toda la iglesia"
      : "Todos los integrantes";

  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-90"
      accessibilityRole="button"
      accessibilityLabel={`${tipo.etiqueta}: ${a.titulo}`}
    >
      <Card className="flex-row items-start gap-3.5" style={[cardShadow, { padding: 16 }, style]}>
        <Ionicons name={tipo.iconoLinea} size={20} color={tipo.tinta} style={{ marginTop: 3 }} />
        <View className="flex-1">
          <Title
            numberOfLines={1}
            style={{ fontFamily: sinLeer ? fonts.serifBold : fonts.serifSemibold, fontSize: 18, lineHeight: 24, color: colors.primary }}
          >
            {a.titulo}
          </Title>
          <Muted numberOfLines={1} className="mt-0.5">
            {aTextoPlano(a.cuerpo)}
          </Muted>
          <Muted numberOfLines={1} className="mt-1.5" style={{ fontSize: 13, lineHeight: 18 }}>
            <Text style={{ color: tinta, fontFamily: a.tipo === "urgente" ? fonts.sansSemibold : fonts.sans }}>
              {tipo.etiqueta}
            </Text>
            {` · ${contexto} · ${formatFechaCorta(a.created_at.slice(0, 10))}`}
            {a.fijado ? " · Fijado" : ""}
          </Muted>
        </View>
        {sinLeer ? <View className="mt-2.5 h-[7px] w-[7px] rounded-full bg-navy" /> : null}
      </Card>
    </Pressable>
  );
}
