import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { FlatList, Linking, Pressable, View } from "react-native";
import { diasHastaCumple, formatCumple } from "../lib/date";
import { useDirectorio } from "../lib/queries/directorio";
import { colors } from "../lib/theme";
import { DirectorioEntry } from "../lib/types";
import { Avatar, Body, Card, Field, Label, Muted } from "./ui";

const soloDigitos = (tel: string) => tel.replace(/\D/g, "");

// Lista del directorio: nombre, cumpleaños y contacto (llamar / WhatsApp).
// Visible para todo miembro activo (RLS de la vista `directorio`). Se usa tanto
// en la ruta standalone (/directorio) como en la pestaña "Nosotros" del feed.
export function DirectorioList() {
  const { data: personas = [], isLoading } = useDirectorio();
  const [q, setQ] = useState("");

  const filtradas = useMemo(() => {
    const base = [...personas].sort((a, b) =>
      `${a.nombre} ${a.apellido ?? ""}`.localeCompare(`${b.nombre} ${b.apellido ?? ""}`, "es")
    );
    const t = q.trim().toLowerCase();
    if (!t) return base;
    return base.filter((p) => `${p.nombre} ${p.apellido ?? ""}`.toLowerCase().includes(t));
  }, [personas, q]);

  const llamar = (tel: string) => Linking.openURL(`tel:${tel}`).catch(() => {});
  const whatsapp = (tel: string) => Linking.openURL(`https://wa.me/${soloDigitos(tel)}`).catch(() => {});

  const renderItem = ({ item: p }: { item: DirectorioEntry }) => {
    const nombre = `${p.nombre} ${p.apellido ?? ""}`.trim();
    const cumpleHoy = diasHastaCumple(p.fecha_nacimiento) === 0;
    return (
      <Card className="mb-2.5 flex-row items-center gap-3">
        <Avatar name={nombre} size={42} />
        <View className="flex-1">
          <Body className="text-ink" numberOfLines={1}>
            {nombre}
          </Body>
          {p.fecha_nacimiento ? (
            <View className="mt-0.5 flex-row items-center gap-1">
              <Ionicons name="gift-outline" size={13} color={cumpleHoy ? colors.cumple : colors.outline} />
              <Muted className="capitalize" style={cumpleHoy ? { color: colors.cumple } : undefined}>
                {formatCumple(p.fecha_nacimiento)}
              </Muted>
            </View>
          ) : null}
        </View>
        {p.telefono ? (
          <View className="flex-row gap-2">
            <Pressable
              onPress={() => whatsapp(p.telefono!)}
              hitSlop={6}
              className="h-10 w-10 items-center justify-center rounded-full bg-surface-mid active:opacity-70"
            >
              <Ionicons name="logo-whatsapp" size={19} color={colors.primary} />
            </Pressable>
            <Pressable
              onPress={() => llamar(p.telefono!)}
              hitSlop={6}
              className="h-10 w-10 items-center justify-center rounded-full bg-surface-mid active:opacity-70"
            >
              <Ionicons name="call-outline" size={18} color={colors.primary} />
            </Pressable>
          </View>
        ) : null}
      </Card>
    );
  };

  return (
    <View className="flex-1 bg-cream">
      <View className="px-4 pt-3">
        <Field
          icon="search-outline"
          placeholder="Buscar por nombre"
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
        />
      </View>
      <FlatList
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        data={filtradas}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<Label className="mb-2">Directorio ({filtradas.length})</Label>}
        ListEmptyComponent={
          !isLoading ? (
            <Card>
              <Muted>{q ? "Nadie coincide con la búsqueda." : "El directorio está vacío."}</Muted>
            </Card>
          ) : null
        }
      />
    </View>
  );
}
