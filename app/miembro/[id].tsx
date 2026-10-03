import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, View } from "react-native";
import { RichTextEditor } from "../../components/RichTextEditor";
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
  Screen,
  Title,
} from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { calcularEdad, dateToFecha, fechaLabel, fechaToDate } from "../../lib/date";
import { estaVacio } from "../../lib/richText";
import { colors } from "../../lib/theme";
import { RolApp, Sexo } from "../../lib/types";
import {
  useGuardarNotasMiembro,
  useMiembro,
  useMiembroTieneCuenta,
  useUpsertMiembro,
} from "../../lib/queries/miembros";
import {
  ParticipacionDeMiembro,
  useDesasociarParticipacion,
  useParticipacionesDeMiembro,
} from "../../lib/queries/participaciones";
import { useCuentaDeMiembro, useUpdateRol } from "../../lib/queries/profiles";

// Una fila de la ficha en modo lectura. Sin input: cuando la persona tiene
// cuenta sus datos son suyos y el discipulador solo los mira.
function Dato({
  label,
  valor,
  capitalizar,
}: {
  label: string;
  valor?: string | null;
  capitalizar?: boolean;
}) {
  if (!valor) return null;
  return (
    <View>
      <Label>{label}</Label>
      <Body className={`mt-0.5 text-ink${capitalizar ? " capitalize" : ""}`}>{valor}</Body>
    </View>
  );
}

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
  const desasociar = useDesasociarParticipacion();

  // Gestiona a esta persona: el admin, o el discipulador de alguno de sus grupos.
  const esMiDiscipulo = participaciones.some(
    (p) => p.discipulado?.discipulador_id === profile?.id
  );
  const puedeGestionar = isAdmin || esMiDiscipulo;
  // Con cuenta enlazada la ficha tiene dueño: la persona la autogestiona desde
  // "Mis datos" y su discipulador solo la lee, salvo las notas pastorales.
  // El admin conserva la edición (es el ABM del padrón). Lo hace cumplir la RLS
  // de 0021, no esto: acá solo se decide qué mostrar.
  const puedeEditarDatos = puedeGestionar && !(tieneCuenta && !isAdmin);
  // Grupos de los que esta persona se puede sacar desde acá: los del admin son
  // todos, los del obrero solo los que lidera. La RLS de `participaciones` ya
  // recorta la lista (un discipulador no ve las de otros grupos); este filtro
  // es para que la UI no ofrezca un botón que el backend va a rechazar.
  const gruposQueGestiono = participaciones.filter(
    (p) => isAdmin || p.discipulado?.discipulador_id === profile?.id
  );

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
  // Las notas se guardan por su propia RPC, así que hay que saber si quedaron
  // pendientes: sin esto "Guardar cambios" volvería atrás dejándolas sin guardar.
  const notasCambiadas = notas !== (miembro?.notas ?? "");
  // Un texto que solo quedó con marcas sueltas o espacios no es una nota.
  const notasAGuardar = () => (estaVacio(notas) ? null : notas.trim());

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
        // Las notas NO: van por su propia RPC, igual que en una ficha con
        // cuenta (un solo camino para esa columna).
        // Solo el admin manda esta columna: el trigger de 0022 rechaza el
        // cambio de cualquier otro, y mandarla sin poder cambiarla no aporta.
        ...(isAdmin ? { activo } : {}),
      });
      // La columna `notas` solo se escribe por la RPC (nunca por el upsert),
      // pero este botón también arrastra lo que haya quedado escrito arriba.
      if (notasCambiadas) await guardarNotas.mutateAsync({ id: miembroId, notas: notasAGuardar() });
      Alert.alert("Listo", "Datos actualizados.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudieron guardar los cambios.");
    }
  };

  const nombreDeGrupo = (p: ParticipacionDeMiembro) =>
    p.discipulado?.nombre ?? p.discipulado?.descripcion_etaria ?? "Discipulado";

  // Desasociar es baja lógica (`activo = false`): la ficha y el historial de
  // asistencias quedan, y a la persona se la puede volver a sumar.
  const quitarDelGrupo = (p: ParticipacionDeMiembro) => {
    Alert.alert(
      "Quitar del discipulado",
      `¿Quitar a ${miembro?.nombre ?? "esta persona"} de «${nombreDeGrupo(p)}»? Se la puede volver a sumar más adelante.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Quitar",
          style: "destructive",
          onPress: () =>
            desasociar.mutate(p.id, {
              onError: (e: any) =>
                Alert.alert("Error", e.message ?? "No se pudo quitar del discipulado."),
            }),
        },
      ]
    );
  };

  const onGuardarNotas = async () => {
    try {
      await guardarNotas.mutateAsync({ id: miembroId, notas: notasAGuardar() });
      Alert.alert("Listo", "Notas actualizadas.");
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudieron guardar las notas.");
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
      <Screen className="items-center justify-center">
        <Muted>Cargando…</Muted>
      </Screen>
    );
  }

  if (!miembro) {
    return (
      <Screen className="items-center justify-center p-6">
        <Muted>No se encontró el miembro.</Muted>
      </Screen>
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

      {/* Sin edición de datos: la ficha se lee como información personal, en
          una vista resumida y sin ningún input. Las notas van aparte, abajo,
          porque sí siguen siendo del discipulador. */}
      {!puedeEditarDatos ? (
        <>
          {puedeGestionar && (
            <View className="mb-4 flex-row items-start gap-2 rounded-lg bg-surface-low p-3">
              <Ionicons name="person-circle-outline" size={18} color={colors.primary} />
              <Muted className="flex-1">
                {miembro.nombre} tiene cuenta en la app: sus datos personales los
                gestiona desde su perfil. Podés dejarle notas del seguimiento.
              </Muted>
            </View>
          )}

          {/* Se lee del miembro, no del formulario: acá no hay formulario. */}
          <Card className="gap-3">
            <Dato
              label="Cumpleaños"
              valor={fechaLabel(miembro.fecha_nacimiento ?? "", "Sin registrar")}
              capitalizar
            />
            <Dato label="Teléfono" valor={miembro.telefono} />
            <Dato label="Email" valor={miembro.email} />
          </Card>
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

          <Button title="Guardar cambios" onPress={guardar} loading={upsert.isPending} />
        </Card>
      )}

      {/* Notas del seguimiento pastoral: son del discipulador (y del admin),
          no de la persona. Nadie más las ve — `mis_datos()` nunca devuelve
          `notas` (0016) y la RLS solo deja leer la ficha a quien la gestiona
          (0014). Una sola tarjeta para las dos ramas, siempre por la RPC
          `guardar_notas_miembro` (0021): es lo único que el discipulador
          puede escribir sobre una ficha con cuenta, y tener un segundo camino
          por el upsert solo abriría la puerta a perder lo escrito. */}
      {puedeGestionar && (
        <Card className="mt-4">
          <RichTextEditor
            label="Notas"
            valor={notas}
            onChange={setNotas}
            placeholder="Seguimiento, situación, pedidos de oración…"
            ayuda="Privadas: las ves vos y los administradores, no la persona."
          />
          <Button
            title="Guardar notas"
            onPress={onGuardarNotas}
            disabled={!notasCambiadas}
            loading={guardarNotas.isPending}
          />
        </Card>
      )}

      {/* Grupos donde participa, con la baja. El botón lo ve el admin y el
          discipulador del grupo: quién puede de verdad lo decide la RLS de
          `participaciones` (0002), que además ya recortó esta lista. */}
      {gruposQueGestiono.length > 0 && (
        <Card className="mt-4">
          <Label>{gruposQueGestiono.length === 1 ? "Discipulado" : "Discipulados"}</Label>
          <View className="mt-2 gap-2.5">
            {gruposQueGestiono.map((p) => (
              <View key={p.id} className="flex-row items-center gap-3">
                <Body className="flex-1 text-ink" numberOfLines={2}>
                  {nombreDeGrupo(p)}
                </Body>
                <Button
                  title="Quitar"
                  variant="danger"
                  size="sm"
                  onPress={() => quitarDelGrupo(p)}
                  disabled={desasociar.isPending}
                  loading={desasociar.isPending && desasociar.variables === p.id}
                />
              </View>
            ))}
          </View>
          <Muted className="mt-3">
            Quitar a alguien del grupo no borra su ficha ni su historial: se lo puede volver
            a sumar cuando haga falta.
          </Muted>
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
