import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Alert, Image, Platform, Pressable, View } from "react-native";
import { Body, Button, Card, Chip, Field, KeyboardScrollView, Label, Muted, Title } from "../../components/ui";
import { dateToFecha, fechaLabel, fechaToDate, formatFechaLarga, formatRangoFechas, mismoDia } from "../../lib/date";
import { colors } from "../../lib/theme";
import { AdjuntoTipo, Evento, TipoEvento } from "../../lib/types";
import { useDeleteEvento, useEventosAdmin, useUpsertEvento } from "../../lib/queries/eventos";
import { AdjuntoLocal, elegirAdjunto, subirAdjunto } from "../../lib/storage";

const TIPOS: TipoEvento[] = ["general", "discipulado", "otro"];

function toISO(fecha: string, hora: string): string {
  return new Date(`${fecha}T${hora}:00`).toISOString();
}

function isoToFecha(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isoToHora(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AdminEventos() {
  const { data: eventos = [] } = useEventosAdmin();
  const upsert = useUpsertEvento();
  const del = useDeleteEvento();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState<TipoEvento>("general");
  const [fecha, setFecha] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [variosDias, setVariosDias] = useState(false);
  const [fechaFin, setFechaFin] = useState("");
  const [showPickerFin, setShowPickerFin] = useState(false);
  const [horaInicio, setHoraInicio] = useState("19:00");
  const [horaFin, setHoraFin] = useState("21:00");
  const [ubicacion, setUbicacion] = useState("");
  // Adjunto: existente (remoto) y/o uno nuevo elegido localmente.
  const [adjuntoUrl, setAdjuntoUrl] = useState<string | null>(null);
  const [adjuntoTipo, setAdjuntoTipo] = useState<AdjuntoTipo | null>(null);
  const [adjuntoLocal, setAdjuntoLocal] = useState<AdjuntoLocal | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  const reset = () => {
    setEditId(null);
    setTitulo("");
    setDescripcion("");
    setTipo("general");
    setFecha("");
    setVariosDias(false);
    setFechaFin("");
    setHoraInicio("19:00");
    setHoraFin("21:00");
    setUbicacion("");
    setAdjuntoUrl(null);
    setAdjuntoTipo(null);
    setAdjuntoLocal(null);
    setShowForm(false);
  };

  const abrirNuevo = () => {
    reset();
    setShowForm(true);
  };

  const editar = (e: Evento) => {
    setEditId(e.id);
    setTitulo(e.titulo);
    setDescripcion(e.descripcion ?? "");
    setTipo(e.tipo);
    const inicioFecha = isoToFecha(e.fecha_inicio);
    const finFecha = isoToFecha(e.fecha_fin);
    setFecha(inicioFecha);
    setVariosDias(finFecha !== inicioFecha);
    setFechaFin(finFecha);
    setHoraInicio(isoToHora(e.fecha_inicio));
    setHoraFin(isoToHora(e.fecha_fin));
    setUbicacion(e.ubicacion ?? "");
    setAdjuntoUrl(e.adjunto_url);
    setAdjuntoTipo(e.adjunto_tipo);
    setAdjuntoLocal(null);
    setShowForm(true);
  };

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      Alert.alert("Fecha inválida", "Usá el formato AAAA-MM-DD.");
      return;
    }
    const finFecha = variosDias ? fechaFin : fecha;
    if (variosDias && !/^\d{4}-\d{2}-\d{2}$/.test(finFecha)) {
      Alert.alert("Fecha de fin inválida", "Elegí en qué día termina el evento.");
      return;
    }
    if (finFecha < fecha) {
      Alert.alert("Fecha de fin inválida", "El fin no puede ser antes del inicio.");
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
        tipo,
        discipulado_id: null,
        fecha_inicio: toISO(fecha, horaInicio),
        fecha_fin: toISO(finFecha, horaFin),
        ubicacion: ubicacion.trim() || null,
        adjunto_url: url,
        adjunto_tipo: tAdj,
      });
      reset();
    } catch (e: any) {
      setSubiendo(false);
      Alert.alert("Error", e.message ?? "No se pudo guardar el evento.");
    }
  };

  const eliminar = (id: string) => {
    Alert.alert("Eliminar", "¿Eliminar este evento? Esta acción no se puede deshacer.", [
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
        title={showForm ? "Cancelar" : "+ Nuevo evento"}
        variant={showForm ? "outline" : "primary"}
        onPress={() => (showForm ? reset() : abrirNuevo())}
      />

      {showForm && (
        <Card className="mt-3">
          <Title className="mb-3 text-base">
            {editId ? "Editar evento" : "Nuevo evento"}
          </Title>
          <Field label="Título" value={titulo} onChangeText={setTitulo} />
          <Field label="Descripción" value={descripcion} onChangeText={setDescripcion} multiline />

          <Label className="mb-1.5">Tipo</Label>
          <View className="mb-4 flex-row gap-2">
            {TIPOS.map((t) => (
              <View key={t} className="flex-1">
                <Button title={t} variant={tipo === t ? "primary" : "outline"} size="sm" onPress={() => setTipo(t)} />
              </View>
            ))}
          </View>

          <Label className="mb-1.5">{variosDias ? "Fecha de inicio" : "Fecha"}</Label>
          <Pressable
            onPress={() => setShowPicker(true)}
            className="mb-3 flex-row items-center justify-between rounded-lg border border-black/10 bg-surface px-4 py-3.5 active:opacity-70"
          >
            <Body className={fecha ? "text-ink capitalize" : "text-outline"}>
              {fechaLabel(fecha)}
            </Body>
            <Ionicons name="calendar-outline" size={18} color={colors.outline} />
          </Pressable>
          {showPicker && (
            <DateTimePicker
              value={fechaToDate(fecha)}
              mode="date"
              display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={(event, selected) => {
                // Android cierra el diálogo con cada acción; iOS queda inline.
                if (Platform.OS !== "ios") setShowPicker(false);
                if (event.type === "set" && selected) {
                  const nueva = dateToFecha(selected);
                  setFecha(nueva);
                  // Si el fin queda antes del nuevo inicio, lo corremos junto.
                  if (fechaFin && fechaFin < nueva) setFechaFin(nueva);
                }
              }}
            />
          )}

          <Pressable
            onPress={() => {
              const next = !variosDias;
              setVariosDias(next);
              if (next && !fechaFin) setFechaFin(fecha);
            }}
            className="mb-4 flex-row items-center gap-2 active:opacity-70"
          >
            <Ionicons
              name={variosDias ? "checkbox" : "square-outline"}
              size={20}
              color={variosDias ? colors.primary : colors.outline}
            />
            <Body className="text-ink">Termina otro día (ej. campamento)</Body>
          </Pressable>

          {variosDias && (
            <>
              <Label className="mb-1.5">Fecha de fin</Label>
              <Pressable
                onPress={() => setShowPickerFin(true)}
                className="mb-4 flex-row items-center justify-between rounded-lg border border-black/10 bg-surface px-4 py-3.5 active:opacity-70"
              >
                <Body className={fechaFin ? "text-ink capitalize" : "text-outline"}>
                  {fechaLabel(fechaFin)}
                </Body>
                <Ionicons name="calendar-outline" size={18} color={colors.outline} />
              </Pressable>
              {showPickerFin && (
                <DateTimePicker
                  value={fechaToDate(fechaFin || fecha)}
                  mode="date"
                  minimumDate={fechaToDate(fecha)}
                  display={Platform.OS === "ios" ? "inline" : "default"}
                  onChange={(event, selected) => {
                    if (Platform.OS !== "ios") setShowPickerFin(false);
                    if (event.type === "set" && selected) setFechaFin(dateToFecha(selected));
                  }}
                />
              )}
            </>
          )}
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Hora inicio" value={horaInicio} onChangeText={setHoraInicio} placeholder="19:00" autoCapitalize="none" />
            </View>
            <View className="flex-1">
              <Field label="Hora fin" value={horaFin} onChangeText={setHoraFin} placeholder="21:00" autoCapitalize="none" />
            </View>
          </View>
          <Field label="Ubicación" value={ubicacion} onChangeText={setUbicacion} />

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

      <Label className="mb-2 mt-4">Eventos ({eventos.length})</Label>
      <View className="gap-2.5">
        {eventos.map((e) => {
          const vigente = new Date(e.fecha_fin) >= new Date();
          return (
            <Card key={e.id}>
              <View className="mb-2 flex-row items-center justify-between">
                <Chip tone="navy">{e.tipo}</Chip>
                {!vigente && <Chip tone="neutral">finalizada</Chip>}
              </View>
              <View className="flex-row gap-3">
                {e.adjunto_url && e.adjunto_tipo === "imagen" ? (
                  <Image source={{ uri: e.adjunto_url }} style={{ width: 56, height: 56, borderRadius: 8 }} />
                ) : e.adjunto_url ? (
                  <View className="h-14 w-14 items-center justify-center rounded-lg bg-surface-mid">
                    <Ionicons name="document-text-outline" size={22} color={colors.primaryContainer} />
                  </View>
                ) : null}
                <View className="flex-1">
                  <Title numberOfLines={2} className="text-base">{e.titulo}</Title>
                  <Muted className="mt-1 capitalize">
                    {mismoDia(e.fecha_inicio, e.fecha_fin)
                      ? formatFechaLarga(e.fecha_inicio)
                      : formatRangoFechas(e.fecha_inicio, e.fecha_fin)}
                  </Muted>
                </View>
              </View>
              {e.descripcion ? (
                <Body className="mt-2" numberOfLines={2}>
                  {e.descripcion}
                </Body>
              ) : null}
              <View className="mt-3 flex-row gap-2">
                <Button title="Editar" variant="outline" size="sm" onPress={() => editar(e)} />
                <Button title="Eliminar" variant="danger" size="sm" onPress={() => eliminar(e.id)} />
              </View>
            </Card>
          );
        })}
      </View>
    </KeyboardScrollView>
  );
}
