import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { useAuth } from "../../lib/auth";
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
} from "../../components/ui";
import { calcularEdad, diasHastaCumple, etiquetaCumple } from "../../lib/date";
import { colors } from "../../lib/theme";
import { CandidatoDiscipulado, Sexo } from "../../lib/types";
import { useDiscipulado } from "../../lib/queries/discipulados";
import {
  useAgregarDiscipuloNuevo,
  useAgregarParticipacion,
  useCandidatosDiscipulado,
  useDesasociarParticipacion,
  useParticipaciones,
} from "../../lib/queries/participaciones";

// Roster completo de un discipulado: alta (buscando primero en el padrón) y
// baja de discípulos. Se llega desde el resumen del grupo (discipulado/[id]),
// con `agregar=1` cuando se tocó "Agregar" para abrir directo el buscador.
export default function DiscipulosDelGrupo() {
  const { id, agregar: abrirAgregar } = useLocalSearchParams<{ id: string; agregar?: string }>();
  const router = useRouter();
  const { isAdmin, profile } = useAuth();
  const discipuladoId = String(id);

  const { data: discipulado } = useDiscipulado(discipuladoId);
  // Puede gestionar el grupo el admin o el discipulador a cargo del mismo.
  const canManage = isAdmin || (!!profile && profile.id === discipulado?.discipulador_id);
  const { data: participaciones = [] } = useParticipaciones(discipuladoId);
  const agregar = useAgregarDiscipuloNuevo(discipuladoId);
  const sumar = useAgregarParticipacion(discipuladoId);
  const desasociar = useDesasociarParticipacion(discipuladoId);

  // Agregar un discípulo es primero buscarlo en el padrón y recién después
  // crearlo: si la persona ya tiene ficha (otro grupo, un ministerio, su
  // cuenta aprobada), crear una nueva la duplica y le parte el historial.
  const [showForm, setShowForm] = useState(abrirAgregar === "1");
  const [busqueda, setBusqueda] = useState("");
  const [crearManual, setCrearManual] = useState(false);
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [sexo, setSexo] = useState<Sexo>("M");
  const [nombreTocado, setNombreTocado] = useState(false);

  const {
    data: candidatos = [],
    isFetching,
    isPending,
    error: errorBusqueda,
  } = useCandidatosDiscipulado(discipuladoId, busqueda);
  const textoBuscado = busqueda.trim();
  // `isPending` además de `isFetching`: con una key nueva (cada tecla lo es) la
  // query todavía no arrancó en el primer render, y sin esto el alta aparecía
  // un frame como si no hubiera coincidencias.
  const buscando = isFetching || (isPending && !errorBusqueda);
  // "No está en el padrón" solo si la búsqueda de verdad contestó. Si falló, no
  // se sabe nada: ofrecer el alta ahí es empujar al duplicado a ciegas.
  const sinCoincidencias =
    textoBuscado.length >= 2 && !buscando && !errorBusqueda && candidatos.length === 0;
  const mostrarAlta = (crearManual || sinCoincidencias) && !errorBusqueda;

  // Mientras nadie toque los campos, la ficha a crear se llama como lo tipeado
  // en el buscador: "no está en el padrón" y "cargala con ese nombre" son el
  // mismo gesto. La primera palabra es el nombre; el resto, el apellido.
  useEffect(() => {
    if (nombreTocado) return;
    const [n = "", ...resto] = textoBuscado.replace(/\s+/g, " ").split(" ");
    setNombre(n);
    setApellido(resto.join(" "));
  }, [textoBuscado, nombreTocado]);

  const onDesasociar = (participacionId: string, nombre: string) => {
    Alert.alert(
      "Desasociar discípulo",
      `¿Quitar a ${nombre} de este discipulado? Podés volver a agregarlo más adelante.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desasociar",
          style: "destructive",
          onPress: () => desasociar.mutate(participacionId),
        },
      ]
    );
  };

  const cerrarAgregar = () => {
    setShowForm(false);
    setBusqueda("");
    setCrearManual(false);
    setNombre("");
    setApellido("");
    setSexo("M");
    setNombreTocado(false);
  };

  // Ya está en el padrón: solo se suma la participación, la ficha no se toca.
  const onSumar = async (c: CandidatoDiscipulado) => {
    try {
      await sumar.mutateAsync(c.id);
      cerrarAgregar();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo sumar a esta persona.");
    }
  };

  const onAgregar = async () => {
    if (!nombre.trim()) {
      Alert.alert("Falta el nombre", "Ingresá al menos el nombre.");
      return;
    }
    try {
      await agregar.mutateAsync({ nombre: nombre.trim(), apellido: apellido.trim() || null, sexo });
      cerrarAgregar();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "No se pudo agregar el discípulo.");
    }
  };

  return (
    <KeyboardScrollView>
      <View className="mb-2 flex-row items-center justify-between">
        <Label>Discípulos ({participaciones.length})</Label>
        {canManage && (
          <Button
            title={showForm ? "Cancelar" : "+ Agregar"}
            variant="ghost"
            size="sm"
            onPress={() => (showForm ? cerrarAgregar() : setShowForm(true))}
          />
        )}
      </View>

      {canManage && showForm && (
        <Card className="mb-3">
          <Field
            icon="search-outline"
            value={busqueda}
            onChangeText={(t) => {
              setBusqueda(t);
              setCrearManual(false);
            }}
            placeholder="Buscar en el padrón por nombre o teléfono"
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus={abrirAgregar === "1"}
          />

          {textoBuscado.length < 2 ? (
            <Muted className="mb-1">
              Escribí al menos dos letras. Si la persona ya está en el padrón, sumala
              desde acá: conserva su ficha y su historial.
            </Muted>
          ) : buscando ? (
            <View className="items-center py-3">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : errorBusqueda ? (
            <View className="mb-1 flex-row items-start gap-2 rounded-lg bg-danger/10 p-3">
              <Ionicons name="alert-circle-outline" size={16} color={colors.error} />
              <Muted className="flex-1">
                No se pudo buscar en el padrón: {errorBusqueda.message}. Probá de nuevo
                antes de crear una ficha; si la persona ya existe, una nueva la duplica.
              </Muted>
            </View>
          ) : (
            <>
              {candidatos.length > 0 && (
                <View className="mb-1 gap-2.5">
                  {candidatos.map((c) => (
                    <View
                      key={c.id}
                      className="flex-row items-center gap-3 rounded-lg border border-black/10 px-3 py-2.5"
                    >
                      <Avatar name={c.nombre} size={34} tone="gold" />
                      <View className="flex-1">
                        <Body className="text-ink">{`${c.nombre} ${c.apellido ?? ""}`.trim()}</Body>
                        {c.telefono_parcial ? <Muted>{c.telefono_parcial}</Muted> : null}
                      </View>
                      {c.ya_participa ? (
                        <Chip tone="success">Ya está</Chip>
                      ) : (
                        <Button
                          title="Sumar"
                          variant="outline"
                          size="sm"
                          onPress={() => onSumar(c)}
                          loading={sumar.isPending}
                        />
                      )}
                    </View>
                  ))}
                  {!crearManual && (
                    <Button
                      title="No es ninguno: crear ficha nueva"
                      variant="ghost"
                      size="sm"
                      onPress={() => setCrearManual(true)}
                    />
                  )}
                </View>
              )}

              {mostrarAlta && (
                <>
                  <Muted className="mb-3 mt-1">
                    {sinCoincidencias
                      ? `Nadie activo del padrón coincide con «${textoBuscado}» (quien ya está en el grupo aparece marcado, y quien fue dado de baja de la iglesia no aparece). Se crea su ficha:`
                      : "Se crea una ficha nueva en el padrón:"}
                  </Muted>
                  <Field
                    label="Nombre"
                    value={nombre}
                    onChangeText={(t) => {
                      setNombreTocado(true);
                      setNombre(t);
                    }}
                    placeholder="Nombre"
                    autoCapitalize="words"
                  />
                  <Field
                    label="Apellido"
                    value={apellido}
                    onChangeText={(t) => {
                      setNombreTocado(true);
                      setApellido(t);
                    }}
                    placeholder="Apellido (opcional)"
                    autoCapitalize="words"
                  />
                  <Label className="mb-1.5">Sexo</Label>
                  <View className="mb-4 flex-row gap-2">
                    {(["M", "F"] as Sexo[]).map((s) => (
                      <View key={s} className="flex-1">
                        <Button title={s === "M" ? "Masculino" : "Femenino"} variant={sexo === s ? "primary" : "outline"} size="sm" onPress={() => setSexo(s)} />
                      </View>
                    ))}
                  </View>
                  <Button title="Guardar discípulo" onPress={onAgregar} loading={agregar.isPending} />
                </>
              )}
            </>
          )}
        </Card>
      )}

      {participaciones.length === 0 ? (
        <Card>
          <Muted>Todavía no hay discípulos en este grupo.</Muted>
        </Card>
      ) : (
        <View className="gap-2.5">
          {participaciones.map((p) => {
            const edad = calcularEdad(p.miembro?.fecha_nacimiento);
            const nombreCompleto = `${p.miembro?.nombre ?? ""} ${p.miembro?.apellido ?? ""}`.trim();
            const diasCumple = diasHastaCumple(p.miembro?.fecha_nacimiento);
            const cumpleProximo = diasCumple != null && diasCumple <= 14;
            return (
              <Card key={p.id} className="flex-row items-center gap-3 py-3.5">
                <Pressable
                  onPress={() => router.push({ pathname: "/miembro/[id]", params: { id: p.miembro_id } })}
                  className="flex-1 flex-row items-center gap-3 active:opacity-70"
                >
                  <Avatar name={p.miembro?.nombre} size={38} tone="gold" />
                  <View className="flex-1">
                    <Body className="text-ink">{nombreCompleto}</Body>
                    {edad != null ? <Muted>{edad} años</Muted> : null}
                  </View>
                  {cumpleProximo ? (
                    <View className="flex-row items-center gap-1">
                      <Ionicons name="gift-outline" size={14} color={colors.cumple} />
                      <Muted style={{ color: colors.cumple }}>{etiquetaCumple(diasCumple)}</Muted>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={16} color={colors.outline} />
                </Pressable>
                {canManage && (
                  <Pressable
                    onPress={() => onDesasociar(p.id, nombreCompleto || "este discípulo")}
                    hitSlop={10}
                    className="active:opacity-60"
                  >
                    <Ionicons name="person-remove-outline" size={20} color={colors.error} />
                  </Pressable>
                )}
              </Card>
            );
          })}
        </View>
      )}
    </KeyboardScrollView>
  );
}
