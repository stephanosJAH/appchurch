import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, Pressable, View } from "react-native";
import { Avatar, Body, Button, Card, Chip, Field, Label, Muted } from "../../components/ui";
import { colors } from "../../lib/theme";
import { Sexo } from "../../lib/types";
import { useMiembros, useUpsertMiembro } from "../../lib/queries/miembros";

export default function AdminMiembros() {
  const router = useRouter();
  const { data: miembros = [], isLoading } = useMiembros();
  const upsert = useUpsertMiembro();

  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [sexo, setSexo] = useState<Sexo>("M");
  const [telefono, setTelefono] = useState("");

  const reset = () => {
    setNombre("");
    setApellido("");
    setSexo("M");
    setTelefono("");
    setShowForm(false);
  };

  const guardar = async () => {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Ingresá al menos el nombre.");
      return;
    }
    try {
      await upsert.mutateAsync({
        nombre: nombre.trim(),
        apellido: apellido.trim() || null,
        sexo,
        telefono: telefono.trim() || null,
      });
      reset();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar.");
    }
  };

  return (
    <View className="flex-1 bg-cream">
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        data={miembros}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={
          <View className="mb-3">
            <Button
              title={showForm ? "Cancelar" : "+ Nuevo miembro"}
              variant={showForm ? "outline" : "primary"}
              onPress={() => setShowForm((v) => !v)}
            />
            {showForm && (
              <Card className="mt-3">
                <Field label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
                <Field label="Apellido" value={apellido} onChangeText={setApellido} autoCapitalize="words" />
                <Field label="Teléfono" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" />
                <Label className="mb-1.5">Sexo</Label>
                <View className="mb-4 flex-row gap-2">
                  {(["M", "F"] as Sexo[]).map((s) => (
                    <View key={s} className="flex-1">
                      <Button title={s === "M" ? "Masculino" : "Femenino"} variant={sexo === s ? "primary" : "outline"} size="sm" onPress={() => setSexo(s)} />
                    </View>
                  ))}
                </View>
                <Button title="Guardar" onPress={guardar} loading={upsert.isPending} />
              </Card>
            )}
            <Label className="mb-2 mt-4">Miembros ({miembros.length})</Label>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/miembro/[id]", params: { id: item.id } })}
            className="active:opacity-70"
          >
            <Card className="mb-2.5 flex-row items-center gap-3 py-3.5">
              <Avatar name={item.nombre} size={38} tone="gold" />
              <View className="flex-1">
                <Body className="text-ink">
                  {item.nombre} {item.apellido ?? ""}
                </Body>
                {item.telefono ? <Muted>{item.telefono}</Muted> : null}
              </View>
              <Chip tone="neutral">{item.sexo}</Chip>
              <Ionicons name="chevron-forward" size={16} color={colors.outline} />
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <Card>
              <Muted>No hay miembros cargados.</Muted>
            </Card>
          ) : null
        }
      />
    </View>
  );
}
