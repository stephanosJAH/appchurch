import { Ionicons } from "@expo/vector-icons";
import { Alert, FlatList, View } from "react-native";
import { Body, Button, Card, Label, Muted, Title } from "../../components/ui";
import { formatHora } from "../../lib/date";
import { colors } from "../../lib/theme";
import { DIAS_SEMANA, Discipulado } from "../../lib/types";
import {
  useDiscipuladosInactivos,
  useReactivarDiscipulado,
} from "../../lib/queries/discipulados";

function fechaBaja(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminBajas() {
  const { data: inactivos = [], isLoading } = useDiscipuladosInactivos();
  const reactivar = useReactivarDiscipulado();

  const onReactivar = (d: Discipulado) => {
    Alert.alert(
      "Reactivar discipulado",
      `«${d.nombre ?? d.descripcion_etaria ?? "Discipulado"}» vuelve a estar activo, sin discipulador asignado. ¿Confirmás?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Reactivar", onPress: () => reactivar.mutate(d.id) },
      ]
    );
  };

  return (
    <View className="flex-1 bg-cream">
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        data={inactivos}
        keyExtractor={(d) => d.id}
        ListHeaderComponent={<Label className="mb-2">Dados de baja ({inactivos.length})</Label>}
        renderItem={({ item: d }) => (
          <Card className="mb-2.5">
            <Title numberOfLines={1}>{d.nombre ?? d.descripcion_etaria ?? "Discipulado"}</Title>
            <Muted className="mt-1">
              {DIAS_SEMANA[d.dia_semana]} · {formatHora(d.hora_inicio)}
            </Muted>

            <View className="mt-3 rounded-lg bg-surface-low p-3">
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="information-circle-outline" size={14} color={colors.outline} />
                <Label>Motivo de baja</Label>
              </View>
              <Body className="mt-1">{d.motivo_baja ?? "—"}</Body>
              {d.fecha_baja ? <Muted className="mt-1">Baja: {fechaBaja(d.fecha_baja)}</Muted> : null}
            </View>

            <View className="mt-3 self-start">
              <Button
                title="Reactivar"
                variant="outline"
                size="sm"
                onPress={() => onReactivar(d)}
                loading={reactivar.isPending}
              />
            </View>
          </Card>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <Card>
              <Muted>No hay discipulados dados de baja.</Muted>
            </Card>
          ) : null
        }
      />
    </View>
  );
}
