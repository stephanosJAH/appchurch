import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector, type NativeGesture } from "react-native-gesture-handler";
import { formatDiasSemana, formatFechaLarga, formatHora } from "../lib/date";
import { cardShadow, colors, fonts } from "../lib/theme";
import { Actividad, DIAS_SEMANA } from "../lib/types";
import { Card, Label, Muted, SkeletonCard, Title } from "./ui";

// Padding horizontal del contenedor del feed (16 por lado): la diapositiva ocupa
// el ancho de pantalla menos ese margen.
const FEED_PADDING = 16;

// Actividades recurrentes que caen HOY (dias_semana incluye el día actual),
// ordenadas por hora de inicio. La consulta ya trae solo las activas.
export function actividadesDeHoy(actividades: Actividad[], ref = new Date()): Actividad[] {
  const dia = ref.getDay(); // 0=domingo … 6=sábado
  return actividades
    .filter((a) => a.dias_semana?.includes(dia))
    .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
}

// Fila de actividad del feed: miniatura de 64 (el flyer, o el ícono sobre
// navy), horario en dorado, título y una línea de contexto. Es deliberadamente
// liviana —el ancla navy del discipulado es la que lleva el peso— y por eso no
// muestra la descripción: para eso está el detalle.
function ActividadSlide({
  a,
  dia,
  width,
  onPress,
}: {
  a: Actividad;
  dia: string;
  width: number;
  onPress: () => void;
}) {
  const horario = `${formatHora(a.hora_inicio)}${a.hora_fin ? ` – ${formatHora(a.hora_fin)}` : ""}`;
  return (
    <View style={{ width }}>
      <Pressable onPress={onPress} className="active:opacity-90">
        <Card className="flex-row items-center gap-3" style={[cardShadow, { padding: 12 }]}>
          <View
            style={{ borderRadius: 12 }}
            className="h-16 w-16 items-center justify-center overflow-hidden bg-navy"
          >
            {a.adjunto_url && a.adjunto_tipo === "imagen" ? (
              <Image
                source={{ uri: a.adjunto_url }}
                resizeMode="cover"
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              />
            ) : (
              <Ionicons name="repeat" size={26} color={colors.tertiaryDim} />
            )}
          </View>
          <View className="flex-1">
            {/* El día siempre visible: la actividad es recurrente, se repite
                todos los <día> — no es un ítem con fecha como un evento. */}
            <Muted className="text-gold" style={{ fontFamily: fonts.sansSemibold, fontSize: 13, lineHeight: 18 }}>
              {dia}
              {horario ? ` · ${horario}` : ""}
            </Muted>
            <Title numberOfLines={1}>{a.titulo}</Title>
            <View className="flex-row items-center gap-1.5">
              <Ionicons
                name={a.ubicacion ? "location-outline" : "repeat-outline"}
                size={13}
                color={colors.outline}
              />
              <Muted numberOfLines={1} className="flex-1" style={{ fontSize: 13, lineHeight: 18 }}>
                {a.ubicacion ?? formatDiasSemana(a.dias_semana)}
              </Muted>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.outline} />
        </Card>
      </Pressable>
    </View>
  );
}

// Carrusel horizontal (una diapositiva por actividad) con las actividades
// recurrentes que tocan hoy. No renderiza nada si hoy no hay ninguna.
//
// `swipeGesture`: gesto nativo del carrusel, para que la pantalla que lo monta
// pueda declarar prioridad frente a sus propios gestos horizontales (el feed
// pasa el suyo para que arrastrar entre actividades no salte a "Nosotros").
//
// `cargando`: mientras la consulta trae las actividades se muestra el
// encabezado (día y fecha son de reloj, no de la base) con una tarjeta
// fantasma debajo. Si al final hoy no hay ninguna, la sección desaparece.
export function ActividadesHoy({
  actividades,
  className,
  swipeGesture,
  cargando,
}: {
  actividades: Actividad[];
  className?: string;
  swipeGesture?: NativeGesture;
  cargando?: boolean;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const slideW = Math.round(width - FEED_PADDING * 2);
  const [index, setIndex] = useState(0);
  const gestoPropio = useMemo(() => Gesture.Native(), []);
  const gesto = swipeGesture ?? gestoPropio;

  const hoy = useMemo(() => actividadesDeHoy(actividades), [actividades]);

  if (hoy.length === 0 && !cargando) return null;

  const fecha = formatFechaLarga(new Date().toISOString());
  const diaHoy = DIAS_SEMANA[new Date().getDay()];

  const onScroll = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(ev.nativeEvent.contentOffset.x / slideW);
    if (i !== index) setIndex(i);
  };

  const encabezado = (
    <View className="mb-2 flex-row items-end justify-between">
      <Label>Actividades de hoy</Label>
      <Muted className="text-xs capitalize">{fecha}</Muted>
    </View>
  );

  if (hoy.length === 0) {
    return (
      <View className={className}>
        {encabezado}
        <SkeletonCard />
      </View>
    );
  }

  return (
    <View className={className}>
      {encabezado}

      {/* GestureDetector + Gesture.Native(): mete el scroll horizontal nativo en
          el sistema de gestos de RNGH, así quien monta el carrusel puede darle
          prioridad sobre un pan de pantalla completa. */}
      <GestureDetector gesture={gesto}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
        >
          {hoy.map((a) => (
            <ActividadSlide
              key={a.id}
              a={a}
              dia={diaHoy}
              width={slideW}
              onPress={() =>
                router.push({ pathname: "/actividad-semanal/[id]", params: { id: a.id } })
              }
            />
          ))}
        </ScrollView>
      </GestureDetector>

      {hoy.length > 1 && (
        <View className="mt-3 flex-row items-center justify-center gap-1.5">
          {hoy.map((a, i) => (
            <View
              key={a.id}
              style={{
                width: i === index ? 18 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === index ? colors.tertiary : colors.outlineVariant,
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
