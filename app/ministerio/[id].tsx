import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
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
import { fechaLabel, formatFechaCorta, formatMoneda } from "../../lib/date";
import { useAnuncios } from "../../lib/queries/anuncios";
import {
  useIntegrantesMinisterio,
  useMinisterio,
  useReunionesDeMiMinisterio,
  useReunionesMinisterio,
  useSoyLiderDe,
} from "../../lib/queries/ministerios";
import { colors } from "../../lib/theme";
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

  if (isLoading || cargandoPertenencia) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  if (!ministerio) {
    return (
      <Screen className="items-center justify-center p-8">
        <Muted className="text-center">
          No encontramos este ministerio. Puede que lo hayan dado de baja.
        </Muted>
      </Screen>
    );
  }

  const lideres = ministerio.lideres ?? [];

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <Stack.Screen
          options={{
            title: ministerio.nombre,
            headerRight: puedeGestionar
              ? () => (
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: "/ministerio/editar", params: { id: ministerioId } })
                    }
                    className="active:opacity-60"
                    hitSlop={12}
                  >
                    <Ionicons name="create-outline" size={22} color={colors.primary} />
                  </Pressable>
                )
              : undefined,
          }}
        />

        {/* Encabezado */}
        <Card className="mb-4 overflow-hidden p-0">
          <View className="h-20 justify-end bg-navy p-4">
            <View className="absolute right-4 top-3 opacity-20">
              <Ionicons
                name={(ministerio.icono as keyof typeof Ionicons.glyphMap) ?? "sparkles"}
                size={52}
                color={colors.tertiaryDim}
              />
            </View>
          </View>
          <View className="p-5">
            <Title className="text-xl">{ministerio.nombre}</Title>
            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              {soyLider ? <Chip tone="gold">Liderás este ministerio</Chip> : null}
              {!soyLider && participo ? <Chip tone="neutral">Participás</Chip> : null}
              {puedeGestionar && ministerio.activo === false ? (
                <Chip tone="danger">Dado de baja</Chip>
              ) : null}
            </View>

            <Label className="mb-1.5 mt-4">
              {lideres.length === 1 ? "Líder" : `Líderes (${lideres.length})`}
            </Label>
            {lideres.length === 0 ? (
              <Muted>Sin líderes asignados todavía.</Muted>
            ) : (
              <View className="gap-1.5">
                {lideres.map((l) => (
                  <View key={l.profile_id} className="flex-row items-center gap-1.5">
                    <Ionicons name="person-outline" size={15} color={colors.tertiary} />
                    <Muted className="text-gold">{l.nombre_completo ?? "Sin nombre"}</Muted>
                  </View>
                ))}
              </View>
            )}

            {ministerio.descripcion ? (
              <View className="mt-4 border-t border-black/5 pt-4">
                <RichTextView descripcion={ministerio.descripcion} />
              </View>
            ) : null}
          </View>
        </Card>

        {puedeGestionar && (
          <Button
            title="Registrar reunión"
            onPress={() =>
              router.push({
                pathname: "/reunion/nueva",
                params: { origen: "ministerio", ministerioId },
              })
            }
          />
        )}

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
      </ScrollView>
    </Screen>
  );
}
