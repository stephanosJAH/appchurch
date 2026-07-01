import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { AppBar } from "../../components/AppBar";
import { Body, Button, Card, Chip, Headline, Label, Muted, Title } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { formatHora } from "../../lib/date";
import { colors } from "../../lib/theme";
import { Discipulado, DIAS_SEMANA } from "../../lib/types";
import { useDiscipulados } from "../../lib/queries/discipulados";

function DiscipuladoCard({ d, onPress }: { d: Discipulado; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card>
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Title numberOfLines={1}>{d.nombre ?? d.descripcion_etaria ?? "Discipulado"}</Title>
            <View className="mt-1.5 flex-row items-center gap-1.5">
              <Ionicons name="calendar-outline" size={14} color={colors.tertiary} />
              <Muted className="text-gold">
                {DIAS_SEMANA[d.dia_semana]} · {formatHora(d.hora_inicio)}
              </Muted>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.outline} />
        </View>
        <View className="mt-3 flex-row items-center gap-2 border-t border-black/5 pt-3">
          <Chip tone="neutral">{d.modalidad}</Chip>
          <Chip tone="navy">{d.sexo}</Chip>
          {!d.activo && <Chip tone="neutral">Inactivo</Chip>}
        </View>
        <View className="mt-2 flex-row items-center gap-1.5">
          <Ionicons name="person-outline" size={13} color={colors.outline} />
          <Muted>{d.discipulador?.nombre_completo ?? "Sin discipulador asignado"}</Muted>
        </View>
      </Card>
    </Pressable>
  );
}

export default function MiDiscipulado() {
  const router = useRouter();
  const { isAdmin, profile } = useAuth();
  const { data: discipulados = [], isLoading } = useDiscipulados();

  const propios = discipulados.filter((d) => d.discipulador_id === profile?.id);
  const goTo = (id: string) => router.push(`/discipulado/${id}`);

  return (
    <View className="flex-1 bg-cream">
      <AppBar />
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
          <View className="mb-4 flex-row items-center justify-between">
            <Headline>{isAdmin ? "Discipulados" : "Mi discipulado"}</Headline>
            {isAdmin && (
              <Button title="Nuevo" variant="outline" size="sm" onPress={() => router.push("/discipulado/editar")} />
            )}
          </View>

          {discipulados.length === 0 ? (
            <Card>
              <Body>
                {isAdmin
                  ? "Todavía no hay discipulados. Andá a Admin para crear uno y asignar el discipulador."
                  : "No tenés un discipulado asignado. Pedile a un admin que te asigne uno."}
              </Body>
            </Card>
          ) : isAdmin ? (
            <>
              {/* Mi propio discipulado (si el admin lidera uno) */}
              {propios.length > 0 && (
                <View className="mb-5">
                  <Label className="mb-2">Mi discipulado</Label>
                  <View className="gap-3">
                    {propios.map((d) => (
                      <DiscipuladoCard key={d.id} d={d} onPress={() => goTo(d.id)} />
                    ))}
                  </View>
                </View>
              )}

              {/* Separador */}
              {propios.length > 0 && <View className="mb-5 h-px bg-black/10" />}

              {/* Todos los discipulados existentes */}
              <Label className="mb-2">Todos los discipulados ({discipulados.length})</Label>
              <View className="gap-3">
                {discipulados.map((d) => (
                  <DiscipuladoCard key={d.id} d={d} onPress={() => goTo(d.id)} />
                ))}
              </View>
            </>
          ) : (
            <View className="gap-3">
              {discipulados.map((d) => (
                <DiscipuladoCard key={d.id} d={d} onPress={() => goTo(d.id)} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
