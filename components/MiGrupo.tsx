import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatHora, proximaReunion } from "../lib/date";
import { useMiGrupo, useReunionesDeMiGrupo } from "../lib/queries/miGrupo";
import { acuarela, colors, fonts } from "../lib/theme";
import { DIAS_SEMANA, MODALIDAD_LABEL, ReunionDeMiGrupo, SEXO_LABEL } from "../lib/types";
import { AppBar } from "./AppBar";
import { FechaBloque } from "./FechaBloque";
import { FondoEncabezado } from "./FondoEncabezado";
import { Avatar, Body, Card, Label, Muted, Title } from "./ui";

// Una reunión: fecha y tema siempre a la vista; los presentes se despliegan.
// Misma fila que "Últimas reuniones" de discipulado/[id].tsx, sin la ofrenda.
function ReunionFila({
  r,
  primera,
  abiertaPorDefecto,
}: {
  r: ReunionDeMiGrupo;
  primera: boolean;
  abiertaPorDefecto: boolean;
}) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  const n = r.participantes.length;

  return (
    <View className={primera ? "" : "border-t border-black/5"}>
      <Pressable
        onPress={() => setAbierta((v) => !v)}
        accessibilityRole="button"
        className="flex-row items-center gap-3 px-4 py-3 active:opacity-80"
      >
        <FechaBloque fecha={r.fecha} />
        <View className="flex-1">
          <Body className="text-ink" numberOfLines={abierta ? undefined : 1}>
            {r.tema || "Sin tema"}
          </Body>
          <Muted>
            {n === 0 ? "Sin asistencia cargada" : `${n} ${n === 1 ? "presente" : "presentes"}`}
          </Muted>
        </View>
        <Ionicons name={abierta ? "chevron-up" : "chevron-down"} size={16} color={colors.outline} />
      </Pressable>

      {abierta && n > 0 && (
        <View className="gap-2.5 px-4 pb-3.5 pl-[68px]">
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
  );
}

// "Mi discipulado" visto por un discípulo: el mismo encabezado de acuarela que
// discipulado/[id].tsx (horario, nombre, discipulador y próxima reunión) y el
// historial con fecha, tema y quiénes estuvieron. Nada de gestión: ni editar,
// ni registrar, ni ofrendas, ni roster. Todo llega por las RPC de
// 0019_mi_grupo.sql — la RLS no le deja leer esas tablas directo.
//
// La lista de grupos vive en app/(tabs)/discipulado.tsx; acá se resuelve el
// grupo por id contra esa misma query (ya cacheada).
//
// `titulo`: desde el tab no hay barra de navegación, así que el título va
// dentro de la acuarela. Desde /mi-grupo/[id] lo pone el Stack.
export function MiGrupoDetalle({ grupoId, titulo }: { grupoId?: string; titulo?: string }) {
  const insets = useSafeAreaInsets();
  const enFoco = useIsFocused();
  const { data: grupos = [], isLoading } = useMiGrupo();
  const grupo = grupos.find((g) => g.id === grupoId);
  const { data: reuniones = [], isLoading: cargandoReuniones } = useReunionesDeMiGrupo(grupo?.id);

  if (isLoading) {
    return (
      <>
        {titulo ? <AppBar title={titulo} /> : null}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </>
    );
  }

  // Solo se llega acá con un id que ya no está entre sus participaciones
  // (lo dieron de baja del grupo mientras miraba, o un link viejo).
  if (!grupo) {
    return (
      <>
        {titulo ? <AppBar title={titulo} /> : null}
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Card>
            <Title className="text-base">No estás en este discipulado</Title>
            <Body className="mt-2">
              Puede que te hayan dado de baja del grupo. Consultale a un obrero de
              la congregación.
            </Body>
          </Card>
        </ScrollView>
      </>
    );
  }

  const proxima = proximaReunion(
    grupo.dia_semana,
    reuniones.map((r) => r.fecha)
  );
  const nombre = grupo.nombre ?? grupo.descripcion_etaria ?? "Discipulado";
  const horario = `${DIAS_SEMANA[grupo.dia_semana]} · ${formatHora(grupo.hora_inicio)}${
    grupo.hora_fin ? `–${formatHora(grupo.hora_fin)}` : ""
  }`;
  const subtitulo = [
    grupo.discipulador ?? "Sin discipulador asignado",
    MODALIDAD_LABEL[grupo.modalidad],
    SEXO_LABEL[grupo.sexo],
  ].join(" · ");

  return (
    <>
      {enFoco && <StatusBar style="light" />}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
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

        {/* Sin datos colgando abajo (el discípulo no ve los números del grupo)
            el bloque cierra antes, igual que un ministerio visto por quien no
            lo gestiona. */}
        <FondoEncabezado>
          {titulo ? (
            <View style={{ paddingTop: insets.top + 12 }} className="px-5 pb-3">
              <Text style={{ fontFamily: fonts.sansBold }} className="text-[16px] leading-6 text-white">
                {titulo}
              </Text>
            </View>
          ) : null}
          <View className="px-5 pt-1" style={{ paddingBottom: 28 }}>
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
              {nombre}
            </Text>
            <Text style={{ fontFamily: fonts.sans }} className="mt-1 text-[15px] text-navy-soft">
              {subtitulo}
            </Text>

            <View
              style={{ backgroundColor: acuarela.panel }}
              className="mt-5 rounded-[14px] py-3.5 pl-4 pr-3.5"
            >
              <Text
                style={{ fontFamily: fonts.sansSemibold, letterSpacing: 1 }}
                className="text-[11px] uppercase text-navy-soft"
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
                {grupo.ubicacion ? ` · ${grupo.ubicacion}` : ""}
              </Text>
            </View>
          </View>
        </FondoEncabezado>

        <View className="px-4 pt-6">
          <Label className="mb-2 px-1">
            {cargandoReuniones ? "Reuniones" : `Reuniones · ${reuniones.length}`}
          </Label>
          {cargandoReuniones ? (
            <Card className="items-center">
              <ActivityIndicator color={colors.primary} />
            </Card>
          ) : reuniones.length === 0 ? (
            <Card>
              <Muted>Todavía no hay reuniones registradas en tu grupo.</Muted>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              {reuniones.map((r, i) => (
                <ReunionFila key={r.id} r={r} primera={i === 0} abiertaPorDefecto={i === 0} />
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </>
  );
}
