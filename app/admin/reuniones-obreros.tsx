import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, View } from "react-native";
import { FechaBloque } from "../../components/FechaBloque";
import { RichTextEditor } from "../../components/RichTextEditor";
import { RichTextView } from "../../components/RichTextView";
import {
  Body,
  Button,
  Card,
  Chip,
  Field,
  KeyboardScrollView,
  Label,
  Muted,
  SkeletonRows,
  Title,
} from "../../components/ui";
import { dateToFecha, fechaLabel, fechaToDate, formatFechaHoraCorta, todayISO } from "../../lib/date";
import {
  useAsistenciasObreros,
  useParticipantesPosibles,
  useRegistrarReunionObreros,
  useReunionesObreros,
} from "../../lib/queries/reunionesObreros";
import { aTextoPlano, estaVacio } from "../../lib/richText";
import { colors } from "../../lib/theme";
import { AsistenciaObrerosInput, Miembro, ReunionObrerosListado } from "../../lib/types";

// Reunión de obreros: participantes + acta de lo tratado. Pantalla de
// administración (se entra desde la sección Administración del Perfil).
//
// POR QUÉ NO REUSA app/reunion/nueva.tsx: esa pantalla es compartida entre
// discipulado y ministerio porque son los MISMOS campos con dos hooks, y ya
// tiene 29 ramas `esMinisterio`. Acá los campos son otros —acta como campo
// principal, sin ofrenda y sin modalidad por persona—, así que un tercer
// `origen` la convertiría en tres formularios en un archivo en vez de uno con
// dos variantes. Ver la cabecera de supabase/migrations/0031_reuniones_obreros.sql.

function nombreDe(m: Miembro): string {
  return [m.nombre, m.apellido].filter(Boolean).join(" ");
}

export default function AdminReunionesObreros() {
  const { data: reuniones, isLoading } = useReunionesObreros();
  const { data: padron = [] } = useParticipantesPosibles();
  const registrar = useRegistrarReunionObreros();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const [fecha, setFecha] = useState(todayISO());
  const [showPicker, setShowPicker] = useState(false);
  const [tema, setTema] = useState("");
  const [resumen, setResumen] = useState("");
  const [busqueda, setBusqueda] = useState("");
  // miembro_id -> presente. Estar en el mapa = participar de la reunión.
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});

  // Al editar, el checklist se precarga con lo que ya está guardado.
  const { data: asistenciasGuardadas } = useAsistenciasObreros(editId ?? undefined);
  useEffect(() => {
    if (!editId || !asistenciasGuardadas) return;
    setSeleccion(
      Object.fromEntries(asistenciasGuardadas.map((a) => [a.miembro_id, a.presente]))
    );
  }, [editId, asistenciasGuardadas]);

  const limpiar = () => {
    setShowForm(false);
    setEditId(null);
    setFecha(todayISO());
    setTema("");
    setResumen("");
    setBusqueda("");
    setSeleccion({});
    setShowPicker(false);
  };

  const abrirAlta = () => {
    limpiar();
    setShowForm(true);
  };

  const abrirEdicion = (r: ReunionObrerosListado) => {
    setEditId(r.id);
    setFecha(r.fecha);
    setTema(r.tema ?? "");
    setResumen(r.resumen ?? "");
    setBusqueda("");
    setSeleccion({}); // lo llena el efecto cuando llegan las asistencias
    setShowPicker(false);
    setShowForm(true);
  };

  // Sólo una reunión por fecha (unique en la base). Avisamos antes de guardar,
  // igual que en reunion/nueva.tsx, para que el upsert no sorprenda.
  const fechaPisa = useMemo(
    () => (reuniones ?? []).some((r) => r.fecha === fecha && r.id !== editId),
    [reuniones, fecha, editId]
  );

  const elegidos = useMemo(
    () => padron.filter((m) => m.id in seleccion),
    [padron, seleccion]
  );

  const candidatos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return [];
    return padron
      .filter((m) => !(m.id in seleccion) && nombreDe(m).toLowerCase().includes(texto))
      .slice(0, 8);
  }, [padron, busqueda, seleccion]);

  const presentes = elegidos.filter((m) => seleccion[m.id]).length;

  const agregar = (m: Miembro) => {
    setSeleccion((s) => ({ ...s, [m.id]: true }));
    setBusqueda("");
  };

  const alternar = (id: string) =>
    setSeleccion((s) => ({ ...s, [id]: !s[id] }));

  const quitar = (id: string) =>
    setSeleccion((s) => {
      const { [id]: _fuera, ...resto } = s;
      return resto;
    });

  const guardar = () => {
    const asistencias: AsistenciaObrerosInput[] = Object.entries(seleccion).map(
      ([miembro_id, presente]) => ({ miembro_id, presente })
    );
    registrar.mutate(
      {
        reunion_id: editId,
        fecha,
        tema: tema.trim() || null,
        resumen: estaVacio(resumen) ? null : resumen,
        asistencias,
      },
      {
        onSuccess: () => limpiar(),
        onError: (e: unknown) =>
          Alert.alert("No se pudo guardar", (e as Error).message),
      }
    );
  };

  /* ============================ Formulario ============================ */

  if (showForm) {
    return (
      <KeyboardScrollView className="px-4 pt-4">
        <Title className="mb-4">
          {editId ? "Editar reunión de obreros" : "Nueva reunión de obreros"}
        </Title>

        <Label className="mb-1.5">Fecha</Label>
        <View className="mb-2 flex-row items-center gap-2">
          <Pressable
            onPress={() => setShowPicker(true)}
            className="flex-1 flex-row items-center gap-2 rounded-lg border border-outline px-3 py-3 active:opacity-60"
          >
            <Ionicons name="calendar-outline" size={18} color={colors.onSurfaceVariant} />
            <Body>{fechaLabel(fecha)}</Body>
          </Pressable>
          <Button title="Hoy" variant="outline" size="sm" onPress={() => setFecha(todayISO())} />
        </View>
        {showPicker && (
          <DateTimePicker
            value={fechaToDate(fecha)}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(event, selected) => {
              // Android cierra el diálogo con cada acción; iOS queda inline.
              if (Platform.OS !== "ios") setShowPicker(false);
              if (event.type === "set" && selected) setFecha(dateToFecha(selected));
            }}
          />
        )}

        {fechaPisa && (
          <View className="mb-4 flex-row items-start gap-2 rounded-lg bg-gold-container p-3">
            <Ionicons name="alert-circle-outline" size={16} color={colors.onTertiaryContainer} />
            <Muted className="flex-1" style={{ color: colors.onTertiaryContainer }}>
              Esa fecha ya tiene una reunión registrada. Si guardás, se actualiza
              con lo que cargues acá en vez de crear otra.
            </Muted>
          </View>
        )}

        <Field
          label="Tema"
          placeholder="Título corto del encuentro"
          value={tema}
          onChangeText={setTema}
        />

        {/* ------------------------- Participantes ------------------------- */}
        <View className="mb-1.5 mt-2 flex-row items-center justify-between">
          <Label>Participantes</Label>
          {elegidos.length > 0 && (
            <Muted>
              {presentes} de {elegidos.length} presentes
            </Muted>
          )}
        </View>

        <Field
          placeholder="Buscar en el padrón para agregar…"
          icon="search-outline"
          value={busqueda}
          onChangeText={setBusqueda}
          autoCorrect={false}
        />

        {candidatos.length > 0 && (
          <Card className="mb-3 p-0">
            {candidatos.map((m, i) => (
              <Pressable
                key={m.id}
                onPress={() => agregar(m)}
                className={`flex-row items-center justify-between px-3 py-3 active:opacity-60 ${
                  i > 0 ? "border-t border-outline-variant" : ""
                }`}
              >
                <Body>{nombreDe(m)}</Body>
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              </Pressable>
            ))}
          </Card>
        )}

        {busqueda.trim() !== "" && candidatos.length === 0 && (
          <Muted className="mb-3">
            Nadie del padrón coincide con “{busqueda.trim()}”.
          </Muted>
        )}

        {elegidos.length === 0 ? (
          <Muted className="mb-4">
            Todavía no agregaste participantes. Buscalos arriba por nombre.
          </Muted>
        ) : (
          <Card className="mb-4 p-0">
            {elegidos.map((m, i) => (
              <View
                key={m.id}
                className={`flex-row items-center gap-2 px-3 py-2.5 ${
                  i > 0 ? "border-t border-outline-variant" : ""
                }`}
              >
                <Pressable
                  onPress={() => alternar(m.id)}
                  hitSlop={6}
                  className="flex-1 flex-row items-center gap-2.5 active:opacity-60"
                >
                  <Ionicons
                    name={seleccion[m.id] ? "checkbox" : "square-outline"}
                    size={22}
                    color={seleccion[m.id] ? colors.primary : colors.onSurfaceVariant}
                  />
                  <Body className={seleccion[m.id] ? "" : "text-ink-muted"}>
                    {nombreDe(m)}
                  </Body>
                </Pressable>
                <Pressable onPress={() => quitar(m.id)} hitSlop={6} className="active:opacity-60">
                  <Ionicons name="close-circle-outline" size={20} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>
            ))}
          </Card>
        )}

        <Muted className="mb-4">
          Destildar deja a la persona registrada como ausente; la cruz la saca de
          la reunión.
        </Muted>

        {/* ---------------------------- El acta ---------------------------- */}
        <RichTextEditor
          label="Resumen de lo tratado"
          valor={resumen}
          onChange={setResumen}
          placeholder="Temas tratados, decisiones, quién queda a cargo de qué…"
          ayuda="Lo lee cualquier administrador. Los temas delicados sobre una persona van en las notas de su ficha, no acá."
        />

        <View className="mb-10 mt-2 flex-row gap-3">
          <View className="flex-1">
            <Button
              title={registrar.isPending ? "Guardando…" : "Guardar"}
              onPress={guardar}
              disabled={registrar.isPending}
            />
          </View>
          <Button title="Cancelar" variant="outline" onPress={limpiar} disabled={registrar.isPending} />
        </View>
      </KeyboardScrollView>
    );
  }

  /* ============================= Historial ============================= */

  return (
    <KeyboardScrollView className="px-4 pt-4">
      <Body className="mb-3">
        Las reuniones del cuerpo de obreros: quiénes participaron y el resumen de
        lo que se trató. No registran ofrenda.
      </Body>

      {/* El layout va en un View que envuelve, no en un `className` sobre el
          Button: `ButtonProps` extiende `PressableProps` y el componente
          spreadea `...props` DESPUÉS de su propio `className`, así que pasarle
          uno le borra el fondo y el padding. */}
      <View className="mb-5">
        <Button title="Registrar reunión" icon="add" onPress={abrirAlta} />
      </View>

      {isLoading ? (
        <SkeletonRows count={3} />
      ) : !reuniones?.length ? (
        <Card>
          <Muted>
            Todavía no hay reuniones registradas. La primera que cargues aparece
            acá, de la más nueva a la más vieja.
          </Muted>
        </Card>
      ) : (
        reuniones.map((r) => {
          const estaAbierta = abierta === r.id;
          const vistaPrevia = aTextoPlano(r.resumen);
          return (
            <Card key={r.id} className="mb-3">
              <Pressable
                onPress={() => setAbierta(estaAbierta ? null : r.id)}
                className="flex-row items-start gap-3 active:opacity-60"
              >
                <FechaBloque fecha={r.fecha} />
                <View className="flex-1">
                  <Title numberOfLines={1}>{r.tema || "Reunión de obreros"}</Title>
                  <View className="mt-1 flex-row items-center gap-2">
                    <Chip tone="navy">
                      {r.presentes} de {r.total_registrados} presentes
                    </Chip>
                  </View>
                  {!estaAbierta && vistaPrevia !== "" && (
                    <Muted className="mt-1.5" numberOfLines={2}>
                      {vistaPrevia}
                    </Muted>
                  )}
                </View>
                <Ionicons
                  name={estaAbierta ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={colors.onSurfaceVariant}
                />
              </Pressable>

              {estaAbierta && (
                <View className="mt-3 border-t border-outline-variant pt-3">
                  {vistaPrevia === "" ? (
                    <Muted>Esta reunión no tiene resumen cargado.</Muted>
                  ) : (
                    <RichTextView descripcion={r.resumen} />
                  )}

                  <Muted className="mt-3">
                    {r.registrado_por_nombre
                      ? `Registró ${r.registrado_por_nombre}.`
                      : "Sin registro de quién la cargó."}
                    {r.editado_por_nombre && r.editado_en
                      ? ` Última edición de ${r.editado_por_nombre}, ${formatFechaHoraCorta(
                          r.editado_en
                        )}.`
                      : ""}
                  </Muted>

                  <View className="mt-3 self-start">
                    <Button
                      title="Editar"
                      variant="outline"
                      size="sm"
                      onPress={() => abrirEdicion(r)}
                    />
                  </View>
                </View>
              )}
            </Card>
          );
        })
      )}

      {registrar.isPending && (
        <View className="items-center py-4">
          <ActivityIndicator color={colors.primary} />
        </View>
      )}
      <View className="h-10" />
    </KeyboardScrollView>
  );
}
