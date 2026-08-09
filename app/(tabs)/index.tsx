import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { ActividadesHoy, actividadesDeHoy } from "../../components/ActividadesHoy";
import { AppBar, FeedTab } from "../../components/AppBar";
import { CumplesSection } from "../../components/Cumples";
import { DirectorioList } from "../../components/Directorio";
import { EventosSemana, eventosDeLaSemana } from "../../components/EventosSemana";
import {
  Body,
  Button,
  Card,
  Chip,
  Display,
  Muted,
  Title,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatHora } from "../../lib/date";
import { colors } from "../../lib/theme";
import { DIAS_SEMANA } from "../../lib/types";
import { useActividadesActivas } from "../../lib/queries/actividades";
import { useDiscipulados } from "../../lib/queries/discipulados";
import { useEventosVigentes } from "../../lib/queries/eventos";
import { useDirectorio } from "../../lib/queries/directorio";

function QuickAction({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card className="flex-row items-center gap-3.5 py-4">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-gold-container">
          <Ionicons name={icon} size={20} color={colors.onTertiaryContainer} />
        </View>
        <View className="flex-1">
          <Title className="text-base">{title}</Title>
          <Muted>{subtitle}</Muted>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.outline} />
      </Card>
    </Pressable>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { profile, isAdmin, esObrero } = useAuth();
  const nombre = (profile?.nombre_completo ?? "").split(" ")[0] || "hermano";
  const { width } = useWindowDimensions();

  // Selector de header "Inicio"/"Nosotros": corre el panel activo a la vista
  // en lugar de navegar, para dar sensación de deslizamiento entre secciones.
  const [tab, setTab] = useState<FeedTab>("inicio");
  const translateX = useSharedValue(0);
  const dragStartX = useSharedValue(0);

  // Reanimated corre esto en el hilo de UI: el dedo mueve el panel sin pasar
  // por el puente JS, por eso se siente tan fluido como el tap en la pestaña.
  const settle = (target: number) => {
    "worklet";
    translateX.value = withTiming(target, { duration: 280, easing: Easing.inOut(Easing.cubic) });
  };

  useEffect(() => {
    translateX.value = withTiming(tab === "inicio" ? 0 : -width, {
      duration: 280,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [tab, width, translateX]);

  // Los carruseles (eventos y actividades de hoy) scrollean horizontal dentro de
  // este panel. Sin declarar la relación, el pan gana el gesto y arrastrar entre
  // tarjetas terminaba saltando a "Nosotros": ahora el pan espera a que el
  // carrusel falle —o ni empiece, que es lo que pasa cuando el arrastre nace
  // fuera de él. Cada carrusel necesita su propia instancia de Gesture.Native().
  const carruselEventos = useMemo(() => Gesture.Native(), []);
  const carruselActividades = useMemo(() => Gesture.Native(), []);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .requireExternalGestureToFail(carruselEventos, carruselActividades)
    .onStart(() => {
      dragStartX.value = translateX.value;
    })
    .onUpdate((e) => {
      const next = dragStartX.value + e.translationX;
      translateX.value = Math.min(0, Math.max(-width, next));
    })
    .onEnd((e) => {
      const aNosotros = tab === "inicio" && (e.translationX < -width * 0.25 || e.velocityX < -800);
      const aInicio = tab === "nosotros" && (e.translationX > width * 0.25 || e.velocityX > 800);
      if (aNosotros) {
        runOnJS(setTab)("nosotros");
      } else if (aInicio) {
        runOnJS(setTab)("inicio");
      } else {
        settle(tab === "inicio" ? 0 : -width);
      }
    });

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const { data: discipulados = [] } = useDiscipulados();
  const { data: eventosVigentes = [] } = useEventosVigentes();
  // Solo actividades/anuncios, sin las reuniones de discipulado (igual que el feed).
  const eventos = eventosVigentes.filter((e) => e.tipo !== "discipulado" && !e.discipulado_id);
  const { data: actividades = [] } = useActividadesActivas();
  const { data: directorio = [] } = useDirectorio();

  const hoy = new Date().getDay();
  const proximo = useMemo(() => {
    return [...discipulados]
      .map((d) => ({ ...d, offset: (d.dia_semana - hoy + 7) % 7 }))
      .sort((a, b) => a.offset - b.offset || a.hora_inicio.localeCompare(b.hora_inicio))[0];
  }, [discipulados, hoy]);
  // ¿Hay eventos esta semana / actividades hoy? (para decidir separadores).
  const hayEventos = useMemo(() => eventosDeLaSemana(eventos).length > 0, [eventos]);
  const hayActividadesHoy = useMemo(() => actividadesDeHoy(actividades).length > 0, [actividades]);

  // Cumpleaños de toda la congregación (directorio, visible a todo miembro activo).
  const miembrosCumple = directorio;

  return (
    <View className="flex-1 bg-cream">
      <AppBar activeTab={tab} onTabChange={setTab} />
      <View style={{ flex: 1, overflow: "hidden" }}>
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[{ flex: 1, flexDirection: "row", width: width * 2 }, slideStyle]}
          >
            {/* Panel "Inicio": feed */}
            <ScrollView
              style={{ width }}
              contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Saludo */}
              <View className="mb-6">
                <Display>Paz sea con vosotros, {nombre}.</Display>
                <Body className="mt-2">
                  Bienvenido al panel de gestión de tu congregación.
                </Body>
              </View>

              {/* Próxima actividad destacada */}
              {proximo && (
                <Card className="mb-6 overflow-hidden p-0">
                  <View className="h-28 justify-end bg-navy p-4">
                    <View className="absolute right-4 top-4 opacity-20">
                      <Ionicons name="book" size={72} color={colors.tertiaryDim} />
                    </View>
                    <Chip tone="gold">Tu discipulado</Chip>
                  </View>
                  <View className="p-5">
                    <View className="mb-2 flex-row items-center gap-1.5">
                      <Ionicons name="calendar-outline" size={15} color={colors.tertiary} />
                      <Muted className="text-gold">
                        {DIAS_SEMANA[proximo.dia_semana]}, {formatHora(proximo.hora_inicio)}
                      </Muted>
                    </View>
                    <Title numberOfLines={2} className="text-xl">
                      {proximo.nombre ?? proximo.descripcion_etaria ?? "Discipulado"}
                    </Title>
                    {proximo.ubicacion ? (
                      <Body className="mt-1" numberOfLines={2}>
                        {proximo.ubicacion}
                      </Body>
                    ) : null}
                    <View className="mt-4">
                      <Button
                        title="Ver detalles"
                        onPress={() => router.push(`/discipulado/${proximo.id}`)}
                      />
                    </View>
                  </View>
                </Card>
              )}

              {/* Separador de sección */}
              {proximo && hayEventos && <View className="mb-5 h-px bg-black/10" />}

              {/* Cumpleaños próximos */}
              <CumplesSection miembros={miembrosCumple} titulo="Cumpleaños" className="mb-6" />

              {/* Separador de sección Cumpleaños próximos */}
              {miembrosCumple && <View className="mb-5 h-px bg-black/10" />}

              {/* Actividades semanales que tocan hoy (carrusel) */}
              <ActividadesHoy
                actividades={actividades}
                swipeGesture={carruselActividades}
                className="mb-6"
              />

              {/* Separador entre "hoy" y "esta semana" */}
              {hayActividadesHoy && hayEventos && <View className="mb-5 h-px bg-black/10" />}

              {/* Eventos de la semana (carrusel lunes→domingo) */}
              <EventosSemana
                eventos={eventos}
                swipeGesture={carruselEventos}
                className="mb-6"
              />

              {/* Separador de sección */}
              {proximo && (hayEventos || hayActividadesHoy) && (
                <View className="mb-5 h-px bg-black/10" />
              )}

              {/* Accesos rápidos */}
              <View className="mb-6 gap-3">
                {/* <QuickAction
                  icon="people-circle-outline"
                  title="Directorio"
                  subtitle="Contactos y cumpleaños de la iglesia"
                  onPress={() => router.push("/directorio")}
                /> */}
                {/* Registrar reunión es gestión de grupo (RPC valida es_discipulador_de):
                    solo obrero/admin, nunca un miembro. */}
                {esObrero && (
                  <QuickAction
                    icon="add-circle-outline"
                    title="Registrar reunión"
                    subtitle="Asistencia, ofrenda y tema"
                    onPress={() =>
                      proximo
                        ? router.push({ pathname: "/reunion/nueva", params: { discipuladoId: proximo.id } })
                        : router.push("/(tabs)/discipulado")
                    }
                  />
                )}
                {isAdmin && (
                  <QuickAction
                    icon="megaphone-outline"
                    title="Nueva actividad"
                    subtitle="Programar evento o reunión"
                    onPress={() => router.push("/admin/eventos")}
                  />
                )}
                {isAdmin && (
                  <QuickAction
                    icon="person-add-outline"
                    title="Añadir miembro"
                    subtitle="Registrar nueva persona"
                    onPress={() => router.push("/admin/miembros")}
                  />
                )}
              </View>
            </ScrollView>

            {/* Panel "Nosotros": directorio */}
            <View style={{ width }}>
              <DirectorioList />
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}
