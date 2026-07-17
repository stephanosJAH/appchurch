import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Image, Pressable, View } from "react-native";
import { Body, Button, Card, Chip, Field, KeyboardScrollView, Label, Muted, Title } from "../../components/ui";
import { formatDiasSemana, formatHora } from "../../lib/date";
import { colors } from "../../lib/theme";
import { Actividad, AdjuntoTipo, Modalidad } from "../../lib/types";
import {
  useActividadesAdmin,
  useDeleteActividad,
  useUpsertActividad,
} from "../../lib/queries/actividades";
import { AdjuntoLocal, elegirAdjunto, subirAdjunto } from "../../lib/storage";

const MODALIDADES: Modalidad[] = ["presencial", "virtual", "ambos"];
// Etiquetas cortas para el selector de días, en orden lunes→domingo.
const DIAS_ORDEN: { idx: number; label: string }[] = [
  { idx: 1, label: "Lun" },
  { idx: 2, label: "Mar" },
  { idx: 3, label: "Mié" },
  { idx: 4, label: "Jue" },
  { idx: 5, label: "Vie" },
  { idx: 6, label: "Sáb" },
  { idx: 0, label: "Dom" },
];

function normalizarHora(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export default function AdminActividades() {
  const { data: actividades = [] } = useActividadesAdmin();
  const upsert = useUpsertActividad();
  const del = useDeleteActividad();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [dias, setDias] = useState<number[]>([]);
  const [horaInicio, setHoraInicio] = useState("20:00");
  const [horaFin, setHoraFin] = useState("21:30");
  const [ubicacion, setUbicacion] = useState("");
  const [modalidad, setModalidad] = useState<Modalidad>("presencial");
  const [enlaceVirtual, setEnlaceVirtual] = useState("");
  const [activa, setActiva] = useState(true);
  // Adjunto: existente (remoto) y/o uno nuevo elegido localmente.
  const [adjuntoUrl, setAdjuntoUrl] = useState<string | null>(null);
  const [adjuntoTipo, setAdjuntoTipo] = useState<AdjuntoTipo | null>(null);
  const [adjuntoLocal, setAdjuntoLocal] = useState<AdjuntoLocal | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const reset = () => {
    setEditId(null);
    setTitulo("");
    setDescripcion("");
    setDias([]);
    setHoraInicio("20:00");
    setHoraFin("21:30");
    setUbicacion("");
    setModalidad("presencial");
    setEnlaceVirtual("");
    setActiva(true);
    setAdjuntoUrl(null);
    setAdjuntoTipo(null);
    setAdjuntoLocal(null);
    setShowForm(false);
  };

  const abrirNuevo = () => {
    reset();
    setShowForm(true);
  };

  const editar = (a: Actividad) => {
    setEditId(a.id);
    setTitulo(a.titulo);
    setDescripcion(a.descripcion ?? "");
    setDias(a.dias_semana);
    setHoraInicio(formatHora(a.hora_inicio));
    setHoraFin(formatHora(a.hora_fin) || "");
    setUbicacion(a.ubicacion ?? "");
    setModalidad(a.modalidad);
    setEnlaceVirtual(a.enlace_virtual ?? "");
    setActiva(a.activa);
    setAdjuntoUrl(a.adjunto_url);
    setAdjuntoTipo(a.adjunto_tipo);
    setAdjuntoLocal(null);
    setShowForm(true);
  };

  const toggleDia = (idx: number) =>
    setDias((prev) => (prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]));

  const onElegirAdjunto = async () => {
    try {
      const file = await elegirAdjunto();
      if (file) setAdjuntoLocal(file);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo abrir el selector.");
    }
  };

  const quitarAdjunto = () => {
    setAdjuntoLocal(null);
    setAdjuntoUrl(null);
    setAdjuntoTipo(null);
  };

  const guardar = async () => {
    if (!titulo.trim()) {
      Alert.alert("Falta el título", "Ingresá un título.");
      return;
    }
    if (dias.length === 0) {
      Alert.alert("Faltan días", "Elegí al menos un día de la semana.");
      return;
    }
    const hi = normalizarHora(horaInicio);
    if (!hi) {
      Alert.alert("Hora inválida", "Usá el formato HH:MM (ej. 20:00).");
      return;
    }
    const hf = horaFin.trim() ? normalizarHora(horaFin) : null;
    if (horaFin.trim() && !hf) {
      Alert.alert("Hora inválida", "La hora de fin debe ser HH:MM (ej. 21:30).");
      return;
    }
    try {
      let url = adjuntoUrl;
      let tAdj = adjuntoTipo;
      if (adjuntoLocal) {
        setSubiendo(true);
        const up = await subirAdjunto(adjuntoLocal);
        url = up.url;
        tAdj = up.tipo;
        setSubiendo(false);
      }
      await upsert.mutateAsync({
        ...(editId ? { id: editId } : {}),
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || null,
        dias_semana: dias,
        hora_inicio: hi,
        hora_fin: hf,
        ubicacion: ubicacion.trim() || null,
        modalidad,
        enlace_virtual: modalidad === "presencial" ? null : enlaceVirtual.trim() || null,
        activa,
        adjunto_url: url,
        adjunto_tipo: tAdj,
      });
      reset();
    } catch (e: any) {
      setSubiendo(false);
      Alert.alert("Error", e.message ?? "No se pudo guardar la actividad.");
    }
  };

  const eliminar = (id: string) => {
    Alert.alert("Eliminar", "¿Eliminar esta actividad? Esta acción no se puede deshacer.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => del.mutate(id) },
    ]);
  };

  const tieneAdjunto = !!adjuntoLocal || !!adjuntoUrl;
  const adjuntoEsImagen = adjuntoLocal ? adjuntoLocal.tipo === "imagen" : adjuntoTipo === "imagen";
  const previewUri = adjuntoLocal?.uri ?? adjuntoUrl ?? undefined;

  return (
    <KeyboardScrollView contentContainerStyle={{ paddingBottom: 32 }}>
      <Button
        title={showForm ? "Cancelar" : "+ Nueva actividad"}
        variant={showForm ? "outline" : "primary"}
        onPress={() => (showForm ? reset() : abrirNuevo())}
      />

      {showForm && (
        <Card className="mt-3">
          <Title className="mb-3 text-base">
            {editId ? "Editar actividad" : "Nueva actividad semanal"}
          </Title>
          <Field label="Título" value={titulo} onChangeText={setTitulo} />
          <Field label="Descripción" value={descripcion} onChangeText={setDescripcion} multiline />

          <Label className="mb-1.5">Días de la semana</Label>
          <View className="mb-4 flex-row flex-wrap gap-2">
            {DIAS_ORDEN.map((d) => {
              const activo = dias.includes(d.idx);
              return (
                <Pressable
                  key={d.idx}
                  onPress={() => toggleDia(d.idx)}
                  style={activo ? { backgroundColor: colors.primary, borderColor: colors.primary } : undefined}
                  className={`rounded-full border px-3.5 py-2 active:opacity-70 ${
                    activo ? "" : "border-black/15 bg-surface"
                  }`}
                >
                  <Body className={activo ? "text-white" : "text-ink-variant"}>{d.label}</Body>
                </Pressable>
              );
            })}
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Hora inicio" value={horaInicio} onChangeText={setHoraInicio} placeholder="20:00" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
            </View>
            <View className="flex-1">
              <Field label="Hora fin" value={horaFin} onChangeText={setHoraFin} placeholder="21:30" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
            </View>
          </View>

          <Label className="mb-1.5">Modalidad</Label>
          <View className="mb-4 flex-row gap-2">
            {MODALIDADES.map((m) => (
              <View key={m} className="flex-1">
                <Button title={m} variant={modalidad === m ? "primary" : "outline"} size="sm" onPress={() => setModalidad(m)} />
              </View>
            ))}
          </View>

          {modalidad !== "presencial" ? (
            <Field label="Enlace virtual" value={enlaceVirtual} onChangeText={setEnlaceVirtual} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
          ) : null}

          <Field label="Ubicación" value={ubicacion} onChangeText={setUbicacion} />

          {editId ? (
            <Pressable
              onPress={() => setActiva((v) => !v)}
              className="mb-4 flex-row items-center gap-2.5 active:opacity-70"
            >
              <View
                className={`h-6 w-6 items-center justify-center rounded border ${
                  activa ? "border-navy bg-navy" : "border-black/25 bg-surface"
                }`}
              >
                {activa ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
              </View>
              <Body className="text-ink">Actividad activa (visible en el feed)</Body>
            </Pressable>
          ) : null}

          {/* Adjunto: flyer/imagen o PDF */}
          <Label className="mb-1.5">Flyer / adjunto</Label>
          {tieneAdjunto ? (
            <View className="mb-4 flex-row items-center gap-3 rounded-lg border border-black/10 bg-surface p-3">
              {adjuntoEsImagen && previewUri ? (
                <Image source={{ uri: previewUri }} style={{ width: 48, height: 48, borderRadius: 8 }} />
              ) : (
                <View className="h-12 w-12 items-center justify-center rounded-lg bg-surface-mid">
                  <Ionicons name="document-text-outline" size={22} color={colors.primaryContainer} />
                </View>
              )}
              <View className="flex-1">
                <Body className="text-ink" numberOfLines={1}>
                  {adjuntoLocal?.name ?? (adjuntoEsImagen ? "Imagen adjunta" : "PDF adjunto")}
                </Body>
                <Muted>{adjuntoLocal ? "Nuevo · sin subir" : "Guardado"}</Muted>
              </View>
              <Pressable onPress={quitarAdjunto} hitSlop={10} className="active:opacity-60">
                <Ionicons name="close-circle" size={24} color={colors.outline} />
              </Pressable>
            </View>
          ) : (
            <View className="mb-4">
              <Button title="Adjuntar flyer o PDF" variant="outline" size="sm" onPress={onElegirAdjunto} />
            </View>
          )}

          <Button
            title={editId ? "Guardar cambios" : "Publicar"}
            onPress={guardar}
            loading={upsert.isPending || subiendo}
          />
        </Card>
      )}

      <Label className="mb-2 mt-4">Actividades ({actividades.length})</Label>
      <View className="gap-2.5">
        {actividades.map((a) => (
          <Card key={a.id}>
            <View className="mb-2 flex-row items-center justify-between">
              <Chip tone="success">semanal</Chip>
              {!a.activa && <Chip tone="neutral">inactiva</Chip>}
            </View>
            <View className="flex-row gap-3">
              {a.adjunto_url && a.adjunto_tipo === "imagen" ? (
                <Image source={{ uri: a.adjunto_url }} style={{ width: 56, height: 56, borderRadius: 8 }} />
              ) : a.adjunto_url ? (
                <View className="h-14 w-14 items-center justify-center rounded-lg bg-surface-mid">
                  <Ionicons name="document-text-outline" size={22} color={colors.primaryContainer} />
                </View>
              ) : null}
              <View className="flex-1">
                <Title numberOfLines={2} className="text-base">{a.titulo}</Title>
                <Muted className="mt-1">
                  {formatDiasSemana(a.dias_semana)} · {formatHora(a.hora_inicio)}
                </Muted>
              </View>
            </View>
            {a.descripcion ? (
              <Body className="mt-2" numberOfLines={2}>
                {a.descripcion}
              </Body>
            ) : null}
            <View className="mt-3 flex-row gap-2">
              <Button title="Editar" variant="outline" size="sm" onPress={() => editar(a)} />
              <Button title="Eliminar" variant="danger" size="sm" onPress={() => eliminar(a.id)} />
            </View>
          </Card>
        ))}
      </View>
    </KeyboardScrollView>
  );
}
