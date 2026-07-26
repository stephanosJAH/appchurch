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
import {
  addDays,
  formatFechaLarga,
  formatRangoFechas,
  mismoDia,
  startOfWeek,
  toISODate,
} from "../lib/date";
import { colors } from "../lib/theme";
import { DIAS_SEMANA, Evento } from "../lib/types";
import { Body, Card, Chip, Label, LinkAction, Muted, Title } from "./ui";

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

function EventoSlide({
  e,
  width,
  onPress,
}: {
  e: Evento;
  width: number;
  onPress: () => void;
}) {
  return (
    <View style={{ width }}>
      <Pressable onPress={onPress} className="active:opacity-90">
        <Card className="overflow-hidden p-0">
          <View className="h-28 justify-end bg-navy p-4">
            {e.adjunto_url && e.adjunto_tipo === "imagen" ? (
              <Image
                source={{ uri: e.adjunto_url }}
                resizeMode="cover"
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 }}
              />
            ) : (
              <View className="absolute right-4 top-4 opacity-20">
                <Ionicons name="megaphone" size={64} color={colors.tertiaryDim} />
              </View>
            )}
            <Chip tone="gold">{diaChip(e)}</Chip>
          </View>
          <View className="p-5">
            <View className="mb-2 flex-row items-center gap-1.5">
              <Ionicons name="calendar-outline" size={15} color={colors.tertiary} />
              <Muted className="capitalize text-gold">
                {mismoDia(e.fecha_inicio, e.fecha_fin)
                  ? formatFechaLarga(e.fecha_inicio)
                  : formatRangoFechas(e.fecha_inicio, e.fecha_fin)}
              </Muted>
            </View>
            <Title numberOfLines={2} className="text-xl">
              {e.titulo}
            </Title>
            {e.descripcion ? (
              <Body className="mt-1" numberOfLines={2}>
                {e.descripcion}
              </Body>
            ) : null}
            <View className="mt-4 flex-row items-center justify-between">
              {e.ubicacion ? (
                <View className="flex-1 flex-row items-center gap-1 pr-2">
                  <Ionicons name="location-outline" size={15} color={colors.outline} />
                  <Muted numberOfLines={1}>{e.ubicacion}</Muted>
                </View>
              ) : (
                <View className="flex-1" />
              )}
              <LinkAction title="Ver detalles" onPress={onPress} />
            </View>
          </View>
        </Card>
      </Pressable>
    </View>
  );
}

// Carrusel horizontal (una diapositiva por evento) con los eventos de la semana
// en curso. No renderiza nada si no hay eventos esta semana.
export function EventosSemana({
  eventos,
  className,
}: {
  eventos: Evento[];
  className?: string;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const slideW = Math.round(width - FEED_PADDING * 2);
  const [index, setIndex] = useState(0);

  const semana = useMemo(() => eventosDeLaSemana(eventos), [eventos]);

  if (semana.length === 0) return null;

  const inicioSemana = startOfWeek();
  const rango = formatRangoFechas(
    inicioSemana.toISOString(),
    addDays(inicioSemana, 6).toISOString()
  );

  const onScroll = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(ev.nativeEvent.contentOffset.x / slideW);
    if (i !== index) setIndex(i);
  };

  return (
    <View className={className}>
      <View className="mb-2 flex-row items-end justify-between">
        <Label>Eventos de la semana</Label>
        <Muted className="text-xs capitalize">{rango}</Muted>
      </View>

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
