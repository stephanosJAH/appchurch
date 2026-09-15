import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { ActividadesHoy, actividadesDeHoy } from "../../components/ActividadesHoy";
import { AnunciosFeed } from "../../components/AnunciosFeed";
import { AppBar, FeedTab } from "../../components/AppBar";
import { CumplesSection, proximosCumples } from "../../components/Cumples";
import { DirectorioList } from "../../components/Directorio";
import { EventosSemana, eventosDeLaSemana } from "../../components/EventosSemana";
import { UltimaPredicacion } from "../../components/Predicaciones";
import {
  Body,
  Button,
  Card,
  Chip,
  Display,
  Muted,
  SkeletonCard,
  Title,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatHora } from "../../lib/date";
import { saludoDelDia } from "../../lib/saludos";
import { colors } from "../../lib/theme";
import { DIAS_SEMANA } from "../../lib/types";
import { useActividadesActivas } from "../../lib/queries/actividades";
import { useDirectorio } from "../../lib/queries/directorio";
import { useDiscipulados } from "../../lib/queries/discipulados";
import { useEventosVigentes } from "../../lib/queries/eventos";
import { useMiGrupo } from "../../lib/queries/miGrupo";

// Ventana de cumpleaños del feed. La miran dos cosas —la sección y el separador
// que la precede— y tienen que coincidir, si no el separador aparece solo sobre
// una sección que decidió no dibujarse.
const VENTANA_CUMPLES = 30;

// El discipulado propio son dos orígenes distintos —la tabla `discipulados`
// para el que uno lidera y el RPC `mi_grupo` para el que uno cursa como
// discípulo— normalizados acá, igual que en la pestaña "Mi grupo".
type GrupoDelFeed = {
  id: string;
  titulo: string;
  dia_semana: number;
  hora_inicio: string;
  ubicacion: string | null;
  lidero: boolean;
};

function GrupoDestacado({ g, onPress }: { g: GrupoDelFeed; onPress: () => void }) {
  return (
    <Card className="mb-4 overflow-hidden p-0">
      <View className="h-28 justify-end bg-navy p-4">
        <View className="absolute right-4 top-4 opacity-20">
          <Ionicons name="book" size={72} color={colors.tertiaryDim} />
        </View>
        <Chip tone="gold">{g.lidero ? "Tu discipulado" : "Donde participás"}</Chip>
      </View>
      <View className="p-5">
        <View className="mb-2 flex-row items-center gap-1.5">
          <Ionicons name="calendar-outline" size={15} color={colors.tertiary} />
          <Muted className="text-gold">
            {DIAS_SEMANA[g.dia_semana]}, {formatHora(g.hora_inicio)}
          </Muted>
        </View>
        <Title numberOfLines={2} className="text-xl">
          {g.titulo}
        </Title>
        {g.ubicacion ? (
          <Body className="mt-1" numberOfLines={2}>
            {g.ubicacion}
          </Body>
        ) : null}
        <View className="mt-4">
          <Button title="Ver detalles" onPress={onPress} />
        </View>
      </View>
    </Card>
  );
}

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

// Separador entre secciones del feed. Arriba siempre hay algo —el bloque del
// discipulado se dibuja incluso vacío, con su tarjeta explicativa—, así que
// cada separador solo depende de que la sección que sigue tenga contenido.
function Separador() {
  return <View className="mb-5 h-px bg-black/10" />;
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

  // `isLoading` = primera carga sin nada en caché: es lo que enciende los
  // skeletons. Cada sección se destapa por su cuenta al resolver su consulta,
  // no se espera a que estén todas.
  //
  // Lo que lidero: la RLS ya recorta `discipulados` al grupo del obrero, pero
  // al admin le devuelve TODOS —de ahí el filtro por discipulador_id, si no el
  // feed le mostraría el grupo de cualquier otro. Para un `miembro` la consulta
  // ni se dispara (la RLS le devolvería [] igual).
  const { data: discipulados = [], isLoading: cargandoLidero } = useDiscipulados({
    enabled: esObrero,
  });
  // Lo que curso como discípulo: va por RPC porque la RLS de `discipulados`
  // solo deja pasar al líder y al admin (supabase/migrations/0019_mi_grupo.sql).
  const { data: participaciones = [], isLoading: cargandoParticipo } = useMiGrupo();
  const { data: eventosVigentes = [], isLoading: cargandoEventos } = useEventosVigentes();
  // Solo actividades/anuncios, sin las reuniones de discipulado (igual que el feed).
  const eventos = eventosVigentes.filter((e) => e.tipo !== "discipulado" && !e.discipulado_id);
  const { data: actividades = [], isLoading: cargandoActividades } = useActividadesActivas();
  // Cumpleaños de toda la congregación (directorio, visible a todo miembro activo).
  const { data: directorio = [], isLoading: cargandoDirectorio } = useDirectorio();

  // Saludo del día: cambia solo, uno por fecha (ver lib/saludos.ts).
  const saludo = useMemo(() => saludoDelDia(nombre), [nombre]);

  const hoy = new Date().getDay();
  const misGrupos = useMemo<GrupoDelFeed[]>(() => {
    const lidero: GrupoDelFeed[] = discipulados
      .filter((d) => d.discipulador_id === profile?.id)
      .map((d) => ({
        id: d.id,
        titulo: d.nombre ?? d.descripcion_etaria ?? "Discipulado",
        dia_semana: d.dia_semana,
        hora_inicio: d.hora_inicio,
        ubicacion: d.ubicacion,
        lidero: true,
      }));
    // Si además figura como participante de un grupo que lidera, no se repite:
    // manda la tarjeta de gestión.
    const idsLidero = new Set(lidero.map((g) => g.id));
    const participo: GrupoDelFeed[] = participaciones
      .filter((g) => !idsLidero.has(g.id))
      .map((g) => ({
        id: g.id,
        titulo: g.nombre ?? g.descripcion_etaria ?? "Discipulado",
        dia_semana: g.dia_semana,
        hora_inicio: g.hora_inicio,
        ubicacion: g.ubicacion,
        lidero: false,
      }));
    // Primero el que toca antes: el día de la semana más cercano a hoy.
    return [...lidero, ...participo].sort(
      (a, b) =>
        ((a.dia_semana - hoy + 7) % 7) - ((b.dia_semana - hoy + 7) % 7) ||
        a.hora_inicio.localeCompare(b.hora_inicio)
    );
  }, [discipulados, participaciones, profile?.id, hoy]);

  // Con la consulta de líder deshabilitada (miembro) `cargandoLidero` da false.
  const cargando = cargandoLidero || cargandoParticipo;
  // Para "Registrar reunión": el RPC valida es_discipulador_de, así que el
  // acceso rápido apunta al primero que lidera, no a uno donde solo participa.
  const primeroQueLidero = misGrupos.find((g) => g.lidero);

  // ¿Qué secciones van a dibujar algo? Mientras cargan se cuentan como
  // presentes: el separador acompaña al skeleton en vez de aparecer de golpe
  // cuando llegan los datos.
  const hayCumples = useMemo(
    () => cargandoDirectorio || proximosCumples(directorio, VENTANA_CUMPLES).length > 0,
    [cargandoDirectorio, directorio]
  );
  const hayActividadesHoy = useMemo(
    () => cargandoActividades || actividadesDeHoy(actividades).length > 0,
    [cargandoActividades, actividades]
  );
  const hayEventos = useMemo(
    () => cargandoEventos || eventosDeLaSemana(eventos).length > 0,
    [cargandoEventos, eventos]
  );
  const hayAccesos = esObrero || isAdmin;

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
              {/* Saludo del día */}
              <View className="mb-6">
                <Display>{saludo.texto}</Display>
                <View className="mt-2 flex-row items-center gap-1.5">
                  <Ionicons name="book-outline" size={14} color={colors.tertiary} />
                  <Muted className="text-gold">{saludo.cita}</Muted>
                </View>
              </View>

              {/* Anuncios: lo que la iglesia o el ministerio quiere avisar.
                  Va arriba de todo porque es lo más perecedero del feed; la
                  sección se esconde sola cuando no hay ninguno. */}
              <AnunciosFeed className="mb-6" />

              {/* El discipulado propio — con su fantasma mientras carga */}
              {cargando && <SkeletonCard accion="boton" style={{ marginBottom: 24 }} />}

              {!cargando &&
                misGrupos.map((g) => (
                  <GrupoDestacado
                    key={g.id}
                    g={g}
                    onPress={() =>
                      g.lidero
                        ? router.push(`/discipulado/${g.id}`)
                        : router.push({ pathname: "/mi-grupo/[id]", params: { id: g.id } })
                    }
                  />
                ))}

              {/* Sin grupo, el bloque quedaría en blanco: se explica por qué. */}
              {!cargando && misGrupos.length === 0 && (
                <Card className="mb-6">
                  <Title className="text-base">Todavía no estás en un discipulado</Title>
                  <Body className="mt-2">
                    {esObrero
                      ? "No tenés un grupo a cargo ni participás de uno. Pedile a un admin que te asigne el discipulado que liderás."
                      : "Cuando tu discipulador te sume a su grupo vas a ver acá el día, el horario y el lugar de la próxima reunión."}
                  </Body>
                </Card>
              )}

              {/* Cumpleaños próximos de toda la congregación */}
              {hayCumples && <Separador />}
              <CumplesSection
                miembros={directorio}
                titulo="Cumpleaños"
                dentroDe={VENTANA_CUMPLES}
                className="mb-6"
                cargando={cargandoDirectorio}
              />

              {/* Actividades semanales que tocan hoy (carrusel) */}
              {hayActividadesHoy && <Separador />}
              <ActividadesHoy
                actividades={actividades}
                swipeGesture={carruselActividades}
                className="mb-6"
                cargando={cargandoActividades}
              />

              {/* Eventos de la semana (carrusel lunes→domingo) */}
              {hayEventos && <Separador />}
              <EventosSemana
                eventos={eventos}
                swipeGesture={carruselEventos}
                className="mb-6"
                cargando={cargandoEventos}
              />

              {/* Última predicación del canal de YouTube. Es un punto fijo del
                  feed —se dibuja siempre, con datos o sin ellos—, por eso su
                  separador no va condicionado a nada. */}
              <Separador />
              <UltimaPredicacion className="mb-6" />

              {/* Accesos rápidos */}
              {hayAccesos && <Separador />}
              <View className="mb-6 gap-3">
                {/* Registrar reunión es gestión de grupo (el RPC valida
                    es_discipulador_de): solo obrero/admin, nunca un miembro. */}
                {esObrero && (
                  <QuickAction
                    icon="add-circle-outline"
                    title="Registrar reunión"
                    subtitle="Asistencia, ofrenda y tema"
                    onPress={() =>
                      primeroQueLidero
                        ? router.push({
                            pathname: "/reunion/nueva",
                            params: { discipuladoId: primeroQueLidero.id },
                          })
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
