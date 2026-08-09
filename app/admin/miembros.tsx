import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, View } from "react-native";
import { Avatar, Body, Button, Card, Chip, Field, Label, Muted } from "../../components/ui";
import { calcularEdad, formatHora } from "../../lib/date";
import { colors, fonts } from "../../lib/theme";
import { DIAS_SEMANA, Sexo } from "../../lib/types";
import { useMiembros, useUpsertMiembro } from "../../lib/queries/miembros";
import { useDiscipulados } from "../../lib/queries/discipulados";
import { useCrearMiembroEnDiscipulado } from "../../lib/queries/participaciones";
import { useMiembrosConCuenta } from "../../lib/queries/profiles";


export default function AdminMiembros() {
  const router = useRouter();
  const { data: miembros = [], isLoading } = useMiembros();
  const { data: discipulados = [] } = useDiscipulados();
  // Qué fichas ya tienen cuenta enlazada: sus datos personales los autogestiona
  // la persona (0021), así que el admin edita sabiendo que la ficha tiene dueño.
  const { data: conCuenta } = useMiembrosConCuenta();
  const totalConCuenta = miembros.filter((m) => conCuenta?.has(m.id)).length;
  const crear = useCrearMiembroEnDiscipulado();
  const crearSuelto = useUpsertMiembro();

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
    try {
      if (discipuladoId) {
        // Alta + participación en el grupo elegido (RPC agregar_discipulo).
        await crear.mutateAsync({
          discipuladoId,
          nombre: nombre.trim(),
          apellido: apellido.trim() || null,
          sexo,
          telefono: telefono.trim() || null,
        });
      } else {
        // Sin grupo (no participa aún o su discipulado no existe todavía):
        // se crea solo el miembro, sin participación.
        await crearSuelto.mutateAsync({
          nombre: nombre.trim(),
          apellido: apellido.trim() || null,
          sexo,
          telefono: telefono.trim() || null,
        });
      }
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
                <Label className="mb-1.5">Discipulado (opcional)</Label>
                <Muted className="mb-2">
                  Si todavía no participa de un grupo o su discipulado aún no existe, dejalo sin asignar.
                </Muted>
                <View className="mb-4 gap-2">
                  <Pressable
                    onPress={() => setDiscipuladoId(null)}
                    className={`flex-row items-center gap-2 rounded-xl border p-3 active:opacity-70 ${
                      discipuladoId === null ? "border-navy bg-navy/5" : "border-black/10 bg-surface"
                    }`}
                  >
                    <Ionicons
                      name={discipuladoId === null ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={discipuladoId === null ? colors.primary : colors.outline}
                    />
                    <Body className="text-ink">Sin discipulado por ahora</Body>
                  </Pressable>
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
                <Button title="Guardar" onPress={guardar} loading={crear.isPending || crearSuelto.isPending} />
              </Card>
            )}
            <Label className={conCuenta ? "mt-4" : "mb-2 mt-4"}>
              Miembros ({miembros.length})
            </Label>
            {/* Recién cuando llegó el dato: si no, diría «0 con cuenta» mientras carga. */}
            {conCuenta && (
              <Muted className="mb-2 mt-1">
                {totalConCuenta} con cuenta en la app · {miembros.length - totalConCuenta} sin
                cuenta
              </Muted>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const edad = calcularEdad(item.fecha_nacimiento);
          const detalle = [edad != null ? `${edad} años` : null, item.telefono]
            .filter(Boolean)
            .join(" · ");
          const tieneCuenta = conCuenta?.has(item.id) ?? false;
          return (
            <Pressable
              onPress={() => router.push({ pathname: "/miembro/[id]", params: { id: item.id } })}
              className="active:opacity-70"
            >
              <Card className="mb-2.5 flex-row items-center gap-3 py-3.5">
                <Avatar name={item.nombre} size={38} tone="gold" />
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Body 
                      className="shrink text-ink" 
                      style={{ fontFamily: fonts.sansBold}}
                      numberOfLines={1}
                    >
                      {item.nombre} {item.apellido ?? ""}
                    </Body>
                    <Chip tone="neutral">{item.sexo}</Chip>
                  </View>
                  {/* {edad ? <Muted> <Ionicons name="calendar" size={12} color={colors.outline} /> {`${edad} años`}</Muted> : null} */}
                  {item.telefono ? <Muted> <Ionicons name="call" size={12} color={colors.outline} /> {item.telefono }</Muted> : null}
                </View>
                {tieneCuenta && <Chip tone="success">C</Chip>}
                <Ionicons name="chevron-forward" size={16} color={colors.outline} />
              </Card>
            </Pressable>
          );
        }}
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
