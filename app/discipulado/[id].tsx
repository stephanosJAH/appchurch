import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useAuth } from "../../lib/auth";
import {
  Avatar,
  Body,
  Button,
  Card,
  Chip,
  Field,
  KeyboardScrollView,
  Label,
  Muted,
  Title,
} from "../../components/ui";
import { CumplesSection } from "../../components/Cumples";
import {
  calcularEdad,
  diasHastaCumple,
  etiquetaCumple,
  formatFechaCorta,
  formatHora,
  formatMoneda,
} from "../../lib/date";
import { colors } from "../../lib/theme";
import { DIAS_SEMANA, Reunion, Sexo } from "../../lib/types";
import { useDiscipulado } from "../../lib/queries/discipulados";
import {
  useAgregarDiscipuloNuevo,
  useDesasociarParticipacion,
  useParticipaciones,
} from "../../lib/queries/participaciones";
import { useReuniones } from "../../lib/queries/reuniones";

function labelMes(clave: string): string {
  const [y, m] = clave.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

type MesReuniones = {
  clave: string; // "YYYY-MM"
  total: number;
  reuniones: Reunion[];
};

export default function DiscipuladoDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin, profile } = useAuth();
  const discipuladoId = String(id);

  const { data: discipulado } = useDiscipulado(discipuladoId);
  // Puede gestionar el grupo el admin o el discipulador a cargo del mismo.
  const canManage = isAdmin || (!!profile && profile.id === discipulado?.discipulador_id);
  const { data: participaciones = [] } = useParticipaciones(discipuladoId);
  const { data: reuniones = [] } = useReuniones(discipuladoId);
  const agregar = useAgregarDiscipuloNuevo(discipuladoId);
  const desasociar = useDesasociarParticipacion(discipuladoId);

  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [sexo, setSexo] = useState<Sexo>("M");

  // Historial agrupado por mes (más reciente primero), como el desglose de ofrendas.
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

  // Primer mes expandido por defecto.
  const [mesesAbiertos, setMesesAbiertos] = useState<Record<string, boolean>>({});
  const mesAbierto = (clave: string, idx: number) => mesesAbiertos[clave] ?? idx === 0;
  const toggleMes = (clave: string, idx: number) =>
    setMesesAbiertos((p) => ({ ...p, [clave]: !mesAbierto(clave, idx) }));

  const onDesasociar = (participacionId: string, nombre: string) => {
    Alert.alert(
      "Desasociar discípulo",
      `¿Quitar a ${nombre} de este discipulado? Podés volver a agregarlo más adelante.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desasociar",
          style: "destructive",
          onPress: () => desasociar.mutate(participacionId),
        },
      ]
    );
  };

  const onAgregar = async () => {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Ingresá al menos el nombre.");
      return;
    }
    try {
      await agregar.mutateAsync({ nombre: nombre.trim(), apellido: apellido.trim() || null, sexo });
      setNombre("");
      setApellido("");
      setSexo("M");
      setShowForm(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo agregar el discípulo.");
    }
  };

  return (
    <KeyboardScrollView>
      {canManage && (
        <Stack.Screen
          options={{
            headerRight: () => (
              <Pressable
                onPress={() => router.push({ pathname: "/discipulado/editar", params: { id: discipuladoId } })}
                className="active:opacity-60"
                hitSlop={12}
              >
                <Ionicons name="create-outline" size={22} color={colors.primary} />
              </Pressable>
            ),
          }}
        />
      )}

      {/* Encabezado del grupo */}
      <Card className="mb-4 overflow-hidden p-0">
        <View className="h-20 justify-end bg-navy p-4">
          <View className="absolute right-4 top-3 opacity-20">
            <Ionicons name="people" size={52} color={colors.tertiaryDim} />
          </View>
        </View>
        <View className="p-5">
          <Title className="text-xl">
            {discipulado?.nombre ?? discipulado?.descripcion_etaria ?? "Discipulado"}
          </Title>
          {discipulado && (
            <>
              <View className="mt-1.5 flex-row items-center gap-1.5">
                <Ionicons name="calendar-outline" size={14} color={colors.tertiary} />
                <Muted className="text-gold">
                  {DIAS_SEMANA[discipulado.dia_semana]} · {formatHora(discipulado.hora_inicio)}
                  {discipulado.hora_fin ? `–${formatHora(discipulado.hora_fin)}` : ""}
                </Muted>
              </View>
              <View className="mt-3 flex-row items-center gap-2">
                <Chip tone="neutral">{discipulado.modalidad}</Chip>
                <Chip tone="navy">{discipulado.sexo}</Chip>
              </View>
              <View className="mt-3 flex-row items-center gap-1.5">
                <Ionicons name="person-outline" size={15} color={colors.tertiary} />
                <Muted className="text-gold">
                  {discipulado.discipulador?.nombre_completo ?? "Sin discipulador asignado"}
                </Muted>
              </View>
              {discipulado.ubicacion ? (
                <View className="mt-3 flex-row items-center gap-1.5">
                  <Ionicons name="location-outline" size={15} color={colors.outline} />
                  <Muted>{discipulado.ubicacion}</Muted>
                </View>
              ) : null}
            </>
          )}
        </View>
      </Card>

      <Button
        title="Registrar reunión"
        onPress={() => router.push({ pathname: "/reunion/nueva", params: { discipuladoId } })}
      />

      {/* Recordatorio de cumpleaños próximos */}
      <CumplesSection
        className="mt-7"
        titulo="Próximos cumpleaños"
        miembros={participaciones.map((p) => p.miembro)}
      />

      {/* Discípulos */}
      <View className="mb-2 mt-7 flex-row items-center justify-between">
        <Label>Discípulos ({participaciones.length})</Label>
        {canManage && (
          <Button
            title={showForm ? "Cancelar" : "+ Agregar"}
            variant="ghost"
            size="sm"
            onPress={() => setShowForm((v) => !v)}
          />
        )}
      </View>

      {canManage && showForm && (
        <Card className="mb-3">
          <Field label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Nombre" autoCapitalize="words" />
          <Field label="Apellido" value={apellido} onChangeText={setApellido} placeholder="Apellido (opcional)" autoCapitalize="words" />
          <Label className="mb-1.5">Sexo</Label>
          <View className="mb-4 flex-row gap-2">
            {(["M", "F"] as Sexo[]).map((s) => (
              <View key={s} className="flex-1">
                <Button title={s === "M" ? "Masculino" : "Femenino"} variant={sexo === s ? "primary" : "outline"} size="sm" onPress={() => setSexo(s)} />
              </View>
            ))}
          </View>
          <Button title="Guardar discípulo" onPress={onAgregar} loading={agregar.isPending} />
        </Card>
      )}

      {participaciones.length === 0 ? (
        <Card>
          <Muted>Todavía no hay discípulos en este grupo.</Muted>
        </Card>
      ) : (
        <View className="gap-2.5">
          {participaciones.map((p) => {
            const edad = calcularEdad(p.miembro?.fecha_nacimiento);
            const nombreCompleto = `${p.miembro?.nombre ?? ""} ${p.miembro?.apellido ?? ""}`.trim();
            const diasCumple = diasHastaCumple(p.miembro?.fecha_nacimiento);
            const cumpleProximo = diasCumple != null && diasCumple <= 14;
            return (
              <Card key={p.id} className="flex-row items-center gap-3 py-3.5">
                <Pressable
                  onPress={() => router.push({ pathname: "/miembro/[id]", params: { id: p.miembro_id } })}
                  className="flex-1 flex-row items-center gap-3 active:opacity-70"
                >
                  <Avatar name={p.miembro?.nombre} size={38} tone="gold" />
                  <View className="flex-1">
                    <Body className="text-ink">{nombreCompleto}</Body>
                    {edad != null ? <Muted>{edad} años</Muted> : null}
                  </View>
                  {cumpleProximo ? (
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="gift-outline" size={14} color={colors.cumple} />
                      <Muted style={{ color: colors.cumple }}>{etiquetaCumple(diasCumple)}</Muted>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={16} color={colors.outline} />
                </Pressable>
                {canManage && (
                  <Pressable
                    onPress={() => onDesasociar(p.id, nombreCompleto || "este discípulo")}
                    hitSlop={10}
                    className="active:opacity-60"
                  >
                    <Ionicons name="person-remove-outline" size={20} color={colors.error} />
                  </Pressable>
                )}
              </Card>
            );
          })}
        </View>
      )}

      {/* Historial agrupado por mes */}
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
                      {mes.reuniones.length} {mes.reuniones.length === 1 ? "reunión" : "reuniones"}
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
                        onPress={() => router.push({ pathname: "/reunion/[id]", params: { id: r.id } })}
                        className="border-b border-black/5 px-4 py-3 active:opacity-80"
                      >
                        <View className="flex-row items-center gap-3">
                          <View className="flex-1">
                            <Body className="text-ink">{formatFechaCorta(r.fecha)}</Body>
                            {r.tema ? (
                              <Muted numberOfLines={1}>{r.tema}</Muted>
                            ) : null}
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
    </KeyboardScrollView>
  );
}
