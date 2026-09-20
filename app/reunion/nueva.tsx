import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from "react-native";
import { Body, Button, Card, Field, KeyboardScrollView, Label, Muted, Screen } from "../../components/ui";
import { dateToFecha, fechaLabel, fechaToDate, todayISO } from "../../lib/date";
import { colors, fonts } from "../../lib/theme";
import { AsistenciaInput, Modalidad } from "../../lib/types";
import { useDiscipulado } from "../../lib/queries/discipulados";
import {
  useIntegrantesMinisterio,
  useMinisterio,
  useRegistrarReunionMinisterio,
  useReunionMinisterio,
  useReunionesMinisterio,
} from "../../lib/queries/ministerios";
import { useParticipaciones } from "../../lib/queries/participaciones";
import { useRegistrarReunion, useReunion, useReuniones } from "../../lib/queries/reuniones";

const MODALIDADES: Modalidad[] = ["presencial", "virtual", "ambos"];
// Modalidades posibles por miembro (asistió presencial u online).
type ModalidadMiembro = "presencial" | "virtual";
const MODALIDADES_MIEMBRO: ModalidadMiembro[] = ["presencial", "virtual"];

// Una fila de la lista de asistencia. `enGrupo` es false para quien quedó
// registrado en la reunión pero ya no participa del grupo/ministerio.
type FilaAsistencia = {
  miembro_id: string;
  nombre: string;
  apellido: string | null;
  enGrupo: boolean;
};

type Origen = "discipulado" | "ministerio";

// Formulario de reunión, compartido por los dos orígenes.
//
// La contabilidad está separada en la base — `reuniones` para discipulados,
// `reuniones_ministerio` para ministerios, cada una con su tabla de asistencias
// y su RPC transaccional (decisión de producto, ver 0025). La UI, en cambio, NO
// se duplica: son los mismos campos, así que esta pantalla se comparte y
// ramifica por el parámetro `origen`; lo único que cambia es de dónde sale el
// roster y qué hook de mutación se llama.
//
// Params:
//   * alta       — `origen=discipulado&discipuladoId=…` (el default histórico)
//                  o `origen=ministerio&ministerioId=…`
//   * edición    — `reunionId=…` + `origen`. El grupo/ministerio lo manda la
//                  reunión guardada, no la navegación (ver 0023/0025).
export default function NuevaReunion() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    origen?: string;
    discipuladoId?: string;
    ministerioId?: string;
    reunionId?: string;
  }>();
  const origen: Origen = params.origen === "ministerio" ? "ministerio" : "discipulado";
  const esMinisterio = origen === "ministerio";
  const editandoId = params.reunionId ? String(params.reunionId) : null;

  /* ---------- Datos de la reunión que se edita (uno u otro origen) ---------- */
  const reunionDisc = useReunion(!esMinisterio && editandoId ? editandoId : "");
  const reunionMin = useReunionMinisterio(esMinisterio && editandoId ? editandoId : "");
  const cargandoReunion = esMinisterio ? reunionMin.isLoading : reunionDisc.isLoading;
  const reunion = esMinisterio ? reunionMin.data : reunionDisc.data;

  // Al editar, el dueño de la reunión lo manda la reunión guardada.
  const grupoId = esMinisterio
    ? editandoId
      ? reunionMin.data?.ministerio_id ?? ""
      : String(params.ministerioId ?? "")
    : editandoId
      ? reunionDisc.data?.discipulado_id ?? ""
      : String(params.discipuladoId ?? "");

  /* ---------- Roster ---------- */
  // Discipulado: `participaciones` embebe al miembro (la RLS deja al líder leer
  // su gente). Ministerio: va por RPC, porque un líder de ministerio puede ser
  // `miembro` y la RLS de `miembros` no le deja leer el padrón (0024).
  const participaciones = useParticipaciones(!esMinisterio ? grupoId : "");
  const integrantes = useIntegrantesMinisterio(grupoId, esMinisterio);
  const { data: discipulado } = useDiscipulado(!esMinisterio ? grupoId : "");
  const { data: ministerio } = useMinisterio(esMinisterio ? grupoId : "");

  /* ---------- Fechas ya ocupadas (aviso de pisada) ---------- */
  // El alta hace upsert por (dueño, fecha): cargar una fecha que ya tiene
  // reunión CORRIGE la que estaba en vez de duplicarla. Es el comportamiento
  // deseado —una reunión por día—, pero conviene avisarlo en lugar de pisar en
  // silencio.
  const reunionesDisc = useReuniones(!esMinisterio ? grupoId : "");
  const reunionesMin = useReunionesMinisterio(grupoId, esMinisterio);
  const fechasOcupadas = useMemo(() => {
    const fuente = esMinisterio ? reunionesMin.data ?? [] : reunionesDisc.data ?? [];
    return new Set(fuente.filter((r) => r.id !== editandoId).map((r) => r.fecha));
  }, [esMinisterio, reunionesMin.data, reunionesDisc.data, editandoId]);

  const registrarDisc = useRegistrarReunion();
  const registrarMin = useRegistrarReunionMinisterio();
  const guardando = esMinisterio ? registrarMin.isPending : registrarDisc.isPending;

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

  // Valores iniciales, una sola vez: al editar salen de la reunión guardada; al
  // dar de alta, la modalidad por defecto es la configurada en el grupo (los
  // ministerios no tienen modalidad propia, así que arrancan en presencial).
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
    } else if (!esMinisterio && discipulado?.modalidad) {
      setModalidad(discipulado.modalidad);
      cargado.current = true;
    }
  }, [editandoId, reunion, esMinisterio, discipulado?.modalidad]);

  // Lista de asistencia: los integrantes activos más, al editar, quienes
  // figuran en la reunión aunque ya no estén. Sacarlos sería reescribir el
  // historial — y como el backend borra las asistencias que no vengan en el
  // payload, directamente los perdería.
  const roster = useMemo<FilaAsistencia[]>(() => {
    const filas = new Map<string, FilaAsistencia>();

    if (esMinisterio) {
      // El RPC devuelve también a los dados de baja del roster, justamente para
      // poder ponerle nombre a quien figura en una reunión vieja.
      const porId = new Map((integrantes.data ?? []).map((i) => [i.miembro_id, i]));
      for (const i of integrantes.data ?? []) {
        if (i.activo) {
          filas.set(i.miembro_id, {
            miembro_id: i.miembro_id,
            nombre: i.nombre,
            apellido: i.apellido,
            enGrupo: true,
          });
        }
      }
      for (const a of reunion?.asistencias ?? []) {
        if (filas.has(a.miembro_id)) continue;
        const i = porId.get(a.miembro_id);
        filas.set(a.miembro_id, {
          miembro_id: a.miembro_id,
          nombre: i?.nombre ?? "Sin nombre",
          apellido: i?.apellido ?? null,
          enGrupo: false,
        });
      }
    } else {
      for (const p of participaciones.data ?? []) {
        filas.set(p.miembro_id, {
          miembro_id: p.miembro_id,
          nombre: p.miembro?.nombre ?? "Sin nombre",
          apellido: p.miembro?.apellido ?? null,
          enGrupo: true,
        });
      }
      for (const a of (reunionDisc.data?.asistencias ?? [])) {
        if (filas.has(a.miembro_id)) continue;
        filas.set(a.miembro_id, {
          miembro_id: a.miembro_id,
          nombre: a.miembro?.nombre ?? "Sin nombre",
          apellido: a.miembro?.apellido ?? null,
          enGrupo: false,
        });
      }
    }

    return [...filas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [esMinisterio, integrantes.data, participaciones.data, reunion, reunionDisc.data]);

  // En el alta todos arrancan presentes. Al editar manda lo registrado: quien
  // no tiene asistencia (se sumó después) arranca ausente.
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

  const fechaPisa = !editandoId && fechasOcupadas.has(fecha);

  const onSubmit = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      Alert.alert("Fecha inválida", "Usá el formato AAAA-MM-DD.");
      return;
    }
    if (!grupoId) {
      Alert.alert(
        "Error",
        esMinisterio
          ? "No se pudo determinar el ministerio de la reunión."
          : "No se pudo determinar el discipulado de la reunión."
      );
      return;
    }
    const asistencias: AsistenciaInput[] = roster.map((f) => ({
      miembro_id: f.miembro_id,
      presente: presenteDe(f.miembro_id),
      modalidad: presenteDe(f.miembro_id) ? modalidadDe(f.miembro_id) : null,
    }));
    try {
      if (esMinisterio) {
        await registrarMin.mutateAsync({
          reunion_id: editandoId,
          ministerio_id: grupoId,
          fecha,
          tema: tema.trim() || null,
          modalidad,
          ofrenda: Number(ofrenda) || 0,
          notas: notas.trim() || null,
          asistencias,
        });
      } else {
        await registrarDisc.mutateAsync({
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
      }
      Alert.alert("Listo", editandoId ? "Reunión actualizada." : "Reunión registrada.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo guardar la reunión.");
    }
  };

  if (editandoId && cargandoReunion) {
    return (
      <Screen className="items-center justify-center">
        <Stack.Screen options={{ title: "Editar reunión" }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </Screen>
    );
  }

  if (editandoId && !reunion) {
    return (
      <Screen className="items-center justify-center p-8">
        <Stack.Screen options={{ title: "Editar reunión" }} />
        <Muted>No se encontró la reunión.</Muted>
      </Screen>
    );
  }

  const cargandoRoster =
    (esMinisterio ? integrantes.isLoading : participaciones.isLoading) && roster.length === 0;
  const nombreDueno = esMinisterio
    ? ministerio?.nombre
    : discipulado?.nombre ?? discipulado?.descripcion_etaria;

  return (
    <KeyboardScrollView>
      <Stack.Screen options={{ title: editandoId ? "Editar reunión" : "Registrar reunión" }} />

      {nombreDueno ? (
        <View className="mb-4 flex-row items-center gap-1.5">
          <Ionicons
            name={esMinisterio ? "sparkles-outline" : "people-outline"}
            size={14}
            color={colors.tertiary}
          />
          <Muted className="text-gold">{nombreDueno}</Muted>
        </View>
      ) : null}

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

        {/* Solo una reunión por día: guardar acá corrige la que ya está */}
        {fechaPisa && (
          <View className="mb-4 flex-row items-start gap-2 rounded-lg bg-gold-container p-3">
            <Ionicons name="alert-circle-outline" size={16} color={colors.onTertiaryContainer} />
            <Muted className="flex-1" style={{ color: colors.onTertiaryContainer }}>
              Esa fecha ya tiene una reunión registrada. Si guardás, se actualiza
              con lo que cargues acá en vez de crear otra.
            </Muted>
          </View>
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
          <Muted>{esMinisterio ? "Cargando integrantes…" : "Cargando discípulos…"}</Muted>
        ) : roster.length === 0 ? (
          <Card>
            <Muted>
              {esMinisterio
                ? "Este ministerio no tiene integrantes. Sumalos desde el detalle del ministerio."
                : "Este grupo no tiene discípulos. Agregalos desde el detalle del discipulado."}
            </Muted>
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
                        {f.nombre} {f.apellido ?? ""}
                      </Body>
                      {!f.enGrupo ? (
                        <Muted>{esMinisterio ? "Ya no está en el ministerio" : "Ya no está en el grupo"}</Muted>
                      ) : null}
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
            loading={guardando}
          />
        </View>
    </KeyboardScrollView>
  );
}
