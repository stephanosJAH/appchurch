import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from "react-native";
import { Body, Button, Card, Field, KeyboardScrollView, Label, Muted } from "../../components/ui";
import { dateToFecha, fechaLabel, fechaToDate, todayISO } from "../../lib/date";
import { colors, fonts } from "../../lib/theme";
import { AsistenciaInput, Miembro, Modalidad } from "../../lib/types";
import { useDiscipulado } from "../../lib/queries/discipulados";
import { useParticipaciones } from "../../lib/queries/participaciones";
import { useRegistrarReunion, useReunion } from "../../lib/queries/reuniones";

const MODALIDADES: Modalidad[] = ["presencial", "virtual", "ambos"];
// Modalidades posibles por miembro (asistió presencial u online).
type ModalidadMiembro = "presencial" | "virtual";
const MODALIDADES_MIEMBRO: ModalidadMiembro[] = ["presencial", "virtual"];

// Una fila de la lista de asistencia. `enGrupo` es false para quien quedó
// registrado en la reunión pero ya no participa del discipulado.
type FilaAsistencia = {
  miembro_id: string;
  miembro: Miembro | null | undefined;
  enGrupo: boolean;
};

// Esta pantalla registra una reunión nueva (params: discipuladoId) y también
// edita una ya registrada (params: reunionId). Es el mismo formulario porque
// es el mismo dato; lo único propio de la edición es de dónde salen los
// valores iniciales y que la fecha ya no crea una reunión aparte (ver 0023).
export default function NuevaReunion() {
  const router = useRouter();
  const { discipuladoId, reunionId } = useLocalSearchParams<{
    discipuladoId?: string;
    reunionId?: string;
  }>();
  const editandoId = reunionId ? String(reunionId) : null;

  const { data: reunion, isLoading: cargandoReunion } = useReunion(editandoId ?? "");
  // Al editar, el grupo lo manda la reunión guardada, no la navegación.
  const grupoId = editandoId ? reunion?.discipulado_id ?? "" : String(discipuladoId ?? "");

  const { data: participaciones = [], isLoading: cargandoParticipaciones } =
    useParticipaciones(grupoId);
  const { data: discipulado } = useDiscipulado(grupoId);
  const registrar = useRegistrarReunion();

  const [fecha, setFecha] = useState(todayISO());
  const [showPicker, setShowPicker] = useState(false);
  const [tema, setTema] = useState("");
  const [modalidad, setModalidad] = useState<Modalidad>("presencial");
  const [ofrenda, setOfrenda] = useState("");
  const [notas, setNotas] = useState("");
  const [presentes, setPresentes] = useState<Record<string, boolean>>({});
  // Override de modalidad por miembro; si no hay, se usa el default según la
  // modalidad de la reunión (presencial/ambos → presencial, virtual → virtual).
  const [modalidadesMiembro, setModalidadesMiembro] = useState<Record<string, ModalidadMiembro>>({});

  // Valores iniciales, una sola vez: al editar salen de la reunión guardada;
  // al dar de alta, la modalidad por defecto es la configurada en el grupo.
  const cargado = useRef(false);
  useEffect(() => {
    if (cargado.current) return;
    if (editandoId) {
      if (!reunion) return;
      setFecha(reunion.fecha);
      setTema(reunion.tema ?? "");
      setModalidad(reunion.modalidad_usada ?? "presencial");
      const monto = Number(reunion.ofrenda_total ?? 0);
      setOfrenda(monto ? String(monto) : "");
      setNotas(reunion.notas ?? "");
      const pres: Record<string, boolean> = {};
      const mods: Record<string, ModalidadMiembro> = {};
      for (const a of reunion.asistencias ?? []) {
        pres[a.miembro_id] = a.presente;
        if (a.modalidad === "presencial" || a.modalidad === "virtual") {
          mods[a.miembro_id] = a.modalidad;
        }
      }
      setPresentes(pres);
      setModalidadesMiembro(mods);
      cargado.current = true;
    } else if (discipulado?.modalidad) {
      setModalidad(discipulado.modalidad);
      cargado.current = true;
    }
  }, [editandoId, reunion, discipulado?.modalidad]);

  // Lista de asistencia: los participantes activos del grupo más, al editar,
  // quienes figuran en la reunión aunque ya no estén en el grupo. Sacarlos
  // sería reescribir el historial — y como el backend borra las asistencias
  // que no vengan en el payload (0023), directamente los perdería.
  const roster = useMemo<FilaAsistencia[]>(() => {
    const filas = new Map<string, FilaAsistencia>();
    for (const p of participaciones) {
      filas.set(p.miembro_id, { miembro_id: p.miembro_id, miembro: p.miembro, enGrupo: true });
    }
    for (const a of reunion?.asistencias ?? []) {
      if (filas.has(a.miembro_id)) continue;
      filas.set(a.miembro_id, { miembro_id: a.miembro_id, miembro: a.miembro, enGrupo: false });
    }
    return [...filas.values()].sort((a, b) =>
      (a.miembro?.nombre ?? "").localeCompare(b.miembro?.nombre ?? "")
    );
  }, [participaciones, reunion]);

  // En el alta todos arrancan presentes. Al editar manda lo registrado: quien
  // no tiene asistencia (se sumó al grupo después) arranca ausente.
  const presenteDe = (mid: string) => presentes[mid] ?? !editandoId;
  const toggle = (mid: string) => setPresentes((p) => ({ ...p, [mid]: !presenteDe(mid) }));

  const modalidadPorDefecto: ModalidadMiembro = modalidad === "virtual" ? "virtual" : "presencial";
  const modalidadDe = (mid: string): ModalidadMiembro => modalidadesMiembro[mid] ?? modalidadPorDefecto;
  const setModalidadMiembro = (mid: string, m: ModalidadMiembro) =>
    setModalidadesMiembro((prev) => ({ ...prev, [mid]: m }));
  // Solo para presencial/ambos ofrecemos elegir quién estuvo online vs presencial.
  const permiteElegirModalidad = modalidad !== "virtual";

  // Cambiar la modalidad de la reunión resetea los overrides por miembro para
  // que todos vuelvan al default de esa modalidad.
  const elegirModalidad = (m: Modalidad) => {
    setModalidad(m);
    setModalidadesMiembro({});
  };

  const totalPresentes = useMemo(
    () => roster.filter((f) => presenteDe(f.miembro_id)).length,
    [roster, presentes, editandoId]
  );

  const onSubmit = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      Alert.alert("Fecha inválida", "Usá el formato AAAA-MM-DD.");
      return;
    }
    if (!grupoId) {
      Alert.alert("Error", "No se pudo determinar el discipulado de la reunión.");
      return;
    }
    const asistencias: AsistenciaInput[] = roster.map((f) => ({
      miembro_id: f.miembro_id,
      presente: presenteDe(f.miembro_id),
      modalidad: presenteDe(f.miembro_id) ? modalidadDe(f.miembro_id) : null,
    }));
    try {
      await registrar.mutateAsync({
        reunion_id: editandoId,
        discipulado_id: grupoId,
        fecha,
        tema: tema.trim() || null,
        material_url: null,
        modalidad,
        ofrenda: Number(ofrenda) || 0,
        notas: notas.trim() || null,
        asistencias,
      });
      Alert.alert("Listo", editandoId ? "Reunión actualizada." : "Reunión registrada.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar la reunión.");
    }
  };

  if (editandoId && cargandoReunion) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <Stack.Screen options={{ title: "Editar reunión" }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (editandoId && !reunion) {
    return (
      <View className="flex-1 items-center justify-center bg-cream p-8">
        <Stack.Screen options={{ title: "Editar reunión" }} />
        <Muted>No se encontró la reunión.</Muted>
      </View>
    );
  }

  const cargandoRoster = cargandoParticipaciones && roster.length === 0;

  return (
    <KeyboardScrollView>
      <Stack.Screen options={{ title: editandoId ? "Editar reunión" : "Registrar reunión" }} />

      <Label className="mb-1.5">Fecha</Label>
        <View className="mb-4 flex-row items-center gap-2">
          <Pressable
            onPress={() => setShowPicker(true)}
            className="flex-1 flex-row items-center justify-between rounded-lg border border-black/10 bg-surface px-4 py-3.5 active:opacity-70"
          >
            <Body className="capitalize text-ink">{fechaLabel(fecha)}</Body>
            <Ionicons name="calendar-outline" size={18} color={colors.outline} />
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

        <Field label="Tema / lección" value={tema} onChangeText={setTema} placeholder="Tema dado en la reunión" multiline />

        <Label className="mb-1.5">Modalidad</Label>
        <View className="mb-4 flex-row gap-2">
          {MODALIDADES.map((m) => (
            <View key={m} className="flex-1">
              <Button title={m} variant={modalidad === m ? "primary" : "outline"} size="sm" onPress={() => elegirModalidad(m)} />
            </View>
          ))}
        </View>

        <Field label="Ofrenda total" value={ofrenda} onChangeText={setOfrenda} placeholder="0" keyboardType="numeric" />

        {/* Asistencia */}
        <View className="mb-2.5 mt-2 flex-row items-center justify-between">
          <Label>Asistencia</Label>
          <Muted className="text-gold">
            {totalPresentes}/{roster.length} presentes
          </Muted>
        </View>

        {cargandoRoster ? (
          <Muted>Cargando discípulos…</Muted>
        ) : roster.length === 0 ? (
          <Card>
            <Muted>Este grupo no tiene discípulos. Agregalos desde el detalle del discipulado.</Muted>
          </Card>
        ) : (
          <View className="gap-2.5">
            {roster.map((f) => {
              const presente = presenteDe(f.miembro_id);
              return (
                <View
                  key={f.miembro_id}
                  className={`rounded-lg border p-3.5 ${
                    presente ? "border-navy bg-navy/5" : "border-black/10 bg-surface"
                  }`}
                >
                  <Pressable
                    onPress={() => toggle(f.miembro_id)}
                    className="flex-row items-center gap-3 active:opacity-70"
                  >
                    <Ionicons
                      name={presente ? "checkmark-circle" : "ellipse-outline"}
                      size={24}
                      color={presente ? colors.primary : colors.outlineVariant}
                    />
                    <View className="flex-1">
                      <Body className="text-ink">
                        {f.miembro?.nombre} {f.miembro?.apellido ?? ""}
                      </Body>
                      {!f.enGrupo ? <Muted>Ya no está en el grupo</Muted> : null}
                    </View>
                  </Pressable>

                  {/* Presencial vs. virtual por miembro (presencial/ambos) */}
                  {presente && permiteElegirModalidad && (
                    <View className="mt-2.5 flex-row gap-2 pl-9">
                      {MODALIDADES_MIEMBRO.map((m) => {
                        const sel = modalidadDe(f.miembro_id) === m;
                        return (
                          <Pressable
                            key={m}
                            onPress={() => setModalidadMiembro(f.miembro_id, m)}
                            className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
                              sel ? "bg-navy" : "bg-surface-mid"
                            }`}
                          >
                            <Ionicons
                              name={m === "virtual" ? "videocam-outline" : "business-outline"}
                              size={14}
                              color={sel ? "#fff" : colors.outline}
                            />
                            <Text
                              style={{ fontFamily: fonts.sansSemibold }}
                              className={`text-xs ${sel ? "text-white" : "text-ink-variant"}`}
                            >
                              {m === "virtual" ? "Virtual" : "Presencial"}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View className="mt-5">
          <Field label="Notas" value={notas} onChangeText={setNotas} placeholder="Observaciones (opcional)" multiline />
        </View>

        <View className="mt-2">
          <Button
            title={editandoId ? "Guardar cambios" : "Guardar reunión"}
            onPress={onSubmit}
            loading={registrar.isPending}
          />
        </View>
    </KeyboardScrollView>
  );
}
