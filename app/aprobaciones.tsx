import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Alert, FlatList, Platform, Pressable, View } from "react-native";
import { Avatar, Body, Button, Card, Field, KeyboardScrollView, Label, Muted } from "../components/ui";
import { dateToFecha, fechaLabel, fechaToDate } from "../lib/date";
import {
  CandidatoMiembro,
  useCandidatosParaPerfil,
  usePendientes,
  useResolverIdentidad,
} from "../lib/queries/profiles";
import { colors } from "../lib/theme";
import { Profile, Sexo } from "../lib/types";

// Aprobación de cuentas pendientes. Accesible para obreros y admins (RLS).
//
// La aprobación ES la resolución de identidad (0018), no un simple toggle:
// la mayoría de quienes se registran ya están en el padrón (los cargó su
// discipulador antes de que existiera el login), así que activar sin
// enlazar terminaba creando una ficha duplicada la primera vez que la
// persona autoeditaba sus datos (app/mis-datos.tsx). Acá el obrero, que conoce a la
// persona, la enlaza a su ficha existente o carga una nueva — nunca hay un
// camino para habilitar sin resolver quién es.
export default function Aprobaciones() {
  const { data: pendientes = [], isLoading } = usePendientes();
  const [resolviendo, setResolviendo] = useState<Profile | null>(null);

  if (resolviendo) {
    return <ResolverIdentidad profile={resolviendo} onVolver={() => setResolviendo(null)} />;
  }

  const renderItem = ({ item: p }: { item: Profile }) => (
    <Pressable onPress={() => setResolviendo(p)} className="mb-2.5 active:opacity-80">
      <Card className="flex-row items-center gap-3">
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
        <Ionicons name="chevron-forward" size={18} color={colors.outline} />
      </Card>
    </Pressable>
  );

  return (
    <View className="flex-1 bg-cream">
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        data={pendientes}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View className="mb-3">
            <Label className="mb-1">Cuentas pendientes ({pendientes.length})</Label>
            <Muted>Tocá una cuenta para identificar a la persona y habilitarla.</Muted>
          </View>
        }
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

// Candidatos del padrón para una cuenta pendiente + fallback de ficha nueva.
function ResolverIdentidad({ profile, onVolver }: { profile: Profile; onVolver: () => void }) {
  const { data: candidatos = [], isLoading } = useCandidatosParaPerfil(profile.id);
  const resolver = useResolverIdentidad();
  const [creandoFicha, setCreandoFicha] = useState(false);

  const enlazar = (c: CandidatoMiembro) => {
    const nombreCompleto = `${c.nombre} ${c.apellido ?? ""}`.trim();
    Alert.alert(
      "Confirmar identidad",
      `¿${profile.nombre_completo ?? "Esta cuenta"} es ${nombreCompleto}? Vas a enlazar su cuenta a esa ficha del padrón y habilitarla.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, es esta persona",
          onPress: async () => {
            try {
              await resolver.mutateAsync({ profileId: profile.id, miembroId: c.id });
              onVolver();
            } catch (e: any) {
              Alert.alert("Error", e.message ?? "No se pudo enlazar la cuenta.");
            }
          },
        },
      ]
    );
  };

  if (creandoFicha) {
    return (
      <CrearFichaYActivar profile={profile} onCancelar={() => setCreandoFicha(false)} onListo={onVolver} />
    );
  }

  return (
    <View className="flex-1 bg-cream">
      <FlatList
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        data={candidatos}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={
          <View className="mb-3">
            <Pressable onPress={onVolver} hitSlop={8} className="mb-3 flex-row items-center gap-1 active:opacity-70">
              <Ionicons name="chevron-back" size={18} color={colors.outline} />
              <Muted>Volver a la lista</Muted>
            </Pressable>
            <View className="flex-row items-center gap-3">
              <Avatar name={profile.nombre_completo} size={42} />
              <View className="flex-1">
                <Body className="text-ink" numberOfLines={1}>
                  {profile.nombre_completo ?? "Sin nombre"}
                </Body>
                <Muted>{profile.username ?? "sin usuario"}</Muted>
              </View>
            </View>
            <Muted className="mt-3">
              {isLoading
                ? "Buscando en el padrón…"
                : candidatos.length > 0
                  ? "¿Es alguna de estas personas del padrón?"
                  : "No encontramos a nadie parecido en el padrón."}
            </Muted>
          </View>
        }
        renderItem={({ item: c }) => (
          <Card className="mb-2.5">
            <View className="flex-row items-center gap-3">
              <Avatar name={c.nombre} size={38} />
              <View className="flex-1">
                <Body className="text-ink" numberOfLines={1}>
                  {`${c.nombre} ${c.apellido ?? ""}`.trim()}
                </Body>
                {c.telefono_parcial ? (
                  <View className="mt-0.5 flex-row items-center gap-1">
                    <Ionicons name="call-outline" size={13} color={colors.outline} />
                    <Muted>{c.telefono_parcial}</Muted>
                  </View>
                ) : null}
              </View>
              <Button
                title="Es esta persona"
                size="sm"
                variant="outline"
                onPress={() => enlazar(c)}
                loading={resolver.isPending}
              />
            </View>
          </Card>
        )}
        ListFooterComponent={
          <View className="mt-2">
            <Button title="No está en la lista: crear ficha nueva" variant="ghost" onPress={() => setCreandoFicha(true)} />
          </View>
        }
      />
    </View>
  );
}

// Fallback: la persona de verdad no está en el padrón. Se carga la ficha
// mínima (mismos campos editables que app/mis-datos.tsx) y se enlaza+activa
// en el mismo paso (resolver_identidad_pendiente con p_miembro_id = null).
function CrearFichaYActivar({
  profile,
  onCancelar,
  onListo,
}: {
  profile: Profile;
  onCancelar: () => void;
  onListo: () => void;
}) {
  const resolver = useResolverIdentidad();
  const [nombre, setNombre] = useState(profile.nombre_completo ?? "");
  const [apellido, setApellido] = useState("");
  const [sexo, setSexo] = useState<Sexo>("M");
  const [nacimiento, setNacimiento] = useState(""); // "YYYY-MM-DD" | ""
  const [telefono, setTelefono] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const onCrear = async () => {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Ingresá al menos el nombre.");
      return;
    }
    try {
      await resolver.mutateAsync({
        profileId: profile.id,
        nuevaFicha: {
          nombre: nombre.trim(),
          apellido: apellido.trim() || null,
          sexo,
          fecha_nacimiento: nacimiento || null,
          telefono: telefono.trim() || null,
        },
      });
      onListo();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo crear la ficha.");
    }
  };

  return (
    <KeyboardScrollView>
      <Pressable onPress={onCancelar} hitSlop={8} className="mb-3 flex-row items-center gap-1 active:opacity-70">
        <Ionicons name="chevron-back" size={18} color={colors.outline} />
        <Muted>Volver a los candidatos</Muted>
      </Pressable>

      <Card>
        <Label className="mb-3">Ficha nueva del padrón</Label>
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

        <Label className="mb-1.5">Cumpleaños</Label>
        <View className="mb-4 flex-row items-center gap-2">
          <Pressable
            onPress={() => setShowPicker(true)}
            className="flex-1 flex-row items-center justify-between rounded-lg border border-black/10 bg-surface px-4 py-3.5 active:opacity-70"
          >
            <Body className={nacimiento ? "capitalize text-ink" : "text-outline"}>{fechaLabel(nacimiento)}</Body>
            <Ionicons name="calendar-outline" size={18} color={colors.outline} />
          </Pressable>
          {nacimiento ? <Button title="Quitar" variant="ghost" size="sm" onPress={() => setNacimiento("")} /> : null}
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

        <Button title="Crear ficha y habilitar" onPress={onCrear} loading={resolver.isPending} />
      </Card>
    </KeyboardScrollView>
  );
}
