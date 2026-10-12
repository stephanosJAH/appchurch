import { Ionicons } from "@expo/vector-icons";
import { Stack, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Dato } from "../../components/Dato";
import { FondoEncabezado } from "../../components/FondoEncabezado";
import { RichTextView } from "../../components/RichTextView";
import {
  Avatar,
  Body,
  Button,
  Card,
  Chip,
  Label,
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
  useSoyLiderDe,
} from "../../lib/queries/ministerios";
import { acuarela, colors, fonts } from "../../lib/theme";
import { ReunionDeMiMinisterio, ReunionMinisterio } from "../../lib/types";

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

function labelMes(clave: string): string {
  const [y, m] = clave.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

type MesReuniones = { clave: string; total: number; reuniones: ReunionMinisterio[] };

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
    <Card className="overflow-hidden p-0">
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

  // Encabezado medianoche, continuo con la foto de abajo: el mismo del resumen
  // de discipulado. La barra de estado pasa a clara solo mientras esta pantalla
  // está al frente (ver discipulado/[id].tsx).
  const encabezado = (
    <>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: acuarela.medianoche },
          headerTintColor: colors.onPrimary,
          headerTitleStyle: { color: colors.onPrimary, fontFamily: fonts.sansBold, fontSize: 16 },
          headerRight: puedeGestionar
            ? () => (
                <Pressable
                  onPress={() =>
                    router.push({ pathname: "/ministerio/editar", params: { id: ministerioId } })
                  }
                  className="active:opacity-60"
                  hitSlop={12}
                  accessibilityLabel="Editar ministerio"
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
  const relacion = soyLider ? "Liderás este ministerio" : participo ? "Participás" : "Ministerio";
  const nombresLideres = lideres.map((l) => l.nombre_completo ?? "Sin nombre").join(" · ");
  const subtitulo =
    lideres.length === 0
      ? "Sin líderes asignados todavía"
      : lideres.length === 1
        ? nombresLideres
        : `Líderes: ${nombresLideres}`;
  // Vienen ordenadas por fecha, la más reciente primero.
  const ultima = reuniones[0];
  const delMes = meses.find((m) => m.clave === toISODate(new Date()).slice(0, 7));
  const nombreMes = new Date().toLocaleDateString("es-AR", { month: "long" });

  return (
    <Screen>
      {encabezado}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* En iOS el rebote de arriba destapa lo que hay detrás del encabezado:
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

        {/* La imagen la sube un líder desde «Editar»; sin ella, la acuarela del
            discipulado. Sin datos colgando abajo (quien no gestiona) el bloque
            cierra antes. */}
        <FondoEncabezado imagenUrl={ministerio.imagen_url}>
          <View className="px-5 pt-1" style={{ paddingBottom: puedeGestionar ? 76 : 28 }}>
            <Text
              style={{ fontFamily: fonts.sansSemibold, letterSpacing: 1 }}
              className="text-xs uppercase text-gold-dim"
            >
              {relacion}
              {puedeGestionar && ministerio.activo === false ? " · Dado de baja" : ""}
            </Text>
            <Text
              style={{ fontFamily: fonts.serifSemibold, fontSize: 28, lineHeight: 34 }}
              className="mt-1.5 text-white"
            >
              {ministerio.nombre}
            </Text>
            <Text style={{ fontFamily: fonts.sans }} className="mt-1 text-[15px] text-navy-soft">
              {subtitulo}
            </Text>

            {/* Un ministerio no tiene día fijo: en lugar de la próxima reunión,
                la última que se cargó. */}
            {puedeGestionar && (
              <View
                style={{ backgroundColor: acuarela.panel }}
                className="mt-5 flex-row items-center gap-3 rounded-[14px] py-3.5 pl-4 pr-3.5"
              >
                <View className="flex-1">
                  <Text
                    style={{ fontFamily: fonts.sansSemibold, letterSpacing: 1 }}
                    className="text-[11px] uppercase text-navy-soft"
                  >
                    Última reunión
                  </Text>
                  <Text
                    style={{ fontFamily: fonts.sansSemibold }}
                    className="mt-0.5 text-base text-white"
                  >
                    {ultima ? formatFechaCorta(ultima.fecha) : "Sin reuniones"}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ fontFamily: fonts.sans }}
                    className="text-[13px] text-navy-soft"
                  >
                    {ultima ? ultima.tema || "Sin tema" : "Registrá la primera"}
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
          </View>
        </FondoEncabezado>

        {puedeGestionar && (
          <View className="flex-row gap-2.5 px-4" style={{ marginTop: -52 }}>
            <Dato
              valor={String(activos.length)}
              titulo={activos.length === 1 ? "Integrante" : "Integrantes"}
              detalle="activos"
            />
            <Dato
              valor={String(delMes?.reuniones.length ?? 0)}
              titulo={delMes?.reuniones.length === 1 ? "Reunión" : "Reuniones"}
              detalle={nombreMes}
            />
            <Dato valor={formatMoneda(delMes?.total ?? 0)} titulo="Ofrenda" detalle={nombreMes} />
          </View>
        )}

        <View className="px-4">
          {ministerio.descripcion ? (
            <Card className="mt-6">
              <RichTextView descripcion={ministerio.descripcion} />
            </Card>
          ) : null}

          {/* Anuncios del ministerio */}
          {(participo || puedeGestionar) && (
            <>
              <View className="mb-2 mt-7 flex-row items-center justify-between">
                <Label>Anuncios</Label>
                {puedeGestionar && (
                  <Button
                    title="+ Publicar"
                    variant="ghost"
                    size="sm"
                    onPress={() =>
                      router.push({ pathname: "/anuncios", params: { ministerioId } })
                    }
                  />
                )}
              </View>
              {anunciosDelMinisterio.length === 0 ? (
                <Card>
                  <Muted>
                    {puedeGestionar
                      ? "Todavía no publicaste nada. Los anuncios les llegan a los integrantes del ministerio."
                      : "Todavía no hay anuncios de este ministerio."}
                  </Muted>
                </Card>
              ) : (
                <View className="gap-2.5">
                  {anunciosDelMinisterio.map((a) => (
                    <Pressable
                      key={a.id}
                      onPress={() => router.push("/anuncios")}
                      className="active:opacity-80"
                    >
                      <Card>
                        <View className="flex-row items-center gap-2">
                          {a.fijado ? (
                            <Ionicons name="pin" size={14} color={colors.tertiary} />
                          ) : null}
                          <Title className="flex-1 text-base" numberOfLines={1}>
                            {a.titulo}
                          </Title>
                        </View>
                        <Muted className="mt-1">{formatFechaCorta(a.created_at.slice(0, 10))}</Muted>
                      </Card>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Roster — solo gestión */}
          {puedeGestionar && (
            <>
              <View className="mb-2 mt-7 flex-row items-center justify-between">
                <Label>Integrantes ({activos.length})</Label>
                <Button
                  title="Gestionar"
                  variant="ghost"
                  size="sm"
                  onPress={() =>
                    router.push({ pathname: "/ministerio/integrantes", params: { id: ministerioId } })
                  }
                />
              </View>
              {activos.length === 0 ? (
                <Card>
                  <Muted>
                    Todavía no hay nadie en este ministerio. Sumá gente desde
                    «Gestionar».
                  </Muted>
                </Card>
              ) : (
                <View className="gap-2.5">
                  {activos.map((i) => (
                    <Card key={i.miembro_id} className="flex-row items-center gap-3 py-3.5">
                      <Avatar name={i.nombre} size={38} tone="gold" />
                      <View className="flex-1">
                        <Body className="text-ink">
                          {`${i.nombre} ${i.apellido ?? ""}`.trim()}
                        </Body>
                        {i.telefono ? <Muted>{i.telefono}</Muted> : null}
                      </View>
                    </Card>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Historial */}
          {puedeGestionar ? (
            <>
              <Label className="mb-2 mt-7">Historial de reuniones</Label>
              {meses.length === 0 ? (
                <Card>
                  <Muted>Sin reuniones registradas.</Muted>
                </Card>
              ) : (
                <View className="gap-3">
                  {meses.map((mes, idx) => {
                    const abierto = mesAbierto(mes.clave, idx);
                    return (
                      <Card key={mes.clave} className="overflow-hidden p-0">
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
            </>
          ) : participo ? (
            <>
              <Label className="mb-2 mt-7">Reuniones ({reunionesParticipante.length})</Label>
              {reunionesParticipante.length === 0 ? (
                <Card>
                  <Muted>Todavía no hay reuniones registradas en este ministerio.</Muted>
                </Card>
              ) : (
                <View className="gap-3">
                  {reunionesParticipante.map((r, i) => (
                    <ReunionParticipanteCard key={r.id} r={r} abiertaPorDefecto={i === 0} />
                  ))}
                </View>
              )}
            </>
          ) : (
            <Card className="mt-7">
              <Muted>
                No participás de este ministerio. Si querés sumarte, hablá con alguno de
                sus líderes.
              </Muted>
            </Card>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
