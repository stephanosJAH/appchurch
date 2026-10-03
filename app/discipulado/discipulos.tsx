import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
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
  Title,
} from "../../components/ui";
import {
  EstadoAsistencia,
  FALTAS_PARA_AVISAR,
  REUNIONES_A_LA_VISTA,
  estadoEn,
  etiquetaColumna,
  faltasSeguidas,
  porcentajePresentes,
  presentesDe,
} from "../../lib/asistencia";
import { diasHastaCumple, etiquetaCumple } from "../../lib/date";
import { colors, fonts } from "../../lib/theme";
import { CandidatoDiscipulado, Sexo } from "../../lib/types";
import { useDiscipulado } from "../../lib/queries/discipulados";
import {
  useAgregarDiscipuloNuevo,
  useAgregarParticipacion,
  useCandidatosDiscipulado,
  useParticipaciones,
} from "../../lib/queries/participaciones";
import { useReunionesConAsistencia } from "../../lib/queries/reuniones";

// Ancho de cada columna de reunión y de la de porcentaje: fijos, para que el
// encabezado, las filas y los totales queden alineados.
const ANCHO_COLUMNA = "w-7";
const ANCHO_PORCENTAJE = "w-10";

// Nombre corto ("Nicolás F.") para que entre al lado de las columnas. El
// nombre completo queda en la etiqueta de accesibilidad y en la ficha.
function nombreCorto(nombre?: string | null, apellido?: string | null): string {
  const n = (nombre ?? "").split(" ")[0];
  const inicial = apellido?.trim()?.charAt(0);
  return [n, inicial ? `${inicial}.` : null].filter(Boolean).join(" ") || "Sin nombre";
}

function Punto({ estado }: { estado: EstadoAsistencia }) {
  if (estado === "presente") return <View className="h-3 w-3 rounded-full bg-navy" />;
  if (estado === "ausente")
    return <View className="h-3 w-3 rounded-full border-[1.5px] border-ink-muted" />;
  return <View className="h-0.5 w-2 rounded-full bg-line" />;
}

function Leyenda({ estado, texto }: { estado: EstadoAsistencia; texto: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Punto estado={estado} />
      <Text style={{ fontFamily: fonts.sans }} className="text-xs text-ink-muted">
        {texto}
      </Text>
    </View>
  );
}

// Roster completo de un discipulado: quién viene a las reuniones, alta
// (buscando primero en el padrón) y baja. Se llega desde el resumen del grupo
// (discipulado/[id]), con `agregar=1` cuando se tocó "Agregar" para abrir
// directo el buscador.
export default function DiscipulosDelGrupo() {
  const { id, agregar: abrirAgregar } = useLocalSearchParams<{ id: string; agregar?: string }>();
  const router = useRouter();
  const { isAdmin, profile } = useAuth();
  const discipuladoId = String(id);

  const { data: discipulado } = useDiscipulado(discipuladoId);
  // Puede gestionar el grupo el admin o el discipulador a cargo del mismo.
  const canManage = isAdmin || (!!profile && profile.id === discipulado?.discipulador_id);
  const { data: participaciones = [] } = useParticipaciones(discipuladoId);
  const { data: reuniones = [] } = useReunionesConAsistencia(discipuladoId);
  const agregar = useAgregarDiscipuloNuevo(discipuladoId);
  const sumar = useAgregarParticipacion(discipuladoId);

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

  // Las columnas de la grilla: las últimas reuniones, de la más vieja a la más
  // nueva (`reuniones` llega al revés), para que se lean de izquierda a derecha.
  const columnas = [...reuniones.slice(0, REUNIONES_A_LA_VISTA)].reverse();
  const promedio = porcentajePresentes(columnas);

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
        <Card className="px-3.5 py-4">
          <View className="flex-row items-start justify-between px-0.5">
            <View className="flex-1 pr-3">
              <Title style={{ fontSize: 18, lineHeight: 24 }}>Asistencia</Title>
              <Muted>
                {columnas.length === 0
                  ? "Sin reuniones registradas"
                  : `Últimas ${columnas.length} ${
                      columnas.length === 1 ? "reunión" : "reuniones"
                    }`}
              </Muted>
            </View>
            {promedio != null && (
              <View className="items-end">
                <Text
                  style={{ fontFamily: fonts.serifBold, fontSize: 22, lineHeight: 26 }}
                  className="text-navy"
                >
                  {promedio}%
                </Text>
                <Text style={{ fontFamily: fonts.sans }} className="text-xs text-ink-muted">
                  promedio
                </Text>
              </View>
            )}
          </View>

          {columnas.length > 0 && (
            <View className="mt-3.5 flex-row items-end pb-1.5">
              <Label className="flex-1">Discípulo</Label>
              {columnas.map((r) => (
                <Text
                  key={r.id}
                  style={{ fontFamily: fonts.sans }}
                  className={`${ANCHO_COLUMNA} text-center text-[10px] leading-3 text-ink-muted`}
                >
                  {etiquetaColumna(r.fecha)}
                </Text>
              ))}
              <View className={ANCHO_PORCENTAJE} />
            </View>
          )}

          {participaciones.map((p) => {
            const nombreCompleto =
              `${p.miembro?.nombre ?? ""} ${p.miembro?.apellido ?? ""}`.trim() || "Sin nombre";
            const diasCumple = diasHastaCumple(p.miembro?.fecha_nacimiento);
            const cumpleProximo = diasCumple != null && diasCumple <= 14;
            const faltas = faltasSeguidas(reuniones, p.miembro_id);
            const pct = porcentajePresentes(columnas, p.miembro_id);
            return (
              <Pressable
                key={p.id}
                onPress={() =>
                  router.push({ pathname: "/miembro/[id]", params: { id: p.miembro_id } })
                }
                accessibilityRole="button"
                accessibilityLabel={[
                  nombreCompleto,
                  cumpleProximo && diasCumple != null
                    ? `cumple ${etiquetaCumple(diasCumple).toLowerCase()}`
                    : null,
                  pct != null ? `${pct}% de asistencia` : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                className="flex-row items-center border-t border-black/5 py-2 active:opacity-60"
                style={{ minHeight: 46 }}
              >
                <View className="flex-1 pr-2">
                  <View className="flex-row items-center gap-1.5">
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: fonts.sans }}
                      className="shrink text-[15px] text-ink"
                    >
                      {nombreCorto(p.miembro?.nombre, p.miembro?.apellido)}
                    </Text>
                    {cumpleProximo && (
                      <Ionicons name="gift-outline" size={14} color={colors.cumple} />
                    )}
                  </View>
                  {faltas >= FALTAS_PARA_AVISAR && (
                    <Text
                      style={{ fontFamily: fonts.sansSemibold, color: colors.onTertiaryContainer }}
                      className="text-[11px] leading-4"
                    >
                      Faltó a las últimas {faltas}
                    </Text>
                  )}
                </View>
                {columnas.map((r) => (
                  <View key={r.id} className={`${ANCHO_COLUMNA} items-center`}>
                    <Punto estado={estadoEn(r, p.miembro_id)} />
                  </View>
                ))}
                {columnas.length > 0 && (
                  <Text
                    style={{ fontFamily: fonts.sansSemibold }}
                    className={`${ANCHO_PORCENTAJE} text-right text-[13px] text-ink`}
                  >
                    {pct != null ? `${pct}%` : "—"}
                  </Text>
                )}
              </Pressable>
            );
          })}

          {columnas.length > 0 && (
            <>
              <View className="flex-row items-center border-t border-black/10 py-2.5">
                <Text
                  style={{ fontFamily: fonts.sansSemibold }}
                  className="flex-1 text-xs text-ink-variant"
                >
                  Presentes
                </Text>
                {columnas.map((r) => {
                  const { presentes, total } = presentesDe(r);
                  return (
                    <Text
                      key={r.id}
                      style={{ fontFamily: fonts.sansSemibold }}
                      className={`${ANCHO_COLUMNA} text-center text-[11px] text-ink-variant`}
                    >
                      {presentes}/{total}
                    </Text>
                  );
                })}
                <View className={ANCHO_PORCENTAJE} />
              </View>
              <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 border-t border-black/5 pt-2.5">
                <Leyenda estado="presente" texto="Presente" />
                <Leyenda estado="ausente" texto="Ausente" />
                <Leyenda estado="sin-registro" texto="Todavía no estaba" />
              </View>
            </>
          )}
        </Card>
      )}
    </KeyboardScrollView>
  );
}
