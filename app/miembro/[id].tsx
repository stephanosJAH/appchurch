import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, View } from "react-native";
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
import { useAuth } from "../../lib/auth";
import { calcularEdad, dateToFecha, fechaLabel, fechaToDate } from "../../lib/date";
import { colors } from "../../lib/theme";
import { Sexo } from "../../lib/types";
import { useMiembro, useUpsertMiembro } from "../../lib/queries/miembros";
import { useParticipacionesDeMiembro } from "../../lib/queries/participaciones";

export default function MiembroDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin, profile } = useAuth();
  const miembroId = String(id);

  const { data: miembro, isLoading } = useMiembro(miembroId);
  const { data: participaciones = [] } = useParticipacionesDeMiembro(miembroId);
  const upsert = useUpsertMiembro();

  // Puede editar: el admin, o el discipulador de algún grupo del miembro.
  const esMiDiscipulo = participaciones.some(
    (p) => p.discipulado?.discipulador_id === profile?.id
  );
  const puedeEditar = isAdmin || esMiDiscipulo;

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [sexo, setSexo] = useState<Sexo>("M");
  const [nacimiento, setNacimiento] = useState(""); // "YYYY-MM-DD" | ""
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  // Cargar los datos del miembro en el formulario cuando llegan.
  useEffect(() => {
    if (!miembro) return;
    setNombre(miembro.nombre);
    setApellido(miembro.apellido ?? "");
    setSexo(miembro.sexo);
    setNacimiento(miembro.fecha_nacimiento ?? "");
    setTelefono(miembro.telefono ?? "");
    setEmail(miembro.email ?? "");
    setNotas(miembro.notas ?? "");
  }, [miembro]);

  const edad = calcularEdad(nacimiento);

  const guardar = async () => {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Ingresá al menos el nombre.");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: miembroId,
        nombre: nombre.trim(),
        apellido: apellido.trim() || null,
        sexo,
        fecha_nacimiento: nacimiento || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        notas: notas.trim() || null,
      });
      Alert.alert("Listo", "Datos actualizados.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudieron guardar los cambios.");
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <Muted>Cargando…</Muted>
      </View>
    );
  }

  if (!miembro) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-6">
        <Muted>No se encontró el miembro.</Muted>
      </View>
    );
  }

  return (
    <KeyboardScrollView>
      {/* Encabezado */}
      <Card className="mb-4 flex-row items-center gap-3">
        <Avatar name={miembro.nombre} size={52} tone="gold" />
        <View className="flex-1">
          <Title numberOfLines={1}>
            {miembro.nombre} {miembro.apellido ?? ""}
          </Title>
          <View className="mt-1 flex-row items-center gap-2">
            <Chip tone="neutral">{miembro.sexo === "M" ? "Masculino" : "Femenino"}</Chip>
            {edad != null && <Chip tone="navy">{edad} años</Chip>}
          </View>
        </View>
      </Card>

      {/* Solo lectura para quien no puede editar */}
      {!puedeEditar ? (
        <Card className="gap-2">
          <View>
            <Label>Cumpleaños</Label>
            <Body className="mt-0.5 capitalize text-ink">
              {fechaLabel(nacimiento, "Sin registrar")}
            </Body>
          </View>
          {telefono ? (
            <View>
              <Label>Teléfono</Label>
              <Body className="mt-0.5 text-ink">{telefono}</Body>
            </View>
          ) : null}
          {email ? (
            <View>
              <Label>Email</Label>
              <Body className="mt-0.5 text-ink">{email}</Body>
            </View>
          ) : null}
          {notas ? (
            <View>
              <Label>Descripción</Label>
              <Body className="mt-0.5 text-ink">{notas}</Body>
            </View>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Field label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
          <Field label="Apellido" value={apellido} onChangeText={setApellido} autoCapitalize="words" placeholder="Opcional" />

          <Label className="mb-1.5">Sexo</Label>
          <View className="mb-4 flex-row gap-2">
            {(["M", "F"] as Sexo[]).map((s) => (
              <View key={s} className="flex-1">
                <Button
                  title={s === "M" ? "Masculino" : "Femenino"}
                  variant={sexo === s ? "primary" : "outline"}
                  size="sm"
                  onPress={() => setSexo(s)}
                />
              </View>
            ))}
          </View>

          {/* Cumpleaños */}
          <Label className="mb-1.5">Cumpleaños</Label>
          <View className="mb-4 flex-row items-center gap-2">
            <Pressable
              onPress={() => setShowPicker(true)}
              className="flex-1 flex-row items-center justify-between rounded-lg border border-black/10 bg-surface px-4 py-3.5 active:opacity-70"
            >
              <Body className={nacimiento ? "capitalize text-ink" : "text-outline"}>
                {fechaLabel(nacimiento)}
              </Body>
              <View className="flex-row items-center gap-2">
                {edad != null && <Muted className="text-gold">{edad} años</Muted>}
                <Ionicons name="calendar-outline" size={18} color={colors.outline} />
              </View>
            </Pressable>
            {nacimiento ? (
              <Button title="Quitar" variant="ghost" size="sm" onPress={() => setNacimiento("")} />
            ) : null}
          </View>
          {showPicker && (
            <DateTimePicker
              value={fechaToDate(nacimiento)}
              mode="date"
              maximumDate={new Date()}
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={(event, selected) => {
                if (Platform.OS !== "ios") setShowPicker(false);
                if (event.type === "set" && selected) setNacimiento(dateToFecha(selected));
              }}
            />
          )}

          <Field label="Teléfono" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" placeholder="Opcional" />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholder="Opcional" />
          <Field
            label="Descripción"
            value={notas}
            onChangeText={setNotas}
            placeholder="Información adicional (notas, situación, etc.)"
            multiline
          />

          <Button title="Guardar cambios" onPress={guardar} loading={upsert.isPending} />
        </Card>
      )}
    </KeyboardScrollView>
  );
}
