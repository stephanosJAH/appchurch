import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Alert, FlatList, Pressable, View } from "react-native";
import { Avatar, Body, Button, Card, Chip, Label, Muted } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { colors } from "../../lib/theme";
import { Profile, RolApp } from "../../lib/types";
import { useDiscipulados } from "../../lib/queries/discipulados";
import { useProfiles, useUpdateRol } from "../../lib/queries/profiles";

export default function AdminUsuarios() {
  const router = useRouter();
  const { profile: yo } = useAuth();
  const { data: profiles = [], isLoading } = useProfiles();
  const { data: discipulados = [] } = useDiscipulados();
  const updateRol = useUpdateRol();

  const pendientesCount = profiles.filter((p) => p.rol === "pendiente").length;
  const activos = profiles.filter((p) => p.rol !== "pendiente");

  // profileId -> nombre del grupo que lidera
  const grupoDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of discipulados) {
      if (d.discipulador_id) m.set(d.discipulador_id, d.nombre ?? d.descripcion_etaria ?? "un grupo");
    }
    return m;
  }, [discipulados]);

  const cambiarRol = (p: Profile, rol: RolApp) => {
    if (p.rol === rol) return;
    const accion = () => updateRol.mutate({ id: p.id, rol });
    if (rol === "admin") {
      Alert.alert(
        "Hacer administrador",
        `${p.nombre_completo ?? "Este usuario"} tendrá acceso total (crear discipulados, gestionar todo). ¿Confirmás?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Confirmar", onPress: accion },
        ]
      );
    } else {
      accion();
    }
  };

  const renderItem = ({ item: p }: { item: Profile }) => {
    const esYo = p.id === yo?.id;
    const grupo = grupoDe.get(p.id);
    return (
      <Card className="mb-2.5">
        <View className="flex-row items-center gap-3">
          <Avatar name={p.nombre_completo} size={42} tone={p.rol === "admin" ? "gold" : "navy"} />
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Body className="text-ink" numberOfLines={1}>
                {p.nombre_completo ?? "Sin nombre"}
              </Body>
              {esYo && <Chip tone="neutral">Vos</Chip>}
            </View>
            <View className="mt-0.5 flex-row items-center gap-1">
              <Ionicons name="people-outline" size={13} color={colors.outline} />
              <Muted>{grupo ? `Lidera «${grupo}»` : "Sin grupo asignado"}</Muted>
            </View>
          </View>
        </View>

        {/* Selector de rol */}
        <View className="mt-3 flex-row gap-2 border-t border-black/5 pt-3">
          <View className="flex-1">
            <Button
              title="Miembro"
              variant={p.rol === "miembro" ? "primary" : "outline"}
              size="sm"
              disabled={esYo}
              onPress={() => cambiarRol(p, "miembro")}
            />
          </View>
          <View className="flex-1">
            <Button
              title="Obrero"
              variant={p.rol === "obrero" ? "primary" : "outline"}
              size="sm"
              disabled={esYo}
              onPress={() => cambiarRol(p, "obrero")}
            />
          </View>
          <View className="flex-1">
            <Button
              title="Admin"
              variant={p.rol === "admin" ? "gold" : "outline"}
              size="sm"
              disabled={esYo}
              onPress={() => cambiarRol(p, "admin")}
            />
          </View>
        </View>
        {esYo && <Muted className="mt-2">No podés cambiar tu propio rol.</Muted>}
      </Card>
    );
  };

  return (
    <View className="flex-1 bg-cream">
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        data={activos}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View>
            {pendientesCount > 0 && (
              <Pressable
                onPress={() => router.push("/aprobaciones")}
                className="mb-3 active:opacity-80"
              >
                <Card className="flex-row items-center gap-3">
                  <View className="h-9 w-9 items-center justify-center rounded-full bg-gold-container">
                    <Ionicons name="person-add-outline" size={18} color={colors.onTertiaryContainer} />
                  </View>
                  <View className="flex-1">
                    <Body className="text-ink">
                      {pendientesCount} cuenta{pendientesCount === 1 ? "" : "s"} pendiente
                      {pendientesCount === 1 ? "" : "s"}
                    </Body>
                    <Muted>Tocá para revisar y habilitar</Muted>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.outline} />
                </Card>
              </Pressable>
            )}
            <Label className="mb-2">Usuarios registrados ({activos.length})</Label>
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <Card>
              <Muted>
                No hay usuarios todavía. Cada persona aparece acá cuando crea su cuenta en la app.
              </Muted>
            </Card>
          ) : null
        }
      />
    </View>
  );
}
