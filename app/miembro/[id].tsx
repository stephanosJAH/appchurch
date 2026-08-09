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
import { RolApp, Sexo } from "../../lib/types";
import {
  useGuardarNotasMiembro,
  useMiembro,
  useMiembroTieneCuenta,
  useUpsertMiembro,
} from "../../lib/queries/miembros";
import { useParticipacionesDeMiembro } from "../../lib/queries/participaciones";
import { useCuentaDeMiembro, useUpdateRol } from "../../lib/queries/profiles";

export default function MiembroDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin, profile } = useAuth();
  const miembroId = String(id);

  const { data: miembro, isLoading } = useMiembro(miembroId);
  const { data: tieneCuenta, isLoading: cargandoCuenta } = useMiembroTieneCuenta(miembroId);
  const { data: participaciones = [] } = useParticipacionesDeMiembro(miembroId);
  // La cuenta enlazada a esta ficha: solo para admin, que es quien administra
  // roles (app/admin/usuarios.tsx). Al obrero la RLS le devolvería null igual.
  const { data: cuenta } = useCuentaDeMiembro(miembroId, isAdmin);
  const upsert = useUpsertMiembro();
  const guardarNotas = useGuardarNotasMiembro();
  const updateRol = useUpdateRol();

  // Gestiona a esta persona: el admin, o el discipulador de alguno de sus grupos.
  const esMiDiscipulo = participaciones.some(
    (p) => p.discipulado?.discipulador_id === profile?.id
  );
  const puedeGestionar = isAdmin || esMiDiscipulo;
  // Con cuenta enlazada la ficha tiene dueño: la persona la autogestiona desde
  // "Mis datos" y su discipulador solo la lee, salvo la descripción pastoral.
  // El admin conserva la edición (es el ABM del padrón). Lo hace cumplir la RLS
  // de 0021, no esto: acá solo se decide qué mostrar.
  const puedeEditarDatos = puedeGestionar && !(tieneCuenta && !isAdmin);

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [sexo, setSexo] = useState<Sexo>("M");
  const [nacimiento, setNacimiento] = useState(""); // "YYYY-MM-DD" | ""
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [notas, setNotas] = useState("");
  const [activo, setActivo] = useState(true);
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
    setActivo(miembro.activo);
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
        // Solo el admin manda esta columna: el trigger de 0022 rechaza el
        // cambio de cualquier otro, y mandarla sin poder cambiarla no aporta.
        ...(isAdmin ? { activo } : {}),
      });
      Alert.alert("Listo", "Datos actualizados.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudieron guardar los cambios.");
    }
  };

  const onGuardarNotas = async () => {
    try {
      await guardarNotas.mutateAsync({ id: miembroId, notas: notas.trim() || null });
      Alert.alert("Listo", "Descripción actualizada.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar la descripción.");
    }
  };

  // Mismo cambio de rol que app/admin/usuarios.tsx, acá sobre la cuenta de esta
  // persona. La autorización es de la RLS (`prof_admin`, 0002) más el trigger
  // que impide autoescalarse (0010); el botón deshabilitado es solo la UI.
  const esMiCuenta = !!cuenta && cuenta.id === profile?.id;
  const cambiarRol = (rol: RolApp) => {
    if (!cuenta || cuenta.rol === rol) return;
    const accion = () => updateRol.mutate({ id: cuenta.id, rol });
    if (rol === "admin") {
      Alert.alert(
        "Hacer administrador",
        `${miembro?.nombre ?? "Esta persona"} tendrá acceso total (crear discipulados, gestionar todo). ¿Confirmás?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Confirmar", onPress: accion },
        ]
      );
    } else {
      accion();
    }
  };

  if (isLoading || cargandoCuenta) {
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

      {/* Sin edición de datos: la ficha se lee como información personal. La
          descripción va aparte porque sí sigue siendo del discipulador. */}
      {!puedeEditarDatos ? (
        <>
          {puedeGestionar && (
            <View className="mb-4 flex-row items-start gap-2 rounded-lg bg-surface-low p-3">
              <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
              <Muted className="flex-1">
                {miembro.nombre} tiene cuenta en la app: sus datos personales los
                gestiona desde su perfil. Podés dejarle una descripción para el
                seguimiento.
              </Muted>
            </View>
          )}

          <Card className="gap-3">
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
          </Card>

          {puedeGestionar ? (
            <Card className="mt-4">
              <Field
                label="Descripción"
                value={notas}
                onChangeText={setNotas}
                placeholder="Información adicional (notas, situación, etc.)"
                multiline
              />
              <Button
                title="Guardar descripción"
                onPress={onGuardarNotas}
                loading={guardarNotas.isPending}
              />
            </Card>
          ) : notas ? (
            <Card className="mt-4">
              <Label>Descripción</Label>
              <Body className="mt-0.5 text-ink">{notas}</Body>
            </Card>
          ) : null}
        </>
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

      {/* Cuenta de la app: el rol se administra desde acá o desde
          admin/usuarios.tsx, indistinto. Solo aparece si la ficha está enlazada
          a una cuenta — sin cuenta no hay rol que cambiar. */}
      {isAdmin && cuenta && (
        <Card className="mt-4">
          <View className="flex-row items-center gap-2">
            <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
            <Label>Cuenta en la app</Label>
          </View>
          <Muted className="mt-1">
            {cuenta.username
              ? `Ingresa como ${cuenta.username}`
              : cuenta.nombre_completo ?? "Cuenta enlazada a esta ficha"}
          </Muted>

          <Label className="mb-1.5 mt-4">Rol</Label>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                title="Miembro"
                variant={cuenta.rol === "miembro" ? "primary" : "outline"}
                size="sm"
                disabled={esMiCuenta || updateRol.isPending}
                onPress={() => cambiarRol("miembro")}
              />
            </View>
            <View className="flex-1">
              <Button
                title="Obrero"
                variant={cuenta.rol === "obrero" ? "primary" : "outline"}
                size="sm"
                disabled={esMiCuenta || updateRol.isPending}
                onPress={() => cambiarRol("obrero")}
              />
            </View>
            <View className="flex-1">
              <Button
                title="Admin"
                variant={cuenta.rol === "admin" ? "gold" : "outline"}
                size="sm"
                disabled={esMiCuenta || updateRol.isPending}
                onPress={() => cambiarRol("admin")}
              />
            </View>
          </View>
          {esMiCuenta ? (
            <Muted className="mt-2">No podés cambiar tu propio rol.</Muted>
          ) : (
            <Muted className="mt-2">
              El obrero gestiona los grupos que tiene asignados; el admin, todo.
            </Muted>
          )}
        </Card>
      )}
    </KeyboardScrollView>
  );
}
