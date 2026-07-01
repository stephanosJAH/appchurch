import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Button, Card, Chip, Label, Muted, Title } from "../../components/ui";
import { formatHora } from "../../lib/date";
import { colors } from "../../lib/theme";
import { DIAS_SEMANA } from "../../lib/types";
import { useDiscipulados } from "../../lib/queries/discipulados";
import { useProfiles } from "../../lib/queries/profiles";

export default function AdminDiscipulados() {
  const router = useRouter();
  const { data: discipulados = [] } = useDiscipulados();
  const { data: profiles = [] } = useProfiles();

  const nombreProfile = (id: string | null) =>
    profiles.find((p) => p.id === id)?.nombre_completo ?? "Sin asignar";

  return (
    <ScrollView className="flex-1 bg-cream" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <Button title="+ Nuevo discipulado" onPress={() => router.push("/discipulado/editar")} />

      <Label className="mb-2 mt-4">Discipulados ({discipulados.length})</Label>
      <View className="gap-2.5">
        {discipulados.map((d) => (
          <Pressable key={d.id} onPress={() => router.push(`/discipulado/${d.id}`)} className="active:opacity-80">
            <Card>
              <View className="flex-row items-start justify-between">
                <Title numberOfLines={1} className="flex-1 pr-2">
                  {d.nombre ?? d.descripcion_etaria ?? "Discipulado"}
                </Title>
                <Ionicons name="chevron-forward" size={18} color={colors.outline} />
              </View>
              <Muted className="mt-1 text-gold">
                {DIAS_SEMANA[d.dia_semana]} · {formatHora(d.hora_inicio)}
              </Muted>
              <View className="mt-3 flex-row flex-wrap items-center gap-2 border-t border-black/5 pt-3">
                <Chip tone="navy">{d.sexo}</Chip>
                <View className="flex-row items-center gap-1">
                  <Ionicons name="person-outline" size={13} color={colors.outline} />
                  <Muted>{nombreProfile(d.discipulador_id)}</Muted>
                </View>
              </View>
            </Card>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
