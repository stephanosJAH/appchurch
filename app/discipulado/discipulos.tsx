import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useAuth } from "../../lib/auth";
import { GrillaAsistencia } from "../../components/GrillaAsistencia";
import { BuscadorPersonas } from "../../components/SelectorPersonas";
import {
  Button,
  Card,
  Field,
  KeyboardScrollView,
  Label,
  Muted,
} from "../../components/ui";
import { diasHastaCumple, etiquetaCumple } from "../../lib/date";
import { colors } from "../../lib/theme";
import { Sexo } from "../../lib/types";
import { useDiscipulado } from "../../lib/queries/discipulados";
import {
  useAgregarDiscipuloNuevo,
  useAgregarParticipacion,
  useCandidatosDiscipulado,
  useParticipaciones,
} from "../../lib/queries/participaciones";
import { useReunionesConAsistencia } from "../../lib/queries/reuniones";

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
  const onSumar = async (miembroId: string) => {
    try {
      await sumar.mutateAsync(miembroId);
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
        <View className="mb-3">
          <BuscadorPersonas
            busqueda={busqueda}
            onBusqueda={(t) => {
              setBusqueda(t);
              setCrearManual(false);
            }}
            candidatos={candidatos.map((c) => ({
              id: c.id,
              nombre: `${c.nombre} ${c.apellido ?? ""}`.trim(),
              detalle: c.telefono_parcial,
              yaEsta: c.ya_participa,
            }))}
            onAgregar={(p) => onSumar(p.id)}
            placeholder="Buscar en el padrón por nombre o teléfono"
            minCaracteres={2}
            ayuda="Escribí al menos dos letras. Si la persona ya está en el padrón, sumala desde acá: conserva su ficha y su historial."
            buscando={buscando}
            error={
              errorBusqueda
                ? `No se pudo buscar en el padrón: ${errorBusqueda.message}. Probá de nuevo antes de crear una ficha; si la persona ya existe, una nueva la duplica.`
                : null
            }
            agregando={sumar.isPending}
            sinResultados={`Nadie activo del padrón coincide con «${textoBuscado}» (quien ya está en el grupo aparece marcado, y quien fue dado de baja de la iglesia no aparece).`}
            autoFocus={abrirAgregar === "1"}
          >
            {candidatos.length > 0 && !crearManual && (
              <View className="mb-3">
                <Button
                  title="No es ninguno: crear ficha nueva"
                  variant="ghost"
                  size="sm"
                  onPress={() => setCrearManual(true)}
                />
              </View>
            )}

            {mostrarAlta && (
              <Card>
                <Muted className="mb-3">Se crea una ficha nueva en el padrón:</Muted>
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
              </Card>
            )}
          </BuscadorPersonas>
        </View>
      )}

      {participaciones.length === 0 ? (
        <Card>
          <Muted>Todavía no hay discípulos en este grupo.</Muted>
        </Card>
      ) : (
        <GrillaAsistencia
          reuniones={reuniones}
          encabezado="Discípulo"
          filas={participaciones.map((p) => {
            const diasCumple = diasHastaCumple(p.miembro?.fecha_nacimiento);
            const cumpleProximo = diasCumple != null && diasCumple <= 14;
            return {
              key: p.id,
              miembroId: p.miembro_id,
              nombre: p.miembro?.nombre,
              apellido: p.miembro?.apellido,
              icono: cumpleProximo ? (
                <Ionicons name="gift-outline" size={14} color={colors.cumple} />
              ) : null,
              accesibilidad: cumpleProximo && diasCumple != null
                ? `cumple ${etiquetaCumple(diasCumple).toLowerCase()}`
                : null,
            };
          })}
          onPress={(f) => router.push({ pathname: "/miembro/[id]", params: { id: f.miembroId } })}
        />
      )}
    </KeyboardScrollView>
  );
}
