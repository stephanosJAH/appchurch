import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { Body, Button, Card, Label, Muted, Title } from "../../components/ui";
import {
  useMinisterios,
  useMinisteriosInactivos,
  useReactivarMinisterio,
} from "../../lib/queries/ministerios";
import { colors } from "../../lib/theme";
import { Ministerio } from "../../lib/types";

// ABM de ministerios — espejo de admin/discipulados.tsx. A diferencia de los
// discipulados, los dados de baja se administran acá mismo y no en una pantalla
// aparte (admin/bajas.tsx): son pocos y la lista entra cómoda.

function fechaBaja(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function nombresLideres(m: Ministerio): string {
  const nombres = (m.lideres ?? []).map((l) => l.nombre_completo ?? "Sin nombre");
  return nombres.length ? nombres.join(" · ") : "Sin líderes asignados";
}

export default function AdminMinisterios() {
  const router = useRouter();
  const { data: ministerios = [] } = useMinisterios();
  const { data: inactivos = [] } = useMinisteriosInactivos();
  const reactivar = useReactivarMinisterio();

  const onReactivar = (m: Ministerio) => {
    Alert.alert(
      "Reactivar ministerio",
      `«${m.nombre}» vuelve a estar activo, con los líderes y el roster que tenía. ¿Confirmás?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Reactivar", onPress: () => reactivar.mutate(m.id) },
      ]
    );
  };

  return (
    <View className="flex-1 bg-cream">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 96 }}>
        <Label className="mb-2 mt-1">Ministerios ({ministerios.length})</Label>

        {ministerios.length === 0 ? (
          <Card>
            <Muted>
              Todavía no hay ministerios. Creá el primero con el botón de abajo y
              asignale sus líderes.
            </Muted>
          </Card>
        ) : (
          <View className="gap-2.5">
            {ministerios.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => router.push({ pathname: "/ministerio/[id]", params: { id: m.id } })}
                className="active:opacity-80"
              >
                <Card>
                  <View className="flex-row items-center gap-3">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-gold-container">
                      <Ionicons
                        name={(m.icono as keyof typeof Ionicons.glyphMap) ?? "sparkles-outline"}
                        size={19}
                        color={colors.onTertiaryContainer}
                      />
                    </View>
                    <Title numberOfLines={1} className="flex-1">
                      {m.nombre}
                    </Title>
                    <Ionicons name="chevron-forward" size={18} color={colors.outline} />
                  </View>
                  <View className="mt-3 flex-row items-center gap-1.5 border-t border-black/5 pt-3">
                    <Ionicons name="people-outline" size={13} color={colors.outline} />
                    <Muted className="flex-1" numberOfLines={1}>
                      {nombresLideres(m)}
                    </Muted>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}

        {inactivos.length > 0 && (
          <>
            <Label className="mb-2 mt-7">Dados de baja ({inactivos.length})</Label>
            <View className="gap-2.5">
              {inactivos.map((m) => (
                <Card key={m.id}>
                  <Title numberOfLines={1}>{m.nombre}</Title>
                  <View className="mt-3 rounded-lg bg-surface-low p-3">
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons name="information-circle-outline" size={14} color={colors.outline} />
                      <Label>Motivo de baja</Label>
                    </View>
                    <Body className="mt-1">{m.motivo_baja ?? "—"}</Body>
                    {m.fecha_baja ? <Muted className="mt-1">Baja: {fechaBaja(m.fecha_baja)}</Muted> : null}
                  </View>
                  <View className="mt-3 self-start">
                    <Button
                      title="Reactivar"
                      variant="outline"
                      size="sm"
                      onPress={() => onReactivar(m)}
                      loading={reactivar.isPending}
                    />
                  </View>
                </Card>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* FAB */}
      <Pressable
        onPress={() => router.push("/ministerio/editar")}
        style={{
          shadowColor: "#04162e",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 10,
          elevation: 6,
        }}
        className="absolute bottom-5 right-5 h-14 w-14 items-center justify-center rounded-full bg-navy active:opacity-90"
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}
