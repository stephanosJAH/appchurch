import { Ionicons } from "@expo/vector-icons";
import { Stack, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PropsWithChildren, useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FechaBloque } from "../../components/FechaBloque";
import {
  Avatar,
  Body,
  Button,
  Card,
  Label,
  LinkAction,
  Muted,
  Screen,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import {
  addDays,
  calcularEdad,
  diasHastaCumple,
  formatCumple,
  formatFechaCorta,
  formatHora,
  formatMoneda,
  proximaOcurrencia,
  toISODate,
} from "../../lib/date";
import { cardShadow, colors, fonts } from "../../lib/theme";
import { DIAS_SEMANA, Modalidad, Participacion, SexoDiscipulado } from "../../lib/types";
import { useDiscipulado } from "../../lib/queries/discipulados";
import { nombreDePerfil } from "../../lib/queries/profiles";
import { useParticipaciones } from "../../lib/queries/participaciones";
import { ReunionConAsistencia, useReunionesConAsistencia } from "../../lib/queries/reuniones";

// Resumen del grupo para quien lo lidera: la próxima reunión, tres números y
// lo que conviene mirar (faltas seguidas, cumpleaños). Las listas completas
// viven aparte, a un toque: discipulos.tsx (alta y baja) e historial.tsx.

// Cuántas reuniones seguidas sin venir disparan el aviso.
const FALTAS_PARA_AVISAR = 3;
// El promedio de asistencia mira las últimas N reuniones (un mes, más o menos).
const REUNIONES_DEL_PROMEDIO = 4;
// Se avisan los cumpleaños de la semana que viene.
const DIAS_AVISO_CUMPLE = 7;
// Discípulos a la vista antes de "Ver todos": dos filas de cinco.
const DISCIPULOS_A_LA_VISTA = 10;

const SEXO_LABEL: Record<SexoDiscipulado, string> = {
  M: "Varones",
  F: "Mujeres",
  mixto: "Mixto",
};
const MODALIDAD_LABEL: Record<Modalidad, string> = {
  presencial: "Presencial",
  virtual: "Virtual",
  ambos: "Presencial y virtual",
};

const MS_POR_DIA = 86400000;

function hoySinHora(): Date {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth(), h.getDate());
}

function nombreCompleto(p: Participacion): string {
  return `${p.miembro?.nombre ?? ""} ${p.miembro?.apellido ?? ""}`.trim() || "Sin nombre";
}

// Próxima reunión según el día fijo del grupo. Si la de hoy ya está cargada,
// la próxima es la de la semana que viene.
function proximaReunion(diaSemana: number, reuniones: ReunionConAsistencia[]) {
  const hoy = hoySinHora();
  let fecha = proximaOcurrencia([diaSemana], hoy) ?? hoy;
  if (reuniones.some((r) => r.fecha === toISODate(fecha))) fecha = addDays(fecha, 7);
  const dias = Math.round((fecha.getTime() - hoy.getTime()) / MS_POR_DIA);
  const mes = fecha.toLocaleDateString("es-AR", { month: "long" });
  return {
    titulo: `${DIAS_SEMANA[fecha.getDay()]} ${fecha.getDate()} de ${mes}`,
    cuando: dias === 0 ? "Hoy" : dias === 1 ? "Mañana" : `En ${dias} días`,
  };
}

// Promedio de asistencia de las últimas reuniones y ofrenda del mes en curso.
function resumen(reuniones: ReunionConAsistencia[]) {
  const recientes = reuniones.slice(0, REUNIONES_DEL_PROMEDIO);
  const filas = recientes.flatMap((r) => r.asistencias);
  const asistencia = filas.length
    ? Math.round((100 * filas.filter((a) => a.presente).length) / filas.length)
    : null;
  const mes = toISODate(new Date()).slice(0, 7); // "YYYY-MM"
  const ofrendaMes = reuniones
    .filter((r) => r.fecha.startsWith(mes))
    .reduce((total, r) => total + Number(r.ofrenda_total ?? 0), 0);
  return { asistencia, reunionesDelPromedio: recientes.length, ofrendaMes };
}

type Aviso = {
  key: string;
  miembroId: string;
  tipo: "faltas" | "cumple";
  titulo: string;
  detalle: string;
  orden: number;
};

// Lo que el líder tendría que mirar hoy: quién viene faltando seguido y quién
// cumple años esta semana. Primero las faltas (las más largas arriba), después
// los cumpleaños por cercanía.
function avisosDelGrupo(
  participaciones: Participacion[],
  reuniones: ReunionConAsistencia[]
): Aviso[] {
  const hoy = hoySinHora();
  const avisos: Aviso[] = [];
  for (const p of participaciones) {
    const nombre = nombreCompleto(p);

    // Faltas seguidas, de la reunión más reciente hacia atrás. Se corta en la
    // primera a la que vino o en la primera donde no figura: ahí todavía no
    // era del grupo, y eso no es una falta.
    let faltas = 0;
    for (const r of reuniones) {
      const a = r.asistencias.find((x) => x.miembro_id === p.miembro_id);
      if (!a || a.presente) break;
      faltas++;
    }
    if (faltas >= FALTAS_PARA_AVISAR) {
      const ultimaVez = reuniones.find((r) =>
        r.asistencias.some((x) => x.miembro_id === p.miembro_id && x.presente)
      );
      avisos.push({
        key: `faltas-${p.id}`,
        miembroId: p.miembro_id,
        tipo: "faltas",
        titulo: `${nombre} faltó a las últimas ${faltas} reuniones`,
        detalle: ultimaVez
          ? `Vino por última vez el ${formatFechaCorta(ultimaVez.fecha)}`
          : "Todavía no vino a ninguna reunión",
        orden: -faltas,
      });
    }

    const nacimiento = p.miembro?.fecha_nacimiento;
    const dias = diasHastaCumple(nacimiento);
    if (dias != null && dias <= DIAS_AVISO_CUMPLE) {
      // El mismo día del cumpleaños `calcularEdad` ya devuelve la edad nueva.
      const edad = calcularEdad(nacimiento);
      const anios = edad == null ? "" : ` ${dias === 0 ? edad : edad + 1}`;
      const cuando =
        dias === 0
          ? "hoy"
          : dias === 1
            ? "mañana"
            : dias < 7
              ? `el ${DIAS_SEMANA[addDays(hoy, dias).getDay()].toLowerCase()}`
              : "en una semana";
      avisos.push({
        key: `cumple-${p.id}`,
        miembroId: p.miembro_id,
        tipo: "cumple",
        titulo: `${nombre} cumple${anios} ${cuando}`,
        detalle: formatCumple(nacimiento) ?? "",
        orden: 100 + dias,
      });
    }
  }
  return avisos.sort((a, b) => a.orden - b.orden);
}

function Seccion({
  titulo,
  accion,
  onAccion,
  children,
}: PropsWithChildren<{ titulo: string; accion?: string; onAccion?: () => void }>) {
  return (
    <View>
      <View className="mb-2 flex-row items-end justify-between px-1">
        <Label>{titulo}</Label>
        {accion ? <LinkAction title={accion} onPress={onAccion} /> : null}
      </View>
      {children}
    </View>
  );
}

// Tarjeta de un número del resumen. `adjustsFontSizeToFit`: una ofrenda de
// siete cifras tiene que entrar en un tercio de pantalla.
function Dato({ valor, titulo, detalle }: { valor: string; titulo: string; detalle: string }) {
  return (
    <Card className="flex-1 px-3 py-3.5" style={cardShadow}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontFamily: fonts.serifBold, fontSize: 22, lineHeight: 28 }}
        className="text-navy"
      >
        {valor}
      </Text>
      <Text style={{ fontFamily: fonts.sans }} className="text-[13px] text-ink-variant">
        {titulo}
      </Text>
      <Text numberOfLines={1} style={{ fontFamily: fonts.sans }} className="text-xs text-ink-muted">
        {detalle}
      </Text>
    </Card>
  );
}

function AvisoFila({ aviso, primero, onPress }: { aviso: Aviso; primero: boolean; onPress: () => void }) {
  const cumple = aviso.tipo === "cumple";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className={`flex-row items-center gap-3 px-4 py-3.5 active:opacity-80 ${
        primero ? "" : "border-t border-black/5"
      }`}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: cumple ? "#f3e0e7" : colors.tertiaryContainer }}
      >
        <Ionicons
          name={cumple ? "gift-outline" : "alert-circle-outline"}
          size={20}
          color={cumple ? colors.cumple : colors.onTertiaryContainer}
        />
      </View>
      <View className="flex-1">
        <Body className="text-ink">{aviso.titulo}</Body>
        {aviso.detalle ? <Muted>{aviso.detalle}</Muted> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.outline} />
    </Pressable>
  );
}

export default function DiscipuladoResumen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const enFoco = useIsFocused();
  const { isAdmin, profile } = useAuth();
  const discipuladoId = String(id);

  const { data: discipulado, isPending } = useDiscipulado(discipuladoId);
  // Puede gestionar el grupo el admin o el discipulador a cargo del mismo.
  const canManage = isAdmin || (!!profile && profile.id === discipulado?.discipulador_id);
  const { data: participaciones = [] } = useParticipaciones(discipuladoId);
  const { data: reuniones = [], isPending: cargandoReuniones } =
    useReunionesConAsistencia(discipuladoId);

  const avisos = useMemo(
    () => avisosDelGrupo(participaciones, reuniones),
    [participaciones, reuniones]
  );
  const datos = useMemo(() => resumen(reuniones), [reuniones]);

  const irAMiembro = (miembroId: string) =>
    router.push({ pathname: "/miembro/[id]", params: { id: miembroId } });
  const irADiscipulos = (agregar = false) =>
    router.push({
      pathname: "/discipulado/discipulos",
      params: agregar ? { id: discipuladoId, agregar: "1" } : { id: discipuladoId },
    });

  // Encabezado navy, continuo con el bloque de arriba. La barra de estado pasa
  // a clara solo mientras esta pantalla está al frente: montada fuera de foco
  // le ganaría a la del layout raíz también en las pantallas que se abren
  // encima, que tienen encabezado blanco.
  const encabezado = (
    <>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.onPrimary,
          headerTitleStyle: { color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 16 },
          headerRight: canManage
            ? () => (
                <Pressable
                  onPress={() =>
                    router.push({ pathname: "/discipulado/editar", params: { id: discipuladoId } })
                  }
                  className="active:opacity-60"
                  hitSlop={12}
                  accessibilityLabel="Editar discipulado"
                >
                  <Ionicons name="create-outline" size={22} color={colors.onPrimary} />
                </Pressable>
              )
            : undefined,
        }}
      />
      {enFoco && <StatusBar style="light" />}
    </>
  );

  if (!discipulado) {
    return (
      <Screen>
        {encabezado}
        <View className="flex-1 items-center justify-center p-6">
          {isPending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Muted>No se pudo cargar este discipulado.</Muted>
          )}
        </View>
      </Screen>
    );
  }

  const proxima = proximaReunion(discipulado.dia_semana, reuniones);
  const titulo = discipulado.nombre ?? discipulado.descripcion_etaria ?? "Discipulado";
  const horario = `${DIAS_SEMANA[discipulado.dia_semana]} · ${formatHora(discipulado.hora_inicio)}${
    discipulado.hora_fin ? `–${formatHora(discipulado.hora_fin)}` : ""
  }`;
  const subtitulo = [
    nombreDePerfil(discipulado.discipulador) ?? "Sin discipulador asignado",
    MODALIDAD_LABEL[discipulado.modalidad],
    SEXO_LABEL[discipulado.sexo],
  ].join(" · ");
  // Con el "Agregar" en la grilla entra un discípulo menos.
  const visibles = participaciones.slice(
    0,
    canManage ? DISCIPULOS_A_LA_VISTA - 1 : DISCIPULOS_A_LA_VISTA
  );
  const ultimas = reuniones.slice(0, 3);
  const nombreMes = new Date().toLocaleDateString("es-AR", { month: "long" });

  return (
    <Screen>
      {encabezado}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      >
        {/* En iOS el rebote de arriba destapa lo que hay detrás del bloque navy:
            que siga siendo navy y no la crema del fondo. */}
        <View
          style={{
            position: "absolute",
            top: -1000,
            left: 0,
            right: 0,
            height: 1000,
            backgroundColor: colors.primary,
          }}
        />

        <View className="bg-navy px-5 pt-1" style={{ paddingBottom: 76 }}>
          <Text
            style={{ fontFamily: fonts.sansSemibold, letterSpacing: 1 }}
            className="text-xs uppercase text-gold-dim"
          >
            {horario}
          </Text>
          <Text
            style={{ fontFamily: fonts.serifSemibold, fontSize: 28, lineHeight: 34 }}
            className="mt-1.5 text-white"
          >
            {titulo}
          </Text>
          <Text style={{ fontFamily: fonts.sans }} className="mt-1 text-[15px] text-navy-soft">
            {subtitulo}
          </Text>

          <View className="mt-5 flex-row items-center gap-3 rounded-[14px] bg-navy-container py-3.5 pl-4 pr-3.5">
            <View className="flex-1">
              <Text
                style={{ fontFamily: fonts.sansSemibold, letterSpacing: 1 }}
                className="text-[11px] uppercase text-navy-on"
              >
                Próxima reunión
              </Text>
              <Text style={{ fontFamily: fonts.sansSemibold }} className="mt-0.5 text-base text-white">
                {proxima.titulo}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontFamily: fonts.sans }}
                className="text-[13px] text-navy-soft"
              >
                {proxima.cuando}
                {discipulado.ubicacion ? ` · ${discipulado.ubicacion}` : ""}
              </Text>
            </View>
            <Button
              title="Registrar"
              variant="goldContainer"
              size="sm"
              hitSlop={8}
              onPress={() =>
                router.push({ pathname: "/reunion/nueva", params: { discipuladoId } })
              }
            />
          </View>
        </View>

        <View className="flex-row gap-2.5 px-4" style={{ marginTop: -52 }}>
          <Dato
            valor={String(participaciones.length)}
            titulo={participaciones.length === 1 ? "Discípulo" : "Discípulos"}
            detalle="activos"
          />
          <Dato
            valor={cargandoReuniones || datos.asistencia == null ? "—" : `${datos.asistencia}%`}
            titulo="Asistencia"
            detalle={
              datos.reunionesDelPromedio === 0
                ? "sin reuniones"
                : datos.reunionesDelPromedio === 1
                  ? "última reunión"
                  : `últimas ${datos.reunionesDelPromedio}`
            }
          />
          <Dato
            valor={cargandoReuniones ? "—" : formatMoneda(datos.ofrendaMes)}
            titulo="Ofrenda"
            detalle={nombreMes}
          />
        </View>

        <View className="gap-6 px-4 pt-6">
          {avisos.length > 0 && (
            <Seccion titulo="Para tener en cuenta">
              <Card className="overflow-hidden p-0">
                {avisos.map((a, i) => (
                  <AvisoFila
                    key={a.key}
                    aviso={a}
                    primero={i === 0}
                    onPress={() => irAMiembro(a.miembroId)}
                  />
                ))}
              </Card>
            </Seccion>
          )}

          <Seccion
            titulo={`Discípulos · ${participaciones.length}`}
            accion="Ver todos"
            onAccion={() => irADiscipulos()}
          >
            <Card className="flex-row flex-wrap px-3 py-4" style={{ rowGap: 16 }}>
              {participaciones.length === 0 && !canManage ? (
                <Muted className="px-2">Todavía no hay discípulos en este grupo.</Muted>
              ) : null}
              {visibles.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => irAMiembro(p.miembro_id)}
                  accessibilityRole="button"
                  accessibilityLabel={nombreCompleto(p)}
                  className="w-1/5 items-center active:opacity-70"
                >
                  <Avatar name={p.miembro?.nombre} size={44} tone="gold" />
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: fonts.sans }}
                    className="mt-1.5 px-0.5 text-[13px] text-ink"
                  >
                    {(p.miembro?.nombre ?? "").split(" ")[0] || "—"}
                  </Text>
                </Pressable>
              ))}
              {canManage && (
                <Pressable
                  onPress={() => irADiscipulos(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Agregar discípulo"
                  className="w-1/5 items-center active:opacity-70"
                >
                  <View className="h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-dashed border-gold">
                    <Ionicons name="add" size={22} color={colors.tertiary} />
                  </View>
                  <Text
                    style={{ fontFamily: fonts.sansSemibold }}
                    className="mt-1.5 text-[13px] text-gold"
                  >
                    Agregar
                  </Text>
                </Pressable>
              )}
            </Card>
          </Seccion>

          <Seccion
            titulo="Últimas reuniones"
            accion={reuniones.length > 0 ? "Historial" : undefined}
            onAccion={() =>
              router.push({ pathname: "/discipulado/historial", params: { id: discipuladoId } })
            }
          >
            {cargandoReuniones ? (
              <Card className="items-center">
                <ActivityIndicator color={colors.primary} />
              </Card>
            ) : ultimas.length === 0 ? (
              <Card>
                <Muted>Sin reuniones registradas.</Muted>
              </Card>
            ) : (
              <Card className="overflow-hidden p-0">
                {ultimas.map((r, i) => {
                  const presentes = r.asistencias.filter((a) => a.presente).length;
                  const total = r.asistencias.length;
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => router.push({ pathname: "/reunion/[id]", params: { id: r.id } })}
                      className={`flex-row items-center gap-3 px-4 py-3 active:opacity-80 ${
                        i > 0 ? "border-t border-black/5" : ""
                      }`}
                    >
                      <FechaBloque fecha={r.fecha} />
                      <View className="flex-1">
                        <Body className="text-ink" numberOfLines={1}>
                          {r.tema || "Sin tema"}
                        </Body>
                        <Muted>
                          {total ? `${presentes} de ${total} presentes` : "Sin asistencia cargada"}
                        </Muted>
                      </View>
                      <Text
                        style={{ fontFamily: fonts.sansSemibold }}
                        className="text-sm text-ink-variant"
                      >
                        {formatMoneda(r.ofrenda_total)}
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>
            )}
          </Seccion>
        </View>
      </ScrollView>
    </Screen>
  );
}
