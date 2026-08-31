import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import {
  Avatar,
  Body,
  Card,
  Chip,
  Display,
  Label,
  Muted,
  Title,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatMoneda } from "../../lib/date";
import {
  useIntegrantesMinisterio,
  useMinisterio,
  useReunionMinisterio,
  useSoyLiderDe,
} from "../../lib/queries/ministerios";
import { useReunion } from "../../lib/queries/reuniones";
import { colors } from "../../lib/theme";
import { Modalidad } from "../../lib/types";

// Detalle de una reunión, compartido por los dos orígenes (ver el comentario de
// reunion/nueva.tsx: dos libros en la base, una sola UI). El parámetro `origen`
// decide de qué tabla se lee y quién puede editarla.

type Origen = "discipulado" | "ministerio";

// Fila de asistencia ya normalizada entre los dos orígenes.
type FilaAsistencia = {
  id: string;
  nombre: string;
  presente: boolean;
  modalidad: Modalidad | null;
};

function fechaLarga(iso: string): string {
  // iso "YYYY-MM-DD": forzamos hora local para no correrse un día por UTC.
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function ReunionDetalle() {
  const { id, origen: origenParam } = useLocalSearchParams<{ id: string; origen?: string }>();
  const router = useRouter();
  const { isAdmin, profile } = useAuth();
  const origen: Origen = origenParam === "ministerio" ? "ministerio" : "discipulado";
  const esMinisterio = origen === "ministerio";
  const reunionId = String(id);

  const disc = useReunion(!esMinisterio ? reunionId : "");
  const min = useReunionMinisterio(esMinisterio ? reunionId : "");
  const isLoading = esMinisterio ? min.isLoading : disc.isLoading;

  const ministerioId = min.data?.ministerio_id ?? "";
  const { data: ministerio } = useMinisterio(esMinisterio ? ministerioId : "");
  const { soyLider } = useSoyLiderDe(esMinisterio ? ministerioId : undefined);
  // Las asistencias de ministerio no traen el nombre embebido: la RLS de
  // `miembros` no deja al líder leer el padrón. Se resuelven contra el roster,
  // que el RPC devuelve completo (incluidos los dados de baja) justamente para
  // poder ponerle nombre a una reunión vieja.
  const { data: integrantes = [] } = useIntegrantesMinisterio(
    ministerioId,
    esMinisterio && (isAdmin || soyLider)
  );

  // Puede editarla el admin, el discipulador a cargo del grupo o CUALQUIER
  // líder del ministerio — el mismo corte que hacen las RPC. Acá es solo para
  // mostrar u ocultar el lápiz.
  const canManage = esMinisterio
    ? isAdmin || soyLider
    : isAdmin || (!!profile && profile.id === disc.data?.discipulado?.discipulador_id);

  const asistencias = useMemo<FilaAsistencia[]>(() => {
    const filas: FilaAsistencia[] = esMinisterio
      ? (min.data?.asistencias ?? []).map((a) => {
          const i = integrantes.find((x) => x.miembro_id === a.miembro_id);
          return {
            id: a.id,
            nombre: i ? `${i.nombre} ${i.apellido ?? ""}`.trim() : "Sin nombre",
            presente: a.presente,
            modalidad: a.modalidad,
          };
        })
      : (disc.data?.asistencias ?? []).map((a) => ({
          id: a.id,
          nombre: `${a.miembro?.nombre ?? ""} ${a.miembro?.apellido ?? ""}`.trim() || "Sin nombre",
          presente: a.presente,
          modalidad: a.modalidad,
        }));
    return filas.sort((a, b) => {
      if (a.presente !== b.presente) return a.presente ? -1 : 1;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [esMinisterio, min.data, disc.data, integrantes]);

  const presentes = asistencias.filter((a) => a.presente).length;

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const reunion = esMinisterio ? min.data : disc.data;
  if (!reunion) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-8">
        <Muted>No se encontró la reunión.</Muted>
      </View>
    );
  }

  const dueno = esMinisterio
    ? ministerio?.nombre ?? "Ministerio"
    : disc.data?.discipulado?.nombre ?? disc.data?.discipulado?.descripcion_etaria ?? "Discipulado";

  return (
    <ScrollView
      className="flex-1 bg-cream"
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      {canManage && (
        <Stack.Screen
          options={{
            headerRight: () => (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/reunion/nueva",
                    params: { reunionId, origen },
                  })
                }
                className="active:opacity-60"
                hitSlop={12}
              >
                <Ionicons name="create-outline" size={22} color={colors.primary} />
              </Pressable>
            ),
          }}
        />
      )}

      {/* Encabezado */}
      <Card className="mb-4 bg-navy">
        <Muted>{dueno}</Muted>
        <Title className="mt-1 capitalize">{fechaLarga(reunion.fecha)}</Title>
        {reunion.modalidad_usada ? (
          <View className="mt-3">
            <Chip tone="gold">{reunion.modalidad_usada}</Chip>
          </View>
        ) : null}
      </Card>

      {/* Ofrenda */}
      <Card className="mb-4 flex-row items-center justify-between">
        <View>
          <Label>Ofrenda total</Label>
          <Display className="mt-1">{formatMoneda(Number(reunion.ofrenda_total ?? 0))}</Display>
        </View>
        <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-mid">
          <Ionicons name="wallet-outline" size={24} color={colors.primaryContainer} />
        </View>
      </Card>

      {/* Tema */}
      {reunion.tema ? (
        <>
          <Label className="mb-2">Tema / lección</Label>
          <Card className="mb-4">
            <Body className="text-ink">{reunion.tema}</Body>
          </Card>
        </>
      ) : null}

      {/* Notas */}
      {reunion.notas ? (
        <>
          <Label className="mb-2">Notas</Label>
          <Card className="mb-4">
            <Body className="text-ink">{reunion.notas}</Body>
          </Card>
        </>
      ) : null}

      {/* Asistencia */}
      <View className="mb-2 mt-2 flex-row items-center justify-between">
        <Label>Asistencia</Label>
        <Muted className="text-gold">
          {presentes}/{asistencias.length} presentes
        </Muted>
      </View>

      {asistencias.length === 0 ? (
        <Card>
          <Muted>No se registró asistencia.</Muted>
        </Card>
      ) : (
        <View className="gap-2.5">
          {asistencias.map((a) => (
            <Card
              key={a.id}
              className={`flex-row items-center gap-3 py-3.5 ${a.presente ? "" : "opacity-60"}`}
            >
              <Avatar name={a.nombre} size={38} tone={a.presente ? "navy" : "gold"} />
              <Body className="flex-1 text-ink">{a.nombre}</Body>
              {a.presente && a.modalidad && a.modalidad !== "ambos" ? (
                <View className="flex-row items-center gap-1">
                  <Ionicons
                    name={a.modalidad === "virtual" ? "videocam-outline" : "business-outline"}
                    size={13}
                    color={colors.outline}
                  />
                  <Muted className="capitalize">{a.modalidad}</Muted>
                </View>
              ) : null}
              <Ionicons
                name={a.presente ? "checkmark-circle" : "close-circle-outline"}
                size={22}
                color={a.presente ? colors.primary : colors.outlineVariant}
              />
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
