import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleProp, View, ViewStyle } from "react-native";
import { TIPOS_ANUNCIO } from "../lib/anuncios";
import { formatFechaCorta } from "../lib/date";
import { cardShadow, colors, fonts } from "../lib/theme";
import { Anuncio } from "../lib/types";
import { Card, Muted, Title } from "./ui";

// Anuncio en una fila, con la misma estructura que la de actividad
// (components/ActividadesHoy.tsx): cuadrado de 64 con el ícono del tipo sobre
// su color, línea de arriba en ese mismo color (tipo · fecha), título y una
// línea de contexto (a quién le llega). La comparten el feed de Inicio y el
// carrusel del detalle de ministerio; el cuerpo con formato vive en
// app/anuncios.tsx.
//
// `mostrarAlcance`: en el detalle de ministerio el nombre del ministerio sobra
// —ya estás adentro—, así que ahí la línea de contexto dice solo la audiencia.
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
  const soloLideres = a.audiencia === "lideres";
  const contexto = soloLideres
    ? mostrarAlcance
      ? `${a.ministerio_nombre ?? "Ministerio"} · solo líderes`
      : "Solo para los líderes"
    : mostrarAlcance
      ? a.ministerio_nombre ?? "Toda la iglesia"
      : "Para todos los integrantes";

  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-90"
      accessibilityRole="button"
      accessibilityLabel={`${tipo.etiqueta}: ${a.titulo}`}
    >
      <Card className="flex-row items-center gap-3" style={[cardShadow, { padding: 12 }, style]}>
        <View
          style={{ borderRadius: 12, backgroundColor: tipo.fondo }}
          className="h-16 w-16 items-center justify-center"
        >
          <Ionicons name={tipo.icono} size={28} color={tipo.tinta} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            {a.fijado ? <Ionicons name="pin" size={12} color={tipo.tinta} /> : null}
            <Muted
              numberOfLines={1}
              className="flex-1"
              style={{ color: tipo.tinta, fontFamily: fonts.sansSemibold, fontSize: 13, lineHeight: 18 }}
            >
              {tipo.etiqueta} · {formatFechaCorta(a.created_at.slice(0, 10))}
            </Muted>
          </View>
          <Title numberOfLines={1}>{a.titulo}</Title>
          <View className="flex-row items-center gap-1.5">
            <Ionicons
              name={soloLideres ? "lock-closed-outline" : a.ministerio_id ? "people-outline" : "home-outline"}
              size={13}
              color={colors.outline}
            />
            <Muted numberOfLines={1} className="flex-1" style={{ fontSize: 13, lineHeight: 18 }}>
              {contexto}
            </Muted>
          </View>
        </View>
        {sinLeer ? <View className="h-2 w-2 rounded-full bg-gold" /> : null}
        <Ionicons name="chevron-forward" size={18} color={colors.outline} />
      </Card>
    </Pressable>
  );
}
