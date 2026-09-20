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
import {
  addDays,
  formatFechaCorta,
  formatRangoFechas,
  mismoDia,
  startOfWeek,
  toISODate,
} from "../lib/date";
import { cardShadow, colors, fonts } from "../lib/theme";
import { DIAS_SEMANA, Evento } from "../lib/types";
import { Card, Label, Muted, SkeletonCard, Title } from "./ui";

// Padding horizontal del contenedor del feed (16 por lado): la diapositiva ocupa
// el ancho de pantalla menos ese margen.
const FEED_PADDING = 16;

// Eventos que se solapan con la semana actual (lunes 00:00 → domingo 23:59).
// Un evento de varios días cuenta si cualquier parte cae dentro de la semana.
export function eventosDeLaSemana(eventos: Evento[], ref = new Date()): Evento[] {
  const inicioSemana = startOfWeek(ref);
  const finSemana = addDays(inicioSemana, 7); // lunes siguiente (exclusivo)
  return eventos
    .filter((e) => {
      const ini = new Date(e.fecha_inicio);
      const fin = new Date(e.fecha_fin);
      return ini < finSemana && fin >= inicioSemana;
    })
    .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
}

// Etiqueta corta para el chip: "Hoy", "Mañana", "En curso" (multi-día) o el día.
function diaChip(e: Evento, ref = new Date()): string {
  const hoyISO = toISODate(ref);
  const iniISO = toISODate(new Date(e.fecha_inicio));
  const finISO = toISODate(new Date(e.fecha_fin));
  if (iniISO !== finISO && hoyISO >= iniISO && hoyISO <= finISO) return "En curso";
  if (iniISO === hoyISO) return "Hoy";
  if (iniISO === toISODate(addDays(ref, 1))) return "Mañana";
  return DIAS_SEMANA[new Date(e.fecha_inicio).getDay()];
}

// Fila de evento del feed, gemela de la de actividades: miniatura de 64 (el
// flyer, o el ícono sobre navy), cuándo en dorado, título y el lugar. La línea
// dorada absorbe lo que antes estaban el chip y la fecha: el relativo
// ("Hoy", "Mañana", "En curso") sólo cuando aporta, porque para un día
// cualquiera `diaChip` ya devuelve el nombre del día que abre la fecha.
function EventoSlide({
  e,
  width,
  onPress,
}: {
  e: Evento;
  width: number;
  onPress: () => void;
}) {
  const rel = diaChip(e);
  const variosDias = !mismoDia(e.fecha_inicio, e.fecha_fin);
  const cuando = variosDias
    ? rel === "En curso"
      ? `En curso · ${formatRangoFechas(e.fecha_inicio, e.fecha_fin)}`
      : formatRangoFechas(e.fecha_inicio, e.fecha_fin)
    : `${rel} · ${formatFechaCorta(e.fecha_inicio)}`;
  return (
    <View style={{ width }}>
      <Pressable onPress={onPress} className="active:opacity-90">
        <Card className="flex-row items-center gap-3" style={[cardShadow, { padding: 12 }]}>
          <View
            style={{ borderRadius: 12 }}
            className="h-16 w-16 items-center justify-center overflow-hidden bg-navy"
          >
            {e.adjunto_url && e.adjunto_tipo === "imagen" ? (
              <Image
                source={{ uri: e.adjunto_url }}
                resizeMode="cover"
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              />
            ) : (
              <Ionicons name="megaphone" size={26} color={colors.tertiaryDim} />
            )}
          </View>
          <View className="flex-1">
            <Muted className="text-gold" style={{ fontFamily: fonts.sansSemibold, fontSize: 13, lineHeight: 18 }}>
              {cuando}
            </Muted>
            <Title numberOfLines={1}>{e.titulo}</Title>
            {e.ubicacion ? (
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="location-outline" size={13} color={colors.outline} />
                <Muted numberOfLines={1} className="flex-1" style={{ fontSize: 13, lineHeight: 18 }}>
                  {e.ubicacion}
                </Muted>
              </View>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.outline} />
        </Card>
      </Pressable>
    </View>
  );
}

// Carrusel horizontal (una diapositiva por evento) con los eventos de la semana
// en curso. No renderiza nada si no hay eventos esta semana.
//
// `swipeGesture`: gesto nativo del carrusel, para que la pantalla que lo monta
// pueda declarar prioridad frente a sus propios gestos horizontales (el feed
// pasa el suyo para que arrastrar entre eventos no salte a "Nosotros").
//
// `cargando`: mientras la consulta trae los eventos se muestra el encabezado
// (el rango de la semana sale del reloj, no de la base) con una tarjeta
// fantasma debajo. Si al final la semana no tiene eventos, la sección
// desaparece.
export function EventosSemana({
  eventos,
  className,
  swipeGesture,
  cargando,
}: {
  eventos: Evento[];
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

  const semana = useMemo(() => eventosDeLaSemana(eventos), [eventos]);

  if (semana.length === 0 && !cargando) return null;

  const inicioSemana = startOfWeek();
  const rango = formatRangoFechas(
    inicioSemana.toISOString(),
    addDays(inicioSemana, 6).toISOString()
  );

  const onScroll = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(ev.nativeEvent.contentOffset.x / slideW);
    if (i !== index) setIndex(i);
  };

  const encabezado = (
    <View className="mb-2 flex-row items-end justify-between">
      <Label>Eventos de la semana</Label>
      <Muted className="text-xs capitalize">{rango}</Muted>
    </View>
  );

  if (semana.length === 0) {
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
          {semana.map((e) => (
            <EventoSlide
              key={e.id}
              e={e}
              width={slideW}
              onPress={() => router.push({ pathname: "/actividad/[id]", params: { id: e.id } })}
            />
          ))}
        </ScrollView>
      </GestureDetector>

      {semana.length > 1 && (
        <View className="mt-3 flex-row items-center justify-center gap-1.5">
          {semana.map((e, i) => (
            <View
              key={e.id}
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
