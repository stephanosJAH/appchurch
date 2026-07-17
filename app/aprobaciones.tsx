import { Ionicons } from "@expo/vector-icons";
import { Alert, FlatList, View } from "react-native";
import { Avatar, Body, Button, Card, Label, Muted } from "../components/ui";
import { useActivarMiembro, usePendientes } from "../lib/queries/profiles";
import { colors } from "../lib/theme";
import { Profile } from "../lib/types";

// Aprobación de cuentas pendientes. Accesible para obreros y admins (RLS).
// Habilitar = pasar el rol de 'pendiente' a 'miembro'.
export default function Aprobaciones() {
  const { data: pendientes = [], isLoading } = usePendientes();
  const activar = useActivarMiembro();

  const onActivar = (p: Profile) => {
    Alert.alert(
      "Habilitar cuenta",
      `${p.nombre_completo ?? "Esta persona"} va a poder ingresar a la app como miembro. ¿Confirmás?`,
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Habilitar", onPress: () => activar.mutate(p.id) },
      ]
    );
  };

  const renderItem = ({ item: p }: { item: Profile }) => (
    <Card className="mb-2.5">
      <View className="flex-row items-center gap-3">
        <Avatar name={p.nombre_completo} size={42} />
        <View className="flex-1">
          <Body className="text-ink" numberOfLines={1}>
            {p.nombre_completo ?? "Sin nombre"}
          </Body>
          <View className="mt-0.5 flex-row items-center gap-1">
            <Ionicons name="at-outline" size={13} color={colors.outline} />
            <Muted>{p.username ?? "sin usuario"}</Muted>
          </View>
        </View>
      </View>
      <View className="mt-3 border-t border-black/5 pt-3">
        <Button
          title="Habilitar como miembro"
          icon="checkmark-circle-outline"
          size="sm"
          onPress={() => onActivar(p)}
          loading={activar.isPending && activar.variables === p.id}
        />
      </View>
    </Card>
  );

  return (
    <View className="flex-1 bg-cream">
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        data={pendientes}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        ListHeaderComponent={<Label className="mb-2">Cuentas pendientes ({pendientes.length})</Label>}
        ListEmptyComponent={
          !isLoading ? (
            <Card>
              <Muted>No hay cuentas esperando aprobación.</Muted>
            </Card>
          ) : null
        }
      />
    </View>
  );
}
