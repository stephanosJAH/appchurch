import { Ionicons } from "@expo/vector-icons";
import { Stack, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Dato } from "../../components/Dato";
import { FondoEncabezado } from "../../components/FondoEncabezado";
import { GrillaAsistencia } from "../../components/GrillaAsistencia";
import { Paneles } from "../../components/Paneles";
import { RichTextView } from "../../components/RichTextView";
import {
  Avatar,
  Body,
  Button,
  Card,
  Chip,
  Label,
  LinkAction,
  Muted,
  Screen,
  Title,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { fechaLabel, formatFechaCorta, formatMoneda, toISODate } from "../../lib/date";
import { useAnuncios } from "../../lib/queries/anuncios";
import {
  useIntegrantesMinisterio,
  useMinisterio,
  useReunionesDeMiMinisterio,
  useReunionesMinisterio,
  useReunionesMinisterioConAsistencia,
  useSoyLiderDe,
} from "../../lib/queries/ministerios";
import { acuarela, cardShadow, colors, fonts } from "../../lib/theme";
import { LiderMinisterio, ReunionDeMiMinisterio, ReunionMinisterio } from "../../lib/types";

// Detalle de un ministerio. La misma pantalla sirve a tres audiencias, y el
// corte NO es el rol (un líder de ministerio puede ser `miembro`):
//
//   * cualquier miembro activo — ve que el ministerio existe, su descripción y
//     quiénes lo lideran. Nada más: el roster es de gestión.
//   * quien participa — suma el historial reducido (fecha, tema y presentes,
//     sin ofrenda ni notas: el corte lo hace el RPC, no esta pantalla) y los
//     anuncios del ministerio.
//   * cualquier líder (o el admin) — suma el roster, el historial completo con
//     ofrendas y los accesos de gestión. TODOS los líderes pueden lo mismo:
//     registrar reuniones, editar las que cargó otro, tocar el roster.
//
// Quién es quién sale de `useSoyLiderDe`, que se resuelve contra el RPC
// `mis_ministerios()` — ver docs/MINISTERIOS.md.
//
// Se ve distinto del discipulado a propósito: portada con la acuarela, hoja
// blanca encima con la foto del ministerio, y el contenido repartido en
// solapas en vez del resumen de una sola tirada. Las solapas siguen el mismo
// corte por audiencia: Integrantes solo para quien gestiona, Reuniones para
// quien gestiona o participa; con una sola solapa no se muestra la barra.

// Alto de la foto por debajo de la barra de estado; la hoja la tapa 28 px.
const ALTO_PORTADA = 200;
const SOLAPA_DE_HOJA = 28;
// Hoja crema con tarjetas blancas y sombra. `Card` es crema (`bg-surface`), así
// que sobre esta hoja desaparece: acá se le pisa el fondo por `style`, que le
// gana al className.
const FONDO_HOJA = colors.background;
const TARJETA = { backgroundColor: colors.surfaceContainerLowest, ...cardShadow };

type Solapa = "inicio" | "integrantes" | "reuniones";

function labelMes(clave: string): string {
  const [y, m] = clave.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

type MesReuniones = { clave: string; total: number; reuniones: ReunionMinisterio[] };

// Botón redondo sobre la foto: la portada no tiene barra de navegación propia.
function BotonFlotante({
  icono,
  label,
  onPress,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
      style={{ backgroundColor: "rgba(251, 249, 248, 0.92)" }}
    >
      <Ionicons name={icono} size={20} color={colors.primary} />
    </Pressable>
  );
}

function BarraSolapas({
  solapas,
  activa,
  onCambiar,
}: {
  solapas: { id: Solapa; titulo: string }[];
  activa: Solapa;
  onCambiar: (s: Solapa) => void;
}) {
  return (
    <View className="mt-5 flex-row border-b border-black/10" accessibilityRole="tablist">
      {solapas.map((s) => {
        const sel = s.id === activa;
        return (
          <Pressable
            key={s.id}
            onPress={() => onCambiar(s.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            className="flex-1 items-center justify-center active:opacity-70"
            style={{
              minHeight: 48,
              marginBottom: -1,
              borderBottomWidth: 3,
              borderBottomColor: sel ? colors.tertiary : "transparent",
            }}
          >
            <Text
              style={{ fontFamily: fonts.sansSemibold }}
              className={`text-[15px] ${sel ? "text-navy" : "text-ink-muted"}`}
            >
              {s.titulo}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Líderes como avatares encimados, alternando dorado y azul; a partir del
// cuarto se resumen en un «+N». Al tocar se despliegan nombre y teléfono de
// cada uno — el teléfono con la regla del directorio (0035).
const LIDERES_VISIBLES = 3;
const TAM_AVATAR_LIDER = 44;

const soloDigitos = (tel: string) => tel.replace(/\D/g, "");

function PilaDeLideres({ lideres }: { lideres: LiderMinisterio[] }) {
  const [abierta, setAbierta] = useState(false);
  // Si sobra uno solo, se muestra en vez de un «+1» que ocupa lo mismo.
  const visibles =
    lideres.length <= LIDERES_VISIBLES + 1 ? lideres : lideres.slice(0, LIDERES_VISIBLES);
  const resto = lideres.length - visibles.length;
  const nombres = lideres.map((l) => l.nombre_completo ?? "Sin nombre").join(", ");

  return (
    <View>
      <Pressable
        onPress={() => setAbierta((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierta }}
        accessibilityLabel={`Líderes: ${nombres}`}
        accessibilityHint={abierta ? "Oculta los contactos" : "Muestra los contactos"}
        hitSlop={6}
        className="flex-row items-center px-1 active:opacity-80"
      >
        {visibles.map((l, i) => (
          <View
            key={l.profile_id}
            style={{
              marginLeft: i === 0 ? 0 : -10,
              borderRadius: TAM_AVATAR_LIDER,
              borderWidth: 3,
              borderColor: FONDO_HOJA,
            }}
          >
            <Avatar
              name={l.nombre_completo}
              size={TAM_AVATAR_LIDER}
              tone={i % 2 === 0 ? "gold" : "navy"}
            />
          </View>
        ))}
        {resto > 0 && (
          <View
            className="items-center justify-center"
            style={{
              marginLeft: -10,
              width: TAM_AVATAR_LIDER + 6,
              height: TAM_AVATAR_LIDER + 6,
              borderRadius: TAM_AVATAR_LIDER,
              borderWidth: 3,
              borderColor: FONDO_HOJA,
              backgroundColor: colors.surfaceContainerHigh,
            }}
          >
            <Text style={{ fontFamily: fonts.sansSemibold }} className="text-sm text-ink">
              +{resto}
            </Text>
          </View>
        )}
        <Ionicons
          name={abierta ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.outline}
          style={{ marginLeft: 8 }}
        />
      </Pressable>

      {abierta && (
        <Card className="mt-3 overflow-hidden p-0" style={TARJETA}>
          {lideres.map((l, i) => (
            <View
              key={l.profile_id}
              className={`flex-row items-center gap-3 px-4 py-3 ${i === 0 ? "" : "border-t border-black/5"}`}
            >
              <Avatar name={l.nombre_completo} size={36} tone={i % 2 === 0 ? "gold" : "navy"} />
              <View className="flex-1">
                <Body className="text-ink" numberOfLines={1}>
                  {l.nombre_completo ?? "Sin nombre"}
                </Body>
                <Muted>{l.telefono ?? "Sin teléfono publicado"}</Muted>
              </View>
              {l.telefono ? (
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() =>
                      Linking.openURL(`https://wa.me/${soloDigitos(l.telefono!)}`).catch(() => {})
                    }
                    hitSlop={6}
                    accessibilityLabel={`WhatsApp a ${l.nombre_completo ?? "líder"}`}
                    className="h-10 w-10 items-center justify-center rounded-full bg-surface-mid active:opacity-70"
                  >
                    <Ionicons name="logo-whatsapp" size={19} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={() => Linking.openURL(`tel:${l.telefono}`).catch(() => {})}
                    hitSlop={6}
                    accessibilityLabel={`Llamar a ${l.nombre_completo ?? "líder"}`}
                    className="h-10 w-10 items-center justify-center rounded-full bg-surface-mid active:opacity-70"
                  >
                    <Ionicons name="call-outline" size={18} color={colors.primary} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

function Encabezado({ titulo, accion, onAccion }: { titulo: string; accion?: string; onAccion?: () => void }) {
  return (
    <View className="mb-2 mt-6 flex-row items-end justify-between px-1">
      <Label>{titulo}</Label>
      {accion ? <LinkAction title={accion} onPress={onAccion} /> : null}
    </View>
  );
}

// Reunión vista por un participante: fecha y tema siempre, presentes al tocar.
// Espejo de la tarjeta de components/MiGrupo.tsx.
function ReunionParticipanteCard({
  r,
  abiertaPorDefecto,
}: {
  r: ReunionDeMiMinisterio;
  abiertaPorDefecto: boolean;
}) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  const n = r.participantes.length;

  return (
    <Card className="overflow-hidden p-0" style={TARJETA}>
      <Pressable
        onPress={() => setAbierta((v) => !v)}
        className="flex-row items-center gap-3 p-4 active:opacity-80"
      >
        <View className="flex-1">
          <Muted className="capitalize text-gold">{fechaLabel(r.fecha)}</Muted>
          <Body className="mt-0.5 text-ink" numberOfLines={abierta ? undefined : 2}>
            {r.tema ?? "Sin tema registrado"}
          </Body>
          <View className="mt-1.5 flex-row items-center gap-1.5">
            <Ionicons name="people-outline" size={13} color={colors.outline} />
            <Muted>
              {n} {n === 1 ? "participante" : "participantes"}
            </Muted>
          </View>
        </View>
        <Ionicons name={abierta ? "chevron-up" : "chevron-down"} size={18} color={colors.outline} />
      </Pressable>

      {abierta && (
        <View className="border-t border-black/10 px-4 py-3">
          {n === 0 ? (
            <Muted>No se registró asistencia en esta reunión.</Muted>
          ) : (
            <View className="gap-2.5">
              {r.participantes.map((nombre, i) => (
                <View key={`${nombre}-${i}`} className="flex-row items-center gap-2.5">
                  <Avatar name={nombre} size={28} tone="gold" />
                  <Body className="flex-1 text-ink" numberOfLines={1}>
                    {nombre}
                  </Body>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

export default function MinisterioDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const enFoco = useIsFocused();
  const ministerioId = String(id);
  const { isAdmin } = useAuth();

  const { data: ministerio, isLoading } = useMinisterio(ministerioId);
  const { soyLider, participo, isLoading: cargandoPertenencia } = useSoyLiderDe(ministerioId);
  const puedeGestionar = isAdmin || soyLider;

  // Roster y historial completo: solo para quien gestiona. `enabled` evita
  // disparar una RPC que va a contestar "no autorizado".
  const { data: integrantes = [] } = useIntegrantesMinisterio(ministerioId, puedeGestionar);
  const { data: reuniones = [] } = useReunionesMinisterio(ministerioId, puedeGestionar);
  // Las mismas reuniones con quién vino, para la grilla de la solapa Integrantes.
  const { data: reunionesConAsistencia = [] } = useReunionesMinisterioConAsistencia(
    ministerioId,
    puedeGestionar
  );
  // Historial reducido: para el participante que no lidera.
  const { data: reunionesParticipante = [] } = useReunionesDeMiMinisterio(
    ministerioId,
    participo && !puedeGestionar
  );
  const { data: anuncios = [] } = useAnuncios();

  const anunciosDelMinisterio = useMemo(
    () => anuncios.filter((a) => a.ministerio_id === ministerioId).slice(0, 3),
    [anuncios, ministerioId]
  );

  const activos = integrantes.filter((i) => i.activo);

  // Historial agrupado por mes (más reciente primero), como el desglose de
  // ofrendas y el detalle de discipulado.
  const meses = useMemo(() => {
    const mapa = new Map<string, MesReuniones>();
    for (const r of reuniones) {
      const clave = r.fecha.slice(0, 7); // "YYYY-MM"
      const g = mapa.get(clave) ?? { clave, total: 0, reuniones: [] };
      g.total += Number(r.ofrenda_total ?? 0);
      g.reuniones.push(r);
      mapa.set(clave, g);
    }
    return [...mapa.values()].sort((a, b) => b.clave.localeCompare(a.clave));
  }, [reuniones]);

  const [mesesAbiertos, setMesesAbiertos] = useState<Record<string, boolean>>({});
  const mesAbierto = (clave: string, idx: number) => mesesAbiertos[clave] ?? idx === 0;
  const toggleMes = (clave: string, idx: number) =>
    setMesesAbiertos((p) => ({ ...p, [clave]: !mesAbierto(clave, idx) }));

  const solapas = useMemo(() => {
    const s: { id: Solapa; titulo: string }[] = [{ id: "inicio", titulo: "Inicio" }];
    if (puedeGestionar) s.push({ id: "integrantes", titulo: "Integrantes" });
    if (puedeGestionar || participo) s.push({ id: "reuniones", titulo: "Reuniones" });
    return s;
  }, [puedeGestionar, participo]);
  const [solapaElegida, setSolapa] = useState<Solapa>("inicio");
  // Si la pertenencia cambia y la solapa elegida deja de estar, vuelve a Inicio.
  const solapa = solapas.some((s) => s.id === solapaElegida) ? solapaElegida : "inicio";
  // Las solapas se cambian con el tap en la barra o deslizando, como
  // "Eventos y actividades" (<Paneles>).
  const onIndexChange = useCallback(
    (i: number) => setSolapa(solapas[i]?.id ?? "inicio"),
    [solapas]
  );
  // El carrusel de anuncios scrollea horizontal dentro de Inicio: <Paneles>
  // tiene que conocerlo para cederle el gesto. Arreglo estable, ver Paneles.
  const carruseles = useMemo(() => [Gesture.Native()], []);
  const [carruselAnuncios] = carruseles;

  // Sin barra de navegación propia: la portada llega hasta arriba y los botones
  // flotan sobre la foto. La barra de estado pasa a clara solo mientras esta
  // pantalla está al frente (ver discipulado/[id].tsx), y solo con la foto ya
  // puesta: mientras carga, abajo está la crema del fondo.
  const encabezado = (
    <>
      <Stack.Screen
        options={{
          headerTransparent: true,
          // El layout raíz pinta el header de blanco para todas las pantallas;
          // sin pisarlo, el header transparente igual tapa la portada.
          headerStyle: { backgroundColor: "transparent" },
          headerTitle: "",
          headerShadowVisible: false,
          headerBackVisible: false,
          headerLeft: () => (
            <BotonFlotante icono="chevron-back" label="Volver" onPress={() => router.back()} />
          ),
          headerRight: puedeGestionar
            ? () => (
                <BotonFlotante
                  icono="create-outline"
                  label="Editar ministerio"
                  onPress={() =>
                    router.push({ pathname: "/ministerio/editar", params: { id: ministerioId } })
                  }
                />
              )
            : undefined,
        }}
      />
      {enFoco && <StatusBar style={ministerio ? "light" : "dark"} />}
    </>
  );

  if (isLoading || cargandoPertenencia || !ministerio) {
    return (
      <Screen>
        {encabezado}
        <View className="flex-1 items-center justify-center p-8">
          {isLoading || cargandoPertenencia ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Muted className="text-center">
              No encontramos este ministerio. Puede que lo hayan dado de baja.
            </Muted>
          )}
        </View>
      </Screen>
    );
  }

  const lideres = ministerio.lideres ?? [];
  // Vienen ordenadas por fecha, la más reciente primero.
  const ultima = reuniones[0];
  const delMes = meses.find((m) => m.clave === toISODate(new Date()).slice(0, 7));
  const nombreMes = new Date().toLocaleDateString("es-AR", { month: "long" });

  return (
    <Screen>
      {encabezado}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* En iOS el rebote de arriba destapa lo que hay detrás de la portada:
            que siga siendo medianoche y no la crema del fondo. */}
        <View
          style={{
            position: "absolute",
            top: -1000,
            left: 0,
            right: 0,
            height: 1000,
            backgroundColor: acuarela.medianoche,
          }}
        />

        {/* La portada es siempre la acuarela: la imagen propia del ministerio
            va en la foto de la hoja, no de fondo. */}
        <FondoEncabezado velo={false}>
          <View style={{ height: insets.top + ALTO_PORTADA + SOLAPA_DE_HOJA }} />
        </FondoEncabezado>

        {/* La hoja va de borde a borde (sin `px-5`): <Paneles> mide el ancho de
            la pantalla, así que el margen lo pone cada bloque adentro. */}
        <View
          className="flex-1"
          style={{
            marginTop: -SOLAPA_DE_HOJA,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            backgroundColor: FONDO_HOJA,
            paddingBottom: insets.bottom + 32,
          }}
        >
          <View className="px-5">
          {/* Foto del ministerio: la sube un líder desde «Editar». Sin ella, la
              inicial del nombre. El borde del color de la hoja la despega de la
              portada. La imagen no se recorta al subirla: `cover` toma el
              centro, que en un cuadrado es lo que se ve. */}
          <View
            className="items-center justify-center overflow-hidden"
            style={{
              marginTop: -40,
              width: 84,
              height: 84,
              borderRadius: 24,
              borderWidth: 4,
              borderColor: FONDO_HOJA,
              backgroundColor: colors.primary,
            }}
          >
            {ministerio.imagen_url ? (
              <Image
                source={{ uri: ministerio.imagen_url }}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <Text
                style={{ fontFamily: fonts.serifBold, fontSize: 34, lineHeight: 40 }}
                className="text-gold-dim"
              >
                {ministerio.nombre.charAt(0).toUpperCase()}
              </Text>
            )}
          </View>

          <Text
            style={{ fontFamily: fonts.serifBold, fontSize: 30, lineHeight: 36 }}
            className="mt-3 text-navy"
          >
            {ministerio.nombre}
          </Text>

          {(soyLider || participo || puedeGestionar) && (
            <View className="mt-3 flex-row flex-wrap gap-2">
              {soyLider ? (
                <Chip tone="gold">Liderás este ministerio</Chip>
              ) : participo ? (
                <Chip tone="gold">Participás</Chip>
              ) : null}
              {puedeGestionar && (
                <Chip tone="neutral">
                  {activos.length} {activos.length === 1 ? "integrante" : "integrantes"}
                </Chip>
              )}
              {puedeGestionar && ministerio.activo === false && (
                <Chip tone="danger">Dado de baja</Chip>
              )}
            </View>
          )}

          {solapas.length > 1 && (
            <BarraSolapas solapas={solapas} activa={solapa} onCambiar={setSolapa} />
          )}
          </View>

          {/* Un hijo por solapa, en el mismo orden que `solapas`: los que no
              corresponden a esta audiencia quedan en `false` y Paneles los
              descarta. */}
          <Paneles
            index={Math.max(solapas.findIndex((s) => s.id === solapa), 0)}
            onIndexChange={onIndexChange}
            carruseles={carruseles}
            altoVariable
          >
          {/* ====================== Inicio ====================== */}
            <View className={solapas.length > 1 ? "px-5" : "mt-2 px-5"}>
              {/* Un ministerio no tiene día fijo: en lugar de la próxima
                  reunión, la última que se cargó. */}
              {puedeGestionar && (
                <View
                  style={{ backgroundColor: colors.primary, borderRadius: 18 }}
                  className="mt-5 flex-row items-center gap-3 py-3.5 pl-4 pr-3.5"
                >
                  <View className="flex-1">
                    <Text
                      style={{ fontFamily: fonts.sansSemibold, letterSpacing: 1 }}
                      className="text-[11px] uppercase text-navy-soft"
                    >
                      {ultima ? `Última reunión · ${formatFechaCorta(ultima.fecha)}` : "Última reunión"}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: fonts.sansSemibold }}
                      className="mt-0.5 text-base text-white"
                    >
                      {ultima ? ultima.tema || "Sin tema" : "Sin reuniones"}
                    </Text>
                    <Text style={{ fontFamily: fonts.sans }} className="text-[13px] text-navy-soft">
                      {ultima
                        ? `${delMes?.reuniones.length ?? 0} en ${nombreMes}`
                        : "Registrá la primera"}
                    </Text>
                  </View>
                  <Button
                    title="Registrar"
                    variant="goldContainer"
                    size="sm"
                    hitSlop={8}
                    onPress={() =>
                      router.push({
                        pathname: "/reunion/nueva",
                        params: { origen: "ministerio", ministerioId },
                      })
                    }
                  />
                </View>
              )}

              {ministerio.descripcion ? (
                <Card className="mt-5" style={TARJETA}>
                  <RichTextView descripcion={ministerio.descripcion} />
                </Card>
              ) : null}

              <Encabezado
                titulo={
                  lideres.length === 1 ? "Lo lidera" : `Lo lideran (${lideres.length})`
                }
              />
              {lideres.length === 0 ? (
                <Card style={TARJETA}>
                  <Muted>Sin líderes asignados todavía.</Muted>
                </Card>
              ) : (
                <PilaDeLideres lideres={lideres} />
              )}

              {(participo || puedeGestionar) && (
                <>
                  <Encabezado
                    titulo="Anuncios"
                    accion={puedeGestionar ? "+ Publicar" : undefined}
                    onAccion={() =>
                      router.push({ pathname: "/anuncios", params: { ministerioId } })
                    }
                  />
                  {anunciosDelMinisterio.length === 0 ? (
                    <Card style={TARJETA}>
                      <Muted>
                        {puedeGestionar
                          ? "Todavía no publicaste nada. Los anuncios les llegan a los integrantes del ministerio."
                          : "Todavía no hay anuncios de este ministerio."}
                      </Muted>
                    </Card>
                  ) : (
                    // Carrusel a lo ancho: se sale del margen de la hoja para que
                    // la tarjeta cortada a la derecha avise que hay más.
                    <GestureDetector gesture={carruselAnuncios}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      className="-mx-5"
                      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 2, paddingBottom: 12, gap: 10 }}
                    >
                      {anunciosDelMinisterio.map((a) => (
                        <Pressable
                          key={a.id}
                          onPress={() => router.push("/anuncios")}
                          className="active:opacity-80"
                        >
                          <Card className="px-4 py-3.5" style={[TARJETA, { width: 240 }]}>
                            <Text
                              style={{ fontFamily: fonts.sansBold, letterSpacing: 1 }}
                              className={`text-xs uppercase ${a.fijado ? "text-gold" : "text-ink-muted"}`}
                            >
                              {a.fijado ? "Fijado" : formatFechaCorta(a.created_at.slice(0, 10))}
                            </Text>
                            <Title className="mt-1 text-[17px]" numberOfLines={2}>
                              {a.titulo}
                            </Title>
                            {a.fijado ? (
                              <Muted className="mt-1">
                                {formatFechaCorta(a.created_at.slice(0, 10))}
                              </Muted>
                            ) : null}
                          </Card>
                        </Pressable>
                      ))}
                    </ScrollView>
                    </GestureDetector>
                  )}
                </>
              )}

              {!participo && !puedeGestionar && (
                <Card className="mt-6" style={TARJETA}>
                  <Muted>
                    No participás de este ministerio. Si querés sumarte, hablá con alguno de
                    sus líderes.
                  </Muted>
                </Card>
              )}
            </View>

          {/* ==================== Integrantes ==================== */}
          {puedeGestionar && (
            <View className="px-5">
              <Encabezado
                titulo={`${activos.length} ${activos.length === 1 ? "activo" : "activos"}`}
                accion="Gestionar"
                onAccion={() =>
                  router.push({ pathname: "/ministerio/integrantes", params: { id: ministerioId } })
                }
              />
              {activos.length === 0 ? (
                <Card style={TARJETA}>
                  <Muted>
                    Todavía no hay nadie en este ministerio. Sumá gente desde
                    «Gestionar».
                  </Muted>
                </Card>
              ) : (
                <GrillaAsistencia
                  style={TARJETA}
                  reuniones={reunionesConAsistencia}
                  encabezado="Integrante"
                  filas={activos.map((i) => ({
                    key: i.miembro_id,
                    miembroId: i.miembro_id,
                    nombre: i.nombre,
                    apellido: i.apellido,
                  }))}
                  // La ficha completa solo la lee el admin (RLS de `miembros`,
                  // 0014); a un líder `miembro` lo llevaría a una pantalla vacía.
                  onPress={
                    isAdmin
                      ? (f) => router.push({ pathname: "/miembro/[id]", params: { id: f.miembroId } })
                      : undefined
                  }
                />
              )}
            </View>
          )}

          {/* ===================== Reuniones ===================== */}
          {(puedeGestionar || participo) && (
            <View className="px-5">
            {puedeGestionar ? (
              <View>
                <View className="mt-5 flex-row gap-2.5">
                  <Dato
                    valor={String(delMes?.reuniones.length ?? 0)}
                    titulo={delMes?.reuniones.length === 1 ? "Reunión" : "Reuniones"}
                    detalle={nombreMes}
                  />
                  <Dato valor={formatMoneda(delMes?.total ?? 0)} titulo="Ofrenda" detalle={nombreMes} />
                </View>

                <Encabezado titulo="Historial" />
                {meses.length === 0 ? (
                  <Card style={TARJETA}>
                    <Muted>Sin reuniones registradas.</Muted>
                  </Card>
                ) : (
                  <View className="gap-3">
                    {meses.map((mes, idx) => {
                      const abierto = mesAbierto(mes.clave, idx);
                      return (
                        <Card key={mes.clave} className="overflow-hidden p-0" style={TARJETA}>
                          <Pressable
                            onPress={() => toggleMes(mes.clave, idx)}
                            className="flex-row items-center gap-3 p-4 active:opacity-80"
                          >
                            <View className="flex-1">
                              <Title className="text-base capitalize">{labelMes(mes.clave)}</Title>
                              <Muted>
                                {mes.reuniones.length}{" "}
                                {mes.reuniones.length === 1 ? "reunión" : "reuniones"}
                              </Muted>
                            </View>
                            <Title className="text-base text-gold">{formatMoneda(mes.total)}</Title>
                            <Ionicons
                              name={abierto ? "chevron-up" : "chevron-down"}
                              size={18}
                              color={colors.outline}
                            />
                          </Pressable>

                          {abierto && (
                            <View className="border-t border-black/10">
                              {mes.reuniones.map((r) => (
                                <Pressable
                                  key={r.id}
                                  onPress={() =>
                                    router.push({
                                      pathname: "/reunion/[id]",
                                      params: { id: r.id, origen: "ministerio" },
                                    })
                                  }
                                  className="border-b border-black/5 px-4 py-3 active:opacity-80"
                                >
                                  <View className="flex-row items-center gap-3">
                                    <View className="flex-1">
                                      <Body className="text-ink">{formatFechaCorta(r.fecha)}</Body>
                                      {r.tema ? <Muted numberOfLines={1}>{r.tema}</Muted> : null}
                                    </View>
                                    <Chip tone="success">{formatMoneda(r.ofrenda_total)}</Chip>
                                    <Ionicons name="chevron-forward" size={16} color={colors.outline} />
                                  </View>
                                </Pressable>
                              ))}
                            </View>
                          )}
                        </Card>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : (
              <View>
                <Encabezado titulo={`Reuniones · ${reunionesParticipante.length}`} />
                {reunionesParticipante.length === 0 ? (
                  <Card style={TARJETA}>
                    <Muted>Todavía no hay reuniones registradas en este ministerio.</Muted>
                  </Card>
                ) : (
                  <View className="gap-3">
                    {reunionesParticipante.map((r, i) => (
                      <ReunionParticipanteCard key={r.id} r={r} abiertaPorDefecto={i === 0} />
                    ))}
                  </View>
                )}
              </View>
            )}
            </View>
          )}
          </Paneles>
        </View>
      </ScrollView>
    </Screen>
  );
}
