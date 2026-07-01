import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
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
import { formatFechaCorta, formatHora, formatMoneda } from "../../lib/date";
import { colors } from "../../lib/theme";
import { DIAS_SEMANA, Sexo } from "../../lib/types";
import { useDiscipulado } from "../../lib/queries/discipulados";
import {
  useAgregarDiscipuloNuevo,
  useParticipaciones,
} from "../../lib/queries/participaciones";
import { useReuniones } from "../../lib/queries/reuniones";

export default function DiscipuladoDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const discipuladoId = String(id);

  const { data: discipulado } = useDiscipulado(discipuladoId);
  const { data: participaciones = [] } = useParticipaciones(discipuladoId);
  const { data: reuniones = [] } = useReuniones(discipuladoId);
  const agregar = useAgregarDiscipuloNuevo(discipuladoId);

  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [sexo, setSexo] = useState<Sexo>("M");

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
      {isAdmin && (
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

      {/* Discípulos */}
      <View className="mb-2 mt-7 flex-row items-center justify-between">
        <Label>Discípulos ({participaciones.length})</Label>
        <Button
          title={showForm ? "Cancelar" : "+ Agregar"}
          variant="ghost"
          size="sm"
          onPress={() => setShowForm((v) => !v)}
        />
      </View>

      {showForm && (
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
          {participaciones.map((p) => (
            <Card key={p.id} className="flex-row items-center gap-3 py-3.5">
              <Avatar name={p.miembro?.nombre} size={38} tone="gold" />
              <Body className="flex-1 text-ink">
                {p.miembro?.nombre} {p.miembro?.apellido ?? ""}
              </Body>
            </Card>
          ))}
        </View>
      )}

      {/* Historial */}
      <Label className="mb-2 mt-7">Historial de reuniones</Label>
      {reuniones.length === 0 ? (
        <Card>
          <Muted>Sin reuniones registradas.</Muted>
        </Card>
      ) : (
        <View className="gap-2.5">
          {reuniones.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => router.push({ pathname: "/reunion/[id]", params: { id: r.id } })}
              className="active:opacity-80"
            >
              <Card>
                <View className="flex-row items-center justify-between">
                  <Title className="text-base">{formatFechaCorta(r.fecha)}</Title>
                  <View className="flex-row items-center gap-2">
                    <Chip tone="success">{formatMoneda(r.ofrenda_total)}</Chip>
                    <Ionicons name="chevron-forward" size={18} color={colors.outline} />
                  </View>
                </View>
                {r.tema ? (
                  <Body className="mt-1.5" numberOfLines={2}>
                    {r.tema}
                  </Body>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </KeyboardScrollView>
  );
}
