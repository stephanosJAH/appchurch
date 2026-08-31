import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { fechaLabel, formatHora } from "../lib/date";
import { useMiGrupo, useReunionesDeMiGrupo } from "../lib/queries/miGrupo";
import { colors } from "../lib/theme";
import { DIAS_SEMANA, MiGrupo as Grupo, ReunionDeMiGrupo } from "../lib/types";
import { Avatar, Body, Card, Chip, Label, Muted, Title } from "./ui";

// Encabezado del grupo: mismo lenguaje visual que discipulado/[id].tsx, pero
// sin nada de gestión (no hay editar, ni registrar reunión, ni ofrendas).
function GrupoHeader({ g }: { g: Grupo }) {
  return (
    <Card className="mb-6 overflow-hidden p-0">
      <View className="h-20 justify-end bg-navy p-4">
        <View className="absolute right-4 top-3 opacity-20">
          <Ionicons name="people" size={52} color={colors.tertiaryDim} />
        </View>
      </View>
      <View className="p-5">
        <Title className="text-xl">
          {g.nombre ?? g.descripcion_etaria ?? "Discipulado"}
        </Title>
        <View className="mt-1.5 flex-row items-center gap-1.5">
          <Ionicons name="calendar-outline" size={14} color={colors.tertiary} />
          <Muted className="text-gold">
            {DIAS_SEMANA[g.dia_semana]} · {formatHora(g.hora_inicio)}
            {g.hora_fin ? `–${formatHora(g.hora_fin)}` : ""}
          </Muted>
        </View>
        <View className="mt-3 flex-row items-center gap-2">
          <Chip tone="neutral">{g.modalidad}</Chip>
          <Chip tone="navy">{g.sexo}</Chip>
        </View>
        <View className="mt-3 flex-row items-center gap-1.5">
          <Ionicons name="person-outline" size={15} color={colors.tertiary} />
          <Muted className="text-gold">
            {g.discipulador ?? "Sin discipulador asignado"}
          </Muted>
        </View>
        {g.ubicacion ? (
          <View className="mt-3 flex-row items-center gap-1.5">
            <Ionicons name="location-outline" size={15} color={colors.outline} />
            <Muted>{g.ubicacion}</Muted>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

// Una reunión: fecha y tema siempre a la vista; los participantes se despliegan.
function ReunionCard({ r, abiertaPorDefecto }: { r: ReunionDeMiGrupo; abiertaPorDefecto: boolean }) {
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
        <Ionicons
          name={abierta ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.outline}
        />
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

// Detalle de lectura de un grupo del que se participa (no se lidera): el
// encabezado y el historial de reuniones con fecha, tema y quiénes estuvieron.
// Todo llega por las RPC de 0019_mi_grupo.sql — la RLS no le deja leer esas
// tablas directo. La lista de grupos vive en app/(tabs)/discipulado.tsx; acá
// se resuelve el grupo por id contra esa misma query (ya cacheada).
export function MiGrupoDetalle({ grupoId }: { grupoId?: string }) {
  const { data: grupos = [], isLoading } = useMiGrupo();
  const grupo = grupos.find((g) => g.id === grupoId);
  const { data: reuniones = [], isLoading: cargandoReuniones } = useReunionesDeMiGrupo(grupo?.id);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Solo se llega acá con un id que ya no está entre sus participaciones
  // (lo dieron de baja del grupo mientras miraba, o un link viejo).
  if (!grupo) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Card>
          <Title className="text-base">No estás en este discipulado</Title>
          <Body className="mt-2">
            Puede que te hayan dado de baja del grupo. Consultale a un obrero de
            la congregación.
          </Body>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <GrupoHeader g={grupo} />

      <Label className="mb-2">Reuniones ({reuniones.length})</Label>
      {cargandoReuniones ? (
        <View className="mt-4 items-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : reuniones.length === 0 ? (
        <Card>
          <Muted>Todavía no hay reuniones registradas en tu grupo.</Muted>
        </Card>
      ) : (
        <View className="gap-3">
          {reuniones.map((r, i) => (
            <ReunionCard key={r.id} r={r} abiertaPorDefecto={i === 0} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
