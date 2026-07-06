import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { Avatar, Body, Button, Card, Chip, Field, Label, Muted } from "../../components/ui";
import { formatHora } from "../../lib/date";
import { colors } from "../../lib/theme";
import { DIAS_SEMANA, Sexo } from "../../lib/types";
import { useMiembros } from "../../lib/queries/miembros";
import { useDiscipulados } from "../../lib/queries/discipulados";
import { useCrearMiembroEnDiscipulado } from "../../lib/queries/participaciones";

export default function AdminMiembros() {
  const router = useRouter();
  const { data: miembros = [], isLoading } = useMiembros();
  const { data: discipulados = [] } = useDiscipulados();
  const crear = useCrearMiembroEnDiscipulado();

  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [sexo, setSexo] = useState<Sexo>("M");
  const [telefono, setTelefono] = useState("");
  const [discipuladoId, setDiscipuladoId] = useState<string | null>(null);

  const reset = () => {
    setNombre("");
    setApellido("");
    setSexo("M");
    setTelefono("");
    setDiscipuladoId(null);
    setShowForm(false);
  };

  const guardar = async () => {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Ingresá al menos el nombre.");
      return;
    }
    if (!discipuladoId) {
      Alert.alert("Falta el discipulado", "Elegí a qué discipulado se asocia el miembro.");
      return;
    }
    try {
      await crear.mutateAsync({
        discipuladoId,
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
    <KeyboardAvoidingView
      className="flex-1 bg-cream"
      behavior={Platform.OS === "android" ? "padding" : undefined}
    >
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
                <Label className="mb-1.5">Discipulado</Label>
                {discipulados.length === 0 ? (
                  <Muted className="mb-4">No hay discipulados activos para asociar.</Muted>
                ) : (
                  <View className="mb-4 gap-2">
                    {discipulados.map((d) => {
                      const activo = discipuladoId === d.id;
                      return (
                        <Pressable
                          key={d.id}
                          onPress={() => setDiscipuladoId(d.id)}
                          className={`flex-row items-center gap-2 rounded-xl border p-3 active:opacity-70 ${
                            activo ? "border-navy bg-navy/5" : "border-black/10 bg-surface"
                          }`}
                        >
                          <Ionicons
                            name={activo ? "radio-button-on" : "radio-button-off"}
                            size={18}
                            color={activo ? colors.primary : colors.outline}
                          />
                          <View className="flex-1">
                            <Body className="text-ink">
                              {d.nombre ?? d.descripcion_etaria ?? "Discipulado"}
                            </Body>
                            <Muted className="text-gold">
                              {DIAS_SEMANA[d.dia_semana]} · {formatHora(d.hora_inicio)}
                            </Muted>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                <Button title="Guardar" onPress={guardar} loading={crear.isPending} />
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
    </KeyboardAvoidingView>
  );
}
