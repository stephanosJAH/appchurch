import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, View } from "react-native";
import {
  Body,
  Button,
  Card,
  Field,
  KeyboardScrollView,
  Label,
  Muted,
  SwitchField,
} from "../components/ui";
import { calcularEdad, dateToFecha, fechaLabel, fechaToDate } from "../lib/date";
import { colors } from "../lib/theme";
import { Sexo } from "../lib/types";
import { useGuardarMisDatos, useMisDatos } from "../lib/queries/misDatos";

export default function MisDatos() {
  const router = useRouter();
  const { data: datos, isLoading } = useMisDatos();
  const guardar = useGuardarMisDatos();

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [sexo, setSexo] = useState<Sexo>("M");
  const [nacimiento, setNacimiento] = useState(""); // "YYYY-MM-DD" | ""
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  // Consentimiento para publicar el teléfono en el directorio. Arranca en
  // true igual que el default de la columna (0020): si la ficha todavía no
  // cargó, el form no muestra un "no" que la persona nunca eligió.
  const [mostrarContacto, setMostrarContacto] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

  // Precargar el formulario con la ficha propia cuando llega.
  useEffect(() => {
    if (!datos) return;
    setNombre(datos.nombre);
    setApellido(datos.apellido ?? "");
    setSexo(datos.sexo);
    setNacimiento(datos.fecha_nacimiento ?? "");
    setTelefono(datos.telefono ?? "");
    setEmail(datos.email ?? "");
    setMostrarContacto(datos.mostrar_contacto ?? true);
  }, [datos]);

  const edad = calcularEdad(nacimiento);

  const onGuardar = async () => {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Ingresá al menos el nombre.");
      return;
    }
    try {
      await guardar.mutateAsync({
        nombre: nombre.trim(),
        apellido: apellido.trim() || null,
        sexo,
        fecha_nacimiento: nacimiento || null,
        telefono: telefono.trim() || null,
        email: email.trim() || null,
        mostrar_contacto: mostrarContacto,
      });
      Alert.alert("Listo", "Tus datos se actualizaron.", [
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

  return (
    <KeyboardScrollView>
      <Card>
        <Field label="Nombre" value={nombre} onChangeText={setNombre} autoCapitalize="words" />
        <Field
          label="Apellido"
          value={apellido}
          onChangeText={setApellido}
          autoCapitalize="words"
          placeholder="Opcional"
        />

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

        <Field
          label="Teléfono"
          value={telefono}
          onChangeText={setTelefono}
          keyboardType="phone-pad"
          placeholder="Opcional"
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="Opcional"
        />

        <View className="mb-4 border-t border-black/5 pt-4">
          <Label className="mb-2.5">Privacidad</Label>
          <SwitchField
            label="Mostrar mi teléfono en el directorio"
            description={
              mostrarContacto
                ? "Cualquier miembro de la iglesia puede llamarte o escribirte por WhatsApp desde el directorio."
                : "Tu teléfono queda oculto. Seguís apareciendo con tu nombre y tu cumpleaños."
            }
            value={mostrarContacto}
            onValueChange={setMostrarContacto}
          />
        </View>

        <Button title="Guardar cambios" onPress={onGuardar} loading={guardar.isPending} />
      </Card>

      <Muted className="mt-3 px-1">
        Tu discipulador y los administradores siempre ven estos datos. En el directorio de
        la iglesia se publican tu nombre y tu cumpleaños, y el teléfono solo si lo permitís.
      </Muted>
    </KeyboardScrollView>
  );
}
